// Strict, isolated readers for the existing structured record shapes. Never
// writes the application's IndexedDB or changes original signed/packet bytes.
import {compactVerify,importJWK} from "jose";
import {allReferralFields,referralInput,type ReferralFields} from "../src/referral-draft";
import {motherProfileInput,type MotherProfile} from "../src/records-model";
import type {PublicDevice} from "../src/sharing-crypto";

export const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const hashPattern=/^[a-f0-9]{64}$/;
export const uidPattern=/^[A-Za-z0-9_-]{1,128}$/;
export type ImportKind="profile"|"outgoing"|"receipt"|"draft"|"pending";
export function object(value:unknown,required:string[],optional:string[]=[]):asserts value is Record<string,unknown>{
  if(!value||typeof value!=="object"||Array.isArray(value)||!required.every(k=>Object.hasOwn(value,k))||Object.keys(value).some(k=>![...required,...optional].includes(k)))throw Error("Unsupported recovery object schema.");
}
function string(value:unknown,max=8000):asserts value is string {if(typeof value!=="string"||value.length>max)throw Error("Invalid recovery record text.");}
function identifier(value:unknown){if(typeof value!=="string"||!uuidPattern.test(value))throw Error("Invalid recovery record identifier.");}
function time(value:unknown){string(value,40);if(!Number.isFinite(Date.parse(value)))throw Error("Invalid recovery record time.");}
function fields(value:unknown){object(value,["reason","history","treatment","instructions"],[...allReferralFields]);referralInput(value as ReferralFields);}
function profile(value:unknown){
  object(value,["name","birthDate","sourceLocalId","sourceUid"],["details","history"]);
  string(value.name,120);string(value.birthDate,10);string(value.sourceLocalId,200);
  if(!value.name.trim()||!/^[A-Za-z0-9_-]{1,200}$/.test(value.sourceLocalId)||typeof value.sourceUid!=="string"||!uidPattern.test(value.sourceUid))throw Error("Invalid recovered profile identity.");
  if(value.birthDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(value.birthDate)||!Number.isFinite(Date.parse(value.birthDate))||new Date(value.birthDate).toISOString().slice(0,10)!==value.birthDate))throw Error("Invalid recovered birth date.");
  if(value.history!==undefined)string(value.history);
  if(value.details!==undefined){
    object(value.details,["bloodGroup","allergies","emergencyContact","emergencyPhone","guardian","guardianPhone","residence","username","profileCode"],["pregnancyWeeks","recordedOn"]);
    motherProfileInput(value.details as MotherProfile);
  }
}
function handoff(value:unknown,uid:string,caseId:string){
  object(value,["version","id","caseId","sourceUid","recipientUid","profile","fields","packet","actorName","recordedAt"]);
  if(value.version!==1||value.caseId!==caseId||value.sourceUid!==uid||typeof value.recipientUid!=="string"||!uidPattern.test(value.recipientUid))throw Error("Recovered handoff identity differs.");
  identifier(value.id);profile(value.profile);fields(value.fields);string(value.packet,8*1024*1024);string(value.actorName,120);time(value.recordedAt);
  return value.id as string;
}
export async function validateImportRecord(kind:ImportKind,raw:Uint8Array,uid:string,caseId:string,sourceId:string,original:PublicDevice){
  const value:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(raw));
  if(kind==="draft"){
    object(value,["version","caseId","sourceUid","revision","fields","destination","capacity","updatedAt"],["cleared"]);
    if(value.version!==1||value.caseId!==caseId||value.sourceUid!==uid||sourceId!==`draft:${caseId}`||(value.cleared!==undefined&&typeof value.cleared!=="boolean"))throw Error("Recovered draft identity differs.");
    identifier(value.revision);fields(value.fields);string(value.destination,128);string(value.capacity,10);time(value.updatedAt);return;
  }
  if(kind==="outgoing"){
    if(sourceId!==`outgoing:${caseId}:${handoff(value,uid,caseId)}`)throw Error("Recovered outgoing storage identity differs.");return;
  }
  if(kind==="pending"){
    object(value,["value","proof"]);string(value.proof,12*1024*1024);
    const pending=value.value;
    object(pending,["version","status","handoff","approvalRevision","capacity","sourceFacility","senderKeyId","recipientKeyId","entryEncrypted","grantWrapped"]);
    if(pending.version!==1||!["pending","confirmed"].includes(String(pending.status))||sourceId!==`pending:${caseId}`||pending.senderKeyId!==original.keyId||typeof pending.recipientKeyId!=="string"||!hashPattern.test(pending.recipientKeyId)||!Number.isSafeInteger(pending.capacity)||(pending.capacity as number)<1)throw Error("Recovered pending identity differs.");
    if(pending.approvalRevision!==null)identifier(pending.approvalRevision);
    handoff(pending.handoff,uid,caseId);string(pending.sourceFacility,128);string(pending.entryEncrypted,8*1024*1024);string(pending.grantWrapped,16384);
    const verified=await compactVerify(value.proof,await importJWK(original.signing,"ES256"),{algorithms:["ES256"]});
    object(verified.protectedHeader,["alg","typ","kid"]);
    if(verified.protectedHeader.typ!=="matrisync-care+jws"||verified.protectedHeader.kid!==original.keyId||new TextDecoder().decode(verified.payload)!==JSON.stringify(pending))throw Error("Original pending proof differs; no retry is permitted.");
    return;
  }
  object(value,["id","key","profile","entries","verified","snapshotOnly","receivedAt"],["verifiedAt","handoffId","motherUid"]);
  if(value.id!==caseId||typeof value.verified!=="boolean"||typeof value.snapshotOnly!=="boolean")throw Error("Recovered profile identity differs.");
  string(value.key,128);profile(value.profile);time(value.receivedAt);
  if(value.verifiedAt!==undefined)time(value.verifiedAt);
  if(value.motherUid!==undefined){string(value.motherUid,128);if(!uidPattern.test(value.motherUid))throw Error("Invalid recovered Mother identity.");}
  if(value.handoffId!==undefined)identifier(value.handoffId);
  if(kind==="receipt"?sourceId!==`receipt:${caseId}:${value.handoffId}`||!value.handoffId:sourceId!==caseId)throw Error("Recovered profile storage identity differs.");
  if(!Array.isArray(value.entries)||value.entries.length>1000)throw Error("Invalid recovered contributions.");
  const ids=new Set<string>();
  for(const entry of value.entries){
    object(entry,["id","kind","actorUid","actorName","role","recordedAt","serverAt","text"],["fields"]);
    identifier(entry.id);if(ids.has(entry.id as string))throw Error("Duplicate recovered contribution.");ids.add(entry.id as string);
    const kinds:Record<string,string[]>={doctor:["clinical-note","prescription","referral"],nurse:["observation","administration"],lab:["laboratory"]};
    if(typeof entry.role!=="string"||typeof entry.kind!=="string"||!kinds[entry.role]?.includes(entry.kind)||typeof entry.actorUid!=="string"||!uidPattern.test(entry.actorUid))throw Error("Invalid recovered contribution identity.");
    string(entry.actorName,120);string(entry.text);time(entry.recordedAt);time(entry.serverAt);if(entry.fields!==undefined)fields(entry.fields);
  }
}
