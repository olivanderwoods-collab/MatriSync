// Loopback developer fixture only. Synthetic authority, not authenticated recovery.
import {CompactSign} from "jose";
import {newSharingDevice,type SharingDevice,type PublicDevice} from "../src/sharing-crypto";
import {emptyReferralFields} from "../src/referral-draft";
import {BrowserImportDatabase,IsolatedRecoveryImport,bytes,digest,rawDigest,sealImportManifest,sealImportObject,verifyImportAcknowledgement,type BrowserStoreBinding,type Decision,type Manifest,type ImportReceipt,type ImportRow} from "./recovery-browser";

if(location.origin!=="http://127.0.0.1:4191")throw Error("Storage fixture is loopback-only.");
const params=new URLSearchParams(location.search);let run=params.get("run");
if(!run){run=crypto.randomUUID();params.set("run",run);history.replaceState(null,"",`/?${params}`);}
if(!/^[a-f0-9-]{36}$/.test(run))throw Error("Invalid fixture run.");
const runId=run;
type Saved={binding:BrowserStoreBinding;conflict:BrowserStoreBinding;target:SharingDevice;source:PublicDevice;decision:Decision;manifest:Manifest;envelope:string;tokens:string[];raws:Uint8Array[];receipt?:ImportReceipt;ack?:string};
async function meta(value?:Saved):Promise<Saved>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open("matrisync-isolated-storage-fixture-v1",1);r.onupgradeneeded=()=>r.result.createObjectStore("runs");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction("runs",value?"readwrite":"readonly"),request=value?tx.objectStore("runs").put(value,runId):tx.objectStore("runs").get(runId);tx.oncomplete=()=>{const result=value??request.result;if(!result)reject(Error("Prepare this synthetic run first."));else resolve(result);};tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
const pub=(d:SharingDevice)=>({encryption:d.encryption,signing:d.signing,keyId:d.keyId});
const assert=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function receiver(s:Saved,store=new BrowserImportDatabase(s.binding)){
  return new IsolatedRecoveryImport({uid:s.binding.uid,target:s.target,store,verifier:{reconcile:async()=>s.decision},authority:()=>({enabled:true,device:s.source,cases:s.decision.cases}),clock:Date.now});
}
async function prepare(){
  const source=await newSharingDevice(),target=await newSharingDevice(),uid=`synthetic-${runId}`,caseId=crypto.randomUUID(),id=crypto.randomUUID();
  const fields={...emptyReferralFields(),remarks:"  original wording — বাংলা  "},date=new Date().toISOString();
  const draft={version:1,caseId,sourceUid:uid,revision:crypto.randomUUID(),fields,destination:"",capacity:"",updatedAt:date};
  const handoff={version:1,id:crypto.randomUUID(),caseId,sourceUid:uid,recipientUid:"synthetic-recipient",profile:{name:"Synthetic Mother",birthDate:"",sourceLocalId:"synthetic",sourceUid:uid},fields,packet:"unchanged-original-packet",actorName:"Synthetic Doctor",recordedAt:date};
  const pending={version:1,status:"pending",handoff,approvalRevision:draft.revision,capacity:32768,sourceFacility:"synthetic-facility",senderKeyId:source.keyId,recipientKeyId:target.keyId,entryEncrypted:"unchanged-entry",grantWrapped:"unchanged-grant"};
  const proof=await new CompactSign(bytes(pending)).setProtectedHeader({alg:"ES256",typ:"matrisync-care+jws",kid:source.keyId}).sign(source.signKey);
  const raws=[new TextEncoder().encode(JSON.stringify(draft,null,2)),new TextEncoder().encode(JSON.stringify({value:pending,proof},null,2))];
  const decision:Decision={version:1,status:"approved",id,uid,requestDigest:"a".repeat(64),scopeDigest:await digest([caseId]),cases:[caseId],decidedAt:Date.now(),epoch:{keyId:target.keyId,parentKeyId:source.keyId,device:pub(target)}};
  const objects=await Promise.all(raws.map(async(raw,i)=>({id:crypto.randomUUID(),caseId,kind:i?"pending" as const:"draft" as const,sourceId:`${i?"pending":"draft"}:${caseId}`,length:raw.length,sha256:await rawDigest(raw)})));
  const manifest:Manifest={version:1,id,uid,requestDigest:decision.requestDigest,decisionDigest:await digest(decision),sourceKeyId:source.keyId,targetKeyId:target.keyId,cases:[caseId],objects};
  const binding={uid,deviceKeyId:target.keyId,storeId:runId},conflict={...binding,storeId:crypto.randomUUID()};
  const saved:Saved={binding,conflict,target,source:pub(source),decision,manifest,raws,envelope:await sealImportManifest(manifest,source,target),tokens:await Promise.all(raws.map((raw,i)=>sealImportObject(manifest,objects[i].id,raw,target)))};
  await new BrowserImportDatabase(binding).initialize();await new BrowserImportDatabase(conflict).initialize();await meta(saved);
  const r=receiver(saved);await r.begin(uid,saved.envelope);await r.stage(uid,id,saved.tokens[0]);
  assert(await r.read(uid,objects[0].sourceId)===undefined,"Partial records must stay invisible");
  return "PASS: prepared partial encrypted recovery; nothing published. Reload to verify saved staging.";
}
async function partial(){
  const s=await meta(),r=receiver(s);await r.begin(s.binding.uid,s.envelope);await r.stage(s.binding.uid,s.decision.id,s.tokens[0]);
  let refused=false;try{await r.finish(s.binding.uid,s.decision.id);}catch(e){refused=String(e).includes("incomplete");}
  assert(refused,"Incomplete recovery did not refuse completion");assert(await r.read(s.binding.uid,s.manifest.objects[0].sourceId)===undefined,"Partial records leaked");
  assert(!s.target.signKey.extractable&&!s.target.decryptKey.extractable,"Target keys became extractable");
  return "PASS: after reload, original non-extractable keys and partial staging survived; records remain hidden.";
}
async function finish(){
  const s=await meta(),r=receiver(s);for(const token of s.tokens)await r.stage(s.binding.uid,s.decision.id,token);
  const failed=receiver(s,new BrowserImportDatabase(s.binding,{fault:p=>{if(p==="after-write")throw Error("Injected interruption");}}));
  let refused=false;try{await failed.finish(s.binding.uid,s.decision.id);}catch(e){refused=String(e).includes("Injected interruption");}
  assert(refused,"Interrupted save unexpectedly succeeded");assert(await r.read(s.binding.uid,s.manifest.objects[0].sourceId)===undefined,"Interrupted publication leaked records");
  const lost=receiver(s,new BrowserImportDatabase(s.binding,{fault:p=>{if(p==="after-commit")throw Error("Injected response loss");}}));
  try{await lost.finish(s.binding.uid,s.decision.id);}catch(e){assert(String(e).includes("Injected response loss"),String(e));}
  s.receipt=await r.finish(s.binding.uid,s.decision.id);s.ack=await r.acknowledge(s.binding.uid,s.decision.id);await meta(s);
  await verify();return "PASS: interrupted write rolled back; lost completion response recovered; exact bytes and pending quarantine verified. Reload to verify receipt.";
}
async function verify(){
  const s=await meta(),r=receiver(s);assert(s.receipt&&s.ack,"Finish recovery first");
  assert(same(await r.finish(s.binding.uid,s.decision.id),s.receipt),"Receipt changed");assert(await r.acknowledge(s.binding.uid,s.decision.id)===s.ack,"Acknowledgement changed");
  await verifyImportAcknowledgement(s.ack!,s.manifest,s.receipt!,s.target);
  for(let i=0;i<s.raws.length;i++){const result=await r.read(s.binding.uid,s.manifest.objects[i].sourceId);assert(result&&same([...result.bytes],[...s.raws[i]])&&result.quarantined===(i===1),"Original bytes or quarantine changed");}
  return "PASS: saved completion receipt, acknowledgement and exact original bytes survived reload; pending handoff stays quarantined.";
}
const channel=new BroadcastChannel(`matrisync-storage-fixture:${runId}`);
function conflictRow(id:string):ImportRow{return {id,type:"record",uid:"synthetic",targetKeyId:"a".repeat(64),descriptor:{id:crypto.randomUUID(),caseId:crypto.randomUUID(),kind:"pending",sourceId:id,length:1,sha256:"b".repeat(64)},encoded:id,quarantined:true};}
async function hold(){
  const s=await meta(),store=new BrowserImportDatabase(s.conflict);let release!:()=>void;
  const ready=new Promise<void>(resolve=>release=resolve);
  const listener=(e:MessageEvent)=>{if(e.data==="release")release();};channel.addEventListener("message",listener);
  try{
    await store.transaction(async rows=>{status.textContent="WAITING: stale write prepared. In a second tab of this same URL, click Save competing change.";await ready;rows.set("stale",conflictRow("stale"));});
    throw Error("Stale writer overwrote newer data");
  }catch(error){assert(String(error).includes("reconcile before retry"),String(error));}finally{channel.removeEventListener("message",listener);}
  const ids=await store.transaction(async rows=>[...rows.keys()]);assert(same(ids,["winner"]),"Conflict did not preserve the winning state");
  return "PASS: competing tab committed; stale write refused; winning record preserved without automatic replay.";
}
async function compete(){const s=await meta();await new BrowserImportDatabase(s.conflict).transaction(async rows=>{rows.set("winner",conflictRow("winner"));});channel.postMessage("release");return "PASS: competing change saved. Check the first tab for stale-write refusal.";}
document.body.innerHTML='<h1>Isolated recovery storage check</h1><p>Local developer fixture. Synthetic records and authority only; no production accounts, patient databases or hardware.</p><p id="run"></p><div id="actions"></div><pre id="status" role="status">Ready. Prepare once, then reload between checks.</pre>';
document.getElementById("run")!.textContent=`Run: ${runId}`;
const status=document.getElementById("status")!;
for(const [label,action] of [["Prepare partial recovery",prepare],["Verify partial after reload",partial],["Finish with failure checks",finish],["Verify saved completion",verify],["Hold stale write",hold],["Save competing change",compete]] as const){
  const button=document.createElement("button");button.textContent=label;button.onclick=async()=>{button.disabled=true;status.textContent="Running…";try{status.textContent=await action();}catch(error){status.textContent=`FAIL: ${String(error)}`;}finally{button.disabled=false;}};document.getElementById("actions")!.append(button);
}
