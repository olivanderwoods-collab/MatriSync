import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {build} from "esbuild";
import {fork} from "node:child_process";
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from "node:fs";
import {join,resolve,relative} from "node:path";
import {randomBytes} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {CompactSign,compactDecrypt} from "jose";
import {newSharingDevice,type SharingDevice} from "../src/sharing-crypto";
import {IsolatedRecoveryVerifier,RECOVERY_DOMAIN,approvalClaims,closureClaims,bytes,possessionClaims,type Approval,type ClosureStatus,type RecoveryOffer} from "./recovery-verifier";
import {SqliteRecoveryStore,type StoragePoint} from "./recovery-sqlite";
import type {WorkerInput} from "./recovery-worker";

const root=resolve(".local-tools"),publicOnly=(d:SharingDevice)=>({encryption:d.encryption,signing:d.signing,keyId:d.keyId});
let dir:string,worker:string;
beforeAll(async()=>{
  mkdirSync(root,{recursive:true});dir=mkdtempSync(join(root,"recovery-durability-"));worker=join(dir,"worker.mjs");
  await build({entryPoints:["tests-care/recovery-worker.ts"],outfile:worker,bundle:true,platform:"node",format:"esm",target:"node24",logLevel:"silent"});
});
afterAll(()=>{
  if(dir && relative(root,dir).startsWith("recovery-durability-") && !relative(root,dir).includes(".."))rmSync(dir,{recursive:true,force:true});
});
async function fixture(){
  const path=join(dir,`${crypto.randomUUID()}.sqlite`),key=randomBytes(32),storeId=crypto.randomUUID();
  const store=new SqliteRecoveryStore(path,key,storeId);store.initialize();
  const original=await newSharingDevice(),target=await newSharingDevice(),uid=`synthetic-${crypto.randomUUID()}`,caseId=crypto.randomUUID();
  const state={now:1794268800000,authority:{enabled:true,device:publicOnly(original),cases:[caseId]}};
  const reopen=(fault?:(point:StoragePoint)=>void)=>new IsolatedRecoveryVerifier({store:new SqliteRecoveryStore(path,key,storeId,{fault}),clock:()=>state.now,authority:id=>id===uid?state.authority:undefined});
  const verifier=reopen(),request={version:1 as const,id:crypto.randomUUID(),uid,oldKeyId:original.keyId,newDevice:publicOnly(target)};
  const offer=await verifier.request(uid,request);
  let nonce="";
  const makeApproval=async(current:RecoveryOffer)=>{
    const opened=await compactDecrypt(current.challengeEnvelope,target.decryptKey);
    nonce=JSON.parse(new TextDecoder().decode(opened.plaintext))[4] as string;
    const sign=(d:SharingDevice,purpose:string,value:unknown)=>new CompactSign(bytes(value)).setProtectedHeader({alg:"ES256",typ:`${RECOVERY_DOMAIN}:${purpose}`,kid:d.keyId}).sign(d.signKey);
    const possession=await sign(target,"possession",possessionClaims(current,nonce));
    return {id:current.request.id,cases:[caseId],possession,approval:await sign(original,"approval",await approvalClaims(current,[caseId],possession))} satisfies Approval;
  };
  const approval=await makeApproval(offer);
  const makeClosure=async(status:ClosureStatus="cancelled")=>({id:request.id,status,proof:await new CompactSign(bytes(closureClaims(offer,status))).setProtectedHeader({alg:"ES256",typ:`${RECOVERY_DOMAIN}:${status}`,kid:original.keyId}).sign(original.signKey)});
  const closure=await makeClosure();
  const job=(action:WorkerInput["action"],crash?:StoragePoint):WorkerInput=>({path,keyHex:key.toString("hex"),storeId,uid,now:state.now,authority:state.authority,action,approval,closure,request,crash});
  return {path,key,storeId,store,uid,state,reopen,verifier,request,offer,nonce,approval,job,makeApproval,makeClosure,closure};
}
function child(job:WorkerInput,ready:()=>Promise<void>=async()=>{}){
  return new Promise<{code:number|null;response?:{ok:boolean;result?:unknown;error?:string}}>((resolveResult,reject)=>{
    const proc=fork(worker,[],{stdio:["ignore","ignore","pipe","ipc"]});
    let response:{ok:boolean;result?:unknown;error?:string}|undefined;
    const timeout=setTimeout(()=>{proc.kill();reject(Error("Isolated recovery worker timeout."));},15000);
    proc.on("message",(message:{ready?:boolean;ok:boolean;result?:unknown;error?:string})=>{if(message.ready)void ready().then(()=>{if(proc.connected)proc.send(job);});else response=message;});
    proc.on("error",error=>{clearTimeout(timeout);reject(error);});
    proc.on("exit",code=>{clearTimeout(timeout);resolveResult({code,response});});
  });
}
function simultaneous(jobs:WorkerInput[]){
  let waiting=0,release:()=>void=()=>{};
  const barrier=new Promise<void>(resolve=>{release=resolve;});
  return Promise.all(jobs.map(job=>child(job,()=>{if(++waiting===jobs.length)release();return barrier;})));
}

describe("isolated encrypted durable recovery",()=>{
  it("reopens the exact challenge and completed receipt in another process",async()=>{
    const f=await fixture();
    expect((await child(f.job("request"))).response).toEqual({ok:true,result:f.offer});
    const decision=await f.reopen().approve(f.uid,f.approval);
    expect((await child(f.job("reconcile"))).response).toEqual({ok:true,result:decision});
    f.state.now+=900000;f.state.authority.enabled=false;
    expect((await child(f.job("approve"))).response).toEqual({ok:true,result:decision});
    expect(await f.reopen().counts()).toEqual({requests:1,decisions:1});
  });
  it("rolls back a thrown error after the SQL write and accepts the original retry",async()=>{
    const f=await fixture();
    await expect(f.reopen(point=>{if(point==="after-write")throw Error("Injected write failure");}).approve(f.uid,f.approval)).rejects.toThrow("write failure");
    expect(await f.reopen().reconcile(f.uid,f.request.id)).toBeUndefined();
    expect(await f.reopen().request(f.uid,f.request)).toEqual(f.offer);
    expect((await f.reopen().approve(f.uid,f.approval)).id).toBe(f.request.id);
  });
  it.each(["after-write","after-commit"] as const)("recovers an abrupt process exit %s without a partial epoch",async point=>{
    const f=await fixture();
    expect((await child(f.job("approve",point))).code).toBe(73);
    const prior=await f.reopen().reconcile(f.uid,f.request.id);
    expect(Boolean(prior)).toBe(point==="after-commit");
    const decision=await f.reopen().approve(f.uid,f.approval);
    if(prior)expect(decision).toEqual(prior);
    expect(await f.reopen().counts()).toEqual({requests:1,decisions:1});
  });
  it("serializes eight independent processes to the same immutable decision",async()=>{
    const f=await fixture(),results=await simultaneous(Array.from({length:8},()=>f.job("approve")));
    expect(results.map(r=>({code:r.code,ok:r.response?.ok,error:r.response?.error}))).toEqual(Array.from({length:8},()=>({code:0,ok:true,error:undefined})));
    for(const result of results)expect(result.response).toEqual(results[0].response);
    expect(await f.reopen().counts()).toEqual({requests:1,decisions:1});
  });
  it("serializes independent connections without blocking the event loop",async()=>{
    const f=await fixture();
    const results=await Promise.all(Array.from({length:4},()=>f.reopen().approve(f.uid,f.approval)));
    expect(results.every(r=>JSON.stringify(r)===JSON.stringify(results[0]))).toBe(true);
  });
  it("prevents two different processes from issuing separate epochs for one target",async()=>{
    const f=await fixture(),request={...f.request,id:crypto.randomUUID()};
    const offer=await f.verifier.request(f.uid,request),approval=await f.makeApproval(offer);
    const results=await simultaneous([f.job("approve"),{...f.job("approve"),request,approval}]);
    expect(results.filter(r=>r.response?.ok)).toHaveLength(1);
    expect(results.find(r=>!r.response?.ok)?.response?.error).toContain("already approved");
    expect(await f.reopen().counts()).toEqual({requests:2,decisions:1});
  });
  it("issues one exact challenge to competing request processes",async()=>{
    const f=await fixture(),request={...f.request,id:crypto.randomUUID()};
    const results=await simultaneous(Array.from({length:4},()=>({...f.job("request"),request})));
    expect(results.every(r=>r.response?.ok)).toBe(true);
    for(const result of results)expect(result.response).toEqual(results[0].response);
    expect(await f.reopen().counts()).toEqual({requests:2,decisions:0});
  });
  it.each(["after-write","after-commit"] as const)("recovers challenge creation interrupted %s",async crash=>{
    const f=await fixture(),request={...f.request,id:crypto.randomUUID()};
    expect((await child({...f.job("request",crash),request})).code).toBe(73);
    expect((await f.reopen().counts()).requests).toBe(crash==="after-write"?1:2);
    const offer=await f.reopen().request(f.uid,request);
    expect(await f.reopen().request(f.uid,request)).toEqual(offer);
    expect((await f.reopen().approve(f.uid,await f.makeApproval(offer))).requestDigest).toBe(offer.digest);
  });
  it.each(["membership","scope","expiry"])("rolls back when %s changes after the disk write but before commit",async change=>{
    const f=await fixture();
    const verifier=f.reopen(point=>{if(point!=="after-write")return;if(change==="membership")f.state.authority.enabled=false;if(change==="scope")f.state.authority.cases=[];if(change==="expiry")f.state.now+=600000;});
    await expect(verifier.approve(f.uid,f.approval)).rejects.toThrow();
    expect(await f.reopen().reconcile(f.uid,f.request.id)).toBeUndefined();
    expect(await f.reopen().counts()).toEqual({requests:1,decisions:0});
  });
  it("fails a bounded busy attempt, then safely retries the same operation",async()=>{
    const f=await fixture(),db=new DatabaseSync(f.path);db.exec("BEGIN IMMEDIATE");
    const blocked=new SqliteRecoveryStore(f.path,f.key,f.storeId,{lockWaitMs:20});
    try{await expect(blocked.transaction(async()=>undefined)).rejects.toThrow("busy");}finally{db.exec("ROLLBACK");db.close();}
    expect((await f.reopen().approve(f.uid,f.approval)).id).toBe(f.request.id);
  });
  it("does not persist plaintext identities, nonces or approval proofs",async()=>{
    const f=await fixture();await f.verifier.approve(f.uid,f.approval);
    const data=readFileSync(f.path);
    for(const value of [f.uid,f.nonce,f.approval.possession,f.approval.approval,f.key.toString("hex")])expect(data.includes(Buffer.from(value))).toBe(false);
  });
  it("keeps the rollback journal encrypted during an interrupted write",async()=>{
    const f=await fixture();let inspected=false;
    await expect(f.reopen(point=>{
      if(point!=="after-write")return;
      const journal=readFileSync(`${f.path}-journal`);inspected=true;
      for(const value of [f.uid,f.nonce,f.approval.possession,f.approval.approval])expect(journal.includes(Buffer.from(value))).toBe(false);
      throw Error("Interrupted after journal inspection");
    }).approve(f.uid,f.approval)).rejects.toThrow("journal inspection");
    expect(inspected).toBe(true);expect(await f.reopen().reconcile(f.uid,f.request.id)).toBeUndefined();
  });
  it("rolls back an oversized aggregate without damaging the original challenge",async()=>{
    const f=await fixture();
    await expect(f.store.transaction(async records=>{records.get(f.request.id)!.input="x".repeat(8*1024*1024);})).rejects.toThrow("capacity");
    expect(await f.reopen().request(f.uid,f.request)).toEqual(f.offer);
  });
  it("rejects a wrong encryption key or store binding without rewriting data",async()=>{
    const f=await fixture(),before=readFileSync(f.path);
    for(const store of [new SqliteRecoveryStore(f.path,randomBytes(32),f.storeId),new SqliteRecoveryStore(f.path,f.key,crypto.randomUUID())])await expect(store.transaction(async()=>undefined)).rejects.toThrow();
    expect(readFileSync(f.path)).toEqual(before);
    expect(await f.reopen().request(f.uid,f.request)).toEqual(f.offer);
  });
  it("fails closed on corruption, missing state and unsupported versions",async()=>{
    for(const mutation of ["corrupt","missing","version","legacy-version"]){
      const f=await fixture(),db=new DatabaseSync(f.path);
      if(mutation==="corrupt")db.prepare("UPDATE recovery SET envelope=?").run(randomBytes(100));
      if(mutation==="missing")db.exec("DELETE FROM recovery");
      if(mutation==="version")db.exec("PRAGMA user_version=99");
      if(mutation==="legacy-version")db.exec("PRAGMA user_version=1");
      db.close();const before=readFileSync(f.path);
      await expect(f.reopen().request(f.uid,f.request)).rejects.toThrow();
      expect(readFileSync(f.path)).toEqual(before);
    }
  });
  it("never overwrites an existing store or silently recreates a missing one",async()=>{
    const f=await fixture(),before=readFileSync(f.path);
    expect(()=>f.store.initialize()).toThrow();expect(readFileSync(f.path)).toEqual(before);
    const missing=new SqliteRecoveryStore(join(dir,"absent.sqlite"),f.key,f.storeId);
    await expect(missing.transaction(async()=>undefined)).rejects.toThrow("refusing to reset");
  });
  it("preserves account isolation and immutable proof binding after restart",async()=>{
    const f=await fixture(),decision=await f.verifier.approve(f.uid,f.approval);
    await expect(f.reopen().reconcile("foreign",f.request.id)).rejects.toThrow("account");
    await expect(f.reopen().approve(f.uid,{...f.approval,approval:"changed"})).rejects.toThrow("conflicts");
    expect(await f.reopen().reconcile(f.uid,f.request.id)).toEqual(decision);
  });
  it("rechecks revoked authority after restart before committing",async()=>{
    const f=await fixture();f.state.authority.enabled=false;
    expect((await child(f.job("approve"))).response?.ok).toBe(false);
    expect(await f.reopen().counts()).toEqual({requests:1,decisions:0});
  });
});



describe("durable recovery cancellation and rejection",()=>{
  it.each(["cancelled","rejected"] as const)("preserves exact %s receipts across restart, expiry and revocation",async status=>{
    const f=await fixture(),closure=await f.makeClosure(status),receipt=await f.reopen().close(f.uid,closure);
    expect((await child(f.job("reconcile"))).response).toEqual({ok:true,result:receipt});
    f.state.now+=900000;f.state.authority.enabled=false;
    expect((await child({...f.job("close"),closure})).response).toEqual({ok:true,result:receipt});
    expect((await child(f.job("approve"))).response?.ok).toBe(false);
    expect(await f.reopen().counts()).toEqual({requests:1,decisions:0});
  });
  it.each(["cancelled","rejected"] as const)("rolls back an interrupted %s write, leaving the original operation approvable",async status=>{
    const f=await fixture(),closure=await f.makeClosure(status);
    await expect(f.reopen(point=>{if(point==="after-write")throw Error("Interrupted closure");}).close(f.uid,closure)).rejects.toThrow("Interrupted closure");
    expect(await f.reopen().reconcile(f.uid,f.request.id)).toBeUndefined();
    expect((await f.reopen().approve(f.uid,f.approval)).status).toBe("approved");
  });
  it.each([
    ["cancelled","after-write"],["cancelled","after-commit"],["rejected","after-write"],["rejected","after-commit"],
  ] as const)("reconciles process termination for %s %s",async(status,point)=>{
    const f=await fixture(),closure=await f.makeClosure(status);
    expect((await child({...f.job("close",point),closure})).code).toBe(73);
    const prior=await f.reopen().reconcile(f.uid,f.request.id);
    expect(Boolean(prior)).toBe(point==="after-commit");
    const receipt=await f.reopen().close(f.uid,closure);
    if(prior)expect(receipt).toEqual(prior);
    expect(receipt.status).toBe(status);
    await expect(f.reopen().approve(f.uid,f.approval)).rejects.toThrow(status);
  });
  it("returns one closure receipt to eight coordinated processes",async()=>{
    const f=await fixture(),results=await simultaneous(Array.from({length:8},()=>f.job("close")));
    expect(results.every(r=>r.code===0&&r.response?.ok)).toBe(true);
    for(const result of results)expect(result.response).toEqual(results[0].response);
    expect((await f.reopen().reconcile(f.uid,f.request.id))?.status).toBe("cancelled");
  });
  it.each(["cancelled","rejected"] as const)("allows exactly one committed outcome in an approval/%s process race",async status=>{
    const f=await fixture(),closure=await f.makeClosure(status);
    const results=await simultaneous([f.job("approve"),{...f.job("close"),closure}]);
    expect(results.filter(r=>r.response?.ok)).toHaveLength(1);
    const receipt=await f.reopen().reconcile(f.uid,f.request.id);
    expect(receipt).toEqual(results.find(r=>r.response?.ok)?.response?.result);
    expect(["approved",status]).toContain(receipt?.status);
    expect((await f.reopen().counts()).decisions).toBe(receipt?.status==="approved"?1:0);
    const retry=receipt?.status==="approved"?await f.reopen().approve(f.uid,f.approval):await f.reopen().close(f.uid,closure);
    expect(retry).toEqual(receipt);
  });
  it("allows only one terminal result in a cancellation/rejection process race",async()=>{
    const f=await fixture(),closure=await f.makeClosure("rejected");
    const results=await simultaneous([f.job("close"),{...f.job("close"),closure}]);
    expect(results.filter(r=>r.response?.ok)).toHaveLength(1);
    expect(await f.reopen().reconcile(f.uid,f.request.id)).toEqual(results.find(r=>r.response?.ok)?.response?.result);
    expect((await f.reopen().counts()).decisions).toBe(0);
  });
  it.each(["membership","identity","expiry"])("rolls back closure if %s changes after writing but before commit",async change=>{
    const f=await fixture();
    const verifier=f.reopen(point=>{if(point!=="after-write")return;if(change==="membership")f.state.authority.enabled=false;if(change==="identity")f.state.authority.device=f.request.newDevice;if(change==="expiry")f.state.now+=600000;});
    await expect(verifier.close(f.uid,f.closure)).rejects.toThrow();
    expect(await f.reopen().reconcile(f.uid,f.request.id)).toBeUndefined();
  });
  it("uses a new store version that old readers reject instead of ignoring closure state",async()=>{
    const f=await fixture();await f.verifier.close(f.uid,f.closure);
    const db=new DatabaseSync(f.path);
    try{expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(2);}finally{db.close();}
    const data=readFileSync(f.path);
    expect(data.includes(Buffer.from(f.closure.proof))).toBe(false);
    expect(data.includes(Buffer.from(f.uid))).toBe(false);
  });
});
