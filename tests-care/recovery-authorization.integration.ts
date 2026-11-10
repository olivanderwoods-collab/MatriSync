import {describe,expect,it,vi} from "vitest";
import {CompactSign,compactDecrypt,decodeJwt} from "jose";
import {newSharingDevice,type SharingDevice} from "../src/sharing-crypto";
import {EmulatorRecoveryBoundary,emulatorAccount,type EmulatorFault} from "./recovery-emulator";
import {RECOVERY_DOMAIN,bytes,approvalClaims,closureClaims,possessionClaims,type RecoveryOffer} from "./recovery-verifier";

// Hard-coded demo emulators; these helpers cannot accept a project or URL.
const root="http://127.0.0.1:8086/v1/projects/demo-matrisync/databases/(default)/documents";
const authRoot="http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
async function auth(method:string,body:unknown,owner=false){
  const r=await fetch(`${authRoot}/${method}?key=emulator-only-key`,{method:"POST",headers:{"Content-Type":"application/json",...(owner?{Authorization:"Bearer owner"}:{})},body:JSON.stringify(body)});
  if(!r.ok)throw Error(`Synthetic Auth fixture failed: ${r.status}`);return r.json();
}
type Field={stringValue?:string;timestampValue?:string;booleanValue?:boolean;mapValue?:{fields:Record<string,Field>}};
function encode(v:unknown):Field {
  if(v instanceof Date)return {timestampValue:v.toISOString()};
  if(typeof v==="string")return {stringValue:v};if(typeof v==="boolean")return {booleanValue:v};
  return {mapValue:{fields:Object.fromEntries(Object.entries(v as Record<string,unknown>).map(([k,v])=>[k,encode(v)]))}};
}
async function put(path:string,data:unknown){
  const r=await fetch(`${root}/${path}`,{method:"PATCH",headers:{Authorization:"Bearer owner","Content-Type":"application/json"},body:JSON.stringify({fields:encode(data).mapValue!.fields})});
  if(!r.ok)throw Error(`Synthetic Firestore fixture failed: ${r.status}`);
}
const pub=(d:SharingDevice)=>({encryption:d.encryption,signing:d.signing,keyId:d.keyId});
async function sign(d:SharingDevice,purpose:string,value:unknown){return new CompactSign(bytes(value)).setProtectedHeader({alg:"ES256",typ:`${RECOVERY_DOMAIN}:${purpose}`,kid:d.keyId}).sign(d.signKey);}
async function proofs(offer:RecoveryOffer,original:SharingDevice,target:SharingDevice,cases:string[]){
  const opened=await compactDecrypt(offer.challengeEnvelope,target.decryptKey),nonce=JSON.parse(new TextDecoder().decode(opened.plaintext))[4];
  const possession=await sign(target,"possession",possessionClaims(offer,nonce));
  return {id:offer.request.id,cases,possession,approval:await sign(original,"approval",await approvalClaims(offer,cases,possession))};
}
async function fixture(role="doctor"){
  const account=await auth("accounts:signUp",{email:`recovery-${crypto.randomUUID()}@example.invalid`,password:"Synthetic-local-test-only-42!",returnSecureToken:true});
  const token=account.idToken as string,uid=account.localId as string;
  const original=await newSharingDevice(),target=await newSharingDevice(),key=crypto.getRandomValues(new Uint8Array(32));
  const facilityId=`facility-${crypto.randomUUID()}`,caseId=crypto.randomUUID();
  await put(`careDevices/${uid}`,pub(original));
  await put(`careFacilities/${facilityId}`,{name:"Synthetic recovery facility",enabled:true,inviteId:"synthetic-only",createdAt:new Date()});
  await put(`careStaff/${uid}`,{facilityId,enabled:true,role,name:"Synthetic care worker"});
  await put(`careCases/${caseId}`,{creatorUid:uid,motherUid:`mother-${crypto.randomUUID()}`,facilityId,motherSalt:"synthetic-salt",motherWrapped:"synthetic-wrapped",encrypted:"synthetic-ciphertext",createdAt:new Date()});
  await put(`careAccess/${caseId}_${uid}`,{caseId,uid,facilityId,grantedBy:facilityId,viaNfc:false,wrapped:"synthetic-wrapped",createdAt:new Date()});
  const state={fault:undefined as undefined|((p:EmulatorFault)=>Promise<void>)};
  const boundary=new EmulatorRecoveryBoundary(key,{fault:p=>state.fault?.(p)??Promise.resolve()});
  await boundary.initialize(token);
  const input={version:1 as const,id:crypto.randomUUID(),uid,oldKeyId:original.keyId,newDevice:pub(target)};
  const offer=await boundary.request(token,input),approval=await proofs(offer,original,target,[caseId]);
  return {token,uid,original,target,key,facilityId,caseId,state,boundary,input,offer,approval};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function pending(f:Fixture){expect(await f.boundary.reconcile(f.token,f.input.id)).toBeUndefined();}
function alteredToken(token:string,fields:Record<string,unknown>){return `${token.split(".")[0]}.${Buffer.from(JSON.stringify({...decodeJwt(token),...fields})).toString("base64url")}.`;}

describe("real local Auth and Firestore recovery authorization boundary",()=>{
  it.each(["doctor","nurse","lab"])("uses authoritative %s assignment without creating grants or changing enrolled keys",async role=>{
    const f=await fixture(role),decision=await f.boundary.approve(f.token,f.approval);
    expect(decision).toMatchObject({uid:f.uid,status:"approved",cases:[f.caseId],epoch:{keyId:f.target.keyId,parentKeyId:f.original.keyId}});
    expect(await new EmulatorRecoveryBoundary(f.key).reconcile(f.token,f.input.id)).toEqual(decision);
    const state=await (await fetch(`${root}/isolatedRecovery/${f.uid}`,{headers:{Authorization:"Bearer owner"}})).text();
    expect(state).not.toContain(f.input.id);expect(state).not.toContain(f.approval.approval);
    const enrolled=await (await fetch(`${root}/careDevices/${f.uid}`,{headers:{Authorization:"Bearer owner"}})).json();
    expect(enrolled.fields.keyId.stringValue).toBe(f.original.keyId);
    for(const method of ["GET","PATCH"]){
      const r=await fetch(`${root}/isolatedRecovery/${f.uid}`,{method,headers:{Authorization:`Bearer ${f.token}`,"Content-Type":"application/json"},...(method==="PATCH"?{body:JSON.stringify({fields:{}})}:{})});
      expect(r.status).toBe(403);
    }
  });
  it("permits an assigned active facility without giving it prescribing authority",async()=>{
    const f=await fixture();await put(`careStaff/${f.uid}`,{enabled:false});await put(`careFacilities/${f.uid}`,{enabled:true});
    await put(`careAccess/${f.caseId}_${f.uid}`,{caseId:f.caseId,uid:f.uid,facilityId:f.uid});
    expect((await f.boundary.approve(f.token,f.approval)).status).toBe("approved");
  });
  it("rejects forged body account, role and authority fields",async()=>{
    const f=await fixture();
    await expect(f.boundary.request(f.token,{...f.input,id:crypto.randomUUID(),uid:"foreign"})).rejects.toThrow("account");
    for(const extra of [{uid:f.uid},{role:"doctor"},{project:"matrisync-c9de7"},{authority:{enabled:true,cases:[f.caseId]}}])await expect(f.boundary.approve(f.token,{...f.approval,...extra})).rejects.toThrow("schema");
    await pending(f);
  });
  it.each([
    {aud:"matrisync-c9de7"},{iss:"https://securetoken.google.com/another-project"},{exp:1},{iat:9999999999},{auth_time:9999999999},
    {firebase:{sign_in_provider:"anonymous"}},{sub:"missing-synthetic-account"},
  ])("refuses invalid token claims %j",async change=>{
    const f=await fixture();await expect(f.boundary.approve(alteredToken(f.token,change),f.approval)).rejects.toThrow();await pending(f);
  });
  it("requires original device approval even with a valid account session",async()=>{
    const f=await fixture();
    await expect(f.boundary.approve(f.token,{...f.approval,approval:""})).rejects.toThrow();
    await expect(f.boundary.approve(f.token,{...f.approval,approval:await sign(f.target,"approval",await approvalClaims(f.offer,[f.caseId],f.approval.possession))})).rejects.toThrow();
    await pending(f);
  });
  it("isolates operations between two real Auth accounts",async()=>{
    const f=await fixture(),other=await fixture();
    await expect(other.boundary.reconcile(other.token,f.input.id)).rejects.toThrow("account");
    await expect(other.boundary.approve(other.token,f.approval)).rejects.toThrow("account");await pending(f);
  });
  it.each(["staff","facility","assignment","staff-facility","role","device"])("blocks changed %s authority before approval",async change=>{
    const f=await fixture();
    if(change==="staff")await put(`careStaff/${f.uid}`,{facilityId:f.facilityId,role:"doctor",enabled:false});
    if(change==="facility")await put(`careFacilities/${f.facilityId}`,{enabled:false});
    if(change==="assignment")await put(`careAccess/${f.caseId}_${f.uid}`,{caseId:f.caseId,uid:f.uid,facilityId:"other"});
    if(change==="staff-facility")await put(`careStaff/${f.uid}`,{facilityId:"missing-facility",role:"doctor",enabled:true});
    if(change==="role")await put(`careStaff/${f.uid}`,{facilityId:f.facilityId,role:"administrator",enabled:true});
    if(change==="device")await put(`careDevices/${f.uid}`,pub(f.target));
    await expect(f.boundary.approve(f.token,f.approval)).rejects.toThrow();await pending(f);
  });
  it("does not grant a Mother full clinical-case recovery",async()=>{
    const f=await fixture();await put(`careStaff/${f.uid}`,{enabled:false});await put(`careCases/${f.caseId}`,{motherUid:f.uid});
    await expect(f.boundary.approve(f.token,f.approval)).rejects.toThrow("authority");await pending(f);
  });
  it("denies a disabled Auth account even when original proofs are valid",async()=>{
    const f=await fixture();await auth("accounts:update",{localId:f.uid,disableUser:true},true);
    await expect(f.boundary.approve(f.token,f.approval)).rejects.toThrow();
    await auth("accounts:update",{localId:f.uid,disableUser:false},true);await pending(f);
  });
  it.each(["staff","facility","assignment","device"])("fails closed when %s changes during the decision transaction",async change=>{
    const f=await fixture();
    f.state.fault=async point=>{
      if(point!=="before-commit")return;
      if(change==="staff")await put(`careStaff/${f.uid}`,{facilityId:f.facilityId,role:"doctor",enabled:false});
      if(change==="facility")await put(`careFacilities/${f.facilityId}`,{enabled:false});
      if(change==="assignment")await put(`careAccess/${f.caseId}_${f.uid}`,{caseId:f.caseId,uid:f.uid,facilityId:"other"});
      if(change==="device")await put(`careDevices/${f.uid}`,pub(f.target));
    };
    await expect(f.boundary.approve(f.token,f.approval)).rejects.toThrow();f.state.fault=undefined;await pending(f);
  });
  it("rechecks Auth after proof validation and before commit",async()=>{
    const f=await fixture();f.state.fault=async point=>{if(point==="before-commit")await auth("accounts:update",{localId:f.uid,disableUser:true},true);};
    await expect(f.boundary.approve(f.token,f.approval)).rejects.toThrow();f.state.fault=undefined;
    await auth("accounts:update",{localId:f.uid,disableUser:false},true);await pending(f);
  });
  it("retains the same receipt after response loss and later staff revocation",async()=>{
    const f=await fixture();f.state.fault=async point=>{if(point==="after-commit")throw Error("Injected response loss");};
    await expect(f.boundary.approve(f.token,f.approval)).rejects.toThrow("response loss");f.state.fault=undefined;
    await put(`careStaff/${f.uid}`,{enabled:false});const restarted=new EmulatorRecoveryBoundary(f.key);
    const receipt=await restarted.reconcile(f.token,f.input.id);expect(receipt?.status).toBe("approved");
    expect(await restarted.approve(f.token,f.approval)).toEqual(receipt);
    await expect(restarted.request(f.token,{...f.input,id:crypto.randomUUID()})).rejects.toThrow("authority");
  });
  it("rolls back pre-commit failures and retries the exact operation",async()=>{
    const f=await fixture();f.state.fault=async point=>{if(point==="before-commit")throw Error("Injected connection failure");};
    await expect(f.boundary.approve(f.token,f.approval)).rejects.toThrow("connection failure");f.state.fault=undefined;await pending(f);
    expect((await f.boundary.approve(f.token,f.approval)).status).toBe("approved");
  });
  it("does not replay a commit when the transport loses its real successful response",async()=>{
    const f=await fixture(),actual=globalThis.fetch;let commits=0;
    const spy=vi.spyOn(globalThis,"fetch").mockImplementation(async(url,init)=>{
      const response=await actual(url,init);
      if(String(url).endsWith("/documents:commit")&&JSON.parse(init!.body as string).writes.length){commits++;if(response.ok)throw TypeError("Injected transport response loss");}
      return response;
    });
    try{await expect(f.boundary.approve(f.token,f.approval)).rejects.toThrow("transport response loss");}finally{spy.mockRestore();}
    expect(commits).toBe(1);const receipt=await f.boundary.reconcile(f.token,f.input.id);expect(receipt?.status).toBe("approved");
    expect(await f.boundary.approve(f.token,f.approval)).toEqual(receipt);
  });
  it("reuses the original challenge after losing the request response",async()=>{
    const f=await fixture(),input={...f.input,id:crypto.randomUUID()};
    f.state.fault=async point=>{if(point==="after-commit")throw Error("Injected request response loss");};
    await expect(f.boundary.request(f.token,input)).rejects.toThrow("response loss");f.state.fault=undefined;
    const offer=await f.boundary.request(f.token,input);
    expect(await new EmulatorRecoveryBoundary(f.key).request(f.token,input)).toEqual(offer);
  });
  it("checks every case and refuses a signed unassigned case",async()=>{
    const f=await fixture(),extra=crypto.randomUUID();await put(`careCases/${extra}`,{motherUid:"another-mother",facilityId:f.facilityId});
    await expect(f.boundary.approve(f.token,await proofs(f.offer,f.original,f.target,[f.caseId,extra]))).rejects.toThrow("scope");await pending(f);
  });
  it("prevents a second operation from approving the same target",async()=>{
    const f=await fixture(),other=await f.boundary.request(f.token,{...f.input,id:crypto.randomUUID()});
    await f.boundary.approve(f.token,f.approval);
    await expect(f.boundary.approve(f.token,await proofs(other,f.original,f.target,[f.caseId]))).rejects.toThrow("already approved");
    expect(await f.boundary.reconcile(f.token,other.request.id)).toBeUndefined();
  });
  it("serializes competing approvals without duplicate decisions",async()=>{
    const f=await fixture();const other=new EmulatorRecoveryBoundary(f.key);
    const results=await Promise.allSettled([f.boundary.approve(f.token,f.approval),other.approve(f.token,f.approval)]);
    expect(results.some(r=>r.status==="fulfilled")).toBe(true);
    const receipt=await other.reconcile(f.token,f.input.id);
    expect(await f.boundary.approve(f.token,f.approval)).toEqual(receipt);
    expect(await other.approve(f.token,f.approval)).toEqual(receipt);
  });
  it("keeps cancellation terminal and immutable across restart",async()=>{
    const f=await fixture(),close={id:f.input.id,status:"cancelled",proof:await sign(f.original,"cancelled",closureClaims(f.offer,"cancelled"))};
    const receipt=await f.boundary.close(f.token,close);
    expect(await new EmulatorRecoveryBoundary(f.key).close(f.token,close)).toEqual(receipt);
    await expect(f.boundary.approve(f.token,f.approval)).rejects.toThrow("cancelled");
  });
  it("refuses replacement initialization, wrong storage keys and damaged state",async()=>{
    const f=await fixture();await expect(f.boundary.initialize(f.token)).rejects.toThrow();
    await expect(new EmulatorRecoveryBoundary(crypto.getRandomValues(new Uint8Array(32))).reconcile(f.token,f.input.id)).rejects.toThrow();
    await pending(f);await put(`isolatedRecovery/${f.uid}`,{envelope:"broken"});
    await expect(f.boundary.reconcile(f.token,f.input.id)).rejects.toThrow("refusing reset");
  });
  it("records the unsigned-token limitation rather than claiming production JWT verification",async()=>{
    const f=await fixture();
    // Emulator accepts this re-encoded unsigned token for an existing account.
    // Therefore even real lookup is not a cryptographic proof of login here.
    expect(await emulatorAccount(alteredToken(f.token,{name:"forged display name"}))).toBe(f.uid);
  });
});
