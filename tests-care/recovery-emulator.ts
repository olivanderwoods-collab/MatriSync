// Isolated test infrastructure only. No listener, production endpoint or grants.
// Auth emulator tokens are UNSIGNED: lookup is not production authentication.
import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {decodeJwt,decodeProtectedHeader} from "jose";
import {IsolatedRecoveryVerifier,RECOVERY_DOMAIN,type Authority,type RecoveryStore,type Stored,type RecoveryOffer,type Decision,type ClosedDecision,type RecoveryOutcome} from "./recovery-verifier";
import type {PublicDevice} from "../src/sharing-crypto";

const project="demo-matrisync",database=`projects/${project}/databases/(default)`;
const root=`http://127.0.0.1:8086/v1/${database}/documents`;
const segment=/^[A-Za-z0-9_-]{1,128}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const limit=512*1024;
type Fields=Record<string,Value>;
type Value={stringValue?:string;timestampValue?:string;booleanValue?:boolean;integerValue?:string;nullValue?:null;mapValue?:{fields:Fields}};
type Document={name:string;fields:Fields};
function decode(v:Value):unknown {
  if("stringValue" in v)return v.stringValue;
  if("timestampValue" in v)return v.timestampValue;
  if("booleanValue" in v)return v.booleanValue;
  if("integerValue" in v)return Number(v.integerValue);
  if("nullValue" in v)return null;
  if(v.mapValue)return Object.fromEntries(Object.entries(v.mapValue.fields).map(([k,v])=>[k,decode(v)]));
  throw Error("Unsupported emulator authority value.");
}
async function rpc(method:string,body:unknown) {
  const response=await fetch(`${root}:${method}`,{method:"POST",redirect:"error",headers:{Authorization:"Bearer owner","Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const result=await response.json();
  const failure=result.error||(Array.isArray(result)?result.find(e=>e.error)?.error:undefined);
  if(!response.ok||failure)throw Error(`Recovery emulator transaction failed (${failure?.status||response.status}); reconcile before retry.`);
  return result;
}
export async function emulatorAccount(token:string):Promise<string> {
  if(typeof token!=="string"||token.length>8192)throw Error("Invalid emulator authentication.");
  const c=decodeJwt(token),h=decodeProtectedHeader(token),now=Math.floor(Date.now()/1000);
  if(h.alg!=="none"||token.split(".")[2]!==""||c.aud!==project||c.iss!==`https://securetoken.google.com/${project}`||
    !segment.test(c.sub||"")||typeof c.exp!=="number"||!Number.isInteger(c.exp)||c.exp<=now||typeof c.iat!=="number"||!Number.isInteger(c.iat)||c.iat>now+30||
    !Number.isInteger(c.auth_time)||(c.auth_time as number)>now+30||
    (c.firebase as {sign_in_provider?:string}|undefined)?.sign_in_provider!=="password")throw Error("Invalid emulator authentication.");
  const response=await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:lookup?key=emulator-only-key",{
    method:"POST",redirect:"error",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error("Emulator account unavailable.");
  const user=(await response.json()).users?.[0];
  if(!user||user.localId!==c.sub||user.disabled||Number(user.validSince||0)>(c.auth_time as number))throw Error("Emulator account unavailable.");
  return c.sub!;
}
type Reader=(path:string)=>Promise<Record<string,unknown>|undefined>;
async function authority(get:Reader,uid:string,cases:string[]):Promise<Authority|undefined> {
  const device=await get(`careDevices/${uid}`),facility=await get(`careFacilities/${uid}`),staff=await get(`careStaff/${uid}`);
  let facilityId:string|undefined;
  if(facility?.enabled===true)facilityId=uid;
  else if(staff?.enabled===true&&typeof staff.facilityId==="string"&&segment.test(staff.facilityId)&&["doctor","nurse","lab"].includes(staff.role as string)) {
    if((await get(`careFacilities/${staff.facilityId}`))?.enabled===true)facilityId=staff.facilityId;
  }
  // Mother recovery needs a record-kind scope. A full clinical case approval
  // would be broader than Mother's current read permissions; fail closed here.
  if(!device||!facilityId)return undefined;
  const allowed:string[]=[];
  for(const id of cases){
    const record=await get(`careCases/${id}`),access=await get(`careAccess/${id}_${uid}`);
    if(record&&access?.caseId===id&&access.uid===uid&&access.facilityId===facilityId)allowed.push(id);
  }
  return {enabled:true,device:device as PublicDevice,cases:allowed};
}

export type EmulatorFault="before-commit"|"after-commit";
export class EmulatorRecoveryBoundary {
  private readonly key:Buffer;
  constructor(key:Uint8Array,private readonly options:{fault?:(point:EmulatorFault)=>Promise<void>}={}) {
    if(key.length!==32)throw Error("Recovery emulator storage key must be 32 bytes.");
    this.key=Buffer.from(key);
  }
  private aad(uid:string){return Buffer.from(`${RECOVERY_DOMAIN}:emulator-v1:${project}:${uid}`);}
  private seal(uid:string,text:string){
    if(Buffer.byteLength(text)>limit)throw Error("Recovery emulator store capacity exceeded.");
    const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",this.key,nonce);cipher.setAAD(this.aad(uid));
    return Buffer.concat([nonce,cipher.update(text),cipher.final(),cipher.getAuthTag()]).toString("base64");
  }
  private open(uid:string,value:unknown):Map<string,Stored> {
    if(typeof value!=="string"||value.length>Math.ceil((limit+28)/3)*4)throw Error("Invalid recovery emulator state.");
    const raw=Buffer.from(value,"base64");
    if(raw.length<28||raw.toString("base64")!==value)throw Error("Invalid recovery emulator state.");
    const decipher=createDecipheriv("aes-256-gcm",this.key,raw.subarray(0,12));decipher.setAAD(this.aad(uid));decipher.setAuthTag(raw.subarray(-16));
    const rows:unknown=JSON.parse(Buffer.concat([decipher.update(raw.subarray(12,-16)),decipher.final()]).toString("utf8"));
    if(!Array.isArray(rows)||rows.some(r=>!Array.isArray(r)||r.length!==2||!uuid.test(r[0])||r[1]?.offer?.request?.id!==r[0]||r[1]?.offer?.request?.uid!==uid)||new Set(rows.map(r=>r[0])).size!==rows.length)throw Error("Invalid recovery emulator state.");
    return new Map(rows);
  }
  // Explicit fixture provisioning only. Main operations never recreate missing state.
  async initialize(token:string){
    const uid=await emulatorAccount(token);
    await rpc("commit",{writes:[{update:{name:`${database}/documents/isolatedRecovery/${uid}`,fields:{version:{integerValue:"1"},envelope:{stringValue:this.seal(uid,"[]")}}},currentDocument:{exists:false}}]});
  }
  private execute(token:string,operation:"request",input:unknown):Promise<RecoveryOffer>;
  private execute(token:string,operation:"approve",input:unknown):Promise<Decision>;
  private execute(token:string,operation:"close",input:unknown):Promise<ClosedDecision>;
  private execute(token:string,operation:"reconcile",input:unknown):Promise<RecoveryOutcome|undefined>;
  private async execute(token:string,operation:"request"|"approve"|"close"|"reconcile",input:unknown){
    const serialized=JSON.stringify(input);
    if(typeof serialized!=="string"||Buffer.byteLength(serialized)>32768)throw Error("Invalid recovery input.");
    const value=JSON.parse(serialized); // Capture before any authentication/network await.
    const cases=operation==="approve"?value?.cases:[];
    if(!Array.isArray(cases)||cases.length>100||!cases.every(id=>typeof id==="string"&&uuid.test(id)))throw Error("Invalid recovery case scope.");
    if(operation==="reconcile"&&(typeof value!=="string"||!uuid.test(value)))throw Error("Invalid recovery operation.");
    const uid=await emulatorAccount(token),path=`isolatedRecovery/${uid}`;
    const store:RecoveryStore={transaction:async <T>(work:(records:Map<string,Stored>)=>Promise<T>,beforeCommit?:()=>void):Promise<T>=>{
      const {transaction}=await rpc("beginTransaction",{options:{readWrite:{}}});
      try{
        const get:Reader=async path=>{
          const entries=await rpc("batchGet",{documents:[`${database}/documents/${path}`],transaction});
          const entry=entries[0] as {missing?:string;found?:Document};
          if(entry?.missing)return undefined;
          if(!entry?.found)throw Error("Invalid recovery emulator read.");
          return decode({mapValue:{fields:entry.found.fields}}) as Record<string,unknown>;
        };
        const state=await get(path);
        if(state?.version!==1||Object.keys(state).sort().join()!=="envelope,version")throw Error("Recovery emulator store missing or unsupported; refusing reset.");
        const records=this.open(uid,state.envelope),before=JSON.stringify([...records]);
        current=operation==="reconcile"?undefined:await authority(get,uid,cases);
        const result=await work(records),after=JSON.stringify([...records]);
        if(after!==before)await this.options.fault?.("before-commit");
        // Auth is a separate service: recheck immediately before commit, but do
        // not claim cross-service atomicity. Firestore read-set authority IS atomic.
        if(await emulatorAccount(token)!==uid)throw Error("Recovery account changed.");
        beforeCommit?.();
        await rpc("commit",{transaction,writes:after===before?[]:[{update:{name:`${database}/documents/${path}`,fields:{version:{integerValue:"1"},envelope:{stringValue:this.seal(uid,after)}}}}]});
        if(after!==before)await this.options.fault?.("after-commit");
        return result;
      }catch(error){
        await rpc("rollback",{transaction}).catch(()=>undefined);
        // Never replay a transaction after an ambiguous outcome. The caller
        // reconciles the same operation; proofs and original offers stay exact.
        throw error;
      }
    }};
    let current:Authority|undefined;
    const verifier=new IsolatedRecoveryVerifier({clock:Date.now,authority:()=>current,store});
    if(operation==="request")return verifier.request(uid,value);
    if(operation==="approve")return verifier.approve(uid,value);
    if(operation==="close")return verifier.close(uid,value);
    return verifier.reconcile(uid,value);
  }
  request(token:string,value:unknown){return this.execute(token,"request",value);}
  approve(token:string,value:unknown){return this.execute(token,"approve",value);}
  close(token:string,value:unknown){return this.execute(token,"close",value);}
  reconcile(token:string,id:string){return this.execute(token,"reconcile",id);}
}
