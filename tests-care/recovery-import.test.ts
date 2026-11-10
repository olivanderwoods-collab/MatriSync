import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {CompactEncrypt,CompactSign,compactDecrypt,compactVerify,generateKeyPair,exportJWK,importJWK,base64url} from "jose";
import {randomBytes} from "node:crypto";
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from "node:fs";
import {resolve,join,relative} from "node:path";
import {fork} from "node:child_process";
import {build} from "esbuild";
import {newSharingDevice,deviceFingerprint,publicPoint,type SharingDevice} from "../src/sharing-crypto";
import {emptyReferralFields} from "../src/referral-draft";
import {IsolatedRecoveryVerifier,RECOVERY_DOMAIN,approvalClaims,closureClaims,bytes,digest,possessionClaims} from "./recovery-verifier";
import {SqliteRecoveryStore,type StoragePoint} from "./recovery-sqlite";
import {IMPORT_DOMAIN,IMPORT_LIMIT,ImportDatabase,IsolatedRecoveryImport,manifestClaims,rawDigest,sealImportManifest,sealImportObject,verifyImportAcknowledgement,type Manifest,type Descriptor,type ImportRow} from "./recovery-import";
import type {ImportJob} from "./recovery-import-worker";

const root=resolve(".local-tools");let dir:string,worker:string;
const publicOnly=(d:SharingDevice)=>({encryption:d.encryption,signing:d.signing,keyId:d.keyId});
beforeAll(async()=>{mkdirSync(root,{recursive:true});dir=mkdtempSync(join(root,"recovery-import-"));worker=join(dir,"worker.mjs");await build({entryPoints:["tests-care/recovery-import-worker.ts"],outfile:worker,bundle:true,format:"esm",platform:"node",target:"node24",logLevel:"silent"});});
afterAll(()=>{if(dir&&relative(root,dir).startsWith("recovery-import-")&&!relative(root,dir).includes(".."))rmSync(dir,{recursive:true,force:true});});
async function fixture(terminal:"approved"|"cancelled"|"rejected"|"pending"="approved"){
  const source=await newSharingDevice(),stranger=await newSharingDevice();
  // Only disposable target fixtures are exportable for IPC. Application and
  // original device keys remain non-extractable; worker imports are non-extractable.
  const enc=await generateKeyPair("ECDH-ES",{crv:"P-256",extractable:true}),sig=await generateKeyPair("ES256",{extractable:true});
  const encryption=publicPoint(await exportJWK(enc.publicKey)),signing=publicPoint(await exportJWK(sig.publicKey));
  const target:SharingDevice={encryption,signing,keyId:await deviceFingerprint(encryption,signing),decryptKey:enc.privateKey,signKey:sig.privateKey};
  const uid=`synthetic-${crypto.randomUUID()}`,caseId=crypto.randomUUID(),id=crypto.randomUUID();
  const state={now:1794268800000,authority:{enabled:true,device:publicOnly(source),cases:[caseId]}};
  const approvalPath=join(dir,`${id}-approval.sqlite`),approvalKey=randomBytes(32),approvalStoreId=crypto.randomUUID();
  const approvalStore=new SqliteRecoveryStore(approvalPath,approvalKey,approvalStoreId);approvalStore.initialize();
  const verifier=new IsolatedRecoveryVerifier({store:approvalStore,clock:()=>state.now,authority:u=>u===uid?state.authority:undefined});
  const offer=await verifier.request(uid,{version:1,id,uid,oldKeyId:source.keyId,newDevice:publicOnly(target)});
  const nonce=JSON.parse(new TextDecoder().decode((await compactDecrypt(offer.challengeEnvelope,target.decryptKey)).plaintext))[4];
  const sign=(d:SharingDevice,purpose:string,value:unknown)=>new CompactSign(bytes(value)).setProtectedHeader({alg:"ES256",typ:`${RECOVERY_DOMAIN}:${purpose}`,kid:d.keyId}).sign(d.signKey);
  const possession=await sign(target,"possession",possessionClaims(offer,nonce));
  const submitted={id,cases:[caseId],possession,approval:await sign(source,"approval",await approvalClaims(offer,[caseId],possession))};
  const candidate={version:1 as const,status:"approved" as const,id,uid,requestDigest:offer.digest,scopeDigest:await digest([caseId]),cases:[caseId],decidedAt:state.now,epoch:{keyId:target.keyId,parentKeyId:source.keyId,device:publicOnly(target)}};
  const decision=terminal==="approved"?await verifier.approve(uid,submitted):candidate;
  if(terminal==="cancelled"||terminal==="rejected")await verifier.close(uid,{id,status:terminal,proof:await sign(source,terminal,closureClaims(offer,terminal))});
  const profile={name:"Synthetic Mother",birthDate:"",sourceLocalId:"synthetic-patient",sourceUid:uid};
  const fields={...emptyReferralFields(),remarks:"  original wording and spacing  "},handoffId=crypto.randomUUID();
  const handoff={version:1,id:handoffId,caseId,sourceUid:uid,recipientUid:"synthetic-recipient",profile,fields,packet:"original-encrypted-recipient-packet",actorName:"Synthetic Doctor",recordedAt:"2026-11-10T00:00:00.000Z"};
  const draft={version:1,caseId,sourceUid:uid,revision:crypto.randomUUID(),fields,destination:"synthetic-recipient",capacity:"32768",updatedAt:handoff.recordedAt};
  const pending={version:1,status:"pending",handoff,approvalRevision:draft.revision,capacity:32768,sourceFacility:"synthetic-facility",senderKeyId:source.keyId,recipientKeyId:stranger.keyId,entryEncrypted:"original-entry-ciphertext",grantWrapped:"original-case-key-envelope"};
  const proof=await new CompactSign(bytes(pending)).setProtectedHeader({alg:"ES256",typ:"matrisync-care+jws",kid:source.keyId}).sign(source.signKey);
  const view={id:caseId,key:"synthetic-key",profile,entries:[{id:crypto.randomUUID(),kind:"observation",actorUid:"synthetic-nurse",actorName:"Synthetic Nurse",role:"nurse",recordedAt:handoff.recordedAt,serverAt:handoff.recordedAt,text:"Manually copied observation"}],verified:false,snapshotOnly:true,receivedAt:handoff.recordedAt};
  const contents=[view,handoff,{...view,handoffId,verified:true,verifiedAt:handoff.recordedAt},draft,{value:pending,proof}];
  const kinds:Descriptor["kind"][]=["profile","outgoing","receipt","draft","pending"],sourceIds=[caseId,`outgoing:${caseId}:${handoffId}`,`receipt:${caseId}:${handoffId}`,`draft:${caseId}`,`pending:${caseId}`];
  const raws=contents.map(v=>bytes(v)),objects:Descriptor[]=[];
  for(let i=0;i<raws.length;i++)objects.push({id:crypto.randomUUID(),caseId,kind:kinds[i],sourceId:sourceIds[i],length:raws[i].length,sha256:await rawDigest(raws[i])});
  const manifest:Manifest={version:1,id,uid,requestDigest:offer.digest,decisionDigest:await digest(decision),sourceKeyId:source.keyId,targetKeyId:target.keyId,cases:[caseId],objects};
  const path=join(dir,`${id}-import.sqlite`),key=randomBytes(32),storeId=crypto.randomUUID();
  const store=new ImportDatabase(path,key,storeId);store.initialize();
  const receiver=(fault?:(point:StoragePoint)=>void)=>new IsolatedRecoveryImport({uid,target,store:new ImportDatabase(path,key,storeId,{fault}),verifier,authority:u=>u===uid?state.authority:undefined,clock:()=>state.now});
  const token=await sealImportManifest(manifest,source,target);
  const tokens=await Promise.all(objects.map((d,i)=>sealImportObject(manifest,d.id,raws[i],target)));
  const all=async()=>{const r=receiver();await r.begin(uid,token);for(const t of tokens)await r.stage(uid,id,t);return r;};
  const job=async(action:ImportJob["action"],crash?:StoragePoint):Promise<ImportJob>=>({path,key:key.toString("hex"),storeId,approvalPath,approvalKey:approvalKey.toString("hex"),approvalStoreId,uid,id,target:publicOnly(target),decryptJwk:await exportJWK(target.decryptKey),signJwk:await exportJWK(target.signKey),authority:state.authority,now:state.now,action,crash});
  return {source,target,stranger,uid,id,caseId,state,verifier,decision,manifest,raws,contents,store,path,key,storeId,receiver,token,tokens,all,job};
}
function child(job:ImportJob,ready:()=>Promise<void>=async()=>{}){return new Promise<{code:number|null;response?:{ok:boolean;result?:unknown;error?:string}}>((resolveResult,reject)=>{
  const proc=fork(worker,[],{stdio:["ignore","ignore","pipe","ipc"]});let response:{ok:boolean;result?:unknown;error?:string}|undefined;
  const timer=setTimeout(()=>{proc.kill();reject(Error("Import child timeout."));},15000);
  proc.on("message",(m:{ready?:boolean;ok:boolean;result?:unknown;error?:string})=>{if(m.ready)void ready().then(()=>{if(proc.connected)proc.send(job);});else response=m;});
  proc.on("error",e=>{clearTimeout(timer);reject(e);});proc.on("exit",code=>{clearTimeout(timer);resolveResult({code,response});});
});}
function race(jobs:ImportJob[]){let n=0,release=()=>{};const barrier=new Promise<void>(r=>{release=r;});return Promise.all(jobs.map(job=>child(job,()=>{if(++n===jobs.length)release();return barrier;})));}

describe("authenticated recovery manifest and staging",()=>{
  it("preserves exact original records and only publishes after the complete verified set",async()=>{
    const f=await fixture(),r=f.receiver();await r.begin(f.uid,f.token);
    for(let i=0;i<f.tokens.length;i++){
      expect(await r.read(f.uid,f.manifest.objects[i].sourceId)).toBeUndefined();
      await expect(r.finish(f.uid,f.id)).rejects.toThrow("incomplete");
      await r.stage(f.uid,f.id,f.tokens[i]);
    }
    const receipt=await r.finish(f.uid,f.id);expect(receipt).toMatchObject({id:f.id,objectCount:5,manifestDigest:await digest(manifestClaims(f.manifest))});
    for(let i=0;i<f.raws.length;i++){const item=await r.read(f.uid,f.manifest.objects[i].sourceId);expect(item?.bytes).toEqual(f.raws[i]);expect(item?.quarantined).toBe(i===4);}
    const pending=JSON.parse(new TextDecoder().decode((await r.read(f.uid,f.manifest.objects[4].sourceId))!.bytes));
    expect(pending).toEqual(f.contents[4]);expect(f.source.signKey.extractable).toBe(false);
    expect(await r.finish(f.uid,f.id)).toEqual(receipt);
    expect(await f.verifier.reconcile(f.uid,f.id)).toEqual(f.decision);
  });
  it.each(["pending","cancelled","rejected"] as const)("refuses a %s operation even with a valid source-signed manifest",async terminal=>{
    const f=await fixture(terminal);await expect(f.receiver().begin(f.uid,f.token)).rejects.toThrow("approved recovery");
  });
  it("rejects an incorrect signer, account or recipient device",async()=>{
    const f=await fixture();await expect(f.receiver().begin(f.uid,await sealImportManifest(f.manifest,f.stranger,f.target))).rejects.toThrow();
    await expect(f.receiver().begin("foreign",f.token)).rejects.toThrow("account");
    await expect(f.receiver().begin(f.uid,await sealImportManifest({...f.manifest,uid:"foreign"},f.source,f.target))).rejects.toThrow("account");
    await expect(f.receiver().begin(f.uid,await sealImportManifest(f.manifest,f.source,f.stranger))).rejects.toThrow();
  });
  it.each(["id","requestDigest","decisionDigest","sourceKeyId","targetKeyId"] as const)("rejects changed approved binding %s",async field=>{
    const f=await fixture(),m={...f.manifest,[field]:field==="id"?crypto.randomUUID():"0".repeat(64)};
    await expect(f.receiver().begin(f.uid,await sealImportManifest(m,f.source,f.target))).rejects.toThrow();
  });
  it("refuses unknown fields, excluded files, duplicate IDs/slots, invalid lengths and overflow",async()=>{
    const f=await fixture();
    const bad:unknown[]=[{...f.manifest,extra:true},{...f.manifest,version:2},{...f.manifest,cases:[]},{...f.manifest,cases:[f.caseId,f.caseId]},{...f.manifest,objects:[]},
      ...["file","attachment"].map(kind=>({...f.manifest,objects:[{...f.manifest.objects[0],kind}]})),
      ...[0,-1,1.5,IMPORT_LIMIT+1].map(length=>({...f.manifest,objects:[{...f.manifest.objects[0],length}]})),
      {...f.manifest,objects:[f.manifest.objects[0],f.manifest.objects[0]]},
      {...f.manifest,objects:[f.manifest.objects[0],{...f.manifest.objects[0],id:crypto.randomUUID()}]},
      {...f.manifest,objects:Array.from({length:1001},(_,i)=>({...f.manifest.objects[0],id:crypto.randomUUID(),sourceId:`slot-${i}`}))},
      {...f.manifest,cases:Array.from({length:101},()=>crypto.randomUUID())},
      {...f.manifest,objects:[{...f.manifest.objects[0],caseId:crypto.randomUUID()}]},
    ];
    for(const m of bad)await expect(f.receiver().begin(f.uid,await sealImportManifest(m as Manifest,f.source,f.target))).rejects.toThrow();
    expect(await f.store.transaction(async rows=>rows.size)).toBe(0);
  });
  it("does not accept adding an unauthorized case or silently dropping a signed object",async()=>{
    const f=await fixture(),other=crypto.randomUUID(),m={...f.manifest,cases:[f.caseId,other],objects:[...f.manifest.objects,{...f.manifest.objects[0],id:crypto.randomUUID(),caseId:other,sourceId:other}]};
    await expect(f.receiver().begin(f.uid,await sealImportManifest(m,f.source,f.target))).rejects.toThrow("approved recovery");
    const opened=JSON.parse(new TextDecoder().decode((await compactDecrypt(f.token,f.target.decryptKey)).plaintext));opened.manifest.objects.pop();
    const altered=await new CompactEncrypt(bytes(opened)).setProtectedHeader({alg:"ECDH-ES",enc:"A256GCM",typ:`${IMPORT_DOMAIN}:manifest-envelope`,kid:f.target.keyId}).encrypt(await importJWK(f.target.encryption,"ECDH-ES"));
    await expect(f.receiver().begin(f.uid,altered)).rejects.toThrow("signature binding");
  });
  it("rejects changed bytes, metadata and envelopes while keeping staged records hidden",async()=>{
    const f=await fixture(),r=f.receiver();await r.begin(f.uid,f.token);
    await expect(r.stage(f.uid,f.id,await sealImportObject(f.manifest,f.manifest.objects[0].id,bytes({changed:true}),f.target))).rejects.toThrow("hash");
    await expect(r.stage(f.uid,f.id,await sealImportObject(f.manifest,crypto.randomUUID(),f.raws[0],f.target))).rejects.toThrow("identity");
    await expect(r.stage(f.uid,crypto.randomUUID(),f.tokens[0])).rejects.toThrow("envelope");
    await expect(r.stage(f.uid,f.id,f.token)).rejects.toThrow("purpose");
    await expect(r.stage("foreign",f.id,f.tokens[0])).rejects.toThrow("account");
    expect(await r.read(f.uid,f.manifest.objects[0].sourceId)).toBeUndefined();
  });
  it.each(["patient","account","file","pending-proof"])("rejects source-signed records with invalid %s content",async change=>{
    const f=await fixture(),index=change==="pending-proof"?4:3;const value=JSON.parse(new TextDecoder().decode(f.raws[index]));
    if(change==="patient")value.caseId=crypto.randomUUID();if(change==="account")value.sourceUid="foreign";if(change==="file")value.attachment={mime:"application/pdf",bytes:"original-file"};if(change==="pending-proof")value.proof="invalid";
    const raw=bytes(value),m=structuredClone(f.manifest);m.objects[index].length=raw.length;m.objects[index].sha256=await rawDigest(raw);
    const r=f.receiver();await r.begin(f.uid,await sealImportManifest(m,f.source,f.target));
    await expect(r.stage(f.uid,f.id,await sealImportObject(m,m.objects[index].id,raw,f.target))).rejects.toThrow();
    expect(await r.read(f.uid,m.objects[index].sourceId)).toBeUndefined();
  });
  it("preserves newer destination drafts and publishes no other records on conflict",async()=>{
    const f=await fixture(),r=await f.all(),d=f.manifest.objects[3],slot=`record:${f.uid}:${f.target.keyId}:${d.sourceId}`;
    const newer={...f.contents[3],revision:crypto.randomUUID()},row:ImportRow={id:slot,type:"record",uid:f.uid,targetKeyId:f.target.keyId,descriptor:d,encoded:base64url.encode(bytes(newer)),quarantined:false};
    await f.store.transaction(async rows=>{rows.set(slot,row);});
    await expect(r.finish(f.uid,f.id)).rejects.toThrow("Destination record changed");
    expect((await r.read(f.uid,d.sourceId))?.bytes).toEqual(bytes(newer));
    expect(await r.read(f.uid,f.manifest.objects[0].sourceId)).toBeUndefined();expect(await r.receipt(f.uid,f.id)).toBeUndefined();
  });
  it("reuses identical manifests and objects but refuses a second signed version",async()=>{
    const f=await fixture(),r=await f.all();expect(await r.begin(f.uid,f.token)).toBe(await digest(manifestClaims(f.manifest)));
    await r.stage(f.uid,f.id,f.tokens[0]);
    await expect(r.begin(f.uid,await sealImportManifest({...f.manifest,objects:f.manifest.objects.slice(0,1)},f.source,f.target))).rejects.toThrow("conflicts");
    const receipt=await r.finish(f.uid,f.id);await r.stage(f.uid,f.id,f.tokens[0]);expect(await r.finish(f.uid,f.id)).toEqual(receipt);
  });
  it("signs one stable target acknowledgement only for a completed import",async()=>{
    const f=await fixture(),r=await f.all();await expect(r.acknowledge(f.uid,f.id)).rejects.toThrow("Incomplete");
    const receipt=await r.finish(f.uid,f.id),ack=await r.acknowledge(f.uid,f.id);
    const verified=await compactVerify(ack,await importJWK(f.target.signing,"ES256"));
    expect(verified.protectedHeader).toEqual({alg:"ES256",typ:`${IMPORT_DOMAIN}:ack`,kid:f.target.keyId});
    expect(JSON.parse(new TextDecoder().decode(verified.payload))).toEqual([IMPORT_DOMAIN,"ack",f.id,f.uid,f.source.keyId,f.target.keyId,receipt.manifestDigest,await digest(receipt)]);
    expect(await f.receiver().acknowledge(f.uid,f.id)).toBe(ack);
    expect(await f.verifier.reconcile(f.uid,f.id)).toEqual(f.decision);
    await expect(verifyImportAcknowledgement(ack,f.manifest,receipt,f.target)).resolves.toBeUndefined();
    await expect(verifyImportAcknowledgement(ack,f.manifest,{...receipt,completedAt:receipt.completedAt+1},f.target)).rejects.toThrow();
    await expect(verifyImportAcknowledgement(ack,f.manifest,receipt,f.stranger)).rejects.toThrow();
    await expect(verifyImportAcknowledgement(ack,{...f.manifest,id:crypto.randomUUID()},receipt,f.target)).rejects.toThrow();
  });
  it("freezes canonical positional manifest bytes independently of input order",async()=>{
    const f=await fixture(),m=f.manifest;
    const expected=[IMPORT_DOMAIN,"manifest",1,m.id,m.uid,m.requestDigest,m.decisionDigest,m.sourceKeyId,m.targetKeyId,m.cases,[...m.objects].sort((a,b)=>a.id.localeCompare(b.id)).map(d=>[d.id,d.caseId,d.kind,d.sourceId,d.length,d.sha256])];
    expect(manifestClaims(m)).toEqual(expected);
    expect(manifestClaims({...m,objects:[...m.objects].reverse()})).toEqual(expected);
    expect(await rawDigest(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("accepts the manifest's 8 MiB boundary and refuses total overflow",async()=>{
    const f=await fixture(),d={...f.manifest.objects[0],length:IMPORT_LIMIT},m={...f.manifest,objects:[d]};
    await expect(f.receiver().begin(f.uid,await sealImportManifest(m,f.source,f.target))).resolves.toBeTruthy();
    const other={...f.manifest.objects[1],length:1};
    await expect(f.receiver().begin(f.uid,await sealImportManifest({...m,objects:[d,other]},f.source,f.target))).rejects.toThrow("size limit");
    await expect(f.receiver().finish(f.uid,f.id)).rejects.toThrow("incomplete");
  });
  it("imports the full 8 MiB payload boundary without truncating packet bytes",async()=>{
    const f=await fixture(),handoff=JSON.parse(new TextDecoder().decode(f.raws[1]));handoff.packet="";
    handoff.packet="x".repeat(IMPORT_LIMIT-bytes(handoff).length);
    const raw=bytes(handoff);expect(raw.length).toBe(IMPORT_LIMIT);
    const d={...f.manifest.objects[1],length:raw.length,sha256:await rawDigest(raw)},m={...f.manifest,objects:[d]},r=f.receiver();
    await r.begin(f.uid,await sealImportManifest(m,f.source,f.target));await r.stage(f.uid,f.id,await sealImportObject(m,d.id,raw,f.target));
    await r.finish(f.uid,f.id);const restored=(await r.read(f.uid,d.sourceId))?.bytes;expect(restored?.length).toBe(raw.length);expect(restored&&Buffer.from(restored).equals(Buffer.from(raw))).toBe(true);
  },20000);
  it("accepts 1000 distinct descriptors but cannot complete without their verified bytes",async()=>{
    const f=await fixture(),objects=Array.from({length:1000},()=>{const id=crypto.randomUUID();return {...f.manifest.objects[1],id,sourceId:`outgoing:${f.caseId}:${id}`,length:1};});
    await expect(f.receiver().begin(f.uid,await sealImportManifest({...f.manifest,objects},f.source,f.target))).resolves.toBeTruthy();
    await expect(f.receiver().finish(f.uid,f.id)).rejects.toThrow("incomplete");
  });
  it("rejects a valid old proof attached to altered pending handoff bytes",async()=>{
    const f=await fixture(),value=JSON.parse(new TextDecoder().decode(f.raws[4]));value.value.handoff.packet="substituted-packet";
    const raw=bytes(value),m=structuredClone(f.manifest);m.objects[4]={...m.objects[4],length:raw.length,sha256:await rawDigest(raw)};
    const r=f.receiver();await r.begin(f.uid,await sealImportManifest(m,f.source,f.target));
    await expect(r.stage(f.uid,f.id,await sealImportObject(m,m.objects[4].id,raw,f.target))).rejects.toThrow("pending proof differs");
  });
  it("revalidates staged content before publication",async()=>{
    const f=await fixture(),r=await f.all();await f.store.transaction(async rows=>{for(const row of rows.values())if(row.type==="session")row.objects[f.manifest.objects[0].id]=base64url.encode(bytes({changed:true}));});
    await expect(r.finish(f.uid,f.id)).rejects.toThrow("integrity");expect(await r.read(f.uid,f.caseId)).toBeUndefined();
  });
  it("isolates staged and published records by account and target device",async()=>{
    const f=await fixture(),r=await f.all();await r.finish(f.uid,f.id);
    await expect(r.read("foreign",f.caseId)).rejects.toThrow("account");await expect(r.receipt("foreign",f.id)).rejects.toThrow("account");await expect(r.acknowledge("foreign",f.id)).rejects.toThrow("account");
    const other=new IsolatedRecoveryImport({uid:f.uid,target:f.stranger,store:f.store,verifier:f.verifier,authority:()=>f.state.authority,clock:()=>f.state.now});
    expect(await other.read(f.uid,f.caseId)).toBeUndefined();await expect(other.receipt(f.uid,f.id)).rejects.toThrow("unavailable");
  });
  it.each(["key","scope","clock"])("rolls back when %s changes between validation and commit",async change=>{
    const f=await fixture();await f.all();
    const r=f.receiver(point=>{if(point!=="after-write")return;if(change==="key")f.state.authority.device={...publicOnly(f.stranger),keyId:f.source.keyId};if(change==="scope")f.state.authority.cases=[];if(change==="clock")f.state.now--;});
    await expect(r.finish(f.uid,f.id)).rejects.toThrow();expect(await r.read(f.uid,f.caseId)).toBeUndefined();expect(await r.receipt(f.uid,f.id)).toBeUndefined();
  });
  it.each(["begin","stage","finish"] as const)("rolls back %s if authority changes just before durable commit",async action=>{
    const f=await fixture();if(action!=="begin")await f.receiver().begin(f.uid,f.token);if(action==="finish")for(const token of f.tokens)await f.receiver().stage(f.uid,f.id,token);
    const r=f.receiver(point=>{if(point==="after-write")f.state.authority.enabled=false;});
    await expect(action==="begin"?r.begin(f.uid,f.token):action==="stage"?r.stage(f.uid,f.id,f.tokens[0]):r.finish(f.uid,f.id)).rejects.toThrow("authority");
    expect(await r.read(f.uid,f.manifest.objects[0].sourceId)).toBeUndefined();
    f.state.authority.enabled=true;const restored=await f.all();expect((await restored.finish(f.uid,f.id)).objectCount).toBe(5);
  });
  it("keeps completed local records readable after revocation without granting new imports",async()=>{
    const f=await fixture(),r=await f.all(),receipt=await r.finish(f.uid,f.id);f.state.authority.enabled=false;
    expect(await r.receipt(f.uid,f.id)).toEqual(receipt);expect((await r.read(f.uid,f.manifest.objects[0].sourceId))?.bytes).toEqual(f.raws[0]);
    await expect(r.begin(f.uid,f.token)).rejects.toThrow("authority");
  });
});

describe("durable import restart and atomic publication",()=>{
  it.each(["begin","stage","finish","acknowledge"] as const)("resumes %s in a fresh process",async action=>{
    const f=await fixture();if(action!=="begin")await f.receiver().begin(f.uid,f.token);if(action==="finish"||action==="acknowledge")await f.all();if(action==="acknowledge")await f.receiver().finish(f.uid,f.id);
    const job=await f.job(action);job.token=action==="begin"?f.token:f.tokens[0];
    const first=await child(job);expect(first.response?.ok).toBe(true);
    const next=await child(job);expect(next.response).toEqual(first.response);
  });
  it.each(["after-write","after-commit"] as const)("recovers process exit %s during publication with all-or-none records",async point=>{
    const f=await fixture();await f.all();expect((await child(await f.job("finish",point))).code).toBe(73);
    const r=f.receiver(),before=await r.receipt(f.uid,f.id);
    expect(Boolean(before)).toBe(point==="after-commit");
    for(const d of f.manifest.objects)expect(Boolean(await r.read(f.uid,d.sourceId))).toBe(Boolean(before));
    const result=await child(await f.job("finish"));expect(result.response?.ok).toBe(true);if(before)expect(result.response?.result).toEqual(before);
  });
  it.each(["after-write","after-commit"] as const)("resumes an interrupted object save %s without publishing it",async point=>{
    const f=await fixture();await f.receiver().begin(f.uid,f.token);
    expect((await child({...await f.job("stage",point),token:f.tokens[0]})).code).toBe(73);
    expect(await f.receiver().read(f.uid,f.manifest.objects[0].sourceId)).toBeUndefined();
    const r=await f.all();expect((await r.finish(f.uid,f.id)).objectCount).toBe(5);
  });
  it("commits one receipt and acknowledgement under independent process races",async()=>{
    const f=await fixture();await f.all();const finished=await race(await Promise.all(Array.from({length:4},()=>f.job("finish"))));
    expect(finished.every(v=>v.response?.ok)).toBe(true);for(const v of finished)expect(v.response).toEqual(finished[0].response);
    const acks=await race(await Promise.all(Array.from({length:4},()=>f.job("acknowledge"))));
    expect(acks.every(v=>v.response?.ok)).toBe(true);for(const v of acks)expect(v.response).toEqual(acks[0].response);
  });
  it.each(["after-write","after-commit"] as const)("recovers acknowledgement response loss %s with original completion evidence",async point=>{
    const f=await fixture(),r=await f.all(),receipt=await r.finish(f.uid,f.id);
    expect((await child(await f.job("acknowledge",point))).code).toBe(73);
    const result=await child(await f.job("acknowledge"));expect(result.response?.ok).toBe(true);
    await verifyImportAcknowledgement(result.response?.result as string,f.manifest,receipt,f.target);
    expect((await child(await f.job("acknowledge"))).response).toEqual(result.response);
  });
  it("rolls back destination publication on storage quota failure",async()=>{
    const f=await fixture();await f.all();
    await expect(f.receiver(point=>{if(point==="after-write")throw new DOMException("Synthetic quota exhaustion","QuotaExceededError");}).finish(f.uid,f.id)).rejects.toThrow("quota");
    expect(await f.receiver().receipt(f.uid,f.id)).toBeUndefined();for(const d of f.manifest.objects)expect(await f.receiver().read(f.uid,d.sourceId)).toBeUndefined();
    expect((await f.receiver().finish(f.uid,f.id)).objectCount).toBe(5);
  });
  it("rolls back write failures and stores neither clinical text nor proofs in plaintext",async()=>{
    const f=await fixture();await f.all();
    await expect(f.receiver(point=>{if(point==="after-write")throw Error("Synthetic disk failure");}).finish(f.uid,f.id)).rejects.toThrow("disk failure");
    expect(await f.receiver().receipt(f.uid,f.id)).toBeUndefined();expect(await f.receiver().read(f.uid,f.manifest.objects[0].sourceId)).toBeUndefined();
    await f.receiver().finish(f.uid,f.id);const file=readFileSync(f.path);
    for(const text of [f.uid,"Synthetic Mother","original-encrypted-recipient-packet",f.key.toString("hex")])expect(file.includes(Buffer.from(text))).toBe(false);
  });
});
