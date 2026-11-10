import "fake-indexeddb/auto";
import {beforeAll,afterAll,describe,it,expect,vi} from "vitest";
import {CompactSign,compactDecrypt} from "jose";
import {randomBytes} from "node:crypto";
import {request as httpRequest} from "node:http";
import {newSharingDevice,type SharingDevice} from "../src/sharing-crypto";
import {localSharingDevice} from "../src/sharing-storage";
import {saveCareDraft,readCareDraft,claimPendingCareHandoff,readPendingCareHandoff,type PendingCareHandoff} from "../src/care-storage";
import {emptyReferralFields} from "../src/referral-draft";
import {EmulatorRecoveryBoundary} from "./recovery-emulator";
import {recoveryTransport,type RecoveryAction} from "./recovery-transport";
import {LoopbackRecoveryClient} from "./recovery-remote";
import {BrowserImportDatabase,BrowserExportDatabase} from "./recovery-indexeddb";
import {IsolatedRecoveryExport} from "./recovery-export";
import {IsolatedRecoveryImport} from "./recovery-import";
import {reviewSourceSelection} from "./recovery-source";
import {bytes,RECOVERY_DOMAIN,approvalClaims,closureClaims,possessionClaims,type RecoveryOffer,type Authority} from "./recovery-protocol";

const session=vi.hoisted(()=>({currentUser:{uid:"",isAnonymous:false}}));
vi.mock("../src/auth",()=>({accountAuth:async()=>session}));
const origin="http://127.0.0.1:4192",root="http://127.0.0.1:8086/v1/projects/demo-matrisync/databases/(default)/documents";
const realFetch=globalThis.fetch;
const serviceKey=randomBytes(32); // One server custody key shared by isolated synthetic accounts.
let boundary:EmulatorRecoveryBoundary,lose:RecoveryAction|undefined;
const server=recoveryTransport({request:(...a)=>boundary.request(...a),approve:(...a)=>boundary.approve(...a),close:(...a)=>boundary.close(...a),reconcile:(...a)=>boundary.reconcile(...a),inspect:(...a)=>boundary.inspect(...a)},{afterDispatch:action=>{if(lose===action){lose=undefined;return true;}return false;}});
beforeAll(async()=>{
  await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(4192,"127.0.0.1",resolve);});
  vi.stubGlobal("location",{origin});
  // Node fetch does not synthesize browser Origin/Fetch Metadata headers. Add
  // them only for the browser client under test; raw security probes omit them.
  vi.stubGlobal("fetch",(url:RequestInfo|URL,init?:RequestInit)=>{
    if(String(url).startsWith(origin)){const headers=new Headers(init?.headers);headers.set("Origin",origin);headers.set("Sec-Fetch-Site","same-origin");return realFetch(url,{...init,headers});}
    return realFetch(url,init);
  });
});
afterAll(async()=>{vi.unstubAllGlobals();server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));});
type Field={stringValue?:string;booleanValue?:boolean;mapValue?:{fields:Record<string,Field>}};
function encode(v:unknown):Field{if(typeof v==="string")return {stringValue:v};if(typeof v==="boolean")return {booleanValue:v};return {mapValue:{fields:Object.fromEntries(Object.entries(v as Record<string,unknown>).map(([k,v])=>[k,encode(v)]))}};}
async function put(path:string,v:unknown){const r=await realFetch(`${root}/${path}`,{method:"PATCH",headers:{Authorization:"Bearer owner","Content-Type":"application/json"},body:JSON.stringify({fields:encode(v).mapValue!.fields})});if(!r.ok)throw Error("Synthetic fixture write failed");}
const pub=(d:SharingDevice)=>({encryption:d.encryption,signing:d.signing,keyId:d.keyId});
const sign=(d:SharingDevice,purpose:string,v:unknown)=>new CompactSign(bytes(v)).setProtectedHeader({alg:"ES256",typ:`${RECOVERY_DOMAIN}:${purpose}`,kid:d.keyId}).sign(d.signKey);
async function fixture(){
  const r=await realFetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:`transport-${crypto.randomUUID()}@example.invalid`,password:"Synthetic-local-test-only-42!",returnSecureToken:true})});
  if(!r.ok)throw Error("Synthetic Auth signup failed");const account=await r.json(),uid=account.localId as string,token=account.idToken as string;
  session.currentUser={uid,isAnonymous:false};const source=await localSharingDevice(uid),target=await newSharingDevice(),caseId=crypto.randomUUID(),facilityId=`synthetic-${crypto.randomUUID()}`,key=serviceKey;
  boundary=new EmulatorRecoveryBoundary(key);lose=undefined;
  await put(`careDevices/${uid}`,pub(source));await put(`careFacilities/${facilityId}`,{enabled:true});await put(`careStaff/${uid}`,{enabled:true,facilityId,role:"doctor"});await put(`careCases/${caseId}`,{motherUid:"synthetic-mother"});await put(`careAccess/${caseId}_${uid}`,{caseId,uid,facilityId});await boundary.initialize(token);
  const client=new LoopbackRecoveryClient(async()=>token),input={version:1 as const,id:crypto.randomUUID(),uid,oldKeyId:source.keyId,newDevice:pub(target)};
  const proofs=async(offer:RecoveryOffer)=>{
    const nonce=JSON.parse(new TextDecoder().decode((await compactDecrypt(offer.challengeEnvelope,target.decryptKey)).plaintext))[4];
    const possession=await sign(target,"possession",possessionClaims(offer,nonce));return {id:input.id,cases:[caseId],possession,approval:await sign(source,"approval",await approvalClaims(offer,[caseId],possession))};
  };
  return {uid,token,source,target,caseId,facilityId,key,client,input,proofs};
}
function probe(token:string,body:unknown,headers:Record<string,string>={},method="POST",path="/v1/recovery"){
  return realFetch(origin+path,{method,headers:{Origin:origin,Authorization:`Bearer ${token}`,"Content-Type":"application/json","X-MatriSync-Recovery":"1",...headers},...(method==="GET"?{}:{body:typeof body==="string"?body:JSON.stringify(body)})});
}
describe("loopback HTTP recovery transport with real emulator identity",()=>{
  it("requires actual original approval and returns only the same persisted decision",async()=>{
    const f=await fixture(),offer=await f.client.request(f.input);expect(await f.client.reconcile(f.input.id)).toBeUndefined();
    await expect(f.client.approve({...await f.proofs(offer),approval:""})).rejects.toThrow("Reconcile");
    const approval=await f.proofs(offer),decision=await f.client.approve(approval);
    expect(await f.client.approve(approval)).toEqual(decision);expect(await f.client.reconcile(f.input.id)).toEqual(decision);
    const inspection=await f.client.inspect(f.input.id);expect(inspection.uid).toBe(f.uid);expect(inspection.authority.cases).toEqual([f.caseId]);expect(inspection.decision).toEqual(decision);
    expect(JSON.stringify(inspection)).not.toContain("nonce");expect(JSON.stringify(inspection)).not.toContain("Bearer owner");
  });
  it("reconciles a socket lost after commit without resubmitting or replacing the proof",async()=>{
    const f=await fixture(),offer=await f.client.request(f.input),approval=await f.proofs(offer);lose="approve";
    await expect(f.client.approve(approval)).rejects.toThrow();boundary=new EmulatorRecoveryBoundary(f.key);
    const receipt=await f.client.reconcile(f.input.id);expect(receipt?.status).toBe("approved");expect(await f.client.approve(approval)).toEqual(receipt);
  });
  it("retries a request after a lost response with its original saved challenge",async()=>{
    const f=await fixture();lose="request";await expect(f.client.request(f.input)).rejects.toThrow();
    const offer=await f.client.request(f.input);expect(await new LoopbackRecoveryClient(async()=>f.token).request(f.input)).toEqual(offer);
  });
  it("keeps cancellation terminal across the transport",async()=>{
    const f=await fixture(),offer=await f.client.request(f.input),close={id:f.input.id,status:"cancelled" as const,proof:await sign(f.source,"cancelled",closureClaims(offer,"cancelled"))};
    const receipt=await f.client.close(close);expect(await f.client.reconcile(f.input.id)).toEqual(receipt);expect(await f.client.close(close)).toEqual(receipt);await expect(f.client.approve(await f.proofs(offer))).rejects.toThrow();await expect(f.client.inspect(f.input.id)).rejects.toThrow();
  });
  it("refuses current inspection after access revocation but retains the historical receipt",async()=>{
    const f=await fixture(),offer=await f.client.request(f.input),decision=await f.client.approve(await f.proofs(offer));await put(`careAccess/${f.caseId}_${f.uid}`,{caseId:f.caseId,uid:f.uid,facilityId:"foreign"});
    await expect(f.client.inspect(f.input.id)).rejects.toThrow();expect(await f.client.reconcile(f.input.id)).toEqual(decision);
  });
  it("refuses inspection of pending operations and changed original devices",async()=>{
    const f=await fixture(),offer=await f.client.request(f.input);await expect(f.client.inspect(f.input.id)).rejects.toThrow();
    const decision=await f.client.approve(await f.proofs(offer));await put(`careDevices/${f.uid}`,pub(f.target));await expect(f.client.inspect(f.input.id)).rejects.toThrow();expect(await f.client.reconcile(f.input.id)).toEqual(decision);
  });
  it.each(["role","uid","authority"])("rejects forged transport %s",async field=>{
    const f=await fixture(),r=await probe(f.token,{action:"request",input:f.input,[field]:"doctor"});expect(r.status).toBe(400);await expect(f.client.reconcile(f.input.id)).rejects.toThrow();
  });
  it.each(["https://matrisync-c9de7.web.app","http://localhost:4192","null",""])("refuses unexpected Origin %s",async Origin=>{
    const f=await fixture(),r=await probe(f.token,{action:"request",input:f.input},{Origin});expect(r.status).toBe(403);expect(r.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("refuses wrong Host and cross-site fetch metadata",async()=>{
    const f=await fixture(),body=JSON.stringify({action:"request",input:f.input});
    const status=await new Promise<number>((resolve,reject)=>{const req=httpRequest(origin+"/v1/recovery",{method:"POST",headers:{Host:"attacker.invalid",Origin:origin,Authorization:`Bearer ${f.token}`,"Content-Type":"application/json","X-MatriSync-Recovery":"1"}},res=>{res.resume();resolve(res.statusCode!);});req.on("error",reject);req.end(body);});expect(status).toBe(403);
    expect((await probe(f.token,body,{"Sec-Fetch-Site":"cross-site"})).status).toBe(403);
  });
  it.each<Record<string,string>>([{ "Content-Type":"text/plain" },{"X-MatriSync-Recovery":""},{Cookie:"session=ignored"},{"Content-Encoding":"gzip"}])("refuses unsupported request headers %j",async headers=>{
    const f=await fixture();expect((await probe(f.token,{action:"request",input:f.input},headers)).status).toBe(400);
  });
  it("requires a token and never accepts initialization or arbitrary actions",async()=>{
    const f=await fixture();expect((await probe(f.token,{action:"request",input:f.input},{Authorization:""})).status).toBe(401);
    for(const action of ["initialize","delete","constructor","__proto__"])expect((await probe(f.token,{action,input:f.input})).status).toBe(400);
    expect((await probe(f.token,{}, {},"GET")).status).toBe(404);expect((await probe(f.token,{}, {},"OPTIONS")).status).toBe(404);
  });
  it("bounds bodies and rejects malformed JSON without disclosing internal errors",async()=>{
    const f=await fixture();expect((await probe(f.token,"x".repeat(50000))).status).toBe(413);expect((await probe(f.token,"{")).status).toBe(400);
    const r=await probe("invalid-token",{action:"request",input:f.input});expect(r.status).toBe(409);const text=await r.text();expect(text).not.toContain(f.uid);expect(text).not.toContain("stack");expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("bounds chunked bodies even without a Content-Length header",async()=>{
    const f=await fixture();
    const status=await new Promise<number>((resolve,reject)=>{const req=httpRequest(origin+"/v1/recovery",{method:"POST",headers:{Origin:origin,Authorization:`Bearer ${f.token}`,"Content-Type":"application/json","X-MatriSync-Recovery":"1","Transfer-Encoding":"chunked"}},res=>{res.resume();resolve(res.statusCode!);});req.on("error",reject);req.write("x".repeat(30000));req.end("y".repeat(30000));});expect(status).toBe(400);
    await expect(f.client.reconcile(f.input.id)).rejects.toThrow();
  });
  it("binds identity to the real token rather than the request account",async()=>{
    const f=await fixture(),offer=await f.client.request(f.input),decision=await f.client.approve(await f.proofs(offer));await expect(f.client.request({...f.input,uid:"another-account"})).rejects.toThrow();
    const other=await fixture();await expect(new LoopbackRecoveryClient(async()=>other.token).reconcile(f.input.id)).rejects.toThrow();
    expect(await f.client.reconcile(f.input.id)).toEqual(decision);
  });
  it("uses current HTTP inspection with actual source export and encrypted destination storage",async()=>{
    const f=await fixture(),offer=await f.client.request(f.input);await f.client.approve(await f.proofs(offer));
    const draft={version:1 as const,caseId:f.caseId,sourceUid:f.uid,revision:crypto.randomUUID(),fields:{...emptyReferralFields(),remarks:"  original বাংলা  "},destination:"",capacity:"",updatedAt:new Date().toISOString()};
    await saveCareDraft(f.uid,draft,null);
    const pending:PendingCareHandoff={version:1,status:"pending",handoff:{version:1,id:crypto.randomUUID(),caseId:f.caseId,sourceUid:f.uid,recipientUid:"synthetic-destination",profile:{name:"Synthetic Mother",birthDate:"",sourceLocalId:"synthetic",sourceUid:f.uid},fields:draft.fields,packet:"original-recipient-packet",actorName:"Synthetic Doctor",recordedAt:draft.updatedAt},approvalRevision:draft.revision,capacity:32768,sourceFacility:f.facilityId,senderKeyId:f.source.keyId,recipientKeyId:f.target.keyId,entryEncrypted:"original-entry",grantWrapped:"original-grant"};
    await claimPendingCareHandoff(f.uid,pending);
    const choices=await reviewSourceSelection(f.uid,[`draft:${f.caseId}`,`pending:${f.caseId}`]);
    let snapshot:Authority|undefined;
    const refresh=async()=>{snapshot=undefined;snapshot=(await f.client.inspect(f.input.id)).authority;};await refresh();
    const reconciler={reconcile:async(uid:string,id:string)=>{expect(uid).toBe(f.uid);return f.client.reconcile(id);}};
    const binding={uid:f.uid,deviceKeyId:f.source.keyId,storeId:crypto.randomUUID()};await new BrowserExportDatabase(binding).initialize();
    const exporter=()=>new IsolatedRecoveryExport({store:new BrowserExportDatabase(binding),verifier:reconciler,authority:uid=>uid===f.uid?snapshot:undefined});
    const p=await exporter().prepare(f.uid,f.input.id,choices);expect(await exporter().prepare(f.uid,f.input.id,choices)).toEqual(p);
    const destination={...binding,deviceKeyId:f.target.keyId};await new BrowserImportDatabase(destination).initialize();
    const receiver=()=>new IsolatedRecoveryImport({uid:f.uid,target:f.target,store:new BrowserImportDatabase(destination),verifier:reconciler,authority:uid=>uid===f.uid?snapshot:undefined,clock:Date.now});
    await refresh();await receiver().begin(f.uid,p.manifestEnvelope);for(const object of p.objects)await receiver().stage(f.uid,f.input.id,object.envelope);
    await put(`careStaff/${f.uid}`,{enabled:false});await expect(refresh()).rejects.toThrow();await expect(receiver().finish(f.uid,f.input.id)).rejects.toThrow("authority");expect(await receiver().read(f.uid,choices[0].sourceId)).toBeUndefined();
    await put(`careStaff/${f.uid}`,{enabled:true,facilityId:f.facilityId,role:"doctor"});await refresh();const receipt=await receiver().finish(f.uid,f.input.id),ack=await receiver().acknowledge(f.uid,f.input.id);
    expect(await receiver().finish(f.uid,f.input.id)).toEqual(receipt);expect(await receiver().acknowledge(f.uid,f.input.id)).toBe(ack);expect(JSON.parse(new TextDecoder().decode((await receiver().read(f.uid,`draft:${f.caseId}`))!.bytes))).toEqual(draft);expect(await readCareDraft(f.uid,f.caseId)).toEqual(draft);
    const importedPending=await receiver().read(f.uid,`pending:${f.caseId}`);expect(importedPending?.quarantined).toBe(true);expect(JSON.parse(new TextDecoder().decode(importedPending!.bytes)).value).toEqual(pending);expect(await readPendingCareHandoff(f.uid,f.caseId)).toEqual(pending);
  });
});
