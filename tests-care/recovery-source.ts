// Isolated read-only adapter for existing care stores. Never enrolls a key,
// creates/upgrades a source database, enumerates documents or rewrites a record.
import {compactDecrypt} from "jose";
import {careAccount} from "../src/care-storage";
import {checkPublicDevice,type SharingDevice} from "../src/sharing-crypto";
import {rawDigest,IMPORT_LIMIT} from "./recovery-import";
import {uuidPattern,hashPattern,object,validateImportRecord,type ImportKind} from "./recovery-import-records";

export type SourceChoice={sourceId:string;encryptedDigest:string};
export function sourceIdentity(sourceId:string):{sourceId:string;caseId:string;kind:ImportKind}{
  if(typeof sourceId!=="string"||sourceId.length>256)throw Error("Invalid selected source slot.");
  if(uuidPattern.test(sourceId))return {sourceId,caseId:sourceId,kind:"profile"};
  const [kind,caseId,id,...rest]=sourceId.split(":");
  if(rest.length||!uuidPattern.test(caseId??""))throw Error("Unsupported selected source slot.");
  if((kind==="draft"||kind==="pending")&&id===undefined)return {sourceId,caseId,kind};
  if((kind==="outgoing"||kind==="receipt")&&uuidPattern.test(id??""))return {sourceId,caseId,kind};
  throw Error("Unsupported source kind; original files are excluded.");
}
export function sourceChoices(value:unknown):SourceChoice[]{
  if(!Array.isArray(value)||value.length<1||value.length>1000)throw Error("Explicitly select 1–1000 source records.");
  const choices=value.map(v=>{
    object(v,["sourceId","encryptedDigest"]);
    if(typeof v.sourceId!=="string"||typeof v.encryptedDigest!=="string"||!hashPattern.test(v.encryptedDigest))throw Error("Invalid reviewed source selection.");
    sourceIdentity(v.sourceId);return {sourceId:v.sourceId,encryptedDigest:v.encryptedDigest};
  });
  if(new Set(choices.map(v=>v.sourceId)).size!==choices.length||new Set(choices.map(v=>sourceIdentity(v.sourceId).caseId)).size>100)throw Error("Duplicate source slot or too many cases.");
  return choices.sort((a,b)=>a.sourceId.localeCompare(b.sourceId));
}
async function existingDatabase(name:string){
  if(!(await indexedDB.databases()).some(db=>db.name===name&&db.version===1))throw Error("Original source database is missing or unsupported; no replacement was created.");
  return new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open(name,1);
    request.onupgradeneeded=()=>request.transaction?.abort();
    request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
    request.onerror=request.onblocked=()=>reject(Error("Original source database could not be opened without changes."));
  });
}
async function readValues<T>(name:string,storeName:string,keys:IDBValidKey[]):Promise<T[]>{
  const db=await existingDatabase(name);
  try{return await new Promise<T[]>((resolve,reject)=>{
    const tx=db.transaction(storeName,"readonly"),store=tx.objectStore(storeName),values:T[]=[];let index=0,total=0;
    const next=()=>{
      if(index===keys.length)return;
      const request=store.get(keys[index++]);
      request.onsuccess=()=>{
        if(storeName==="copies"){
          if(typeof request.result!=="string"||(total+=request.result.length)>16*1024*1024){tx.abort();return;}
        }
        values.push(request.result as T);next();
      };
    };
    next();tx.oncomplete=()=>resolve(values);tx.onerror=tx.onabort=()=>reject(Error("Selected source snapshot is missing, oversized or could not be read."));
  });}finally{db.close();}
}
export async function sourceSession(uid:string){
  const auth=await careAccount(uid);
  const guard=()=>{if(auth.currentUser?.uid!==uid||auth.currentUser.isAnonymous)throw Error("Source account changed; no export was published.");};
  const [device]=await readValues<SharingDevice|undefined>("matrisync-sharing-pilot-v1","devices",[uid]);
  if(!device)throw Error("Original source key is missing; no replacement was created.");
  await checkPublicDevice(device);guard();return {device,guard};
}
export async function reviewSourceSelection(uid:string,slots:string[]):Promise<SourceChoice[]>{
  if(!Array.isArray(slots)||slots.length<1||slots.length>1000)throw Error("Explicit source selection is required.");
  const selected=[...slots];selected.forEach(sourceIdentity);
  if(new Set(selected).size!==selected.length)throw Error("Duplicate selected source slot.");
  const session=await sourceSession(uid),values=await readValues<unknown>("matrisync-care-v1","copies",selected.map(slot=>[uid,slot]));
  const choices:SourceChoice[]=[];
  for(let i=0;i<values.length;i++){
    const value=values[i];if(typeof value!=="string"||value.length>16*1024*1024)throw Error("Selected source record is missing or oversized.");
    choices.push({sourceId:selected[i],encryptedDigest:await rawDigest(new TextEncoder().encode(value))});
  }
  session.guard();return sourceChoices(choices); // Metadata only; no private key or clinical bytes.
}
export async function captureSourceSelection(uid:string,choices:SourceChoice[],device:SharingDevice){
  const auth=await careAccount(uid);
  const selected=sourceChoices(choices),values=await readValues<unknown>("matrisync-care-v1","copies",selected.map(v=>[uid,v.sourceId]));
  const captured:{sourceId:string;caseId:string;kind:ImportKind;raw:Uint8Array}[]=[];let total=0;
  for(let i=0;i<selected.length;i++){
    const choice=selected[i],value=values[i];
    if(typeof value!=="string"||value.length>16*1024*1024||await rawDigest(new TextEncoder().encode(value))!==choice.encryptedDigest)throw Error("Selected source changed or is missing; review it again.");
    const opened=await compactDecrypt(value,device.decryptKey,{keyManagementAlgorithms:["ECDH-ES"],contentEncryptionAlgorithms:["A256GCM"]});
    object(opened.protectedHeader,["alg","enc","typ","kid","epk"]);
    if(opened.protectedHeader.typ!=="matrisync-care+jwe"||opened.protectedHeader.kid!==device.keyId)throw Error("Original source encryption binding differs.");
    const identity=sourceIdentity(choice.sourceId);total+=opened.plaintext.length;
    if(total>IMPORT_LIMIT)throw Error("Selected recovery payload exceeds 8 MiB; select fewer records.");
    await validateImportRecord(identity.kind,opened.plaintext,uid,identity.caseId,identity.sourceId,device);
    captured.push({...identity,raw:opened.plaintext.slice()});
  }
  if(auth.currentUser?.uid!==uid||auth.currentUser.isAnonymous)throw Error("Source account changed during capture.");
  return captured;
}
