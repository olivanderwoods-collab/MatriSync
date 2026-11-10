import "fake-indexeddb/auto";
import {IDBFactory} from "fake-indexeddb";
import {beforeAll,afterAll,describe,expect,it,vi} from "vitest";
import {randomBytes} from "node:crypto";
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from "node:fs";
import {join,relative,resolve} from "node:path";
import {CompactSign,compactDecrypt} from "jose";
import {saveCareCopy,saveCareHandoff,saveCareReceipt,saveCareDraft,clearCareDraft,claimPendingCareHandoff,confirmPendingCareHandoff,readCareCopy,readCareDraft,readPendingCareHandoff,latestCareHandoff,careReceipts,type PendingCareHandoff,type SavedCareHandoff,type CareHandoffDraft} from "../src/care-storage";
import {localSharingDevice,existingSharingDevice} from "../src/sharing-storage";
import {newSharingDevice} from "../src/sharing-crypto";
import {wrapCare,unwrapCareBytes,newCareKey} from "../src/care-crypto";
import {emptyReferralFields} from "../src/referral-draft";
import {frameHandoff} from "../src/handoff-frame";
import {base64} from "../src/vault-crypto";
import type {CareView} from "../src/care-model";
import {IsolatedRecoveryVerifier,RECOVERY_DOMAIN,bytes,approvalClaims,closureClaims,possessionClaims} from "./recovery-verifier";
import {ExportDatabase,IsolatedRecoveryExport} from "./recovery-export";
import {reviewSourceSelection,sourceSession} from "./recovery-source";
import {ImportDatabase,IsolatedRecoveryImport,rawDigest} from "./recovery-import";
import type {StoragePoint} from "./recovery-sqlite";

const auth=vi.hoisted(()=>({currentUser:{uid:"",isAnonymous:false}}));
vi.mock("../src/auth",()=>({accountAuth:async()=>auth}));
const root=resolve(".local-tools");let dir:string;
beforeAll(()=>{mkdirSync(root,{recursive:true});dir=mkdtempSync(join(root,"recovery-export-"));});
afterAll(()=>{if(dir&&relative(root,dir).startsWith("recovery-export-")&&!relative(root,dir).includes(".."))rmSync(dir,{recursive:true,force:true});});
async function sourceRaw<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore)=>IDBRequest<T>,store="copies",name="matrisync-care-v1"){
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(name,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  return new Promise<T>((resolve,reject)=>{const tx=db.transaction(store,mode),r=work(tx.objectStore(store));tx.oncomplete=()=>{db.close();resolve(r.result);};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error);};});
}
async function fixture(status:"approved"|"pending"|"rejected"="approved"){
  const uid=`synthetic-${crypto.randomUUID()}`;auth.currentUser={uid,isAnonymous:false};
  const source=await localSharingDevice(uid),target=await newSharingDevice(),recipient=await newSharingDevice(),caseId=crypto.randomUUID(),id=crypto.randomUUID();
  const state={enabled:true,cases:[caseId],now:1794268800000};
  const authority=()=>({enabled:state.enabled,cases:state.cases,device:{encryption:source.encryption,signing:source.signing,keyId:source.keyId}});
  const verifier=new IsolatedRecoveryVerifier({clock:()=>state.now,authority:u=>u===uid?authority():undefined});
  const offer=await verifier.request(uid,{version:1,id,uid,oldKeyId:source.keyId,newDevice:{encryption:target.encryption,signing:target.signing,keyId:target.keyId}});
  const nonce=JSON.parse(new TextDecoder().decode((await compactDecrypt(offer.challengeEnvelope,target.decryptKey)).plaintext))[4];
  const possession=await new CompactSign(bytes(possessionClaims(offer,nonce))).setProtectedHeader({alg:"ES256",typ:`${RECOVERY_DOMAIN}:possession`,kid:target.keyId}).sign(target.signKey);
  if(status==="approved")await verifier.approve(uid,{id,cases:[caseId],possession,approval:await new CompactSign(bytes(await approvalClaims(offer,[caseId],possession))).setProtectedHeader({alg:"ES256",typ:`${RECOVERY_DOMAIN}:approval`,kid:source.keyId}).sign(source.signKey)});
  if(status==="rejected")await verifier.close(uid,{id,status,proof:await new CompactSign(bytes(closureClaims(offer,status))).setProtectedHeader({alg:"ES256",typ:`${RECOVERY_DOMAIN}:${status}`,kid:source.keyId}).sign(source.signKey)});
  const profile={name:"Synthetic existing patient",birthDate:"",sourceLocalId:"synthetic-existing",sourceUid:uid,history:"  original Unicode বাংলা  "};
  const time="2026-11-08T01:00:00.000Z",fields={...emptyReferralFields(),reason:"  exact original reason  "};
  const saved:SavedCareHandoff={version:1,id:crypto.randomUUID(),caseId,sourceUid:uid,recipientUid:"synthetic-destination",profile,fields,packet:base64(frameHandoff(bytes("Original recipient ciphertext বাংলা"),32768)),actorName:"Synthetic Doctor",recordedAt:time};
  const view:CareView={id:caseId,key:newCareKey(),profile,entries:[],verified:true,snapshotOnly:false,receivedAt:time};
  const receipt:CareView={...view,key:"",verified:false,snapshotOnly:true,handoffId:saved.id,entries:[{id:saved.id,kind:"referral",actorUid:uid,actorName:saved.actorName,role:"doctor",recordedAt:time,serverAt:"",text:"",fields}]};
  const draft:CareHandoffDraft={version:1,caseId,sourceUid:uid,revision:crypto.randomUUID(),fields,destination:"",capacity:"",updatedAt:time};
  const pending:PendingCareHandoff={version:1,status:"pending",handoff:saved,approvalRevision:draft.revision,capacity:32768,sourceFacility:"synthetic-facility",senderKeyId:source.keyId,recipientKeyId:recipient.keyId,entryEncrypted:"original-entry-ciphertext",grantWrapped:"original-grant-envelope"};
  await saveCareCopy(uid,view);await saveCareHandoff(uid,saved);await saveCareReceipt(uid,receipt);await saveCareDraft(uid,draft,null);await claimPendingCareHandoff(uid,pending);
  const slots=[caseId,`outgoing:${caseId}:${saved.id}`,`receipt:${caseId}:${saved.id}`,`draft:${caseId}`,`pending:${caseId}`];
  const choices=await reviewSourceSelection(uid,slots);
  const path=join(dir,`${id}-export.sqlite`),key=randomBytes(32),storeId=crypto.randomUUID();
  const store=new ExportDatabase(path,key,storeId);store.initialize();
  const exporter=(fault?:(point:StoragePoint)=>void)=>new IsolatedRecoveryExport({store:new ExportDatabase(path,key,storeId,{fault}),verifier,authority:u=>u===uid?authority():undefined});
  const dest=new ImportDatabase(join(dir,`${id}-import.sqlite`),randomBytes(32),crypto.randomUUID());dest.initialize();
  const receiver=new IsolatedRecoveryImport({uid,target,store:dest,verifier,authority:u=>u===uid?authority():undefined,clock:()=>state.now});
  const snapshot=async()=>{const result:Record<string,string>={};for(const slot of slots)result[slot]=await sourceRaw("readonly",s=>s.get([uid,slot]));return result;};
  return {uid,source,target,caseId,id,state,verifier,saved,view,receipt,draft,pending,slots,choices,path,key,store,exporter,receiver,snapshot};
}
async function transfer(f:Awaited<ReturnType<typeof fixture>>){const p=await f.exporter().prepare(f.uid,f.id,f.choices);await f.receiver.begin(f.uid,p.manifestEnvelope);for(const o of p.objects)await f.receiver.stage(f.uid,f.id,o.envelope);await f.receiver.finish(f.uid,f.id);return p;}

describe("read-only source export and actual care-storage compatibility",()=>{
  it("round trips actual writer output byte-for-byte without changing source stores",async()=>{
    const f=await fixture(),before=await f.snapshot(),p=await transfer(f);
    for(const d of p.manifest.objects){const expected=await unwrapCareBytes(f.uid,before[d.sourceId]),actual=await f.receiver.read(f.uid,d.sourceId);expect(actual?.bytes).toEqual(expected);expect(actual?.quarantined).toBe(d.kind==="pending");expect(d.sha256).toBe(await rawDigest(expected));}
    expect(await f.snapshot()).toEqual(before);
    expect(await readCareCopy(f.uid,f.caseId)).toEqual(f.view);expect(await latestCareHandoff(f.uid,f.caseId)).toEqual(f.saved);expect(await readCareDraft(f.uid,f.caseId)).toEqual(f.draft);expect(await readPendingCareHandoff(f.uid,f.caseId)).toEqual(f.pending);expect(await careReceipts(f.uid,f.caseId)).toEqual([f.receipt]);
    expect(f.source.decryptKey.extractable).toBe(false);expect(f.source.signKey.extractable).toBe(false);
    const restored=JSON.parse(new TextDecoder().decode((await f.receiver.read(f.uid,f.slots[2]))!.bytes));expect(restored.entries[0].serverAt).toBe("");expect(restored.profile).not.toHaveProperty("details");
  });
  it("preserves original receipt time and a later verification after offline rescans",async()=>{
    const f=await fixture(),verifiedAt="2026-11-09T02:00:00.000Z";
    await saveCareReceipt(f.uid,{...f.receipt,receivedAt:verifiedAt,verified:true,verifiedAt});await saveCareReceipt(f.uid,{...f.receipt,receivedAt:"2026-11-10T02:00:00.000Z"});
    f.choices=await reviewSourceSelection(f.uid,f.slots);await transfer(f);
    const restored=JSON.parse(new TextDecoder().decode((await f.receiver.read(f.uid,f.slots[2]))!.bytes));
    expect(restored.receivedAt).toBe(f.receipt.receivedAt);expect(restored.verifiedAt).toBe(verifiedAt);expect(restored.verified).toBe(true);expect(restored.entries[0].serverAt).toBe("");
  });
  it("preserves a cleared draft marker and confirmed pending proof from actual writers",async()=>{
    const f=await fixture();await clearCareDraft(f.uid,f.caseId,f.draft.revision);await confirmPendingCareHandoff(f.uid,f.pending);
    f.choices=await reviewSourceSelection(f.uid,f.slots);const before=await f.snapshot();await transfer(f);
    const draft=JSON.parse(new TextDecoder().decode((await f.receiver.read(f.uid,f.slots[3]))!.bytes));expect(draft.cleared).toBe(true);expect(draft.fields).toEqual(emptyReferralFields());
    const pending=JSON.parse(new TextDecoder().decode((await f.receiver.read(f.uid,f.slots[4]))!.bytes));expect(pending.value.status).toBe("confirmed");expect((await f.receiver.read(f.uid,f.slots[4]))!.quarantined).toBe(true);
    expect(await f.snapshot()).toEqual(before);expect((await readPendingCareHandoff(f.uid,f.caseId))?.status).toBe("confirmed");
  });
  it("exports exactly the explicit selection and derives identities and lengths itself",async()=>{
    const f=await fixture(),selected=f.choices.filter(c=>c.sourceId===f.slots[3]);const p=await f.exporter().prepare(f.uid,f.id,selected);
    expect(p.manifest.objects).toHaveLength(1);expect(p.manifest.objects[0]).toMatchObject({caseId:f.caseId,kind:"draft",sourceId:f.slots[3]});
    await expect(f.exporter().prepare(f.uid,f.id,f.choices)).rejects.toThrow("conflicts");
    expect(await f.snapshot()).toBeTruthy();
  });
  it("refuses changed source revisions before preparation without replacing the selection",async()=>{
    const f=await fixture();await saveCareDraft(f.uid,{...f.draft,revision:crypto.randomUUID(),fields:{...f.draft.fields,reason:"newer source draft"}},f.draft.revision);
    await expect(f.exporter().prepare(f.uid,f.id,f.choices)).rejects.toThrow("changed");expect(await f.store.transaction(async rows=>rows.size)).toBe(0);
    f.choices=await reviewSourceSelection(f.uid,f.slots);await transfer(f);expect((await readCareDraft(f.uid,f.caseId))?.fields.reason).toBe("newer source draft");
  });
  it("reuses the durable exact package after response loss and later source edits",async()=>{
    const f=await fixture();await expect(f.exporter(point=>{if(point==="after-commit")throw Error("Lost export response");}).prepare(f.uid,f.id,f.choices)).rejects.toThrow("Lost export response");
    const original=await f.exporter().prepare(f.uid,f.id,f.choices);
    await saveCareDraft(f.uid,{...f.draft,revision:crypto.randomUUID(),fields:{...f.draft.fields,reason:"newer draft retained"}},f.draft.revision);
    const retry=await f.exporter().prepare(f.uid,f.id,[...f.choices].reverse());expect(retry).toEqual(original);retry.objects[0].envelope="mutated";expect(await f.exporter().prepare(f.uid,f.id,f.choices)).toEqual(original);
    await expect(f.exporter().prepare(f.uid,f.id,await reviewSourceSelection(f.uid,f.slots))).rejects.toThrow("conflicts");expect((await readCareDraft(f.uid,f.caseId))?.fields.reason).toBe("newer draft retained");
  });
  it.each(["pending","rejected"] as const)("does not prepare data for a %s recovery operation",async status=>{
    const f=await fixture(status);await expect(f.exporter().prepare(f.uid,f.id,f.choices)).rejects.toThrow("approved");expect(await f.store.transaction(async rows=>rows.size)).toBe(0);
  });
  it("rejects foreign, anonymous and signed-out accounts before exporting",async()=>{
    const f=await fixture();for(const current of [{uid:"foreign",isAnonymous:false},{uid:f.uid,isAnonymous:true},{uid:"",isAnonymous:false}]){auth.currentUser=current;await expect(f.exporter().prepare(f.uid,f.id,f.choices)).rejects.toThrow("Sign in");}
    auth.currentUser={uid:f.uid,isAnonymous:false};expect(await f.store.transaction(async rows=>rows.size)).toBe(0);
  });
  it("never generates a replacement when the original saved key is missing",async()=>{
    const f=await fixture();await sourceRaw("readwrite",s=>s.delete(f.uid),"devices","matrisync-sharing-pilot-v1");
    try{await expect(sourceSession(f.uid)).rejects.toThrow("no replacement");await expect(f.exporter().prepare(f.uid,f.id,f.choices)).rejects.toThrow("missing");expect(await existingSharingDevice(f.uid)).toBeUndefined();}
    finally{await sourceRaw("readwrite",s=>s.put(f.source,f.uid),"devices","matrisync-sharing-pilot-v1");}
  });
  it("does not create absent source databases while attempting review",async()=>{
    const isolated=new IDBFactory(),previous=indexedDB;auth.currentUser={uid:"synthetic-empty-source",isAnonymous:false};vi.stubGlobal("indexedDB",isolated);
    try{await expect(reviewSourceSelection(auth.currentUser.uid,[crypto.randomUUID()])).rejects.toThrow("missing");expect(await isolated.databases()).toEqual([]);}finally{vi.stubGlobal("indexedDB",previous);}
  });
  it("does not initialize a missing care database when the original identity exists",async()=>{
    const isolated=new IDBFactory(),previous=indexedDB;auth.currentUser={uid:"synthetic-empty-care",isAnonymous:false};vi.stubGlobal("indexedDB",isolated);
    try{await localSharingDevice(auth.currentUser.uid);const before=await isolated.databases();await expect(reviewSourceSelection(auth.currentUser.uid,[crypto.randomUUID()])).rejects.toThrow("missing");expect(await isolated.databases()).toEqual(before);}finally{vi.stubGlobal("indexedDB",previous);}
  });
  it("uses only readonly source transactions during review and preparation",async()=>{
    const f=await fixture(),probe=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open("matrisync-care-v1",1);r.onsuccess=()=>resolve(r.result);});
    const prototype=Object.getPrototypeOf(probe) as IDBDatabase;probe.close();const calls:IDBTransactionMode[]=[];
    const original=prototype.transaction;
    const spy=vi.spyOn(prototype,"transaction").mockImplementation(function(this:IDBDatabase,names:string|Iterable<string>,mode?:IDBTransactionMode,options?:IDBTransactionOptions){calls.push(mode??"readonly");return original.call(this,names,mode,options);});
    try{const choices=await reviewSourceSelection(f.uid,f.slots);await f.exporter().prepare(f.uid,f.id,choices);expect(calls.length).toBeGreaterThan(0);expect(calls.every(mode=>mode==="readonly")).toBe(true);}finally{spy.mockRestore();}
  });
  it("rejects source schema upgrades without downgrading or changing the database",async()=>{
    const isolated=new IDBFactory(),previous=indexedDB;auth.currentUser={uid:"synthetic-new-source-version",isAnonymous:false};vi.stubGlobal("indexedDB",isolated);
    try{
      await localSharingDevice(auth.currentUser.uid);
      await new Promise<void>(resolve=>{const r=indexedDB.open("matrisync-care-v1",2);r.onupgradeneeded=()=>r.result.createObjectStore("copies");r.onsuccess=()=>{r.result.close();resolve();};});
      const before=await isolated.databases();await expect(reviewSourceSelection(auth.currentUser.uid,[crypto.randomUUID()])).rejects.toThrow("unsupported");expect(await isolated.databases()).toEqual(before);
    }finally{vi.stubGlobal("indexedDB",previous);}
  });
  it("refuses a different local device even with the same account login",async()=>{
    const f=await fixture();await sourceRaw("readwrite",s=>s.put(f.target,f.uid),"devices","matrisync-sharing-pilot-v1");
    try{await expect(f.exporter().prepare(f.uid,f.id,f.choices)).rejects.toThrow("original approved");}finally{await sourceRaw("readwrite",s=>s.put(f.source,f.uid),"devices","matrisync-sharing-pilot-v1");}
  });
  it("rejects excluded slots, duplicate choices, extra metadata and absent records",async()=>{
    const f=await fixture();for(const selected of [[],[...f.choices,f.choices[0]],[{...f.choices[0],kind:"file"}],[{...f.choices[0],sourceId:`document:${f.caseId}`}],[{...f.choices[0],encryptedDigest:"bad"}]])await expect(f.exporter().prepare(f.uid,f.id,selected)).rejects.toThrow();
    await expect(reviewSourceSelection(f.uid,[`file:${f.caseId}`])).rejects.toThrow();await expect(reviewSourceSelection(f.uid,[crypto.randomUUID()])).rejects.toThrow("missing");
  });
  it("copies the explicit selection before asynchronous work",async()=>{
    const f=await fixture(),selected=structuredClone(f.choices),preparing=f.exporter().prepare(f.uid,f.id,selected);selected[0].encryptedDigest="0".repeat(64);selected.pop();
    const result=await preparing;expect(result.manifest.objects).toHaveLength(f.choices.length);expect(await f.exporter().prepare(f.uid,f.id,f.choices)).toEqual(result);
  });
  it("requires byte-identical source review even when replacement ciphertext decrypts identically",async()=>{
    const f=await fixture();await saveCareCopy(f.uid,f.view);
    await expect(f.exporter().prepare(f.uid,f.id,f.choices)).rejects.toThrow("changed");expect(await f.store.transaction(async rows=>rows.size)).toBe(0);
  });
  it("does not export substituted ciphertext copied from a different patient slot",async()=>{
    const f=await fixture(),other=crypto.randomUUID();await saveCareCopy(f.uid,{...f.view,id:other});
    const substituted=await sourceRaw<string>("readonly",s=>s.get([f.uid,other]));await sourceRaw("readwrite",s=>s.put(substituted,[f.uid,f.caseId]));
    await expect(f.exporter().prepare(f.uid,f.id,await reviewSourceSelection(f.uid,f.slots))).rejects.toThrow("identity");
    expect(await sourceRaw("readonly",s=>s.get([f.uid,f.caseId]))).toBe(substituted);
  });
  it("refuses a selected case outside approval and current assignment",async()=>{
    const f=await fixture(),other=crypto.randomUUID();await saveCareCopy(f.uid,{...f.view,id:other});
    await expect(f.exporter().prepare(f.uid,f.id,await reviewSourceSelection(f.uid,[other]))).rejects.toThrow("not approved");f.state.cases=[];
    await expect(f.exporter().prepare(f.uid,f.id,f.choices)).rejects.toThrow("authority");
  });
  it.each(["version","extra-file","patient","bad-time"])("refuses unsupported saved content: %s",async change=>{
    const f=await fixture(),v:Record<string,unknown>={...f.draft};if(change==="version")v.version=2;if(change==="extra-file")v.attachment={bytes:"original PDF"};if(change==="patient")v.caseId=crypto.randomUUID();if(change==="bad-time")v.updatedAt="not-a-time";
    await sourceRaw("readwrite",s=>s.put("temporary",[f.uid,f.slots[3]]));const sealed=await wrapCare(v,f.source);await sourceRaw("readwrite",s=>s.put(sealed,[f.uid,f.slots[3]]));
    const choices=await reviewSourceSelection(f.uid,f.slots);await expect(f.exporter().prepare(f.uid,f.id,choices)).rejects.toThrow();expect(await sourceRaw("readonly",s=>s.get([f.uid,f.slots[3]]))).toBe(sealed);
  });
  it("rejects missing server timestamps outside the actual received-snapshot shape",async()=>{
    const f=await fixture();await saveCareCopy(f.uid,{...f.receipt,snapshotOnly:false});f.choices=await reviewSourceSelection(f.uid,f.slots);
    await expect(f.exporter().prepare(f.uid,f.id,f.choices)).rejects.toThrow("time");
  });
  it.each(["account","authority","disk"])("rolls back prepared export when %s changes before durable commit",async change=>{
    const f=await fixture(),before=await f.snapshot();const exporter=f.exporter(point=>{if(point!=="after-write")return;if(change==="account")auth.currentUser={uid:"foreign",isAnonymous:false};if(change==="authority")f.state.enabled=false;if(change==="disk")throw Error("Synthetic disk error");});
    await expect(exporter.prepare(f.uid,f.id,f.choices)).rejects.toThrow();expect(await f.store.transaction(async rows=>rows.size)).toBe(0);
    auth.currentUser={uid:f.uid,isAnonymous:false};f.state.enabled=true;expect(await f.snapshot()).toEqual(before);await transfer(f);
  });
  it("serializes concurrent preparation to one exact signature and package",async()=>{
    const f=await fixture(),results=await Promise.all(Array.from({length:4},()=>f.exporter().prepare(f.uid,f.id,f.choices)));
    for(const result of results)expect(result).toEqual(results[0]);expect(await f.store.transaction(async rows=>rows.size)).toBe(1);
    const file=readFileSync(f.path);for(const secret of [f.uid,f.view.profile.name,f.saved.packet,f.key.toString("hex")])expect(file.includes(Buffer.from(secret))).toBe(false);
  });
});

