// Isolated receiver model. No app store, cloud writes, clinical permissions or sends.
import {CompactEncrypt,CompactSign,compactDecrypt,compactVerify,importJWK,base64url} from "jose";
import {checkPublicDevice,type SharingDevice,type PublicDevice} from "../src/sharing-crypto";
import {RECOVERY_DOMAIN,bytes,digest,type Authority,type Decision,type RecoveryReconciler,type RecoveryTransactionStore} from "./recovery-protocol";
import {object,uuidPattern,hashPattern,uidPattern,validateImportRecord,type ImportKind} from "./recovery-import-records";

export const IMPORT_DOMAIN=`${RECOVERY_DOMAIN}:import-v1`;
export const IMPORT_LIMIT=8*1024*1024;
export type Descriptor={id:string;caseId:string;kind:ImportKind;sourceId:string;length:number;sha256:string};
export type Manifest={version:1;id:string;uid:string;requestDigest:string;decisionDigest:string;sourceKeyId:string;targetKeyId:string;cases:string[];objects:Descriptor[]};
export type ImportReceipt={version:1;id:string;uid:string;targetKeyId:string;manifestDigest:string;objectCount:number;completedAt:number};
type Session={id:string;type:"session";manifest:Manifest;digest:string;proof:string;objects:Record<string,string>;receipt?:ImportReceipt;ack?:string};
export type ImportedRecord={id:string;type:"record";uid:string;targetKeyId:string;descriptor:Descriptor;encoded:string;quarantined:boolean};
export type ImportRow=Session|ImportedRecord;
function bounded(value:unknown,max:number){if(bytes(value).length>max)throw Error("Recovery import size limit exceeded.");}
export async function rawDigest(value:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",value.slice())),v=>v.toString(16).padStart(2,"0")).join("");}
export function manifestClaims(m:Manifest){return [IMPORT_DOMAIN,"manifest",m.version,m.id,m.uid,m.requestDigest,m.decisionDigest,m.sourceKeyId,m.targetKeyId,[...m.cases].sort(),[...m.objects].sort((a,b)=>a.id.localeCompare(b.id)).map(o=>[o.id,o.caseId,o.kind,o.sourceId,o.length,o.sha256])];}
function manifest(value:unknown):Manifest{
  bounded(value,1024*1024);object(value,["version","id","uid","requestDigest","decisionDigest","sourceKeyId","targetKeyId","cases","objects"]);
  if(value.version!==1||typeof value.id!=="string"||!uuidPattern.test(value.id)||typeof value.uid!=="string"||!uidPattern.test(value.uid)||![value.requestDigest,value.decisionDigest,value.sourceKeyId,value.targetKeyId].every(v=>typeof v==="string"&&hashPattern.test(v)))throw Error("Invalid import identity.");
  if(!Array.isArray(value.cases)||value.cases.length<1||value.cases.length>100||!value.cases.every(v=>typeof v==="string"&&uuidPattern.test(v))||new Set(value.cases).size!==value.cases.length)throw Error("Invalid import scope.");
  if(!Array.isArray(value.objects)||value.objects.length<1||value.objects.length>1000)throw Error("Invalid import object count.");
  const ids=new Set<string>(),slots=new Set<string>();let total=0;
  for(const d of value.objects){
    object(d,["id","caseId","kind","sourceId","length","sha256"]);
    if(typeof d.id!=="string"||!uuidPattern.test(d.id)||typeof d.caseId!=="string"||!value.cases.includes(d.caseId)||!["profile","outgoing","receipt","draft","pending"].includes(String(d.kind))||typeof d.sourceId!=="string"||!d.sourceId||d.sourceId.length>256||!Number.isSafeInteger(d.length)||(d.length as number)<1||typeof d.sha256!=="string"||!hashPattern.test(d.sha256))throw Error("Invalid import descriptor or excluded file kind.");
    if(ids.has(d.id)||slots.has(d.sourceId))throw Error("Duplicate import object or destination.");ids.add(d.id);slots.add(d.sourceId);
    total+=d.length as number;if(total>IMPORT_LIMIT)throw Error("Recovery import size limit exceeded.");
  }
  if(value.cases.some(id=>!(value.objects as Descriptor[]).some(d=>d.caseId===id)))throw Error("Import scope contains an empty case.");
  const parsed=structuredClone(value) as Manifest;
  parsed.cases.sort();parsed.objects.sort((a,b)=>a.id.localeCompare(b.id));return parsed;
}
const pub=(d:PublicDevice):PublicDevice=>({encryption:structuredClone(d.encryption),signing:structuredClone(d.signing),keyId:d.keyId});
async function envelope(value:unknown,target:PublicDevice,purpose:string){
  await checkPublicDevice(target);
  return new CompactEncrypt(bytes(value)).setProtectedHeader({alg:"ECDH-ES",enc:"A256GCM",typ:`${IMPORT_DOMAIN}:${purpose}`,kid:target.keyId}).encrypt(await importJWK(target.encryption,"ECDH-ES"));
}
export async function sealImportManifest(m:Manifest,source:SharingDevice,target:PublicDevice){
  const proof=await new CompactSign(bytes(manifestClaims(m))).setProtectedHeader({alg:"ES256",typ:`${IMPORT_DOMAIN}:manifest`,kid:source.keyId}).sign(source.signKey);
  return envelope({manifest:m,proof},target,"manifest-envelope");
}
export async function sealImportObject(m:Manifest,id:string,raw:Uint8Array,target:PublicDevice){return envelope({version:1,id:m.id,manifestDigest:await digest(manifestClaims(m)),objectId:id,encoded:base64url.encode(raw)},target,"object-envelope");}
export async function verifyImportAcknowledgement(token:string,m:Manifest,receipt:ImportReceipt,target:PublicDevice){
  const checked=manifest(m);
  object(receipt,["version","id","uid","targetKeyId","manifestDigest","objectCount","completedAt"]);
  if(typeof token!=="string"||token.length>8192||receipt.version!==1||receipt.id!==checked.id||receipt.uid!==checked.uid||receipt.targetKeyId!==target.keyId||checked.targetKeyId!==target.keyId||receipt.manifestDigest!==await digest(manifestClaims(checked))||receipt.objectCount!==checked.objects.length||!Number.isSafeInteger(receipt.completedAt)||receipt.completedAt<0)throw Error("Import acknowledgement identity differs.");
  await checkPublicDevice(target);
  const verified=await compactVerify(token,await importJWK(target.signing,"ES256"),{algorithms:["ES256"]});
  object(verified.protectedHeader,["alg","typ","kid"]);
  if(verified.protectedHeader.typ!==`${IMPORT_DOMAIN}:ack`||verified.protectedHeader.kid!==target.keyId||new TextDecoder().decode(verified.payload)!==JSON.stringify([IMPORT_DOMAIN,"ack",m.id,m.uid,m.sourceKeyId,target.keyId,receipt.manifestDigest,await digest(receipt)]))throw Error("Import acknowledgement proof differs.");
}

export class IsolatedRecoveryImport {
  private target:SharingDevice;
  constructor(private readonly options:{uid:string;target:SharingDevice;store:RecoveryTransactionStore<ImportRow>;verifier:RecoveryReconciler;authority:(uid:string)=>Authority|undefined;clock:()=>number}){this.target=structuredClone(options.target);}
  private account(uid:string){if(uid!==this.options.uid||!uidPattern.test(uid))throw Error("Import account differs.");}
  private sessionId(uid:string,id:string){return `session:${uid}:${this.target.keyId}:${id}`;}
  private slot(uid:string,sourceId:string){return `record:${uid}:${this.target.keyId}:${sourceId}`;}
  private session(rows:Map<string,ImportRow>,uid:string,id:string){const s=rows.get(this.sessionId(uid,id));if(!s||s.type!=="session")throw Error("Import unavailable for this account/device.");return s;}
  private current(m:Manifest){
    const authority=this.options.authority(m.uid);
    if(!authority?.enabled||authority.device.keyId!==m.sourceKeyId||!m.cases.every(id=>authority.cases.includes(id)))throw Error("Current import authority or scope unavailable.");
    return pub(authority.device);
  }
  private unchanged(m:Manifest,source:PublicDevice){if(JSON.stringify(this.current(m))!==JSON.stringify(source))throw Error("Original import public keys changed.");}
  private async authorized(m:Manifest):Promise<{decision:Decision;source:PublicDevice}>{
    const decision=await this.options.verifier.reconcile(m.uid,m.id);
    if(!decision||decision.status!=="approved"||decision.uid!==m.uid||decision.requestDigest!==m.requestDigest||decision.epoch.parentKeyId!==m.sourceKeyId||decision.epoch.keyId!==m.targetKeyId||m.targetKeyId!==this.target.keyId||!m.cases.every(id=>decision.cases.includes(id))||await digest(decision)!==m.decisionDigest)throw Error("Import does not match an approved recovery operation.");
    const source=this.current(m);await checkPublicDevice(source);await checkPublicDevice(this.target);
    if(JSON.stringify(pub(decision.epoch.device))!==JSON.stringify(pub(this.target)))throw Error("Import target public keys differ.");
    return {decision,source};
  }
  private async open(token:string,purpose:string,max:number){
    if(typeof token!=="string"||token.length>max)throw Error("Import envelope size limit exceeded.");
    const opened=await compactDecrypt(token,this.target.decryptKey,{keyManagementAlgorithms:["ECDH-ES"],contentEncryptionAlgorithms:["A256GCM"]});
    const h=opened.protectedHeader;
    object(h,["alg","enc","typ","kid","epk"]);
    if(h.typ!==`${IMPORT_DOMAIN}:${purpose}`||h.kid!==this.target.keyId)throw Error("Import envelope purpose or device differs.");
    return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(opened.plaintext)) as unknown;
  }
  async begin(uid:string,token:string){
    this.account(uid);
    const payload=await this.open(token,"manifest-envelope",3*1024*1024);object(payload,["manifest","proof"]);
    const m=manifest(payload.manifest);if(m.uid!==uid)throw Error("Import account differs.");
    if(typeof payload.proof!=="string"||payload.proof.length>2*1024*1024)throw Error("Invalid manifest proof.");
    const {source}=await this.authorized(m);
    const verified=await compactVerify(payload.proof,await importJWK(source.signing,"ES256"),{algorithms:["ES256"]});
    object(verified.protectedHeader,["alg","typ","kid"]);
    if(verified.protectedHeader.typ!==`${IMPORT_DOMAIN}:manifest`||verified.protectedHeader.kid!==m.sourceKeyId||new TextDecoder().decode(verified.payload)!==JSON.stringify(manifestClaims(m)))throw Error("Manifest signature binding differs.");
    const manifestDigest=await digest(manifestClaims(m)),proof=payload.proof;
    return this.options.store.transaction(async rows=>{
      const id=this.sessionId(uid,m.id),existing=rows.get(id);
      if(existing){if(existing.type!=="session"||existing.digest!==manifestDigest||existing.proof!==proof)throw Error("Existing import manifest conflicts.");return existing.digest;}
      rows.set(id,{id,type:"session",manifest:m,digest:manifestDigest,proof,objects:{}});return manifestDigest;
    },()=>{this.unchanged(m,source);});
  }
  async stage(uid:string,id:string,token:string){
    this.account(uid);const value=await this.open(token,"object-envelope",16*1024*1024);
    object(value,["version","id","manifestDigest","objectId","encoded"]);
    if(value.version!==1||value.id!==id||typeof value.objectId!=="string"||typeof value.encoded!=="string"||value.encoded.length>Math.ceil(IMPORT_LIMIT*4/3))throw Error("Invalid import object envelope.");
    const raw=base64url.decode(value.encoded);if(base64url.encode(raw)!==value.encoded)throw Error("Noncanonical import bytes.");
    let guard:(()=>void)|undefined;
    return this.options.store.transaction(async rows=>{
      const s=this.session(rows,uid,id),d=s.manifest.objects.find(d=>d.id===value.objectId);
      if(!d||value.manifestDigest!==s.digest||raw.length!==d.length||await rawDigest(raw)!==d.sha256)throw Error("Import object hash, size or identity differs.");
      const {source}=await this.authorized(s.manifest);
      await validateImportRecord(d.kind,raw,uid,d.caseId,d.sourceId,source);
      guard=()=>{this.unchanged(s.manifest,source);};
      const old=s.objects[d.id];if(old!==undefined&&old!==value.encoded)throw Error("Staged object conflicts.");
      if(s.receipt)return; // Validated exact duplicate; no post-completion mutation.
      s.objects[d.id]=value.encoded as string;
    },()=>guard?.());
  }
  async finish(uid:string,id:string):Promise<ImportReceipt>{
    this.account(uid);let guard:(()=>void)|undefined;
    return this.options.store.transaction(async rows=>{
      const s=this.session(rows,uid,id);if(s.receipt)return structuredClone(s.receipt);
      const {decision,source}=await this.authorized(s.manifest);
      if(Object.keys(s.objects).length!==s.manifest.objects.length)throw Error("Import is incomplete; no records were published.");
      for(const d of s.manifest.objects){
        const encoded=s.objects[d.id];if(!encoded)throw Error("Import is incomplete.");
        const raw=base64url.decode(encoded);
        if(raw.length!==d.length||await rawDigest(raw)!==d.sha256)throw Error("Staged import integrity differs.");
        await validateImportRecord(d.kind,raw,uid,d.caseId,d.sourceId,source);
        const slot=this.slot(uid,d.sourceId),existing=rows.get(slot);
        if(existing&&(existing.type!=="record"||existing.encoded!==encoded||existing.descriptor.kind!==d.kind||existing.descriptor.caseId!==d.caseId))throw Error("Destination record changed; preserve both versions for explicit review.");
      }
      const now=this.options.clock();if(!Number.isSafeInteger(now)||now<decision.decidedAt)throw Error("Invalid import completion clock.");
      for(const d of s.manifest.objects){const slot=this.slot(uid,d.sourceId);if(!rows.has(slot))rows.set(slot,{id:slot,type:"record",uid,targetKeyId:this.target.keyId,descriptor:d,encoded:s.objects[d.id],quarantined:d.kind==="pending"});}
      s.receipt={version:1,id,uid,targetKeyId:this.target.keyId,manifestDigest:s.digest,objectCount:s.manifest.objects.length,completedAt:now};
      guard=()=>{this.unchanged(s.manifest,source);const current=this.options.clock();if(!Number.isSafeInteger(current)||current<now)throw Error("Import clock moved backwards before commit.");};return structuredClone(s.receipt);
    },()=>guard?.());
  }
  async read(uid:string,sourceId:string):Promise<{bytes:Uint8Array;quarantined:boolean}|undefined>{
    this.account(uid);return this.options.store.transaction(async rows=>{const row=rows.get(this.slot(uid,sourceId));return row?.type==="record"?{bytes:base64url.decode(row.encoded),quarantined:row.quarantined}:undefined;});
  }
  async receipt(uid:string,id:string){this.account(uid);return this.options.store.transaction(async rows=>structuredClone(this.session(rows,uid,id).receipt));}
  async acknowledge(uid:string,id:string){
    this.account(uid);return this.options.store.transaction(async rows=>{
      const s=this.session(rows,uid,id);if(!s.receipt)throw Error("Incomplete import cannot be acknowledged.");if(s.ack)return s.ack;
      s.ack=await new CompactSign(bytes([IMPORT_DOMAIN,"ack",id,uid,s.manifest.sourceKeyId,this.target.keyId,s.digest,await digest(s.receipt)])).setProtectedHeader({alg:"ES256",typ:`${IMPORT_DOMAIN}:ack`,kid:this.target.keyId}).sign(this.target.signKey);
      await verifyImportAcknowledgement(s.ack,s.manifest,s.receipt,this.target);
      return s.ack; // Historical completion only. Source data is never deleted.
    });
  }
}
