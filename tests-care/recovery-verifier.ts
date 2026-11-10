// Isolated contract model only: no HTTP server, Firebase or care grants.
// The auth UID and authority adapter are trusted test inputs, NOT authentication.
import {CompactEncrypt, compactVerify, importJWK} from "jose";
import {checkPublicDevice, type PublicDevice} from "../src/sharing-crypto";

export const RECOVERY_DOMAIN = "matrisync-isolated-recovery-contract-v1";
const encoder = new TextEncoder();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fingerprint = /^[a-f0-9]{64}$/;
export const bytes = (value: unknown) => encoder.encode(JSON.stringify(value));
export async function digest(value: unknown) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(value))), x=>x.toString(16).padStart(2,"0")).join("");
}
function exact(value: unknown, fields: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== fields.length || !fields.every(k=>Object.hasOwn(value,k))) throw Error("Unsupported recovery schema.");
}
function bounded(value: unknown, max: number) {
  if (bytes(value).length > max) throw Error("Recovery size limit exceeded.");
}
function publicDevice(value: unknown): PublicDevice {
  exact(value,["encryption","signing","keyId"]);
  for (const key of [value.encryption,value.signing]) {
    exact(key,["kty","crv","x","y"]);
    if (key.kty!=="EC" || key.crv!=="P-256" || typeof key.x!=="string" || typeof key.y!=="string" || !/^[A-Za-z0-9_-]{43}$/.test(key.x) || !/^[A-Za-z0-9_-]{43}$/.test(key.y)) throw Error("Invalid recovery public key.");
  }
  if (typeof value.keyId!=="string" || !fingerprint.test(value.keyId)) throw Error("Invalid recovery fingerprint.");
  const point=(key: Record<string,unknown>)=>({kty:"EC",crv:"P-256",x:key.x as string,y:key.y as string});
  return {encryption:point(value.encryption as Record<string,unknown>),signing:point(value.signing as Record<string,unknown>),keyId:value.keyId};
}
export type RecoveryInput = {version:1; id:string; uid:string; oldKeyId:string; newDevice:PublicDevice};
export type RecoveryRequest = RecoveryInput & {createdAt:number; expiresAt:number; challenge:string};
export type RecoveryOffer = {request:RecoveryRequest; digest:string; challengeEnvelope:string};
export type Authority = {enabled:boolean; device:PublicDevice; cases:readonly string[]};
export type Approval = {id:string; cases:string[]; possession:string; approval:string};
export type Decision = {version:1; status:"approved"; id:string; uid:string; requestDigest:string; scopeDigest:string; cases:string[]; decidedAt:number; epoch:{keyId:string; parentKeyId:string; device:PublicDevice}};
export type Stored = {offer:RecoveryOffer; nonce:string; original:PublicDevice; input:string; decision?:Decision; proofs?:Approval};

export interface RecoveryStore {
  transaction<T>(work:(records:Map<string,Stored>)=>Promise<T>,beforeCommit?:()=>void):Promise<T>;
}
export class MemoryRecoveryStore implements RecoveryStore {
  private records=new Map<string,Stored>();
  private queue:Promise<unknown>=Promise.resolve();
  transaction<T>(work:(records:Map<string,Stored>)=>Promise<T>,beforeCommit?:()=>void):Promise<T> {
    const task=this.queue.then(async()=>{
      const draft=structuredClone(this.records);
      const result=await work(draft);
      beforeCommit?.();
      this.records=structuredClone(draft);
      return result;
    });
    this.queue=task.catch(()=>undefined);return task;
  }
}

function input(value: unknown): RecoveryInput {
  bounded(value,16384); exact(value,["version","id","uid","oldKeyId","newDevice"]);
  if(value.version!==1 || typeof value.id!=="string" || !uuid.test(value.id) || typeof value.uid!=="string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value.uid) || typeof value.oldKeyId!=="string" || !fingerprint.test(value.oldKeyId)) throw Error("Invalid recovery request.");
  return {version:1,id:value.id,uid:value.uid,oldKeyId:value.oldKeyId,newDevice:publicDevice(value.newDevice)};
}
function scope(value: unknown): string[] {
  if(!Array.isArray(value) || value.length<1 || value.length>100 || !value.every(id=>typeof id==="string" && uuid.test(id)) || new Set(value).size!==value.length) throw Error("Invalid recovery scope.");
  return [...value].sort();
}
export function requestClaims(r: RecoveryRequest) {
  const point=(p:PublicDevice["encryption"])=>[p.kty,p.crv,p.x,p.y];
  return [RECOVERY_DOMAIN,"request",r.version,r.id,r.uid,r.oldKeyId,[r.newDevice.keyId,point(r.newDevice.encryption),point(r.newDevice.signing)],r.createdAt,r.expiresAt,r.challenge];
}
export function possessionClaims(offer: RecoveryOffer, nonce: string) {
  const r=offer.request;
  return [RECOVERY_DOMAIN,"possession",r.id,r.uid,offer.digest,r.oldKeyId,r.newDevice.keyId,r.expiresAt,nonce];
}
export async function approvalClaims(offer: RecoveryOffer, cases: string[], possession: string) {
  const r=offer.request;
  return [RECOVERY_DOMAIN,"approve",r.id,r.uid,offer.digest,r.oldKeyId,r.newDevice.keyId,r.expiresAt,scope(cases),await digest(possession)];
}
async function verify(token: string, device: PublicDevice, purpose: string, expected: unknown) {
  if(typeof token!=="string" || token.length>8192) throw Error("Invalid recovery proof.");
  const result=await compactVerify(token,await importJWK(device.signing,"ES256"),{algorithms:["ES256"]});
  exact(result.protectedHeader,["alg","typ","kid"]);
  if(result.protectedHeader.typ!==`${RECOVERY_DOMAIN}:${purpose}` || result.protectedHeader.kid!==device.keyId || new TextDecoder().decode(result.payload)!==JSON.stringify(expected)) throw Error("Recovery proof binding differs.");
}

export class IsolatedRecoveryVerifier {
  private store:RecoveryStore;
  constructor(private readonly options:{clock:()=>number; authority:(uid:string)=>Authority|undefined; fault?:(point:"before-commit"|"after-commit")=>void; store?:RecoveryStore}) {this.store=options.store??new MemoryRecoveryStore();}
  private authority(uid:string,oldKeyId:string):Authority {
    const value=this.options.authority(uid);
    if(!value?.enabled || value.device.keyId!==oldKeyId) throw Error("Recovery authority unavailable or changed.");
    return {...value,device:publicDevice(value.device),cases:[...value.cases]};
  }
  private now() {
    const now=this.options.clock();
    if(!Number.isSafeInteger(now) || now<0 || now>Number.MAX_SAFE_INTEGER-600000) throw Error("Invalid verifier clock.");
    return now;
  }
  private live(record:Stored) {
    const now=this.now(),r=record.offer.request;
    if(now<r.createdAt || now>=r.expiresAt) throw Error("Recovery request expired or verifier clock moved backwards.");
    return now;
  }
  async request(authUid:string,value:unknown):Promise<RecoveryOffer> {
    const parsed=input(value); // Clone/validate before queuing; caller cannot mutate it.
    if(authUid!==parsed.uid) throw Error("Recovery account differs.");
    return this.store.transaction(async(records)=>{
      const old=records.get(parsed.id),canonical=JSON.stringify(parsed);
      if(old){if(old.input!==canonical)throw Error("Recovery operation conflicts.");this.live(old);return structuredClone(old.offer);}
      const authority=this.authority(authUid,parsed.oldKeyId);
      await checkPublicDevice(authority.device);await checkPublicDevice(parsed.newDevice);
      if(parsed.oldKeyId===parsed.newDevice.keyId) throw Error("Recovery requires a different device.");
      const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("");
      const createdAt=this.now(),request:RecoveryRequest={...parsed,createdAt,expiresAt:createdAt+600000,challenge:random()};
      const requestDigest=await digest(requestClaims(request)),nonce=random();
      const challengeEnvelope=await new CompactEncrypt(bytes([RECOVERY_DOMAIN,"challenge",request.id,requestDigest,nonce])).setProtectedHeader({alg:"ECDH-ES",enc:"A256GCM",typ:`${RECOVERY_DOMAIN}:challenge`,kid:parsed.newDevice.keyId}).encrypt(await importJWK(parsed.newDevice.encryption,"ECDH-ES"));
      const offer={request,digest:requestDigest,challengeEnvelope};
      records.set(parsed.id,{offer,nonce,original:authority.device,input:canonical});
      return structuredClone(offer);
    });
  }
  async approve(authUid:string,value:unknown):Promise<Decision> {
    bounded(value,32768);exact(value,["id","cases","possession","approval"]);
    if(typeof value.id!=="string" || !uuid.test(value.id) || typeof value.possession!=="string" || typeof value.approval!=="string") throw Error("Invalid recovery approval.");
    const submitted:Approval={id:value.id,cases:scope(value.cases),possession:value.possession,approval:value.approval};
    let committed=false;
    let recheck:(()=>void)|undefined;
    const result=await this.store.transaction(async(records)=>{
      const record=records.get(submitted.id);
      if(!record || record.offer.request.uid!==authUid) throw Error("Recovery request unavailable for this account.");
      if(record.decision){
        if(JSON.stringify(record.proofs)!==JSON.stringify(submitted)) throw Error("Completed recovery operation conflicts.");
        return structuredClone(record.decision); // Original receipt, not fresh authority.
      }
      const r=record.offer.request;
      this.live(record);
      await verify(submitted.possession,r.newDevice,"possession",possessionClaims(record.offer,record.nonce));
      await verify(submitted.approval,record.original,"approval",await approvalClaims(record.offer,submitted.cases,submitted.possession));
      const scopeDigest=await digest(submitted.cases);
      this.options.fault?.("before-commit");
      // No awaits between this authoritative read and the single aggregate write.
      const authority=this.authority(authUid,r.oldKeyId),decidedAt=this.live(record);
      if(JSON.stringify(authority.device)!==JSON.stringify(record.original) || !submitted.cases.every(id=>authority.cases.includes(id))) throw Error("Recovery scope or original identity is no longer authorized.");
      if([...records.values()].some(item=>item.decision?.uid===authUid && item.decision.epoch.keyId===r.newDevice.keyId)) throw Error("Target device already approved by another operation.");
      const decision:Decision={version:1,status:"approved",id:r.id,uid:authUid,requestDigest:record.offer.digest,scopeDigest,cases:submitted.cases,decidedAt,epoch:{keyId:r.newDevice.keyId,parentKeyId:r.oldKeyId,device:r.newDevice}};
      recheck=()=>{
        const latest=this.authority(authUid,r.oldKeyId);this.live(record);
        if(JSON.stringify(latest.device)!==JSON.stringify(record.original)||!submitted.cases.every(id=>latest.cases.includes(id)))throw Error("Recovery authority changed before durable commit.");
      };
      // Decision + epoch are one value, so the model cannot expose half a commit.
      records.set(r.id,{...record,decision,proofs:submitted});
      committed=true;
      return structuredClone(decision);
    },()=>recheck?.());
    // Only a successfully committed store transaction may simulate response loss.
    if(committed)this.options.fault?.("after-commit");
    return result;
  }
  async reconcile(authUid:string,id:string):Promise<Decision|undefined> {
    return this.store.transaction(async(records)=>{
      const record=records.get(id);
      if(!record || record.offer.request.uid!==authUid) throw Error("Recovery request unavailable for this account.");
      return structuredClone(record.decision);
    });
  }
  counts(){return this.store.transaction(async records=>({requests:records.size,decisions:[...records.values()].filter(r=>r.decision).length}));}
}
