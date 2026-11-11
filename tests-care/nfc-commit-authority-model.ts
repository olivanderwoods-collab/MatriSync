// ISOLATED Node contract; no production authority, endpoint, browser or driver.
import type {SharingDevice} from "../src/sharing-crypto";
import {EncryptedRecoveryDatabase,type StoragePoint} from "./recovery-sqlite";
import {NfcCommitJournal} from "./nfc-commit-journal";
import {inspectCommit,checkPinnedSection,type TagImage} from "./nfc-commit-model";
import type {MemoryLayout} from "../src/nfc/layout";
import {AUTH_DOMAIN,completionClaims,freshnessClaims,signProof,tokenDigest,verifyCompletion,verifyFreshness,verifyGrant,type Freshness,type LoggerCommitment,type Trust} from "./nfc-commit-authority-protocol";

// Each role gets its own encrypted database/domain and supplied custody key.
// Values are exact original signed tokens, not material to regenerate on retry.
export class ProtocolLedger {
  readonly #db:EncryptedRecoveryDatabase<string>;
  constructor(path:string,key:Uint8Array,storeId:string,role:"logger"|"authority",options:{fault?:(point:StoragePoint)=>void;lockWaitMs?:number}={}){
    this.#db=new EncryptedRecoveryDatabase(path,key,storeId,{version:1,purpose:`${AUTH_DOMAIN}:${role}`,limit:8*1024*1024,decode:v=>{
      if(!Array.isArray(v)||v.some(e=>!Array.isArray(e)||e.length!==2||typeof e[0]!=="string"||e[0].length>2048||typeof e[1]!=="string"||e[1].length>16384)||new Set(v.map(e=>e[0])).size!==v.length)throw Error("Invalid NFC signed-evidence ledger.");
      return new Map(v);
    }},options);
  }
  initialize(){this.#db.initialize();}
  transaction<T>(work:(records:Map<string,string>)=>Promise<T>,beforeCommit?:()=>void){return this.#db.transaction(work,beforeCommit);}
}
const finalKey=(trust:Trust)=>JSON.stringify(["final",trust.scope.uid,trust.scope.patientId,trust.scope.referralId,trust.grantId]);
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

export async function retainLoggerCompletion(input:{grantToken:string;trust:Trust;logger:SharingDevice;journal:NfcCommitJournal;operationId:string;sectionKey:CryptoKey;image:TagImage;ledger:ProtocolLedger}){
  const {grantToken,logger,journal,operationId,sectionKey,ledger}=input,trust=structuredClone(input.trust),image=new Map([...input.image].map(([n,b])=>[n,b.slice()]));
  const g=await verifyGrant(grantToken,trust);
  if(logger.keyId!==g.logger.keyId)throw Error("Only the granted logger can sign completion.");
  const restored=await journal.restore(trust.scope,operationId,sectionKey),s=restored.pending.snapshot();
  if(restored.head!==operationId||!restored.completion||s.expected.context.section!=="b"||s.original?.packetDigest!==g.originalDigest||s.expected.context.sequence<g.minGeneration||s.expected.context.sequence>g.maxGeneration||(await restored.pending.reconcile(image,sectionKey)).status!=="confirmed-in-model")throw Error("Logger completion requires the active, completed B operation and exact readback.");
  const claims:LoggerCommitment={grantId:g.id,grantDigest:await tokenDigest(grantToken),scope:g.scope,loggerId:g.logger.keyId,receiverId:g.receiver.keyId,originalDigest:g.originalDigest,generation:s.expected.context.sequence,packetDigest:s.expected.packetDigest,operationId,operationDigest:restored.completion.operationDigest,imageDigest:restored.completion.imageDigest};
  return ledger.transaction(async rows=>{
    const key=finalKey(trust),old=rows.get(key);
    if(old){const verified=await verifyCompletion(old,grantToken,trust);if(!equal(verified.commitment,claims))throw Error("Logger already closed this grant with different bytes.");return old;}
    const token=await signProof("completion",completionClaims(claims),logger);
    // Check public/private signer consistency before retaining anything.
    await verifyCompletion(token,grantToken,trust);rows.set(key,token);return token;
  });
}

export type CurrentAuthority={enabled:boolean;grantToken:string;trust:Omit<Trust,"now">};
export class CompletionAuthority {
  constructor(private readonly options:{ledger:ProtocolLedger;device:SharingDevice;clock:()=>number;current:()=>CurrentAuthority}){}
  private current(grantToken:string){
    const state=structuredClone(this.options.current()),now=this.options.clock();
    if(!state.enabled||state.grantToken!==grantToken||state.trust.authority.keyId!==this.options.device.keyId||!Number.isSafeInteger(now)||now<0)throw Error("Current NFC authority unavailable or revoked.");
    return{state,trust:{...state.trust,now}};
  }
  private unchanged(original:ReturnType<CompletionAuthority["current"]>,grantToken:string,expiresAt:number){
    const current=this.current(grantToken);
    if(!equal(original.state,current.state)||current.trust.now<original.trust.now||current.trust.now>=expiresAt)throw Error("NFC authority or clock changed before commit.");
  }
  // authenticatedLoggerId is supplied by a trusted synthetic adapter, not a UI role.
  async finalize(authenticatedLoggerId:string,grantToken:string,completion:string){
    let finalCheck:()=>void=()=>{throw Error("Missing current-authority transaction check.");};
    return this.options.ledger.transaction(async rows=>{
      const state=this.current(grantToken),v=await verifyCompletion(completion,grantToken,state.trust);
      if(authenticatedLoggerId!==v.grant.logger.keyId)throw Error("Authenticated logger differs from grant.");
      const key=finalKey(state.trust),old=rows.get(key);
      if(old&&old!==completion)throw Error("Grant already finalized with a different immutable completion.");
      rows.set(key,completion);finalCheck=()=>this.unchanged(state,grantToken,v.grant.expiresAt);return completion;
    },()=>finalCheck());
  }
  async freshness(authenticatedReceiverId:string,grantToken:string,completion:string,challenge:string){
    if(!/^[a-f0-9]{64}$/.test(challenge))throw Error("Fresh random receiver challenge required.");
    let finalCheck:()=>void=()=>{throw Error("Missing current-authority transaction check.");};
    return this.options.ledger.transaction(async rows=>{
      const state=this.current(grantToken),v=await verifyCompletion(completion,grantToken,state.trust);
      if(authenticatedReceiverId!==v.grant.receiver.keyId)throw Error("Authenticated receiver differs from grant.");
      if(rows.get(finalKey(state.trust))!==completion)throw Error("Completion is not the authoritative terminal selection.");
      const key=JSON.stringify(["freshness",finalKey(state.trust),authenticatedReceiverId,challenge]);
      const expected={grantId:v.grant.id,grantDigest:await tokenDigest(grantToken),completionDigest:await tokenDigest(completion),receiverId:authenticatedReceiverId,challenge,epoch:v.grant.epoch};
      const old=rows.get(key);
      if(old){
        const f=await verifyFreshness(old,state.trust,expected,Math.max(0,state.trust.now-59999));
        finalCheck=()=>this.unchanged(state,grantToken,Math.min(f.expiresAt,v.grant.expiresAt));return old;
      }
      const claim:Freshness={...expected,issuedAt:state.trust.now,expiresAt:Math.min(state.trust.now+60000,v.grant.expiresAt)};
      const token=await signProof("freshness",freshnessClaims(claim),this.options.device);
      await verifyFreshness(token,state.trust,expected,state.trust.now);
      rows.set(key,token);finalCheck=()=>this.unchanged(state,grantToken,claim.expiresAt);return token;
    },()=>finalCheck());
  }
}

// A challenge is created locally, never supplied by the tag or an incoming proof.
// It is memory-only in this slice. A new process creates a new challenge and must
// obtain new authority evidence; no old response can restore current status.
export class ReceiverChallenge {
  readonly #nonce=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,"0")).join("");
  readonly #trust:Trust;
  readonly #receiverId:string;
  #acceptedDigest:string|null=null;
  constructor(trust:Trust,receiverId:string){
    this.#trust=structuredClone(trust);this.#receiverId=receiverId;
    if(!Number.isSafeInteger(trust.now)||trust.now<0)throw Error("Trusted receiver clock required.");
  }
  get nonce(){return this.#nonce;}
  async inspect(input:{grantToken:string;completion:string;freshness?:string;now:number;image:TagImage;layout:MemoryLayout;sectionKey:CryptoKey}){
    const {grantToken,completion,freshness,now,sectionKey}=input,layout=structuredClone(input.layout),image=new Map([...input.image].map(([n,b])=>[n,b.slice()]));
    const trust={...this.#trust,now},v=await verifyCompletion(completion,grantToken,trust);
    if(v.grant.receiver.keyId!==this.#receiverId)throw Error("Receiver is outside this grant.");
    if(!freshness)return{status:"authenticated-not-fresh" as const,reason:"Logger identity is verified, but current authority evidence is unavailable. No current clinical data returned."};
    const proof=await verifyFreshness(freshness,trust,{grantId:v.grant.id,grantDigest:await tokenDigest(grantToken),completionDigest:await tokenDigest(completion),receiverId:this.#receiverId,challenge:this.#nonce,epoch:v.grant.epoch},this.#trust.now);
    const evidence=await tokenDigest(freshness);
    if(this.#acceptedDigest&&this.#acceptedDigest!==evidence)throw Error("Receiver challenge already consumed by different evidence.");
    // A's independent reader remains available separately. This B result never
    // promotes a digest read from Section C into a trusted expectation.
    const decoded=await inspectCommit(image,layout,v.expected,sectionKey);
    if(decoded.status!=="current")throw Error("Tag B differs from the authoritative signed completion.");
    await checkPinnedSection(image,layout,{context:{...v.expected.context,section:"a",sequence:1},packetDigest:v.grant.originalDigest});
    if(this.#acceptedDigest&&this.#acceptedDigest!==evidence)throw Error("Receiver challenge already consumed by different evidence.");
    this.#acceptedDigest=evidence;
    return{status:"current-at-authority-check" as const,checkedAt:proof.issuedAt,expiresAt:proof.expiresAt,expected:v.expected,value:decoded.value};
  }
}
