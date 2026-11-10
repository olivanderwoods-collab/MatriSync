import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCompactApproval, sourceMatchesApproval, validateCompactApproval } from "./approval";
import { readCompactApproval, saveCompactApproval } from "./approval-storage";
import { prepareCompactReview } from "./review";
import { allReferralFields } from "../referral-draft";
import { localSharingDevice, existingSharingDevice } from "../sharing-storage";
import { base64 } from "../vault-crypto";
const auth=vi.hoisted(()=>({currentUser:{uid:"",isAnonymous:false}}));
vi.mock("../auth",()=>({accountAuth:async()=>auth}));
beforeEach(()=>{auth.currentUser={uid:crypto.randomUUID(),isAnonymous:false};});
async function fixture(enroll=true,patientId=crypto.randomUUID(),previousId:string|null=null){
  const uid=auth.currentUser.uid;
  if(enroll)await localSharingDevice(uid);
  const identity={patientId,professionalId:uid,patientName:"Synthetic private name",referralId:crypto.randomUUID(),sendingFacilityId:"synthetic-facility",subject:"mother" as const,createdAt:"2026-11-11T01:00:00.000Z"};
  const source={reason:"Exact reason · মা",history:"Excluded source history",treatment:"",instructions:"",allergies:"unknown",drugsGiven:"Recorded synthetic medicine only"};
  const review=await prepareCompactReview(identity,source,allReferralFields.filter(k=>k!=="history"));
  const approval=await buildCompactApproval(uid,review,previousId);
  return{uid,patientId,identity,source,review,approval};
}
async function raw<T>(store:string,mode:IDBTransactionMode,work:(s:IDBObjectStore)=>IDBRequest<T>,dbName="matrisync-compact-approvals-v1"){
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  return new Promise<T>((resolve,reject)=>{const tx=db.transaction(store,mode),r=work(tx.objectStore(store));tx.oncomplete=()=>{db.close();resolve(r.result);};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error);};});
}
describe("Durable compact handoff approvals",()=>{
  it("persists exact signed/encrypted source and selection, including omitted source",async()=>{
    const f=await fixture();await saveCompactApproval(f.uid,f.approval);
    const ciphertext=await raw<string>("records","readonly",s=>s.get([f.uid,f.patientId,f.approval.id]));
    for(const text of [f.identity.patientName,f.source.reason,f.source.history,f.approval.binary])expect(ciphertext).not.toContain(text);
    expect(await readCompactApproval(f.uid,f.patientId)).toEqual(f.approval);
    expect(f.approval.binary).toBe(base64(f.review.binary));expect(f.approval.included).not.toContain("history");expect(f.approval.source.history).toBe(f.source.history);
  });
  it("reconciles the exact saved approval without resealing or adding another record",async()=>{
    const f=await fixture();await saveCompactApproval(f.uid,f.approval);
    const before=await raw<string>("records","readonly",s=>s.get([f.uid,f.patientId,f.approval.id]));
    expect(await saveCompactApproval(f.uid,structuredClone(f.approval))).toEqual(f.approval);
    expect(await raw("records","readonly",s=>s.get([f.uid,f.patientId,f.approval.id]))).toBe(before);
    await expect(saveCompactApproval(f.uid,{...f.approval,approvedAt:"2026-11-11T02:00:00.000Z"})).rejects.toThrow(/different content/);
  });
  it("retains previous immutable approvals and detects newer source separately",async()=>{
    const f=await fixture();await saveCompactApproval(f.uid,f.approval);
    const next=await fixture(true,f.patientId,f.approval.id);await saveCompactApproval(f.uid,next.approval);
    expect(await readCompactApproval(f.uid,f.patientId)).toEqual(next.approval);
    expect(await readCompactApproval(f.uid,f.patientId,f.approval.id)).toEqual(f.approval);
    expect(sourceMatchesApproval(f.approval,f.identity,f.source)).toBe(true);
    expect(sourceMatchesApproval(f.approval,f.identity,{...f.source,reason:"Changed"})).toBe(false);
    expect(sourceMatchesApproval(f.approval,f.identity,{...f.source,contact:""})).toBe(false);
    await expect(saveCompactApproval(f.uid,f.approval)).rejects.toThrow(/Another tab/);
  });
  it("serializes competing tabs; only one head and record wins",async()=>{
    const f=await fixture(),other=await fixture(true,f.patientId);
    const results=await Promise.allSettled([saveCompactApproval(f.uid,f.approval),saveCompactApproval(f.uid,other.approval)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    const head=await readCompactApproval(f.uid,f.patientId);expect([f.approval.id,other.approval.id]).toContain(head?.id);
    const keys=await raw<IDBValidKey[]>("records","readonly",s=>s.getAllKeys());expect(keys.filter(k=>Array.isArray(k)&&k[0]===f.uid)).toHaveLength(1);
  });
  it("rejects changed content, forged binary, reordered selection and source hashes",async()=>{
    const f=await fixture();
    for(const changed of [{...f.approval,source:{...f.source,reason:"Altered"}},{...f.approval,binary:base64(new Uint8Array([1]))},{...f.approval,included:[...f.approval.included].reverse()},{...f.approval,sourceHash:"0".repeat(64)},{...f.approval,identity:{...f.identity,professionalId:"someone-else"}}])await expect(validateCompactApproval(changed,f.uid,f.patientId)).rejects.toThrow();
    await expect(buildCompactApproval(f.uid,{...f.review,binary:new Uint8Array([1])},null)).rejects.toThrow();
  });
  it("isolates accounts, cases and anonymous sessions",async()=>{
    const f=await fixture();await saveCompactApproval(f.uid,f.approval);
    expect(await readCompactApproval(f.uid,"other-patient")).toBeUndefined();
    auth.currentUser.uid="other-account";expect(await readCompactApproval("other-account",f.patientId)).toBeUndefined();
    await expect(readCompactApproval(f.uid,f.patientId)).rejects.toThrow(/Sign in/);
    await expect(saveCompactApproval("other-account",f.approval)).rejects.toThrow();
    auth.currentUser={uid:f.uid,isAnonymous:true};await expect(readCompactApproval(f.uid,f.patientId)).rejects.toThrow(/Sign in/);
  });
  it("refuses missing keys without enrolling a replacement",async()=>{
    const f=await fixture(false);expect(await readCompactApproval(f.uid,f.patientId)).toBeUndefined();
    await expect(saveCompactApproval(f.uid,f.approval)).rejects.toThrow(/original enrolled/);expect(await existingSharingDevice(f.uid)).toBeUndefined();
    await localSharingDevice(f.uid);await saveCompactApproval(f.uid,f.approval);
    await raw("devices","readwrite",s=>s.delete(f.uid),"matrisync-sharing-pilot-v1");
    await expect(readCompactApproval(f.uid,f.patientId)).rejects.toThrow(/original device key/);expect(await existingSharingDevice(f.uid)).toBeUndefined();
  });
  it("refuses ciphertext substitutions and missing/corrupt rows without resetting",async()=>{
    const f=await fixture(),other=await fixture();await saveCompactApproval(f.uid,f.approval);await saveCompactApproval(other.uid,other.approval);
    const cipher=await raw<string>("records","readonly",s=>s.get([f.uid,f.patientId,f.approval.id]));
    await raw("records","readwrite",s=>s.put(cipher,[other.uid,other.patientId,other.approval.id]));await expect(readCompactApproval(other.uid,other.patientId)).rejects.toThrow();
    await raw("records","readwrite",s=>s.delete([f.uid,f.patientId,f.approval.id]));await expect(readCompactApproval(f.uid,f.patientId)).rejects.toThrow(/missing or damaged/);
    await expect(saveCompactApproval(f.uid,f.approval)).rejects.toThrow(/missing or damaged/);
  });
  it("aborts when the source/session changes at a transaction guard",async()=>{
    const f=await fixture();await expect(saveCompactApproval(f.uid,f.approval,()=>false)).rejects.toThrow(/Source changed/);expect(await readCompactApproval(f.uid,f.patientId)).toBeUndefined();
    let calls=0;await expect(saveCompactApproval(f.uid,f.approval,()=>++calls<2)).rejects.toThrow(/Source changed/);expect(await readCompactApproval(f.uid,f.patientId)).toBeUndefined();
    await expect(saveCompactApproval(f.uid,f.approval,()=>{auth.currentUser.uid="changed";return true;})).rejects.toThrow();
    auth.currentUser.uid=f.uid;expect(await readCompactApproval(f.uid,f.patientId)).toBeUndefined();
  });
  it("snapshots the click before asynchronous encryption",async()=>{
    const f=await fixture(),copy=structuredClone(f.approval),saving=saveCompactApproval(f.uid,copy);
    copy.source.reason="Changed after click";copy.identity.patientName="Different";
    await saving;expect(await readCompactApproval(f.uid,f.patientId)).toEqual(f.approval);
  });
  it("keeps large excluded provenance without requiring it to fit the NFC codec",async()=>{
    const f=await fixture(),source={...f.source,history:"অ".repeat(8000),treatment:"অ".repeat(8000),instructions:"অ".repeat(8000)};
    const review=await prepareCompactReview(f.identity,source,["reason"]),value=await buildCompactApproval(f.uid,review,null);
    await saveCompactApproval(f.uid,value);expect((await readCompactApproval(f.uid,f.patientId))?.source).toEqual(source);
  });
});
