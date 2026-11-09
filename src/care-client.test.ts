import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newSharingDevice } from "./sharing-crypto";
import { existingSharingDevice, localSharingDevice } from "./sharing-storage";
import { emptyReferralFields } from "./referral-draft";
import { newCareKey, wrapCare, unwrapCare } from "./care-crypto";
import { createCareHandoff, enrollCareDevice } from "./care-client";
import * as storage from "./care-storage";
import { CareDraftSession } from "./care-draft-session";
import type { CareView } from "./care-model";

const mocks = vi.hoisted(() => ({ uid: "", data: new Map<string, Record<string, unknown>>(), writes: 0, transactions: 0, failure: "", unavailable: false, chain: Promise.resolve() }));
vi.mock("./auth", () => ({ accountAuth: async () => ({ currentUser: { uid: mocks.uid, isAnonymous: false }, app: { options: { projectId: "isolated-test" } } }) }));
vi.mock("./care-model", async importOriginal => ({ ...await importOriginal<object>(), careEnabled: true }));
vi.mock("firebase/firestore", () => {
  const snap = (path:string) => ({ exists: () => mocks.data.has(path), data: () => mocks.data.get(path)! });
  return {
    getFirestore: () => ({}), doc: (_db: unknown, ...path: string[]) => path.join("/"), serverTimestamp: () => "test-server-timestamp",
    getDocFromServer: async (path: string) => {
      if (mocks.unavailable) throw Object.assign(Error("Server unavailable"), { code: "unavailable" });
      if (path.startsWith("careHandoffs/") && !mocks.data.has(path)) throw Object.assign(Error("Missing handoff is unreadable"), { code: "permission-denied" });
      return snap(path);
    },
    runTransaction: async (_db:unknown, work:(tx:unknown)=>Promise<void>) => {
      const task=mocks.chain.then(async()=>{
        mocks.transactions++;
        if(mocks.failure==="before") { mocks.failure=""; throw Error("Timeout before commit"); }
        const staged=new Map<string,Record<string,unknown>>();
        await work({get: async(path:string)=>snap(path), set:(path:string,value:Record<string,unknown>)=>staged.set(path,value)});
        for(const [path,value] of staged) { if(mocks.data.has(path)) throw Error("Append-only update forbidden"); mocks.data.set(path,value); mocks.writes++; }
        if(mocks.failure==="after" || mocks.failure==="after-offline") { const offline=mocks.failure==="after-offline"; mocks.failure=""; mocks.unavailable=offline; throw Error("Commit response lost"); }
      });
      mocks.chain=task.catch(()=>{}); return task;
    },
  };
});
let view: CareView;
const fields=()=>({...emptyReferralFields(),reason:"Synthetic reason"});
const create=()=>createCareHandoff(mocks.uid,view,"recipient",fields(),32768);
async function pendingRaw(value?: string) {
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open("matrisync-care-v1",1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  return new Promise<string>((resolve,reject)=>{const tx=db.transaction("copies",value===undefined?"readonly":"readwrite"),s=tx.objectStore("copies"),key=[mocks.uid,`pending:${view.id}`]; const r=value===undefined?s.get(key):s.put(value,key);tx.oncomplete=()=>{db.close();resolve(r.result as string);};tx.onerror=()=>{db.close();reject(tx.error);};});
}
beforeEach(async()=>{
  vi.restoreAllMocks(); mocks.data.clear(); mocks.writes=0; mocks.transactions=0; mocks.failure=""; mocks.unavailable=false; mocks.chain=Promise.resolve(); mocks.uid=`doctor-${crypto.randomUUID()}`;
  const sender=await localSharingDevice(mocks.uid), recipient=await newSharingDevice();
  mocks.data.set(`careStaff/${mocks.uid}`,{name:"Synthetic doctor",role:"doctor",enabled:true,facilityId:"source-facility"});
  mocks.data.set(`careDevices/${mocks.uid}`,sender as unknown as Record<string,unknown>); mocks.data.set("careDevices/recipient",recipient as unknown as Record<string,unknown>);
  mocks.data.set("careFacilities/recipient",{enabled:true});
  view={id:crypto.randomUUID(),key:newCareKey(),profile:{name:"Synthetic mother",birthDate:"",sourceLocalId:"local",sourceUid:mocks.uid},entries:[],verified:true,snapshotOnly:false,receivedAt:""};
});
describe("care device recovery boundary",()=>{
  it("does not create a replacement key when the enrolled key is missing locally",async()=>{
    mocks.uid=`lost-device-${crypto.randomUUID()}`;
    const original=await newSharingDevice();
    mocks.data.set(`careDevices/${mocks.uid}`,original as unknown as Record<string,unknown>);
    await expect(enrollCareDevice(mocks.uid)).rejects.toThrow("Use the original browser");
    expect(await existingSharingDevice(mocks.uid)).toBeUndefined();
    expect(mocks.data.get(`careDevices/${mocks.uid}`)).toBe(original);
    expect(mocks.writes).toBe(0);
  });
  it("preserves a different local key and the original server enrollment",async()=>{
    const local=await existingSharingDevice(mocks.uid),original=await newSharingDevice();
    mocks.data.set(`careDevices/${mocks.uid}`,original as unknown as Record<string,unknown>);
    await expect(enrollCareDevice(mocks.uid)).rejects.toThrow("no existing key was replaced");
    expect((await existingSharingDevice(mocks.uid))?.keyId).toBe(local?.keyId);
    expect(mocks.data.get(`careDevices/${mocks.uid}`)).toBe(original);
    expect(mocks.writes).toBe(0);
  });
  it("does not generate a new key when authoritative enrollment cannot be checked",async()=>{
    mocks.uid=`offline-device-${crypto.randomUUID()}`;mocks.unavailable=true;
    await expect(enrollCareDevice(mocks.uid)).rejects.toThrow("Server unavailable");
    expect(await existingSharingDevice(mocks.uid)).toBeUndefined();
    expect(mocks.writes).toBe(0);
  });
  it("reuses the original device without writing another enrollment",async()=>{
    const original=await existingSharingDevice(mocks.uid);
    expect((await enrollCareDevice(mocks.uid)).keyId).toBe(original?.keyId);
    expect(mocks.writes).toBe(0);
  });
});
describe("durable approved handoff reconciliation",()=>{
  it("persists before mutation and recovers the original packet after a timeout before commit",async()=>{
    mocks.failure="before"; await expect(create()).rejects.toThrow("saved, but completion is not confirmed");
    const pending=await storage.readPendingCareHandoff(mocks.uid,view.id); expect(pending?.status).toBe("pending"); expect(mocks.writes).toBe(0); expect(await storage.latestCareHandoff(mocks.uid,view.id)).toBeUndefined();
    const result=await create(); expect(result.id).toBe(pending?.handoff.id); expect(btoa(String.fromCharCode(...result.packet))).toBe(pending?.handoff.packet); expect(result.savedLocally).toBe(true); expect(mocks.writes).toBe(3);
    const again=await create(); expect(again.packet).toEqual(result.packet); expect(mocks.writes).toBe(3);
  });
  it("recognizes a committed operation despite a lost response without another transaction",async()=>{
    mocks.failure="after"; const result=await create(); expect(result.savedLocally).toBe(true); expect(mocks.transactions).toBe(1);
    expect((await create()).id).toBe(result.id); expect(mocks.transactions).toBe(1);
  });
  it("keeps uncertainty across unavailable reconciliation and preserves the original summary on recovery",async()=>{
    mocks.failure="after-offline"; await expect(create()).rejects.toThrow("completion is not confirmed");
    const pending=await storage.readPendingCareHandoff(mocks.uid,view.id); await expect(create()).rejects.toThrow("completion is not confirmed"); expect(mocks.transactions).toBe(1);
    mocks.unavailable=false; view.profile.name="Later profile edit"; const result=await create(); expect(result.profile.name).toBe("Synthetic mother"); expect(result.recordedAt).toBe(pending?.handoff.recordedAt); expect(mocks.writes).toBe(3);
  });
  it("retains an approved operation after local completion quota failure",async()=>{
    vi.spyOn(storage,"confirmPendingCareHandoff").mockRejectedValueOnce(Error("Quota exceeded"));
    const result=await create(); expect(result.savedLocally).toBe(false); expect((await storage.readPendingCareHandoff(mocks.uid,view.id))?.status).toBe("pending");
    expect((await create()).packet).toEqual(result.packet); expect(mocks.transactions).toBe(1);
  });
  it("never mutates cloud if the durable approval cannot be saved",async()=>{
    vi.spyOn(storage,"claimPendingCareHandoff").mockRejectedValueOnce(Error("Quota exceeded"));
    await expect(create()).rejects.toThrow("Quota"); expect(mocks.transactions).toBe(0); expect(mocks.writes).toBe(0);
  });
  it("rejects size overflow before local pending state or cloud writes",async()=>{
    await expect(createCareHandoff(mocks.uid,view,"recipient",fields(),48)).rejects.toThrow(); expect(await storage.readPendingCareHandoff(mocks.uid,view.id)).toBeUndefined(); expect(mocks.transactions).toBe(0);
  });
  it("does not submit an absent operation after role revocation, but can recover a confirmed commit",async()=>{
    mocks.failure="before"; await expect(create()).rejects.toThrow(); mocks.data.get(`careStaff/${mocks.uid}`)!.enabled=false;
    await expect(create()).rejects.toThrow("assignment changed"); expect(mocks.writes).toBe(0);
    mocks.data.get(`careStaff/${mocks.uid}`)!.enabled=true; const result=await create(); mocks.data.get(`careStaff/${mocks.uid}`)!.enabled=false;
    expect((await create()).id).toBe(result.id); expect(mocks.writes).toBe(3);
  });
  it("refuses changed destination device and changed approved fields",async()=>{
    mocks.failure="before"; await expect(create()).rejects.toThrow(); mocks.data.get("careDevices/recipient")!.keyId="changed";
    await expect(create()).rejects.toThrow("device identity changed"); expect(mocks.writes).toBe(0);
    await expect(createCareHandoff(mocks.uid,view,"recipient",{...fields(),reason:"Different"},32768)).rejects.toThrow("different details");
    await expect(createCareHandoff(mocks.uid,view,"recipient",fields(),48)).rejects.toThrow("different details");
  });
  it("serializes two tabs without duplicate entries or changed packet bytes",async()=>{
    const results=await Promise.allSettled([create(),create()]); expect(results.some(r=>r.status==="fulfilled")).toBe(true);
    const original=await storage.latestCareHandoff(mocks.uid,view.id); expect((await create()).id).toBe(original?.id); expect(mocks.writes).toBe(3);
  });
  it("rejects conflicting server evidence and retains the approval",async()=>{
    mocks.failure="before"; await expect(create()).rejects.toThrow(); const pending=(await storage.readPendingCareHandoff(mocks.uid,view.id))!;
    mocks.data.set(`careHandoffs/${pending.handoff.id}`,{caseId:view.id,sourceUid:mocks.uid,recipientUid:"wrong",ciphertext:"wrong"});
    await expect(create()).rejects.toThrow("server handoff differs"); expect(mocks.writes).toBe(0);
  });
  it("preserves a newer draft while recovering the earlier approval",async()=>{
    const draft=new CareDraftSession(mocks.uid,view.id); await draft.save({fields:fields(),destination:"recipient",capacity:"32768"}); const revision=draft.revision;
    mocks.failure="before"; await expect(create()).rejects.toThrow();
    await draft.save({fields:{...fields(),reason:"Newer unsent draft"},destination:"recipient",capacity:"32768"});
    const result=await createCareHandoff(mocks.uid,view,"recipient",fields(),32768,revision); expect(result.approvalRevision).toBe(revision); expect((await storage.readCareDraft(mocks.uid,view.id))?.fields.reason).toBe("Newer unsent draft");
  });
  it("treats repeated approval after draft cleanup as recovery until a new draft is edited",async()=>{
    const draft=new CareDraftSession(mocks.uid,view.id); await draft.save({fields:fields(),destination:"recipient",capacity:"32768"});
    const result=await create(); await draft.complete();
    expect((await createCareHandoff(mocks.uid,view,"recipient",fields(),32768,draft.revision)).id).toBe(result.id); expect(mocks.writes).toBe(3);
    await draft.save({fields:fields(),destination:"recipient",capacity:"32768"});
    const next=await create(); expect(next.id).not.toBe(result.id); expect(mocks.writes).toBe(5);
  });
  it("rejects a re-encrypted but altered approval without the original signature",async()=>{
    mocks.failure="before"; await expect(create()).rejects.toThrow();
    const sealed=await pendingRaw(); const wrapper=await unwrapCare(mocks.uid,sealed);
    expect(sealed).not.toContain("Synthetic reason");
    wrapper.value.handoff.fields.reason="Substituted";
    await pendingRaw(await wrapCare(wrapper,await localSharingDevice(mocks.uid)));
    await expect(create()).rejects.toThrow("integrity differs"); expect(mocks.writes).toBe(0);
  });
  it("isolates saved approvals across accounts and patients",async()=>{
    mocks.failure="before"; await expect(create()).rejects.toThrow();
    expect(await storage.readPendingCareHandoff(mocks.uid,crypto.randomUUID())).toBeUndefined();
    const other=`doctor-${crypto.randomUUID()}`; mocks.uid=other;
    expect(await storage.readPendingCareHandoff(other,view.id)).toBeUndefined();
  });
  it("does not recreate previously confirmed records if server evidence disappears",async()=>{
    const result=await create(); mocks.data.delete(`careHandoffs/${result.id}`); mocks.data.delete(`careCases/${view.id}/entries/${result.id}`);
    await expect(create()).rejects.toThrow("No replacement was created"); expect(mocks.transactions).toBe(1);
  });
});
