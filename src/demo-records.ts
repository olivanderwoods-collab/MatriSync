import { validatedDocument } from "./records-model";
import { checkManualRecord, type AddedRecord, type RecordInput, type RecordKind } from "./record-entry";
// Guest-only storage, deliberately separate from account vaults and Firebase.
// File bytes never enter a handoff, PDF case summary or cloud request.
type Stored = { record: AddedRecord; file?: Blob };
async function store<T>(mode:IDBTransactionMode,work:(s:IDBObjectStore)=>IDBRequest<T>) {
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open("matrisync-guest-records-v1",1);r.onupgradeneeded=()=>r.result.createObjectStore("records",{keyPath:"record.id"});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 return new Promise<T>((resolve,reject)=>{const tx=db.transaction("records",mode),r=work(tx.objectStore("records"));tx.oncomplete=()=>{db.close();resolve(r.result);};tx.onabort=tx.onerror=()=>{db.close();reject(Error("Could not save the local record. Existing records were kept."));};});
}
export async function demoRecords(){return (await store<Stored[]>("readonly",s=>s.getAll())).map(v=>v.record).sort((a,b)=>b.addedAt.localeCompare(a.addedAt));}
export async function addDemoRecord(kind:RecordKind,input:RecordInput,enteredBy:string){
 if(input.source.length>200 || (input.date && (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0,10)!==input.date)))throw Error("Check the source and date.");
 const manual=input.manual?checkManualRecord(input.manual):undefined;
 if(!manual&&!input.file)throw Error("Enter details or choose a file.");
 if(input.file)await validatedDocument(input.file);
 const record:AddedRecord={id:crypto.randomUUID(),kind,title:manual?.title||input.file!.name,source:input.source.trim(),date:input.date,addedAt:new Date().toISOString(),enteredBy,...(manual?{manual}:{}),...(input.file?{fileName:input.file.name}:{})};
 await store("readwrite",s=>s.add({record,...(input.file?{file:input.file}:{})}));return record;
}
export async function demoRecordFile(id:string){return (await store<Stored|undefined>("readonly",s=>s.get(id)))?.file;}
