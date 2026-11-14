import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync,existsSync} from "node:fs";
import {join,resolve,relative} from "node:path";
import {fork} from "node:child_process";
import {randomBytes} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {build} from "esbuild";
import {closureFixture,layout} from "./nfc-commit-closure-fixture";
import {NfcCommitJournal} from "./nfc-commit-journal";
import {PendingTagCommit,type TagImage} from "./nfc-commit-model";
import {ReceiverChallenge} from "./nfc-commit-authority-model";
import {ReceiverEvidenceStore,type ReceiptOwner} from "./nfc-commit-receiver";
import {prepareTravel} from "../src/nfc/travel";
import {grantClaims,signProof,sealKeyEnvelope} from "./nfc-commit-authority-protocol";
import {EncryptedRecoveryDatabase} from "./recovery-sqlite";
import type {ClosureJob} from "./nfc-commit-closure-worker";

const root=resolve(".local-tools");let dir:string,worker:string;
type Fixture=Awaited<ReturnType<typeof closureFixture>>;
const wire=(image:TagImage):[number,number[]][]=>[...image].map(([n,b])=>[n,[...b]]);
const owner=(f:Fixture):ReceiptOwner=>({trust:{authority:f.trust.authority,scope:f.scope,grantId:f.grantId,epoch:f.trust.epoch},receiverId:f.receiver.keyId});
beforeAll(async()=>{mkdirSync(root,{recursive:true});dir=mkdtempSync(join(root,"nfc-closure-"));worker=join(dir,"worker.mjs");await build({entryPoints:["tests-care/nfc-commit-closure-worker.ts"],outfile:worker,bundle:true,platform:"node",format:"esm",target:"node24",logLevel:"silent"});});
afterAll(()=>{if(dir&&relative(root,dir).startsWith("nfc-closure-")&&!relative(root,dir).includes(".."))rmSync(dir,{recursive:true,force:true});});
async function next(f:Fixture){const context={...f.b.expected().context,sequence:2};return PendingTagCommit.prepare({layout,before:f.b.finalImage(),key:f.bKey,context,original:f.a.expected(),previous:f.b.expected(),packet:await prepareTravel({tripStartedAt:f.now,events:[]},f.bKey,context,layout.bBytes)});}
function job(f:Fixture,action:ClosureJob["action"]):ClosureJob{return{action,path:f.journalPath,key:[...f.key],storeId:f.id,sectionKey:[...f.bRaw],trust:f.trust,grantToken:f.grantToken,operationId:"b",image:wire(f.b.finalImage()),layout,logger:{keyId:f.logger.keyId,encryption:f.logger.encryption,signing:f.logger.signing},loggerJwk:f.loggerJwk,receiverId:f.receiver.keyId,completion:f.completion};}
type Response={ok:boolean;result?:unknown;error?:string};
function child(job:ClosureJob,ready:()=>Promise<void>=async()=>{},fresh?: (challenge:string)=>Promise<string>){
  return new Promise<{code:number|null;response?:Response}>((done,reject)=>{
    const proc=fork(worker,[],{stdio:["ignore","ignore","pipe","ipc"]});let response:Response|undefined;
    const timer=setTimeout(()=>{proc.kill();reject(Error("Closure worker timeout"));},15000);
    proc.on("message",(m:Response&{ready?:boolean;challenge?:string})=>{
      if(m.ready)void ready().then(()=>proc.connected&&proc.send(job));
      else if(m.challenge&&fresh)void fresh(m.challenge).then(freshness=>proc.connected&&proc.send({freshness})).catch(e=>{proc.kill();reject(e);});
      else response=m;
    });
    proc.on("error",e=>{clearTimeout(timer);reject(e);});proc.on("exit",code=>{clearTimeout(timer);done({code,response});});
  });
}
function simultaneous(jobs:ClosureJob[]){let count=0,release=()=>{};const barrier=new Promise<void>(r=>{release=r;});return Promise.all(jobs.map(j=>child(j,()=>{if(++count===jobs.length)release();return barrier;})));}
async function receiptFixture(){
  const f=await closureFixture(dir,true);await f.finalize();const path=join(dir,crypto.randomUUID()+"-receiver.sqlite");
  const reopen=()=>new ReceiverEvidenceStore(path,f.key,f.id),store=reopen();store.initialize();
  const session=f.challenge(),freshness=await f.fresh(session),input={grantToken:f.grantToken,completion:f.completion,freshness,now:f.now,image:f.b.finalImage(),layout,sectionKey:f.bKey};
  return{...f,path,reopen,store,session,input};
}

describe("atomic logger closure and durable historical receiver evidence",()=>{
  it("owns Buffer input bytes before awaits and never wipes caller key material",async()=>{
    const f=await closureFixture(dir),raw=randomBytes(32),original=Buffer.from(raw);
    await sealKeyEnvelope(f.grantId,f.scope,"receiver","b",f.receiver,raw);expect(raw).toEqual(original);
    const before=new Map([...f.a.baseline()].map(([n,b])=>[n,Buffer.from(b)])),packet=Buffer.from(f.a.snapshot().packet),context={...f.a.expected().context,binding:Buffer.from(f.a.expected().context.binding)};
    const pending=PendingTagCommit.prepare({layout,before,packet,context,key:f.aKey});packet.fill(0);context.binding.fill(0);for(const b of before.values())b.fill(1);
    expect((await pending).snapshot()).toEqual(f.a.snapshot());
    const image=new Map([...f.b.finalImage()].map(([n,b])=>[n,Buffer.from(b)]));
    const signing=f.journal.closeLogger({grantToken:f.grantToken,trust:f.trust,logger:f.logger,operationId:"b",sectionKey:f.bKey,image});
    for(const b of image.values())b.fill(0);expect(await signing).toBeTypeOf("string");
  });
  it.each(["before","after-write","after-commit"] as const)("recovers closure after abrupt process exit %s",async crash=>{
    const f=await closureFixture(dir),j=job(f,"close");expect((await child({...j,crash})).code).toBe(73);
    const restored=await f.journal.restore(f.scope,"b",f.bKey);expect(Boolean(restored.closure)).toBe(crash==="after-commit");
    const spy=vi.spyOn(crypto.subtle,"sign");let token:string;
    try{token=await f.sign();if(restored.closure){expect(token).toBe(restored.closure.token);expect(spy).not.toHaveBeenCalled();}else expect(spy).toHaveBeenCalledOnce();}finally{spy.mockRestore();}
    expect((await child(j)).response).toEqual({ok:true,result:token!});
    await expect(f.journal.save(f.scope,"b2",await next(f),"b")).rejects.toThrow(/closed/);
  });
  it("serializes two processes closing the same operation to one exact signature",async()=>{
    const f=await closureFixture(dir),results=await simultaneous([job(f,"close"),job(f,"close")]);
    expect(results[0].response?.ok).toBe(true);expect(results[1].response).toEqual(results[0].response);
    expect((await f.journal.restore(f.scope,"b",f.bKey)).closure?.token).toBe(results[0].response?.result);
  });
  it("allows only one winner when a process advances B while another closes it",async()=>{
    const f=await closureFixture(dir),b2=await next(f),results=await simultaneous([job(f,"close"),{...job(f,"save"),snapshot:b2.snapshot()}]);
    expect(results.filter(r=>r.response?.ok)).toHaveLength(1);
    const state=await f.journal.restore(f.scope,"b",f.bKey);
    if(results[0].response?.ok){expect(state.head).toBe("b");expect(state.closure).not.toBeNull();}
    else{expect(state.head).toBe("b2");expect(state.closure).toBeNull();await expect(f.sign()).rejects.toThrow(/active/);}
  });
  it("holds closure lock through signing and prevents a queued newer head",async()=>{
    const f=await closureFixture(dir),b2=await next(f);let entered=()=>{},release=()=>{};
    const atSign=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{release=r;});
    const original=crypto.subtle.sign.bind(crypto.subtle),spy=vi.spyOn(crypto.subtle,"sign").mockImplementation(async(...args)=>{entered();await gate;return original(...args);});
    try{
      const closing=f.sign();await atSign;
      const advancing=new NfcCommitJournal(f.journalPath,f.key,f.id).save(f.scope,"b2",b2,"b");
      const observed=Promise.allSettled([closing,advancing]);release();const results=await observed;
      expect(results[0].status).toBe("fulfilled");expect(results[1].status).toBe("rejected");
    }finally{release();spy.mockRestore();}
  });
  it("rejects another grant and preserves historical exact save/completion retries after closure",async()=>{
    const f=await closureFixture(dir,true),grant={...f.grant,id:crypto.randomUUID()},grantToken=await signProof("grant",grantClaims(grant),f.authority);
    await expect(f.journal.closeLogger({grantToken,trust:{...f.trust,grantId:grant.id},logger:f.logger,operationId:"b",sectionKey:f.bKey,image:f.b.finalImage()})).rejects.toThrow(/closed/);
    await f.journal.save(f.scope,"b",f.b,"a");await f.journal.complete(f.scope,"b",f.b.finalImage(),f.bKey);
    expect((await f.journal.restore(f.scope,"b",f.bKey)).closure?.token).toBe(f.completion);
  });
  it("keeps closure scoped and refuses v1 journals without migration or reset",async()=>{
    const f=await closureFixture(dir,true),other={...f.scope,uid:"separate-account"};await f.journal.save(other,"b",f.b,null);
    expect((await f.journal.restore(other,"b",f.bKey)).closure).toBeNull();
    const path=join(dir,"old.sqlite"),old=new EncryptedRecoveryDatabase(path,f.key,f.id,{version:1,purpose:"matrisync-isolated-nfc-journal-v1",limit:8*1024*1024,decode:()=>new Map()});old.initialize();const before=readFileSync(path);
    await expect(new NfcCommitJournal(path,f.key,f.id).restore(f.scope,"b",f.bKey)).rejects.toThrow(/version/);expect(readFileSync(path)).toEqual(before);
  });
  it("records the full-store rollback limit while the separate authority refuses a conflicting terminal",async()=>{
    const f=await closureFixture(dir),before=readFileSync(f.journalPath),token=await f.sign();await f.issuer().finalize(f.logger.keyId,f.grantToken,token);
    writeFileSync(f.journalPath,before);expect((await f.journal.restore(f.scope,"b",f.bKey)).closure).toBeNull();
    // Local storage alone cannot detect replacement by an authentic old database.
    const b2=await next(f);await f.journal.save(f.scope,"b2",b2,"b");await f.journal.complete(f.scope,"b2",b2.finalImage(),f.bKey);
    const conflicting=await f.journal.closeLogger({grantToken:f.grantToken,trust:f.trust,logger:f.logger,operationId:"b2",sectionKey:f.bKey,image:b2.finalImage()});
    await expect(f.issuer().finalize(f.logger.keyId,f.grantToken,conflicting)).rejects.toThrow(/different immutable/);
  });
  it("restores exact encrypted receiver evidence in a fresh process as historical only",async()=>{
    const f=await receiptFixture(),saved=await f.store.accept("receipt",f.session,f.input),before=readFileSync(f.path);
    const response=(await child({...job(f,"restore"),path:f.path})).response;
    expect(response?.ok).toBe(true);expect(response?.result).toMatchObject({status:"historical-authority-evidence",receipt:saved,checkedAt:f.now,expiresAt:f.now+60000});
    expect(readFileSync(f.path)).toEqual(before);
    for(const text of [f.scope.uid,f.grantId,f.completion,f.input.freshness])expect(before.includes(Buffer.from(text))).toBe(false);
    const spy=vi.spyOn(crypto.subtle,"encrypt"),sign=vi.spyOn(crypto.subtle,"sign");
    try{expect((await f.reopen().restore("receipt",owner(f),f.bKey)).receipt).toEqual(saved);expect(spy).not.toHaveBeenCalled();expect(sign).not.toHaveBeenCalled();}finally{spy.mockRestore();sign.mockRestore();}
    f.state.now+=120000;expect((await f.reopen().restore("receipt",owner(f),f.bKey)).status).toBe("historical-authority-evidence");
    await expect(f.inspect(f.challenge(),f.input.freshness)).rejects.toThrow();
  });
  it.each(["before","after-write","after-commit"] as const)("retains all or none of a receiver receipt after process exit %s",async crash=>{
    const f=await receiptFixture(),j={...job(f,"accept"),path:f.path,crash};
    const result=await child(j,undefined,nonce=>f.issuer().freshness(f.receiver.keyId,f.grantToken,f.completion,nonce));expect(result.code).toBe(73);
    if(crash==="after-commit")expect((await f.reopen().restore("receipt",owner(f),f.bKey)).status).toBe("historical-authority-evidence");
    else await expect(f.reopen().restore("receipt",owner(f),f.bKey)).rejects.toThrow(/missing/);
  });
  it("retains original receipt time on exact retry and refuses conflicting IDs",async()=>{
    const f=await receiptFixture(),first=await f.store.accept("receipt",f.session,f.input);
    expect(await f.reopen().accept("receipt",f.session,{...f.input,now:f.now+1000})).toEqual(first);
    const session=f.challenge(),freshness=await f.fresh(session);
    await expect(f.reopen().accept("receipt",session,{...f.input,freshness})).rejects.toThrow(/conflicts/);
    expect((await f.reopen().restore("receipt",owner(f),f.bKey)).receipt).toEqual(first);
  });
  it("serializes competing receiver processes without replacing the winner",async()=>{
    const f=await receiptFixture(),j={...job(f,"accept"),path:f.path};
    const results=await Promise.all([child(j,undefined,n=>f.issuer().freshness(f.receiver.keyId,f.grantToken,f.completion,n)),child(j,undefined,n=>f.issuer().freshness(f.receiver.keyId,f.grantToken,f.completion,n))]);
    expect(results.filter(r=>r.response?.ok)).toHaveLength(1);expect(results.find(r=>!r.response?.ok)?.response?.error).toMatch(/conflicts/);
    expect((await f.reopen().restore("receipt",owner(f),f.bKey)).receipt).toEqual(results.find(r=>r.response?.ok)?.response?.result);
  });
  it("isolates receipt account/referral/receiver, pinned authority and missing or wrong keys",async()=>{
    const f=await receiptFixture();await f.store.accept("receipt",f.session,f.input);const before=readFileSync(f.path),base=owner(f);
    for(const altered of [{...base,receiverId:f.logger.keyId},{...base,trust:{...base.trust,epoch:8}},...(["uid","patientId","referralId"] as const).map(k=>({...base,trust:{...base.trust,scope:{...f.scope,[k]:"foreign"}}}))])await expect(f.reopen().restore("receipt",altered,f.bKey)).rejects.toThrow(/missing|outside/);
    await expect(new ReceiverEvidenceStore(f.path,randomBytes(32),f.id).restore("receipt",base,f.bKey)).rejects.toThrow();
    await expect(f.reopen().restore("receipt",base,f.aKey)).rejects.toThrow();expect(readFileSync(f.path)).toEqual(before);
    const absent=join(dir,"missing-receiver.sqlite");await expect(new ReceiverEvidenceStore(absent,f.key,f.id).restore("receipt",base,f.bKey)).rejects.toThrow(/reset/);expect(existsSync(absent)).toBe(false);
  });
  it("rejects corruption and authenticated tampered receipt data without destructive reset",async()=>{
    const f=await receiptFixture();await f.store.accept("receipt",f.session,f.input);
    const original=readFileSync(f.path),unsafe=new EncryptedRecoveryDatabase<{evidence:{image:[number,number[]][]}}>(f.path,f.key,f.id,{version:1,purpose:"matrisync-isolated-nfc-receiver-v1",limit:8*1024*1024,decode:v=>new Map(v as [string,{evidence:{image:[number,number[]][]}}][])});
    await unsafe.transaction(async rows=>{[...rows.values()][0].evidence.image[0][1][0]^=1;});const tampered=readFileSync(f.path);
    await expect(f.reopen().restore("receipt",owner(f),f.bKey)).rejects.toThrow(/image/);expect(readFileSync(f.path)).toEqual(tampered);
    writeFileSync(f.path,original);const db=new DatabaseSync(f.path);db.exec("UPDATE recovery SET envelope=randomblob(100)");db.close();const corrupt=readFileSync(f.path);
    await expect(f.reopen().restore("receipt",owner(f),f.bKey)).rejects.toThrow();expect(readFileSync(f.path)).toEqual(corrupt);
  });
  it("does not turn rolled-back receipt history into a current challenge",async()=>{
    const f=await receiptFixture();await f.store.accept("receipt",f.session,f.input);const old=readFileSync(f.path);
    f.state.now+=1000;const newer=f.challenge();await f.store.accept("newer",newer,{...f.input,now:f.state.now,freshness:await f.fresh(newer)});
    writeFileSync(f.path,old);expect((await f.reopen().restore("receipt",owner(f),f.bKey)).status).toBe("historical-authority-evidence");
    await expect(f.reopen().restore("newer",owner(f),f.bKey)).rejects.toThrow(/missing/);
    await expect(f.inspect(new ReceiverChallenge({...f.trust,now:f.state.now},f.receiver.keyId),f.input.freshness)).rejects.toThrow(/replayed/);
  });
});
