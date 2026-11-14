import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync} from "node:fs";
import {join,resolve,relative} from "node:path";
import {fork} from "node:child_process";
import {build} from "esbuild";
import {closureFixture,layout} from "./nfc-commit-closure-fixture";
import {NfcCommitJournal,type WriteLease} from "./nfc-commit-journal";
import {PendingTagCommit} from "./nfc-commit-model";
import {SyntheticNfcDriver,SyntheticTagPort} from "./nfc-commit-driver";
import {prepareTravel} from "../src/nfc/travel";
import {completionClaims,signProof} from "./nfc-commit-authority-protocol";
import {EncryptedRecoveryDatabase} from "./recovery-sqlite";
import type {DriverJob} from "./nfc-commit-driver-worker";

const root=resolve(".local-tools");let dir:string,worker:string;
type Fixture=Awaited<ReturnType<typeof closureFixture>>;
const target={transportId:"synthetic-gateway",tagId:"synthetic-tag"};
beforeAll(async()=>{mkdirSync(root,{recursive:true});dir=mkdtempSync(join(root,"nfc-driver-"));worker=join(dir,"worker.mjs");await build({entryPoints:["tests-care/nfc-commit-driver-worker.ts"],outfile:worker,bundle:true,platform:"node",format:"esm",target:"node24",logLevel:"silent"});});
afterAll(()=>{if(dir&&relative(root,dir).startsWith("nfc-driver-")&&!relative(root,dir).includes(".."))rmSync(dir,{recursive:true,force:true});});
async function fixture(){
  const f=await closureFixture(dir),path=join(dir,crypto.randomUUID()+"-driver.sqlite");
  const reopen=(options:ConstructorParameters<typeof NfcCommitJournal>[3]={})=>new NfcCommitJournal(path,f.key,f.id,options),journal=reopen();journal.initialize();await journal.save(f.scope,"b",f.b,null);
  const binding={storeId:f.id,scope:f.scope,...target},port=new SyntheticTagPort(binding,f.b.baseline()),driver=new SyntheticNfcDriver(journal,port);
  const acquire=(fence=0)=>journal.acquireWriteLease(f.scope,"b",f.bKey,target,fence);
  const close=()=>journal.closeLogger({grantToken:f.grantToken,trust:f.trust,logger:f.logger,operationId:"b",sectionKey:f.bKey,image:port.read()});
  return{...f,path,journal,reopen,binding,port,driver,acquire,close};
}
function job(f:Fixture,action:DriverJob["action"]):DriverJob{return{action,path:f.authorityPath,key:[...f.key],storeId:f.id,sectionKey:[...f.bRaw],trust:f.trust,grantToken:f.grantToken,completion:f.completion,authorityJwk:f.authorityJwk,loggerId:f.logger.keyId,receiverId:f.receiver.keyId,challenge:"a".repeat(64),operationId:"b",...target,expectedFence:0};}
type Response={ok:boolean;result?:unknown;error?:string};
function child(job:DriverJob,ready:()=>Promise<void>=async()=>{}){
  return new Promise<{code:number|null;response?:Response}>((done,reject)=>{
    const proc=fork(worker,[],{stdio:["ignore","ignore","pipe","ipc"]});let response:Response|undefined;
    const timer=setTimeout(()=>{proc.kill();reject(Error("Driver worker timeout"));},15000);
    proc.on("message",(m:Response&{ready?:boolean})=>{if(m.ready)void ready().then(()=>proc.connected&&proc.send(job));else response=m;});
    proc.on("error",e=>{clearTimeout(timer);reject(e);});proc.on("exit",code=>{clearTimeout(timer);done({code,response});});
  });
}
function simultaneous(jobs:DriverJob[]){let count=0,release=()=>{};const gate=new Promise<void>(r=>{release=r;});return Promise.all(jobs.map(j=>child(j,()=>{if(++count===jobs.length)release();return gate;})));}

describe("guarded synthetic NFC writer leases",()=>{
  it("requires an explicit live lease and closes without permitting a stale restored handle to write",async()=>{
    const f=await fixture(),lease=await f.acquire(),old=(await f.journal.restore(f.scope,"b",f.bKey)).pending;
    expect((await f.driver.run(lease,f.bKey)).status).toBe("confirmed-in-model");expect(f.port.read()).toEqual(f.b.finalImage());
    expect(f.port.writes.map(s=>s.bytes)).toEqual(old.steps().map(s=>s.bytes));
    const token=await f.close(),count=f.port.writes.length;expect(token).toBeTypeOf("string");
    await expect(f.driver.run(lease,f.bKey)).rejects.toThrow(/inactive|closed/);await expect(f.acquire(lease.fence)).rejects.toThrow(/pending/);
    expect(f.port.writes).toHaveLength(count);expect((await f.journal.restore(f.scope,"b",f.bKey)).closure?.token).toBe(token);
  });
  it("explicit takeover invalidates the older lease before any command can run",async()=>{
    const f=await fixture(),first=await f.acquire(),second=await f.acquire(first.fence);
    await expect(f.driver.run(first,f.bKey)).rejects.toThrow(/Stale/);expect(f.port.writes).toHaveLength(0);
    await expect(f.journal.releaseWriteLease(first)).rejects.toThrow(/Stale/);await expect(f.acquire(first.fence)).rejects.toThrow(/Stale/);
    await f.driver.run(second,f.bKey);expect((await f.journal.restore(f.scope,"b",f.bKey)).lease?.active).toBe(false);
  });
  it("release blocks old handles and retains the monotonic fence across restart",async()=>{
    const f=await fixture(),first=await f.acquire();await f.journal.releaseWriteLease(first);await f.journal.releaseWriteLease(first);
    await expect(f.driver.run(first,f.bKey)).rejects.toThrow(/inactive/);
    const before=readFileSync(f.path),state=await f.reopen().restore(f.scope,"b",f.bKey);expect(state.lease).toMatchObject({fence:1,active:false});expect(readFileSync(f.path)).toEqual(before);expect(f.port.writes).toHaveLength(0);
    const second=await f.reopen().acquireWriteLease(f.scope,"b",f.bKey,target,1);expect(second.fence).toBe(2);expect(second.token).not.toBe(first.token);
  });
  it("does not let direct completion bypass an active writer or close pending work",async()=>{
    const f=await fixture(),lease=await f.acquire();await expect(f.journal.complete(f.scope,"b",f.b.finalImage(),f.bKey)).rejects.toThrow(/guarded/);await expect(f.close()).rejects.toThrow(/Active writer/);
    await f.journal.releaseWriteLease(lease);await expect(f.close()).rejects.toThrow(/completed/);expect(f.port.writes).toHaveLength(0);
  });
  it("holds ownership through delayed command application, readback and completion before closure",async()=>{
    const f=await fixture(),lease=await f.acquire();let entered=()=>{},release=()=>{};
    const atStep=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{release=r;});
    const running=f.driver.run(lease,f.bKey,{beforeStep:async index=>{if(index===1){entered();await gate;}}});await atStep;
    let closed=false;const closing=f.close().then(token=>{closed=true;return token;});
    await expect(f.reopen({lockWaitMs:0}).releaseWriteLease(lease)).rejects.toThrow(/busy/);expect(closed).toBe(false);
    const closureResult=expect(closing).rejects.toThrow(/exact readback/);
    release();await running;await closureResult;expect(closed).toBe(false);
    // The queued request captured an interrupted image, not fresh final readback.
    await f.close();const writes=f.port.writes.length;
    await expect(f.driver.run(lease,f.bKey)).rejects.toThrow();expect(f.port.writes).toHaveLength(writes);
  });
  it("refuses two simultaneous runs of the same lease after the first completes",async()=>{
    const f=await fixture(),lease=await f.acquire(),other=new SyntheticNfcDriver(f.reopen(),f.port);
    const results=await Promise.allSettled([f.driver.run(lease,f.bKey),other.run(lease,f.bKey)]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(f.port.writes).toHaveLength(f.b.steps().length);
  });
  it("recovers every B write-step prefix tear by explicit retry of the same ciphertext",async()=>{
    const f=await fixture();let cases=0;
    for(let step=0;step<f.b.steps().length;step++)for(let cut=0;cut<=16;cut++){
      const path=join(dir,crypto.randomUUID()+".sqlite"),journal=new NfcCommitJournal(path,f.key,f.id);journal.initialize();await journal.save(f.scope,"b",f.b,null);
      const port=new SyntheticTagPort(f.binding,f.b.baseline()),driver=new SyntheticNfcDriver(journal,port),lease=await journal.acquireWriteLease(f.scope,"b",f.bKey,target,0);
      await expect(driver.run(lease,f.bKey,{fault:{step,cut}})).rejects.toThrow(/interrupted/);
      const retained=await journal.restore(f.scope,"b",f.bKey);expect(retained.completion).toBeNull();expect(retained.pending.snapshot()).toEqual(f.b.snapshot());
      await driver.run(lease,f.bKey);expect(port.read()).toEqual(f.b.finalImage());cases++;
    }
    expect(cases).toBe(f.b.steps().length*17);console.info("Synthetic leased B tear/retry cases:",cases);
  },60000);
  it("reconciles a lost final acknowledgement without writing again",async()=>{
    const f=await fixture(),lease=await f.acquire();await expect(f.driver.run(lease,f.bKey,{fault:{step:f.b.steps().length-1,lostAck:true}})).rejects.toThrow(/acknowledgement/);
    expect((await f.journal.restore(f.scope,"b",f.bKey)).completion).toBeNull();const count=f.port.writes.length;
    await f.driver.run(lease,f.bKey);expect(f.port.writes).toHaveLength(count);expect((await f.journal.restore(f.scope,"b",f.bKey)).lease?.active).toBe(false);
  });
  it.each(["after-write","after-commit"] as const)("reconciles external effects after journal failure %s",async point=>{
    const f=await fixture(),lease=await f.acquire(),journal=f.reopen({fault:p=>{if(p===point)throw Error("lost durable completion response");}});
    await expect(new SyntheticNfcDriver(journal,f.port).run(lease,f.bKey)).rejects.toThrow(/lost/);const count=f.port.writes.length,state=await f.reopen().restore(f.scope,"b",f.bKey);
    expect(Boolean(state.completion)).toBe(point==="after-commit");
    if(point==="after-write")await f.driver.run(lease,f.bKey);else await expect(f.driver.run(lease,f.bKey)).rejects.toThrow(/inactive/);
    expect(f.port.writes).toHaveLength(count);
  });
  it("stops on bad readback and never writes an unknown damaged or different target",async()=>{
    const f=await fixture(),lease=await f.acquire();await expect(f.driver.run(lease,f.bKey,{fault:{step:1,badReadback:true}})).rejects.toThrow(/read-back/);expect(f.port.writes).toHaveLength(2);
    const damaged=f.b.baseline();damaged.get(layout.a[0])![0]^=1;const port=new SyntheticTagPort(f.binding,damaged);
    await expect(new SyntheticNfcDriver(f.journal,port).run(lease,f.bKey)).rejects.toThrow(/recognized/);expect(port.writes).toHaveLength(0);
    const wrong=new SyntheticTagPort({...f.binding,tagId:"different-tag"},f.b.baseline());await expect(new SyntheticNfcDriver(f.journal,wrong).run(lease,f.bKey)).rejects.toThrow(/binding/);expect(wrong.writes).toHaveLength(0);
  });
  it("isolates account, journal, operation and immutable tag bindings",async()=>{
    const f=await fixture();
    // Runtime extra fields cannot overwrite internally assigned scope/fence/ID.
    const binding={...target,scope:{...f.scope,uid:"foreign"},fence:999,id:"foreign",token:"attacker-selected"};
    const lease=await f.journal.acquireWriteLease(f.scope,"b",f.bKey,binding,0);expect(lease).toMatchObject({scope:f.scope,id:"b",fence:1});expect(lease.token).not.toBe(binding.token);
    for(const bad of [{...lease,scope:{...lease.scope,uid:"foreign"}},{...lease,id:"foreign"},{...lease,storeId:crypto.randomUUID()},{...lease,token:crypto.randomUUID()},{...lease,tagId:"other"}])await expect(f.driver.run(bad,f.bKey)).rejects.toThrow(/Stale/);
    await expect(f.journal.acquireWriteLease(f.scope,"b",f.bKey,{...target,tagId:"other"},1)).rejects.toThrow(/binding/);expect(f.port.writes).toHaveLength(0);
    await expect(f.driver.run(lease,f.aKey)).rejects.toThrow();expect(f.port.writes).toHaveLength(0);
  });
  it("preserves fence across generation advance and rejects v2 without resetting",async()=>{
    const f=await fixture(),lease=await f.acquire();await f.driver.run(lease,f.bKey);
    const context={...f.b.expected().context,sequence:2},b2=await PendingTagCommit.prepare({layout,before:f.b.finalImage(),key:f.bKey,context,original:f.a.expected(),previous:f.b.expected(),packet:await prepareTravel({tripStartedAt:f.now,events:[]},f.bKey,context,layout.bBytes)});
    const prior=(await f.journal.restore(f.scope,"b",f.bKey)).completion;
    await f.journal.save(f.scope,"b2",b2,"b");const next=await f.journal.acquireWriteLease(f.scope,"b2",f.bKey,target,1);expect(next.fence).toBe(2);
    expect(await f.journal.complete(f.scope,"b",f.b.finalImage(),f.bKey)).toEqual(prior);
    await expect(f.driver.run(lease,f.bKey)).rejects.toThrow(/Stale/);await f.driver.run(next,f.bKey);expect(f.port.read()).toEqual(b2.finalImage());
    const path=join(dir,"v2.sqlite"),old=new EncryptedRecoveryDatabase(path,f.key,f.id,{version:2,purpose:"matrisync-isolated-nfc-journal-v2",limit:8*1024*1024,decode:()=>new Map()});old.initialize();const bytes=readFileSync(path);
    await expect(new NfcCommitJournal(path,f.key,f.id).restore(f.scope,"b",f.bKey)).rejects.toThrow(/version/);expect(readFileSync(path)).toEqual(bytes);
  });
  it("initializes A through the same guard and preserves its exact encrypted packet",async()=>{
    const f=await fixture(),path=join(dir,crypto.randomUUID()+"-a.sqlite"),journal=new NfcCommitJournal(path,f.key,f.id);journal.initialize();await journal.save(f.scope,"a",f.a,null);
    const port=new SyntheticTagPort(f.binding,f.a.baseline()),driver=new SyntheticNfcDriver(journal,port),lease=await journal.acquireWriteLease(f.scope,"a",f.aKey,target,0);
    await driver.run(lease,f.aKey);expect(port.read()).toEqual(f.a.finalImage());expect((await journal.restore(f.scope,"a",f.aKey)).pending.snapshot()).toEqual(f.a.snapshot());
    await journal.save(f.scope,"b",f.b,"a");const bLease=await journal.acquireWriteLease(f.scope,"b",f.bKey,target,1);await driver.run(bLease,f.bKey);expect(port.read()).toEqual(f.b.finalImage());
  });
  it("retained synthetic gateway fence rejects a rolled-back journal handle",async()=>{
    const f=await fixture(),first=await f.acquire(),old=readFileSync(f.path),second=await f.acquire(1);
    await expect(f.driver.run(second,f.bKey,{fault:{step:0,cut:0}})).rejects.toThrow(/interrupted/);const writes=f.port.writes.length;
    writeFileSync(f.path,old);expect((await f.journal.restore(f.scope,"b",f.bKey)).lease?.fence).toBe(1);
    await expect(f.driver.run(first,f.bKey)).rejects.toThrow(/gateway.*stale fence/);expect(f.port.writes).toHaveLength(writes);
    // This defense depends on retaining the gateway's separate state. The
    // in-memory port is not a persistent or rollback-resistant physical device.
  });
  it.each(["before","after-write","after-commit"] as const)("retains exactly the committed lease across process exit %s",async crash=>{
    const f=await fixture(),j={...job(f,"acquire"),path:f.path,crash};expect((await child(j)).code).toBe(73);
    const state=await f.journal.restore(f.scope,"b",f.bKey);expect(Boolean(state.lease)).toBe(crash==="after-commit");expect(f.port.writes).toHaveLength(0);
    if(state.lease){expect((await child({...j,action:"lease-state",crash:undefined})).response).toEqual({ok:true,result:state.lease});await expect(f.acquire()).rejects.toThrow(/Stale/);await f.acquire(state.lease.fence);}
    else expect((await f.acquire()).fence).toBe(1);
  });
  it("serializes competing processes acquiring the same expected fence",async()=>{
    const f=await fixture(),j={...job(f,"acquire"),path:f.path},results=await simultaneous([j,j]);expect(results.filter(r=>r.response?.ok)).toHaveLength(1);
    const winner=results.find(r=>r.response?.ok)?.response?.result as WriteLease;expect(winner.fence).toBe(1);await f.driver.run(winner,f.bKey);
  });
});

describe("authority ledger abrupt process recovery",()=>{
  it.each(["before","after-write","after-commit"] as const)("retains terminal selection across exit %s",async crash=>{
    const f=await closureFixture(dir,true),j=job(f,"finalize");expect((await child({...j,crash})).code).toBe(73);
    if(crash==="after-commit")expect(await f.fresh(f.challenge())).toBeTypeOf("string");else await expect(f.fresh(f.challenge())).rejects.toThrow(/terminal/);
    expect((await child(j)).response).toEqual({ok:true,result:f.completion});expect(await f.finalize()).toBe(f.completion);
  });
  it.each(["before","after-write","after-commit"] as const)("retains exact freshness without extending time across exit %s",async crash=>{
    const f=await closureFixture(dir,true);await f.finalize();const j=job(f,"freshness");expect((await child({...j,crash})).code).toBe(73);
    const retained=await f.authorityLedger().transaction(async rows=>[...rows].find(([k])=>k.includes("freshness"))?.[1]);expect(Boolean(retained)).toBe(crash==="after-commit");
    const retry=await child({...j,trust:{...j.trust,now:j.trust.now+1000}});expect(retry.response?.ok).toBe(true);if(retained)expect(retry.response?.result).toBe(retained);
    const spy=vi.spyOn(crypto.subtle,"sign");try{f.state.now+=2000;expect(await f.issuer().freshness(f.receiver.keyId,f.grantToken,f.completion,j.challenge)).toBe(retry.response?.result);expect(spy).not.toHaveBeenCalled();}finally{spy.mockRestore();}
    expect((await child({...j,trust:{...j.trust,now:j.trust.now+61000}})).response?.error).toMatch(/stale/);
  });
  it("lets only one process select a terminal and converges concurrent freshness retries",async()=>{
    const f=await closureFixture(dir,true),other=await signProof("completion",completionClaims({...f.commitment!,packetDigest:"1".repeat(64)}),f.logger),j=job(f,"finalize"),results=await simultaneous([j,{...j,completion:other}]);
    expect(results.filter(r=>r.response?.ok)).toHaveLength(1);const completion=results.find(r=>r.response?.ok)?.response?.result as string;
    const proofs=await simultaneous([{...j,action:"freshness",completion},{...j,action:"freshness",completion}]);expect(proofs[0].response?.ok).toBe(true);expect(proofs[1].response).toEqual(proofs[0].response);
  });
});
