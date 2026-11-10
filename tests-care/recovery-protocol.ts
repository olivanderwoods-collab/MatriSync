// Browser-safe canonical contract only; no verifier, persistence or authority I/O.
import type {PublicDevice} from "../src/sharing-crypto";

export const RECOVERY_DOMAIN = "matrisync-isolated-recovery-contract-v1";
const encoder = new TextEncoder();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const bytes = (value: unknown) => encoder.encode(JSON.stringify(value));
export async function digest(value: unknown) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(value))), x=>x.toString(16).padStart(2,"0")).join("");
}
export type RecoveryInput = {version:1; id:string; uid:string; oldKeyId:string; newDevice:PublicDevice};
export type RecoveryRequest = RecoveryInput & {createdAt:number; expiresAt:number; challenge:string};
export type RecoveryOffer = {request:RecoveryRequest; digest:string; challengeEnvelope:string};
export type Authority = {enabled:boolean; device:PublicDevice; cases:readonly string[]};
export type Approval = {id:string; cases:string[]; possession:string; approval:string};
export type Decision = {version:1; status:"approved"; id:string; uid:string; requestDigest:string; scopeDigest:string; cases:string[]; decidedAt:number; epoch:{keyId:string; parentKeyId:string; device:PublicDevice}};
export type ClosureStatus = "cancelled"|"rejected";
export type Closure = {id:string;status:ClosureStatus;proof:string};
export type ClosedDecision = {version:1;status:ClosureStatus;id:string;uid:string;requestDigest:string;oldKeyId:string;newKeyId:string;decidedAt:number;proofDigest:string};
export type RecoveryOutcome = Decision|ClosedDecision;

export function scope(value: unknown): string[] {
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
export function closureClaims(offer:RecoveryOffer,status:ClosureStatus) {
  const r=offer.request;
  return [RECOVERY_DOMAIN,"close",1,r.id,r.uid,offer.digest,r.oldKeyId,r.newDevice.keyId,r.expiresAt,status];
}

export interface RecoveryReconciler {reconcile(uid:string,id:string):Promise<RecoveryOutcome|undefined>;}

// Implementations must isolate drafts, serialize conflicting operations, call
// beforeCommit immediately before atomic publication and roll back on failure.
// This interface does not supply durability, authentication or browser storage.
export interface RecoveryTransactionStore<Row> {
  transaction<Result>(work:(rows:Map<string,Row>)=>Promise<Result>,beforeCommit?:()=>void):Promise<Result>;
}
