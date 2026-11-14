import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync} from "node:fs";
import {join,resolve,relative} from "node:path";
import {randomBytes} from "node:crypto";
import {CompactSign,CompactEncrypt,importJWK,base64url} from "jose";
import {newSharingDevice,type PublicDevice} from "../src/sharing-crypto";
import {memoryLayout} from "../src/nfc/layout";
import {prepareSection,referralBinding,type SectionContext} from "../src/nfc/sections";
import {prepareTravel} from "../src/nfc/travel";
import {PendingTagCommit} from "./nfc-commit-model";
import {NfcCommitJournal} from "./nfc-commit-journal";
import {AUTH_DOMAIN,bytes,grantClaims,completionClaims,freshnessClaims,signProof,tokenDigest,verifyGrant,verifyCompletion,sealKeyEnvelope,openKeyEnvelope,measureAuthorization,type Grant,type Trust,type LoggerCommitment} from "./nfc-commit-authority-protocol";
import {ProtocolLedger,CompletionAuthority,ReceiverChallenge,retainLoggerCompletion,type CurrentAuthority} from "./nfc-commit-authority-model";
import type {StoragePoint} from "./recovery-sqlite";

const root=resolve(".local-tools");let dir:string;
const layout=memoryLayout({model:"classic-1k",verifiedDataBlocks:Array.from({length:63},(_,i)=>i+1).filter(b=>b%4!==3),reservedBlocks:[]});
const publicOnly=(d:PublicDevice):PublicDevice=>({keyId:d.keyId,encryption:d.encryption,signing:d.signing});
beforeAll(()=>{mkdirSync(root,{recursive:true});dir=mkdtempSync(join(root,"nfc-authority-"));});
afterAll(()=>{if(dir&&relative(root,dir).startsWith("nfc-authority-")&&!relative(root,dir).includes(".."))rmSync(dir,{recursive:true,force:true});});
async function fixture(){
  const [authority,logger,receiver]=await Promise.all([newSharingDevice(),newSharingDevice(),newSharingDevice()]);
  const scope={uid:"SYN-AUTH-OWNER",patientId:"SYN-AUTH-P",referralId:"SYN-AUTH-R"},grantId=crypto.randomUUID(),now=1794390000000;
  const aRaw=randomBytes(32),bRaw=randomBytes(32),aKey=await crypto.subtle.importKey("raw",aRaw,"AES-GCM",false,["encrypt","decrypt"]),bKey=await crypto.subtle.importKey("raw",bRaw,"AES-GCM",false,["encrypt","decrypt"]);
  const context:SectionContext={section:"a",dictionaryVersion:1,sequence:1,binding:await referralBinding(scope.patientId,scope.referralId)};
  const a=await PendingTagCommit.prepare({layout,before:new Map(layout.blocks.map(n=>[n,new Uint8Array(16)])),context,key:aKey,packet:(await prepareSection({patientId:scope.patientId,referralId:scope.referralId,reason:"Synthetic reason",subject:"mother"},aKey,context,layout.aBytes)).packet});
  const bc={...context,section:"b" as const},b=await PendingTagCommit.prepare({layout,before:a.finalImage(),context:bc,key:bKey,original:a.expected(),packet:await prepareTravel({tripStartedAt:now,events:[]},bKey,bc,layout.bBytes)});
  const envelopes=await Promise.all([sealKeyEnvelope(grantId,scope,"logger","b",logger,bRaw),sealKeyEnvelope(grantId,scope,"receiver","a",receiver,aRaw),sealKeyEnvelope(grantId,scope,"receiver","b",receiver,bRaw)]);
  const grant:Grant={id:grantId,scope,originalDigest:a.expected().packetDigest,logger:publicOnly(logger),receiver:publicOnly(receiver),minGeneration:1,maxGeneration:4,epoch:7,notBefore:now-1000,expiresAt:now+3600000,envelopes:await Promise.all(envelopes.map(async(token,i)=>({role:i===0?"logger" as const:"receiver" as const,section:i===1?"a" as const:"b" as const,keyId:i===0?logger.keyId:receiver.keyId,digest:await tokenDigest(token)})))};
  const grantToken=await signProof("grant",grantClaims(grant),authority),trust:Trust={authority:publicOnly(authority),scope,grantId,epoch:7,now};
  const key=randomBytes(32),id=crypto.randomUUID(),journalPath=join(dir,`${id}-pending.sqlite`),loggerPath=join(dir,`${id}-logger.sqlite`),authorityPath=join(dir,`${id}-authority.sqlite`);
  const journal=new NfcCommitJournal(journalPath,key,id);journal.initialize();await journal.save(scope,"a",a,null);await journal.complete(scope,"a",a.finalImage(),aKey);await journal.save(scope,"b",b,"a");await journal.complete(scope,"b",b.finalImage(),bKey);
  const loggerLedger=(fault?:(p:StoragePoint)=>void)=>new ProtocolLedger(loggerPath,key,id,"logger",{fault}),authorityLedger=(fault?:(p:StoragePoint)=>void)=>new ProtocolLedger(authorityPath,key,id,"authority",{fault});loggerLedger().initialize();authorityLedger().initialize();
  const state:{now:number;value:CurrentAuthority}={now,value:{enabled:true,grantToken,trust:{authority:trust.authority,scope,grantId,epoch:7}}};
  const issuer=(fault?:(p:StoragePoint)=>void)=>new CompletionAuthority({ledger:authorityLedger(fault),device:authority,clock:()=>state.now,current:()=>state.value});
  const sign=()=>retainLoggerCompletion({grantToken,trust,logger,journal,operationId:"b",sectionKey:bKey,image:b.finalImage()});
  const completion=await sign(),commitment=(await verifyCompletion(completion,grantToken,trust)).commitment;
  const challenge=()=>new ReceiverChallenge({...trust,now:state.now},receiver.keyId);
  const inspect=(session:ReceiverChallenge,freshness?:string)=>session.inspect({grantToken,completion,freshness,now:state.now,image:b.finalImage(),layout,sectionKey:bKey});
  const finalize=()=>issuer().finalize(logger.keyId,grantToken,completion);
  const fresh=(session:ReceiverChallenge)=>issuer().freshness(receiver.keyId,grantToken,completion,session.nonce);
  return{authority,logger,receiver,scope,grantId,now,aRaw,bRaw,aKey,bKey,a,b,context,grant,grantToken,trust,envelopes,journal,journalPath,key,id,loggerPath,authorityPath,loggerLedger,authorityLedger,state,issuer,sign,completion,commitment,challenge,inspect,finalize,fresh};
}

describe("isolated signed NFC completion, grants and receiver freshness",()=>{
  it("round trips separate non-extractable section keys with logger B only",async()=>{
    const f=await fixture();const opened=await Promise.all(f.envelopes.map((token,i)=>openKeyEnvelope({grantToken:f.grantToken,trust:f.trust,token,device:i===0?f.logger:f.receiver,role:i===0?"logger":"receiver",section:i===1?"a":"b"})));
    expect(opened.map(k=>k.extractable)).toEqual([false,false,false]);expect(opened.map(k=>k.usages)).toEqual([["encrypt","decrypt"],["decrypt"],["decrypt"]]);
    expect((await f.b.reconcile(f.b.finalImage(),opened[0])).status).toBe("confirmed-in-model");expect((await f.b.reconcile(f.b.finalImage(),opened[2])).status).toBe("confirmed-in-model");expect((await f.a.reconcile(f.a.finalImage(),opened[1])).status).toBe("confirmed-in-model");
    await expect(openKeyEnvelope({grantToken:f.grantToken,trust:f.trust,token:f.envelopes[1],device:f.logger,role:"logger",section:"a"})).rejects.toThrow(/pinned/);
    await expect(sealKeyEnvelope(f.grantId,f.scope,"logger","a",f.logger,f.aRaw)).rejects.toThrow();
    await expect(crypto.subtle.exportKey("raw",opened[0])).rejects.toThrow();
  });
  it("requires pinned authority, expected scope, epoch, algorithm and explicit proof type",async()=>{
    const f=await fixture(),stranger=await newSharingDevice();
    for(const trust of [{...f.trust,authority:publicOnly(stranger)},{...f.trust,epoch:8},{...f.trust,grantId:"foreign"},{...f.trust,scope:{...f.scope,uid:"foreign"}},{...f.trust,scope:{...f.scope,referralId:"foreign"}},{...f.trust,now:f.grant.expiresAt},{...f.trust,now:f.grant.notBefore-1}])await expect(verifyGrant(f.grantToken,trust)).rejects.toThrow();
    const wrongType=await signProof("completion",grantClaims(f.grant),f.authority);await expect(verifyGrant(wrongType,f.trust)).rejects.toThrow(/type/);
    const extraHeader=await new CompactSign(bytes(grantClaims(f.grant))).setProtectedHeader({alg:"ES256",kid:f.authority.keyId,typ:`${AUTH_DOMAIN}:grant`,jku:"https://untrusted.invalid/key"}).sign(f.authority.signKey);await expect(verifyGrant(extraHeader,f.trust)).rejects.toThrow(/type/);
    const parts=f.grantToken.split(".");parts[0]=base64url.encode(bytes({alg:"none",kid:f.authority.keyId,typ:`${AUTH_DOMAIN}:grant`}));await expect(verifyGrant(parts.join("."),f.trust)).rejects.toThrow();
    await expect(verifyGrant("x".repeat(16385),f.trust)).rejects.toThrow(/Oversized/);
  });
  it("rejects modified ciphertext, wrong recipients and unpinned replacement envelopes",async()=>{
    const f=await fixture(),stranger=await newSharingDevice(),token=f.envelopes[2];
    await expect(openKeyEnvelope({grantToken:f.grantToken,trust:f.trust,token,device:stranger,role:"receiver",section:"b"})).rejects.toThrow(/different/);
    for(const changed of [token.slice(0,-3)+"abc",f.envelopes[1],await sealKeyEnvelope(f.grantId,f.scope,"receiver","b",f.receiver,f.bRaw)])await expect(openKeyEnvelope({grantToken:f.grantToken,trust:f.trust,token:changed,device:f.receiver,role:"receiver",section:"b"})).rejects.toThrow(/pinned/);
    // Even a signed envelope digest does not make a mismatched inner binding valid.
    const wrong=await sealKeyEnvelope("another-grant",f.scope,"receiver","b",f.receiver,f.bRaw),grant=structuredClone(f.grant);grant.envelopes[2].digest=await tokenDigest(wrong);
    const grantToken=await signProof("grant",grantClaims(grant),f.authority);await expect(openKeyEnvelope({grantToken,trust:f.trust,token:wrong,device:f.receiver,role:"receiver",section:"b"})).rejects.toThrow(/binding/);
  });
  it("rejects invalid grant policies, clinical versions and logger A capability",async()=>{
    const f=await fixture();
    for(const modify of [(g:Grant)=>{g.maxGeneration=0;},(g:Grant)=>{g.minGeneration=5;},(g:Grant)=>{g.receiver=g.logger;},(g:Grant)=>{g.expiresAt=g.notBefore+86400001;},(g:Grant)=>{g.envelopes[0].section="a";},(g:Grant)=>{g.envelopes[2].digest=g.envelopes[1].digest;}]){
      const g=structuredClone(f.grant);modify(g);await expect(verifyGrant(await signProof("grant",grantClaims(g),f.authority),f.trust)).rejects.toThrow();
    }
    const claims=grantClaims(f.grant);claims[8]=2;await expect(verifyGrant(await signProof("grant",claims,f.authority),f.trust)).rejects.toThrow(/unsupported/);
  });
  it("does not call a valid logger signature current without independent authority freshness",async()=>{
    const f=await fixture(),session=f.challenge();expect(await f.inspect(session)).toMatchObject({status:"authenticated-not-fresh"});
    await expect(f.fresh(session)).rejects.toThrow(/terminal/);await f.finalize();const proof=await f.fresh(session);
    expect(await f.inspect(session,proof)).toMatchObject({status:"current-at-authority-check",checkedAt:f.now,expiresAt:f.now+60000});
    expect(await f.inspect(session,proof)).toEqual(await f.inspect(session,proof));
  });
  it("rejects a receiver holding B encryption material as an authorized logger",async()=>{
    const f=await fixture(),forged=await signProof("completion",completionClaims(f.commitment),f.receiver);
    await expect(verifyCompletion(forged,f.grantToken,f.trust)).rejects.toThrow();
    await expect(f.issuer().finalize(f.receiver.keyId,f.grantToken,f.completion)).rejects.toThrow(/logger/);
    await f.finalize();await expect(f.issuer().freshness(f.logger.keyId,f.grantToken,f.completion,f.challenge().nonce)).rejects.toThrow(/receiver/);
  });
  it("rejects completion substitutions for another referral, A pin, device, grant or generation",async()=>{
    const f=await fixture();
    for(const modify of [(c:LoggerCommitment)=>{c.scope.referralId="foreign";},(c:LoggerCommitment)=>{c.originalDigest="0".repeat(64);},(c:LoggerCommitment)=>{c.generation=5;},(c:LoggerCommitment)=>{c.generation=0;},(c:LoggerCommitment)=>{c.loggerId=f.receiver.keyId;},(c:LoggerCommitment)=>{c.receiverId=f.logger.keyId;},(c:LoggerCommitment)=>{c.grantDigest="0".repeat(64);}]){
      const c=structuredClone(f.commitment);modify(c);await expect(verifyCompletion(await signProof("completion",completionClaims(c),f.logger),f.grantToken,f.trust)).rejects.toThrow(/outside/);
    }
  });
  it("retains exact signed logger bytes after reopen and rejects another final operation",async()=>{
    const f=await fixture(),spy=vi.spyOn(crypto.subtle,"sign");
    try{expect(await f.sign()).toBe(f.completion);expect(spy).not.toHaveBeenCalled();}finally{spy.mockRestore();}
    const next={...f.b.expected().context,sequence:2},b2=await PendingTagCommit.prepare({layout,before:f.b.finalImage(),key:f.bKey,context:next,original:f.a.expected(),previous:f.b.expected(),packet:await prepareTravel({tripStartedAt:f.now,events:[]},f.bKey,next,layout.bBytes)});
    await expect(f.journal.save(f.scope,"b2",b2,"b")).rejects.toThrow(/closed/);
    await expect(retainLoggerCompletion({grantToken:f.grantToken,trust:f.trust,logger:f.logger,journal:f.journal,operationId:"b2",sectionKey:f.bKey,image:b2.finalImage()})).rejects.toThrow(/active/);
    expect(await f.sign()).toBe(f.completion);
    const data=readFileSync(f.journalPath);for(const value of [f.completion,f.scope.uid,f.grantId,f.bRaw.toString("hex")])expect(data.includes(Buffer.from(value))).toBe(false);
  });
  it("refuses an uncompleted journal operation or changed readback before logger signing",async()=>{
    const f=await fixture(),path=join(dir,`${crypto.randomUUID()}-pending.sqlite`),journal=new NfcCommitJournal(path,f.key,f.id);journal.initialize();await journal.save(f.scope,"b",f.b,null);
    const invoke=(image=f.b.finalImage())=>retainLoggerCompletion({grantToken:f.grantToken,trust:f.trust,logger:f.logger,journal,operationId:"b",sectionKey:f.bKey,image});
    await expect(invoke()).rejects.toThrow(/completed/);await journal.complete(f.scope,"b",f.b.finalImage(),f.bKey);
    const changed=f.b.finalImage();changed.get(layout.b[0])![0]^=1;await expect(invoke(changed)).rejects.toThrow(/readback/);
  });
  it("snapshots signed claims and device identity before asynchronous verification",async()=>{
    const f=await fixture(),claims=grantClaims(f.grant),device={...f.authority},pending=signProof("grant",claims,device);
    claims[3]="mutated";device.keyId=f.receiver.keyId;
    expect((await verifyGrant(await pending,f.trust)).id).toBe(f.grantId);
  });
  it("refuses lost ledger custody without initializing or replacing existing evidence",async()=>{
    const f=await fixture(),before=readFileSync(f.authorityPath);
    for(const ledger of [new ProtocolLedger(f.authorityPath,randomBytes(32),f.id,"authority"),new ProtocolLedger(f.authorityPath,f.key,f.id,"logger"),new ProtocolLedger(f.authorityPath,f.key,crypto.randomUUID(),"authority")]){
      const authority=new CompletionAuthority({ledger,device:f.authority,clock:()=>f.now,current:()=>f.state.value});await expect(authority.finalize(f.logger.keyId,f.grantToken,f.completion)).rejects.toThrow();
    }
    expect(readFileSync(f.authorityPath)).toEqual(before);expect(()=>f.authorityLedger().initialize()).toThrow();
    const missing=new ProtocolLedger(join(dir,"missing-ledger.sqlite"),f.key,f.id,"authority");await expect(missing.transaction(async()=>undefined)).rejects.toThrow(/refusing to reset/);
  });
  it.each(["after-write","after-commit"] as const)("retains one authoritative finalization after failure %s",async point=>{
    const f=await fixture();await expect(f.issuer(p=>{if(p===point)throw Error("lost finalization response");}).finalize(f.logger.keyId,f.grantToken,f.completion)).rejects.toThrow(/lost/);
    if(point==="after-write")await expect(f.fresh(f.challenge())).rejects.toThrow(/terminal/);
    else expect(await f.fresh(f.challenge())).toBeTypeOf("string");
    expect(await f.finalize()).toBe(f.completion);
  });
  it("serializes competing terminal commitments and never issues freshness for the loser",async()=>{
    const f=await fixture(),other=await signProof("completion",completionClaims({...f.commitment,packetDigest:"1".repeat(64)}),f.logger);
    const results=await Promise.allSettled([f.finalize(),f.issuer().finalize(f.logger.keyId,f.grantToken,other)]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    const winner=results[0].status==="fulfilled"?f.completion:other,loser=winner===other?f.completion:other;
    expect(await f.issuer().freshness(f.receiver.keyId,f.grantToken,winner,f.challenge().nonce)).toBeTypeOf("string");await expect(f.issuer().freshness(f.receiver.keyId,f.grantToken,loser,f.challenge().nonce)).rejects.toThrow(/terminal/);
  });
  it.each(["after-write","after-commit"] as const)("recovers exact freshness evidence after failure %s without extending its clock",async point=>{
    const f=await fixture();await f.finalize();const session=f.challenge();
    await expect(f.issuer(p=>{if(p===point)throw Error("lost freshness response");}).freshness(f.receiver.keyId,f.grantToken,f.completion,session.nonce)).rejects.toThrow(/lost/);
    const retained=await f.authorityLedger().transaction(async rows=>[...rows].find(([k])=>k.includes("freshness"))?.[1]);
    expect(Boolean(retained)).toBe(point==="after-commit");f.state.now+=1000;
    const spy=vi.spyOn(crypto.subtle,"sign");let proof:string;
    try{proof=await f.fresh(session);if(retained){expect(proof).toBe(retained);expect(spy).not.toHaveBeenCalled();}else expect(spy).toHaveBeenCalledOnce();}finally{spy.mockRestore();}
    expect(await f.inspect(session,proof!)).toMatchObject({checkedAt:retained?f.now:f.state.now});
  });
  it("recovers persisted logger signature after a lost response without re-signing",async()=>{
    const f=await fixture(),path=join(dir,crypto.randomUUID()+"-pending.sqlite");
    const journal=(fault?:(p:StoragePoint)=>void)=>new NfcCommitJournal(path,f.key,f.id,{fault});journal().initialize();
    await journal().save(f.scope,"b",f.b,null);await journal().complete(f.scope,"b",f.b.finalImage(),f.bKey);
    const sign=(store:NfcCommitJournal)=>retainLoggerCompletion({grantToken:f.grantToken,trust:f.trust,logger:f.logger,journal:store,operationId:"b",sectionKey:f.bKey,image:f.b.finalImage()});
    await expect(sign(journal(p=>{if(p==="after-commit")throw Error("lost signature response");}))).rejects.toThrow(/lost/);
    const saved=(await journal().restore(f.scope,"b",f.bKey)).closure!.token,spy=vi.spyOn(crypto.subtle,"sign");
    try{expect(await sign(journal())).toBe(saved);expect(spy).not.toHaveBeenCalled();}finally{spy.mockRestore();}
  });
  it("binds freshness to one challenge, recipient and completion, with no clock extension",async()=>{
    const f=await fixture();await f.finalize();const session=f.challenge(),proof=await f.fresh(session);expect(await f.fresh(session)).toBe(proof);
    await expect(f.inspect(f.challenge(),proof)).rejects.toThrow(/replayed/);
    const forged=await signProof("freshness",freshnessClaims({grantId:f.grantId,grantDigest:await tokenDigest(f.grantToken),completionDigest:await tokenDigest(f.completion),receiverId:f.receiver.keyId,challenge:session.nonce,epoch:7,issuedAt:f.now,expiresAt:f.now+60001}),f.authority);await expect(f.inspect(session,forged)).rejects.toThrow(/replayed/);
    f.state.now=f.now-1;await expect(f.inspect(session,proof)).rejects.toThrow();f.state.now=f.now+60000;await expect(f.inspect(session,proof)).rejects.toThrow(/stale/);await expect(f.fresh(session)).rejects.toThrow(/stale/);
    const later=f.challenge();expect(await f.inspect(later,await f.fresh(later))).toMatchObject({checkedAt:f.state.now});
  });
  it("consumes a challenge atomically for one proof even under concurrent inspection",async()=>{
    const f=await fixture();await f.finalize();const session=f.challenge(),first=await f.fresh(session);
    // Deliberately bypass the issuer's immutable nonce ledger with its test key.
    const second=await signProof("freshness",freshnessClaims({grantId:f.grantId,grantDigest:await tokenDigest(f.grantToken),completionDigest:await tokenDigest(f.completion),receiverId:f.receiver.keyId,challenge:session.nonce,epoch:7,issuedAt:f.now,expiresAt:f.now+59999}),f.authority);
    const results=await Promise.allSettled([f.inspect(session,first),f.inspect(session,second)]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect((results.find(r=>r.status==="rejected") as PromiseRejectedResult).reason.message).toMatch(/consumed/);
  });
  it("refuses current evidence after revocation or authority changes during commit",async()=>{
    const f=await fixture();await f.finalize();f.state.value.enabled=false;await expect(f.fresh(f.challenge())).rejects.toThrow(/revoked/);
    f.state.value.enabled=true;f.state.value.trust.epoch++;await expect(f.fresh(f.challenge())).rejects.toThrow(/epoch/);f.state.value.trust.epoch--;
    const session=f.challenge();await expect(f.issuer(p=>{if(p==="after-write")f.state.value.enabled=false;}).freshness(f.receiver.keyId,f.grantToken,f.completion,session.nonce)).rejects.toThrow(/revoked/);
    f.state.value.enabled=true;expect(await f.fresh(session)).toBeTypeOf("string");
    const g=await fixture();await expect(g.issuer(p=>{if(p==="after-write")g.state.value.trust.epoch++;}).finalize(g.logger.keyId,g.grantToken,g.completion)).rejects.toThrow(/changed/);g.state.value.trust.epoch--;await expect(g.fresh(g.challenge())).rejects.toThrow(/terminal/);
  });
  it("does not confuse valid old B, changed ciphertext or mixed A with current selection",async()=>{
    const f=await fixture();await f.finalize();const session=f.challenge(),proof=await f.fresh(session);
    for(const image of [f.a.finalImage(),(()=>{const i=f.b.finalImage();i.get(layout.b[0])![0]^=1;return i;})(),(()=>{const i=f.b.finalImage();i.get(layout.a[0])![0]^=1;return i;})()])await expect(session.inspect({grantToken:f.grantToken,completion:f.completion,freshness:proof,now:f.now,image,layout,sectionKey:f.bKey})).rejects.toThrow();
    expect(await f.inspect(session,proof)).toMatchObject({status:"current-at-authority-check"});
  });
  it("keeps signed proof domains distinct and rejects malformed canonical payloads",async()=>{
    const f=await fixture();await expect(verifyCompletion(f.grantToken,f.grantToken,f.trust)).rejects.toThrow();
    const noncanonical=await new CompactSign(new TextEncoder().encode(JSON.stringify(grantClaims(f.grant),null,2))).setProtectedHeader({alg:"ES256",typ:`${AUTH_DOMAIN}:grant`,kid:f.authority.keyId}).sign(f.authority.signKey);await expect(verifyGrant(noncanonical,f.trust)).rejects.toThrow(/Noncanonical/);
    const g=structuredClone(f.grant);(g.logger.signing as Record<string,unknown>).d="secret";expect(()=>grantClaims(g)).toThrow();
  });
  it("bounds and authenticates envelope headers even when the issuer pins malformed content",async()=>{
    const f=await fixture();const bad=await new CompactEncrypt(bytes([AUTH_DOMAIN,"section-key",f.grantId,f.scope.uid,f.scope.patientId,f.scope.referralId,1,1,"receiver","b",f.receiver.keyId,f.bRaw.toString("hex")])).setProtectedHeader({alg:"ECDH-ES",enc:"A256GCM",typ:"wrong",kid:f.receiver.keyId}).encrypt(await importJWK(f.receiver.encryption,"ECDH-ES"));
    const grant=structuredClone(f.grant);grant.envelopes[2].digest=await tokenDigest(bad);const grantToken=await signProof("grant",grantClaims(grant),f.authority);
    await expect(openKeyEnvelope({grantToken,trust:f.trust,token:bad,device:f.receiver,role:"receiver",section:"b"})).rejects.toThrow(/type/);
    await expect(openKeyEnvelope({grantToken,trust:f.trust,token:"x".repeat(8193),device:f.receiver,role:"receiver",section:"b"})).rejects.toThrow(/Oversized/);
  });
  it("measures every actual wire token and framing without borrowing Section C",async()=>{
    const f=await fixture();await f.finalize();const session=f.challenge(),proof=await f.fresh(session),budget=measureAuthorization(f.grantToken,f.completion,proof,f.envelopes);
    expect(budget.grant.signatureOrTagBytes).toBe(64);expect(budget.completion.signatureOrTagBytes).toBe(64);expect(budget.freshness.signatureOrTagBytes).toBe(64);
    expect(budget.envelopes.map(e=>[e.nonceBytes,e.signatureOrTagBytes])).toEqual([[12,16],[12,16],[12,16]]);
    expect(budget.framedBytes).toBe(bytes([AUTH_DOMAIN,"authorization-bundle",1,f.grantToken,f.completion,proof,f.envelopes]).length);expect(budget.framedBytes).toBeGreaterThan(752);expect(budget.tagCBytesAvailable).toBe(0);
    const trustAnchorBytes=bytes(publicOnly(f.authority)).length,freshnessRequestBytes=bytes([AUTH_DOMAIN,"freshness-request",1,f.grantId,await tokenDigest(f.grantToken),await tokenDigest(f.completion),f.receiver.keyId,session.nonce]).length;
    const evidence={sample:"Synthetic short IDs; random UUID grant and full device keys. Not a universal fit claim.",...budget,trustAnchorBytes,freshnessRequestBytes,allMeasuredPayloadBytes:budget.framedBytes+trustAnchorBytes+freshnessRequestBytes,unmeasured:"TLS/HTTP/auth headers, provisioning certificates, BLE framing and hardware storage are not implemented; no total network/hardware capacity claim.",tag:{verifiedBytes:48,hypotheticalUsableBytes:752,reservedCBytes:96,descriptorsBytes:96},channels:{grant:"pre-provisioned authenticated device storage; production adapter pending",envelopes:"three pre-provisioned recipient-specific encrypted tokens; production adapter pending",completion:"authenticated end-of-journey out-of-band relay; bridge protocol pending",freshness:"online authenticated authority challenge/response; production service pending"}};
    writeFileSync(join(root,"nfc-authority-2026-11-11-budget.json"),JSON.stringify(evidence,null,2));console.info("NFC authorization wire budget",JSON.stringify(budget));
  });
});
