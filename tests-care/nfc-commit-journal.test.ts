import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {build} from "esbuild";
import {fork} from "node:child_process";
import {mkdtempSync,mkdirSync,readFileSync,rmSync,existsSync} from "node:fs";
import {join,resolve,relative} from "node:path";
import {randomBytes} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {memoryLayout} from "../src/nfc/layout";
import {prepareSection,referralBinding,type SectionContext} from "../src/nfc/sections";
import {prepareTravel} from "../src/nfc/travel";
import {PendingTagCommit,type TagImage} from "./nfc-commit-model";
import {NfcCommitJournal} from "./nfc-commit-journal";
import {EncryptedRecoveryDatabase} from "./recovery-sqlite";
import type {JournalJob} from "./nfc-commit-worker";

const root=resolve(".local-tools"),layout=memoryLayout({model:"classic-1k",verifiedDataBlocks:Array.from({length:63},(_,i)=>i+1).filter(b=>b%4!==3),reservedBlocks:[]});
let dir:string,worker:string;
const wire=(image:TagImage):[number,number[]][]=>[...image].map(([n,b])=>[n,[...b]]);
beforeAll(async()=>{
  mkdirSync(root,{recursive:true});dir=mkdtempSync(join(root,"nfc-journal-"));worker=join(dir,"worker.mjs");
  await build({entryPoints:["tests-care/nfc-commit-worker.ts"],outfile:worker,bundle:true,platform:"node",format:"esm",target:"node24",logLevel:"silent"});
});
afterAll(()=>{if(dir&&relative(root,dir).startsWith("nfc-journal-")&&!relative(root,dir).includes(".."))rmSync(dir,{recursive:true,force:true});});
async function fixture(){
  const path=join(dir,`${crypto.randomUUID()}.sqlite`),storageKey=randomBytes(32),storeId=crypto.randomUUID(),raw=randomBytes(32);
  const key=await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt","decrypt"]);
  const scope={uid:"synthetic-account-private",patientId:"SYN-JOURNAL-P",referralId:"SYN-JOURNAL-R"};
  const context:SectionContext={section:"a",sequence:1,dictionaryVersion:1,binding:await referralBinding(scope.patientId,scope.referralId)};
  const packet=(await prepareSection({patientId:scope.patientId,referralId:scope.referralId,reason:"Synthetic literal only",subject:"mother"},key,context,layout.aBytes)).packet;
  const a=await PendingTagCommit.prepare({layout,before:new Map(layout.blocks.map(n=>[n,new Uint8Array(16)])),packet,context,key});
  const bc={...context,section:"b" as const};
  const b=await PendingTagCommit.prepare({layout,before:a.finalImage(),packet:await prepareTravel({tripStartedAt:0,events:[]},key,bc,layout.bBytes),context:bc,key,original:a.expected()});
  const bc2={...bc,sequence:2};
  const b2=await PendingTagCommit.prepare({layout,before:b.finalImage(),packet:await prepareTravel({tripStartedAt:0,events:[]},key,bc2,layout.bBytes),context:bc2,key,original:a.expected(),previous:b.expected()});
  const reopen=()=>new NfcCommitJournal(path,storageKey,storeId),journal=reopen();journal.initialize();
  const job=(action:JournalJob["action"],crash?:JournalJob["crash"]):JournalJob=>({path,storageKey:storageKey.toString("hex"),storeId,scope,id:"op-a",sectionKey:[...raw],snapshot:a.snapshot(),head:null,action,crash,image:wire(a.finalImage())});
  return{path,storageKey,storeId,key,scope,a,b,b2,journal,reopen,job};
}
type Response={ok:boolean;result?:unknown;error?:string};
function child(job:JournalJob,ready:()=>Promise<void>=async()=>{}){
  return new Promise<{code:number|null;response?:Response}>((done,reject)=>{
    const proc=fork(worker,[],{stdio:["ignore","ignore","pipe","ipc"]});let response:Response|undefined;
    const timer=setTimeout(()=>{proc.kill();reject(Error("NFC worker timeout"));},15000);
    proc.on("message",(m:Response&{ready?:boolean})=>{if(m.ready)void ready().then(()=>{if(proc.connected)proc.send(job);});else response=m;});
    proc.on("error",e=>{clearTimeout(timer);reject(e);});proc.on("exit",code=>{clearTimeout(timer);done({code,response});});
  });
}
function simultaneous(jobs:JournalJob[]){
  let count=0,release=()=>{};const barrier=new Promise<void>(r=>{release=r;});
  return Promise.all(jobs.map(job=>child(job,()=>{if(++count===jobs.length)release();return barrier;})));
}
describe("isolated encrypted NFC operation journal",()=>{
  it("restores exact ciphertext, nonce, pins, baseline and steps in a fresh process without writes",async()=>{
    const f=await fixture();await f.journal.save(f.scope,"op-a",f.a,null);const before=readFileSync(f.path);
    expect((await child(f.job("restore"))).response).toEqual({ok:true,result:{snapshot:f.a.snapshot(),steps:f.a.steps().map(s=>({...s,bytes:[...s.bytes]})),completion:null,head:"op-a"}});
    expect(readFileSync(f.path)).toEqual(before);
    const spy=vi.spyOn(crypto.subtle,"encrypt");
    try{await f.reopen().restore(f.scope,"op-a",f.key);expect(spy).not.toHaveBeenCalled();}finally{spy.mockRestore();}
    const bytes=readFileSync(f.path);
    for(const value of [f.scope.uid,f.scope.patientId,f.scope.referralId,"op-a","Synthetic literal only",f.storageKey.toString("hex")])expect(bytes.includes(Buffer.from(value))).toBe(false);
  });
  it.each(["before","after-write","after-commit"] as const)("survives process exit %s pending persistence",async crash=>{
    const f=await fixture();expect((await child(f.job("save",crash))).code).toBe(73);
    if(crash==="after-commit")expect((await f.reopen().restore(f.scope,"op-a",f.key)).pending.snapshot()).toEqual(f.a.snapshot());
    else await expect(f.reopen().restore(f.scope,"op-a",f.key)).rejects.toThrow(/missing/);
    await f.reopen().save(f.scope,"op-a",f.a,null);expect((await f.reopen().restore(f.scope,"op-a",f.key)).completion).toBeNull();
  });
  it.each(["before","after-write","after-commit"] as const)("reconciles lost final acknowledgement across exit %s completion persistence",async crash=>{
    const f=await fixture();await f.journal.save(f.scope,"op-a",f.a,null);
    expect((await child(f.job("complete",crash))).code).toBe(73);
    const restored=await f.reopen().restore(f.scope,"op-a",f.key);expect(Boolean(restored.completion)).toBe(crash==="after-commit");
    const evidence=await f.reopen().complete(f.scope,"op-a",f.a.finalImage(),f.key);
    expect(evidence.status).toBe("confirmed-in-model");expect(await f.reopen().complete(f.scope,"op-a",f.a.finalImage(),f.key)).toEqual(evidence);
    expect((await child(f.job("restore"))).response?.ok).toBe(true);
  });
  it("explicitly retries all 833 interrupted images after reopen with exact original bytes",async()=>{
    const f=await fixture();let cases=0;
    // Separate scopes are not invented: journal A then B then B2 in order.
    await f.journal.save(f.scope,"op-a",f.a,null);
    const a=(await f.reopen().restore(f.scope,"op-a",f.key)).pending;
    await f.journal.complete(f.scope,"op-a",f.a.finalImage(),f.key);await f.journal.save(f.scope,"op-b",f.b,"op-a");
    await f.journal.complete(f.scope,"op-b",f.b.finalImage(),f.key);await f.journal.save(f.scope,"op-b2",f.b2,"op-b");
    const b2=(await f.reopen().restore(f.scope,"op-b2",f.key)).pending;
    for(const p of [a,b2]){
      const prefix=p.baseline();
      for(const step of p.steps()){
        for(let cut=0;cut<=16;cut++){
          const torn=new Map([...prefix].map(([n,b])=>[n,b.slice()]));torn.get(step.block)!.set(step.bytes.subarray(0,cut));
          const retry=p.retryFrom(torn);expect(retry.snapshot()).toEqual(p.snapshot());expect(retry.steps()).toEqual(p.steps());expect(retry.finalImage()).toEqual(p.finalImage());cases++;
        }
        prefix.set(step.block,step.bytes);
      }
    }
    expect(cases).toBe(833);
    expect((await f.reopen().restore(f.scope,"op-b2",f.key)).completion).toBeNull();
    const damaged=f.b2.baseline();damaged.get(layout.a[0])![0]^=1;expect(()=>b2.retryFrom(damaged)).toThrow(/recognized/);
    await expect(f.journal.complete(f.scope,"op-b2",damaged,f.key)).rejects.toThrow(/readback/);
  });
  it("two processes retain one winner and cannot overwrite or advance stale state",async()=>{
    const f=await fixture(),results=await simultaneous([f.job("save"),{...f.job("save"),id:"competitor"}]);
    expect(results.filter(r=>r.response?.ok)).toHaveLength(1);expect(results.find(r=>!r.response?.ok)?.response?.error).toMatch(/Stale/);
    const winner=results[0].response?.ok?"op-a":"competitor";
    await f.journal.complete(f.scope,winner,f.a.finalImage(),f.key);
    const next={...f.job("save"),id:"op-b",snapshot:f.b.snapshot(),head:winner};
    const updates=await simultaneous([next,{...next,id:"op-b-competing"}]);expect(updates.filter(r=>r.response?.ok)).toHaveLength(1);
    await expect(f.journal.save(f.scope,"stale",f.b,winner)).rejects.toThrow(/Stale/);
  });
  it("restores and completes B in another process with no A decryption key",async()=>{
    const f=await fixture(),raw=randomBytes(32),key=await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt","decrypt"]);
    const context={...f.b.expected().context};
    const b=await PendingTagCommit.prepare({layout,before:f.a.finalImage(),packet:await prepareTravel({tripStartedAt:0,events:[]},key,context,layout.bBytes),context,key,original:f.a.expected()});
    await f.journal.save(f.scope,"op-a",f.a,null);await f.journal.complete(f.scope,"op-a",f.a.finalImage(),f.key);
    const job={...f.job("save"),id:"op-b",snapshot:b.snapshot(),head:"op-a",sectionKey:[...raw],image:wire(b.finalImage())};
    expect((await child(job)).response?.ok).toBe(true);
    expect((await child({...job,action:"restore"})).response).toEqual({ok:true,result:{snapshot:b.snapshot(),steps:b.steps().map(s=>({...s,bytes:[...s.bytes]})),completion:null,head:"op-b"}});
    expect((await child({...job,action:"complete",crash:"after-commit"})).code).toBe(73);
    expect((await f.reopen().restore(f.scope,"op-b",key)).completion?.status).toBe("confirmed-in-model");
    await expect(f.journal.restore(f.scope,"op-b",f.key)).rejects.toThrow();
  });
  it("refuses competing ciphertext under an existing ID and mismatched completed baseline",async()=>{
    const f=await fixture();await f.journal.save(f.scope,"op-a",f.a,null);await f.journal.complete(f.scope,"op-a",f.a.finalImage(),f.key);
    const context=f.b.expected().context;
    const packet=await prepareTravel({tripStartedAt:1,events:[]},f.key,context,layout.bBytes);
    const alternate=await PendingTagCommit.prepare({layout,before:f.a.finalImage(),packet,context,key:f.key,original:f.a.expected()});
    await f.journal.save(f.scope,"op-b",f.b,"op-a");await expect(f.journal.save(f.scope,"op-b",alternate,"op-a")).rejects.toThrow(/conflicts/);
    await f.journal.complete(f.scope,"op-b",f.b.finalImage(),f.key);
    const wrongBaseline=alternate.finalImage(),next={...context,sequence:2};
    const different=await PendingTagCommit.prepare({layout,before:wrongBaseline,packet:await prepareTravel({tripStartedAt:2,events:[]},f.key,next,layout.bBytes),context:next,key:f.key,original:f.a.expected(),previous:alternate.expected()});
    await expect(f.journal.save(f.scope,"op-b2",different,"op-b")).rejects.toThrow(/baseline/);
    expect((await f.reopen().restore(f.scope,"op-b",f.key)).pending.snapshot()).toEqual(f.b.snapshot());
  });
  it("identical racing saves/completions return immutable original records",async()=>{
    const f=await fixture();const saves=await simultaneous([f.job("save"),f.job("save")]);expect(saves[0].response?.ok).toBe(true);expect(saves[1].response).toEqual(saves[0].response);
    const completions=await simultaneous([f.job("complete"),f.job("complete")]);expect(completions[0].response?.ok).toBe(true);expect(completions[1].response).toEqual(completions[0].response);
    await f.journal.save(f.scope,"op-b",f.b,"op-a");
    expect(await f.journal.complete(f.scope,"op-a",f.a.finalImage(),f.key)).toEqual(completions[0].response?.result);
    await expect(f.journal.save(f.scope,"op-a",f.b,null)).rejects.toThrow(/conflicts/);
    await expect(f.journal.save(f.scope,"op-b2",f.b2,"op-b")).rejects.toThrow(/pending/);
    expect((await f.reopen().restore(f.scope,"op-a",f.key)).head).toBe("op-b");
  });
  it("isolates account, patient and referral routing and rejects mismatched packet binding",async()=>{
    const f=await fixture();await f.journal.save(f.scope,"op-a",f.a,null);
    for(const field of ["uid","patientId","referralId"] as const){
      const scope={...f.scope,[field]:"foreign"};await expect(f.journal.restore(scope,"op-a",f.key)).rejects.toThrow(/missing/);await expect(f.journal.complete(scope,"op-a",f.a.finalImage(),f.key)).rejects.toThrow(/missing/);
      if(field!=="uid")await expect(f.journal.save(scope,"op-a",f.a,null)).rejects.toThrow(/different patient/);
    }
    // Account labels are caller-supplied isolation, not authentication/grants.
    const other={...f.scope,uid:"separate-synthetic-account"};await f.journal.save(other,"op-a",f.a,null);
    await f.journal.complete(other,"op-a",f.a.finalImage(),f.key);expect((await f.journal.restore(f.scope,"op-a",f.key)).completion).toBeNull();
  });
  it("fails on missing keys/store, corrupt ciphertext/row/version without resetting",async()=>{
    const f=await fixture();await f.journal.save(f.scope,"op-a",f.a,null);const before=readFileSync(f.path);
    for(const journal of [new NfcCommitJournal(f.path,randomBytes(32),f.storeId),new NfcCommitJournal(f.path,f.storageKey,crypto.randomUUID())])await expect(journal.restore(f.scope,"op-a",f.key)).rejects.toThrow();
    const wrong=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);await expect(f.journal.restore(f.scope,"op-a",wrong)).rejects.toThrow();
    expect(()=>new NfcCommitJournal(f.path,new Uint8Array(),f.storeId)).toThrow();expect(()=>f.journal.initialize()).toThrow();expect(readFileSync(f.path)).toEqual(before);
    const missing=join(dir,"missing.sqlite");await expect(new NfcCommitJournal(missing,f.storageKey,f.storeId).restore(f.scope,"op-a",f.key)).rejects.toThrow(/refusing to reset/);expect(existsSync(missing)).toBe(false);
    for(const sql of ["DELETE FROM recovery","UPDATE recovery SET envelope=randomblob(50)","PRAGMA user_version=99"]){
      const g=await fixture();await g.journal.save(g.scope,"op-a",g.a,null);const db=new DatabaseSync(g.path);db.exec(sql);db.close();const corrupt=readFileSync(g.path);
      await expect(g.journal.restore(g.scope,"op-a",g.key)).rejects.toThrow();expect(readFileSync(g.path)).toEqual(corrupt);
    }
  });
  it("rejects changed snapshot digest, pins, layout, packet and duplicate baseline blocks",async()=>{
    const f=await fixture();
    for(const mutate of [(s:ReturnType<typeof f.a.snapshot>)=>{s.expected.packetDigest="0".repeat(64);},(s:ReturnType<typeof f.a.snapshot>)=>{s.packet[30]^=1;},(s:ReturnType<typeof f.a.snapshot>)=>{s.before.push(s.before[0]);},(s:ReturnType<typeof f.a.snapshot>)=>{s.expected.context.sequence++;},(s:ReturnType<typeof f.a.snapshot>)=>{s.layout={...s.layout,aBytes:999};}]){
      const snapshot=f.a.snapshot();mutate(snapshot);await expect(PendingTagCommit.restore(snapshot,f.key)).rejects.toThrow();
    }
    const snapshot=f.b2.snapshot();snapshot.original!.packetDigest="0".repeat(64);await expect(PendingTagCommit.restore(snapshot,f.key)).rejects.toThrow();
  });
  it("rejects authenticated but inconsistent chains and conflicting completion evidence",async()=>{
    for(const mutation of ["cycle","missing-operation","missing-completion","conflicting-evidence"]){
      const f=await fixture();await f.journal.save(f.scope,"op-a",f.a,null);await f.journal.complete(f.scope,"op-a",f.a.finalImage(),f.key);await f.journal.save(f.scope,"op-b",f.b,"op-a");
      // Privileged corruption fixture deliberately knows the synthetic storage key.
      const unsafe=new EncryptedRecoveryDatabase<Record<string,unknown>>(f.path,f.storageKey,f.storeId,{version:3,purpose:"matrisync-isolated-nfc-journal-v3",limit:8*1024*1024,decode:v=>new Map(v as [string,Record<string,unknown>][])});
      await unsafe.transaction(async rows=>{
        for(const [key,row] of rows){
          if(mutation==="cycle"&&row.kind==="operation"&&row.id==="op-b")row.previousId="op-b";
          if(mutation==="missing-operation"&&row.kind==="operation"&&row.id==="op-a")rows.delete(key);
          if(mutation==="missing-completion"&&row.kind==="completion")rows.delete(key);
          if(mutation==="conflicting-evidence"&&row.kind==="completion")row.imageDigest="0".repeat(64);
        }
      });
      const before=readFileSync(f.path);await expect(f.reopen().restore(f.scope,"op-a",f.key)).rejects.toThrow();expect(readFileSync(f.path)).toEqual(before);
    }
  });
  it("rolls back exceptions, keeps rollback file encrypted and bounds lock contention",async()=>{
    const f=await fixture();await f.journal.save(f.scope,"op-a",f.a,null);
    const failing=new NfcCommitJournal(f.path,f.storageKey,f.storeId,{fault:point=>{if(point==="after-write"){const bytes=readFileSync(`${f.path}-journal`);expect(bytes.includes(Buffer.from(f.scope.uid))).toBe(false);throw Error("injected failure");}}});
    await expect(failing.complete(f.scope,"op-a",f.a.finalImage(),f.key)).rejects.toThrow(/injected/);expect((await f.reopen().restore(f.scope,"op-a",f.key)).completion).toBeNull();
    const db=new DatabaseSync(f.path);db.exec("BEGIN IMMEDIATE");
    try{await expect(new NfcCommitJournal(f.path,f.storageKey,f.storeId,{lockWaitMs:20}).restore(f.scope,"op-a",f.key)).rejects.toThrow(/busy/);}finally{db.exec("ROLLBACK");db.close();}
    expect((await f.journal.complete(f.scope,"op-a",f.a.finalImage(),f.key)).status).toBe("confirmed-in-model");
  });
});
