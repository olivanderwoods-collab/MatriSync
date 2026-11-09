import {collection,doc,getDocFromServer,getDocsFromServer,limit,query,runTransaction,serverTimestamp,setDoc,Timestamp} from "firebase/firestore";
import { careDb, careMembership, enrollCareDevice, loadCareProfile } from "./care-client";
import { careHash,newCareKey,openCare,sealCare,wrapCare } from "./care-crypto";
import { careAccount } from "./care-storage";
import type { CareView } from "./care-model";
import { checkManualRecord, type AddedRecord } from "./record-entry";
export async function createPatientPairing(uid:string,view:CareView,facilityUid:string){
 if(view.motherUid!==uid||view.snapshotOnly||!view.key)throw Error("Load your own full profile before creating a pairing code.");
 const database=await careDb(uid), destination=await getDocFromServer(doc(database,"careFacilities",facilityUid));
 if(!destination.exists()||!destination.data().enabled)throw Error("Choose an active receiving facility.");
 const id=crypto.randomUUID(),secret=newCareKey(), expires=Date.now()+30*60*1000;
 await setDoc(doc(database,"carePairings",id),{caseId:view.id,motherUid:uid,facilityUid,wrapped:await sealCare(secret,`pair:${id}`,{id:view.id,key:view.key}),createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(expires),used:false});
 return {code:`MSP1.${id}.${secret}`,expiresAt:new Date(expires).toISOString()};
}
export async function redeemPatientPairing(uid:string,code:string){
 const [version,id,secret,...rest]=code.trim().split(".");
 if(version!=="MSP1"||!/^[a-f0-9-]{36}$/.test(id)||!secret||rest.length)throw Error("Enter the complete Mother-generated pairing code, not the login access code.");
 const database=await careDb(uid), own=await enrollCareDevice(uid), ref=doc(database,"carePairings",id), pair=await getDocFromServer(ref);
 if(!pair.exists()||pair.data().facilityUid!==uid||pair.data().used||pair.data().expiresAt.toMillis()<=Date.now())throw Error("Pairing code is unavailable, expired, already used or belongs to another facility.");
 const opened=await openCare(secret,`pair:${id}`,pair.data().wrapped);if(opened.id!==pair.data().caseId)throw Error("Pairing identity differs.");
 const wrapped=await wrapCare({id:opened.id,uid,key:opened.key},own),access=doc(database,"careAccess",`${opened.id}_${uid}`);
 await runTransaction(database,async tx=>{const current=await tx.get(ref), old=await tx.get(access);if(!current.exists()||current.data().used||current.data().wrapped!==pair.data().wrapped||current.data().expiresAt.toMillis()<=Date.now())throw Error("Pairing code was already used or changed.");if(!old.exists())tx.set(access,{caseId:opened.id,uid,facilityId:uid,grantedBy:uid,viaNfc:false,wrapped,createdAt:serverTimestamp(),pairingId:id});tx.update(ref,{used:true,usedAt:serverTimestamp()});});
 return loadCareProfile(uid,opened.id);
}
export type ReviewableRecord={id:string;record:AddedRecord;ownerUid:string;createdAt:string;approved?:{reviewerUid:string;reviewerName:string;approvedAt:string}};
export async function submitMotherRecord(uid:string,view:CareView,record:AddedRecord,fileDigest?:string){
 if(view.motherUid!==uid||!view.key||view.snapshotOnly)throw Error("Load your own linked profile before sending a record for review.");
 if(record.manual)checkManualRecord(record.manual);
 const database=await careDb(uid),id=(await careHash(`${uid}:${view.id}:${record.id}`)).slice(0,32),ref=doc(database,"careCases",view.id,"records",id);
 const value={version:1,record,...(fileDigest?{fileDigest}:{})};
 const encrypted=await sealCare(view.key,`care-record:${view.id}:${id}`,value);
 await runTransaction(database,async tx=>{const prior=await tx.get(ref);if(prior.exists()){const old=await openCare(view.key,`care-record:${view.id}:${id}`,prior.data().encrypted);if(JSON.stringify(old)!==JSON.stringify(value))throw Error("A different version is already submitted. The original was kept.");return;}tx.set(ref,{ownerUid:uid,kind:record.kind,encrypted,createdAt:serverTimestamp()});});return id;
}
export async function listMotherRecords(uid:string,view:CareView):Promise<ReviewableRecord[]>{
 if(!view.key||view.snapshotOnly)return [];
 const database=await careDb(uid),records=await getDocsFromServer(query(collection(database,"careCases",view.id,"records"),limit(100)));
 if(records.size===100)throw Error("The record review list exceeds this prototype's limit.");
 return Promise.all(records.docs.map(async snap=>{const value=await openCare(view.key,`care-record:${view.id}:${snap.id}`,snap.data().encrypted);if(value.version!==1||!value.record||value.record.kind!==snap.data().kind)throw Error("Record binding differs.");if(value.record.manual)checkManualRecord(value.record.manual);const approval=await getDocFromServer(doc(database,"careCases",view.id,"records",snap.id,"reviews","final"));return {id:snap.id,record:value.record,ownerUid:snap.data().ownerUid,createdAt:snap.data().createdAt.toDate().toISOString(),...(approval.exists()?{approved:{reviewerUid:approval.data().reviewerUid,reviewerName:approval.data().reviewerName,approvedAt:approval.data().approvedAt.toDate().toISOString()}}:{})};}));
}
export async function approveMotherRecord(uid:string,caseId:string,id:string,originalReviewed:boolean){
 if(!originalReviewed)throw Error("Review the original separately before approving this copy.");
 const database=await careDb(uid), {staff}=await careMembership(uid);if(!staff?.enabled||staff.role!=="doctor")throw Error("An assigned Doctor must approve the record.");
 const ref=doc(database,"careCases",caseId,"records",id,"reviews","final");
 await runTransaction(database,async tx=>{const original=await tx.get(doc(database,"careCases",caseId,"records",id)), previous=await tx.get(ref);if(!original.exists())throw Error("Submitted record not found.");if(previous.exists())return;await careAccount(uid);tx.set(ref,{reviewerUid:uid,reviewerName:staff.name,approvedAt:serverTimestamp(),originalReviewed:true});});
}
