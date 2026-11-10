import {describe,expect,it} from "vitest";
import {CompactSign,compactDecrypt} from "jose";
import {newSharingDevice,type PublicDevice,type SharingDevice} from "../src/sharing-crypto";
import {IsolatedRecoveryVerifier,RECOVERY_DOMAIN,approvalClaims,bytes,digest,possessionClaims,requestClaims,type Approval} from "./recovery-verifier";

const publicOnly=(device:SharingDevice):PublicDevice=>({encryption:device.encryption,signing:device.signing,keyId:device.keyId});
async function sign(device:SharingDevice,purpose:string,value:unknown,kid=device.keyId){
  return new CompactSign(bytes(value)).setProtectedHeader({alg:"ES256",typ:`${RECOVERY_DOMAIN}:${purpose}`,kid}).sign(device.signKey);
}
async function fixture(){
  const original=await newSharingDevice(),target=await newSharingDevice(),stranger=await newSharingDevice();
  const uid=`synthetic-${crypto.randomUUID()}`,caseId=crypto.randomUUID();
  const state={now:1794268800000,enabled:true,device:publicOnly(original),cases:[caseId],fault:undefined as undefined|((point:"before-commit"|"after-commit")=>void)};
  const verifier=new IsolatedRecoveryVerifier({clock:()=>state.now,authority:id=>id===uid?{enabled:state.enabled,device:state.device,cases:state.cases}:undefined,fault:point=>state.fault?.(point)});
  const input={version:1 as const,id:crypto.randomUUID(),uid,oldKeyId:original.keyId,newDevice:publicOnly(target)};
  const offer=await verifier.request(uid,input);
  const opened=await compactDecrypt(offer.challengeEnvelope,target.decryptKey,{keyManagementAlgorithms:["ECDH-ES"],contentEncryptionAlgorithms:["A256GCM"]});
  expect(opened.protectedHeader.typ).toBe(`${RECOVERY_DOMAIN}:challenge`);
  expect(opened.protectedHeader.kid).toBe(target.keyId);
  const challenge=JSON.parse(new TextDecoder().decode(opened.plaintext));
  expect(challenge.slice(0,4)).toEqual([RECOVERY_DOMAIN,"challenge",offer.request.id,offer.digest]);
  const nonce=challenge[4] as string;
  const possession=await sign(target,"possession",possessionClaims(offer,nonce));
  const approval=await sign(original,"approval",await approvalClaims(offer,[caseId],possession));
  const submitted:Approval={id:input.id,cases:[caseId],possession,approval};
  return {uid,caseId,original,target,stranger,state,verifier,input,offer,nonce,submitted};
}
async function rejected(f:Awaited<ReturnType<typeof fixture>>,submitted:unknown=f.submitted){
  await expect(f.verifier.approve(f.uid,submitted)).rejects.toThrow();
  expect(await f.verifier.reconcile(f.uid,f.input.id)).toBeUndefined();
  expect((await await f.verifier.counts()).decisions).toBe(0);
}

describe("isolated original-device recovery verifier",()=>{
  it("binds canonical request bytes and approves only the exact authorized scope",async()=>{
    const f=await fixture();
    expect(f.offer.digest).toBe(await digest(requestClaims(f.offer.request)));
    expect(requestClaims(f.offer.request).slice(0,6)).toEqual([RECOVERY_DOMAIN,"request",1,f.input.id,f.uid,f.original.keyId]);
    expect(f.offer.request.expiresAt-f.offer.request.createdAt).toBe(600000);
    expect(f.offer.request.challenge).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(f.offer)).not.toContain(f.nonce);
    const result=await f.verifier.approve(f.uid,f.submitted);
    expect(result).toMatchObject({id:f.input.id,uid:f.uid,status:"approved",cases:[f.caseId],requestDigest:f.offer.digest,scopeDigest:await digest([f.caseId]),epoch:{keyId:f.target.keyId,parentKeyId:f.original.keyId}});
    expect(f.original.decryptKey.extractable).toBe(false);expect(f.target.signKey.extractable).toBe(false);
    expect(f.state.device).toEqual(publicOnly(f.original));
    expect(await f.verifier.counts()).toEqual({requests:1,decisions:1});
  });
  it("does not treat sign-in or possession by the new browser as original approval",async()=>{
    const f=await fixture();
    await rejected(f,{...f.submitted,approval:""});
    await rejected(f,{...f.submitted,approval:await sign(f.target,"approval",await approvalClaims(f.offer,[f.caseId],f.submitted.possession),f.original.keyId)});
  });
  it("requires the new encryption key as well as its signing key",async()=>{
    const f=await fixture();
    await expect(compactDecrypt(f.offer.challengeEnvelope,f.stranger.decryptKey)).rejects.toThrow();
    const possession=await sign(f.target,"possession",possessionClaims(f.offer,"guessed-nonce"));
    await rejected(f,{...f.submitted,possession,approval:await sign(f.original,"approval",await approvalClaims(f.offer,[f.caseId],possession))});
  });
  it("requires the new signing key as well as its encryption key",async()=>{
    const f=await fixture();
    const possession=await sign(f.stranger,"possession",possessionClaims(f.offer,f.nonce),f.target.keyId);
    await rejected(f,{...f.submitted,possession,approval:await sign(f.original,"approval",await approvalClaims(f.offer,[f.caseId],possession))});
  });
  it("rejects wrong account access to requests, approvals and receipts",async()=>{
    const f=await fixture();
    await expect(f.verifier.request("foreign",f.input)).rejects.toThrow("account");
    await expect(f.verifier.approve("foreign",f.submitted)).rejects.toThrow("account");
    await expect(f.verifier.reconcile("foreign",f.input.id)).rejects.toThrow("account");
    expect(await f.verifier.counts()).toEqual({requests:1,decisions:0});
  });
  it("rejects scope substitution, duplicates, unknown fields and excess size",async()=>{
    const f=await fixture();
    for(const cases of [[crypto.randomUUID()],[f.caseId,f.caseId],[],Array.from({length:101},()=>crypto.randomUUID())])await rejected(f,{...f.submitted,cases});
    await rejected(f,{...f.submitted,approvedBy:f.uid});
    await rejected(f,{...f.submitted,approval:"x".repeat(33000)});
  });
  it("rejects a signed but currently unassigned case",async()=>{
    const f=await fixture(),cases=[crypto.randomUUID()];
    await rejected(f,{...f.submitted,cases,approval:await sign(f.original,"approval",await approvalClaims(f.offer,cases,f.submitted.possession))});
  });
  it.each(["purpose","key identifier","payload"])('rejects changed proof %s',async change=>{
    const f=await fixture(),claims=await approvalClaims(f.offer,[f.caseId],f.submitted.possession);
    const approval=await sign(f.original,change==="purpose"?"other-purpose":"approval",change==="payload"?[...claims,"extra"]:claims,change==="key identifier"?f.stranger.keyId:f.original.keyId);
    await rejected(f,{...f.submitted,approval});
  });
  it.each([600000,-1])("rejects expiry or backwards time at offset %s",async offset=>{
    const f=await fixture();f.state.now+=offset;await rejected(f);
  });
  it.each(["membership","case","key","expiry"])("rechecks %s after cryptographic verification and before commit",async change=>{
    const f=await fixture();
    f.state.fault=point=>{if(point!=="before-commit")return;if(change==="membership")f.state.enabled=false;if(change==="case")f.state.cases=[];if(change==="key")f.state.device=publicOnly(f.stranger);if(change==="expiry")f.state.now+=600000;};
    await rejected(f);
  });
  it("returns one immutable result to concurrent exact approvals",async()=>{
    const f=await fixture();
    const results=await Promise.all(Array.from({length:8},()=>f.verifier.approve(f.uid,f.submitted)));
    expect(results.every(value=>JSON.stringify(value)===JSON.stringify(results[0]))).toBe(true);
    results[0].cases.push(crypto.randomUUID());results[0].epoch.device.keyId="changed";
    expect((await f.verifier.reconcile(f.uid,f.input.id))?.cases).toEqual([f.caseId]);
    expect((await f.verifier.reconcile(f.uid,f.input.id))?.epoch.keyId).toBe(f.target.keyId);
    expect((await await f.verifier.counts()).decisions).toBe(1);
  });
  it("reconciles a lost response without another approval or changed time",async()=>{
    const f=await fixture();
    f.state.fault=point=>{if(point==="after-commit"){f.state.fault=undefined;throw Error("Injected lost response");}};
    await expect(f.verifier.approve(f.uid,f.submitted)).rejects.toThrow("lost response");
    const receipt=await f.verifier.reconcile(f.uid,f.input.id);
    f.state.now+=900000;f.state.enabled=false;
    expect(await f.verifier.approve(f.uid,f.submitted)).toEqual(receipt);
    expect((await await f.verifier.counts()).decisions).toBe(1);
    await expect(f.verifier.approve(f.uid,{...f.submitted,cases:[crypto.randomUUID()]})).rejects.toThrow("conflicts");
  });
  it("keeps a pre-commit failure pending and retries the original request",async()=>{
    const f=await fixture();f.state.fault=()=>{f.state.fault=undefined;throw Error("Injected before commit");};
    await rejected(f);
    expect(await f.verifier.request(f.uid,f.input)).toEqual(f.offer);
    expect((await f.verifier.approve(f.uid,f.submitted)).id).toBe(f.input.id);
  });
  it("rejects changed requests, private keys and forged fingerprints without new state",async()=>{
    const f=await fixture();
    const bad=[{...f.input,version:2},{...f.input,extra:true},{...f.input,newDevice:{...publicOnly(f.target),decryptKey:"private"}},{...f.input,newDevice:{...publicOnly(f.target),encryption:{...f.target.encryption,d:"private"}}},{...f.input,id:crypto.randomUUID(),newDevice:{...publicOnly(f.target),keyId:"0".repeat(64)}}];
    for(const value of bad)await expect(f.verifier.request(f.uid,value)).rejects.toThrow();
    await expect(f.verifier.request(f.uid,{...f.input,newDevice:publicOnly(f.stranger)})).rejects.toThrow("conflicts");
    expect(await f.verifier.counts()).toEqual({requests:1,decisions:0});
  });
  it("does not accept proof replay into another operation",async()=>{
    const f=await fixture(),second=await f.verifier.request(f.uid,{...f.input,id:crypto.randomUUID()});
    await expect(f.verifier.approve(f.uid,{...f.submitted,id:second.request.id})).rejects.toThrow();
    expect((await await f.verifier.counts()).decisions).toBe(0);
  });
  it("binds original approval to the exact new-device possession proof",async()=>{
    const f=await fixture();
    const possession=await sign(f.target,"possession",possessionClaims(f.offer,f.nonce));
    expect(possession).not.toBe(f.submitted.possession);
    await rejected(f,{...f.submitted,possession});
  });
  it("normalizes equivalent scope ordering without permitting added cases",async()=>{
    const f=await fixture(),cases=[f.caseId,crypto.randomUUID()];f.state.cases=cases;
    const approval=await sign(f.original,"approval",await approvalClaims(f.offer,cases,f.submitted.possession));
    const first=await f.verifier.approve(f.uid,{...f.submitted,cases,approval});
    expect(first.cases).toEqual([...cases].sort());
    expect(await f.verifier.approve(f.uid,{...f.submitted,cases:[...cases].reverse(),approval})).toEqual(first);
  });
  it("refuses absent authority, unchanged target identity and invalid verifier clocks",async()=>{
    const f=await fixture();
    f.state.enabled=false;
    await expect(f.verifier.request(f.uid,{...f.input,id:crypto.randomUUID()})).rejects.toThrow("authority");
    f.state.enabled=true;
    await expect(f.verifier.request(f.uid,{...f.input,id:crypto.randomUUID(),newDevice:publicOnly(f.original)})).rejects.toThrow("different device");
    for(const now of [NaN,-1,Number.MAX_SAFE_INTEGER]){
      f.state.now=now;
      await expect(f.verifier.request(f.uid,{...f.input,id:crypto.randomUUID()})).rejects.toThrow("clock");
    }
    expect(await f.verifier.counts()).toEqual({requests:1,decisions:0});
  });
  it("does not create a second epoch for one target using another valid operation",async()=>{
    const f=await fixture();await f.verifier.approve(f.uid,f.submitted);
    const second=await f.verifier.request(f.uid,{...f.input,id:crypto.randomUUID()});
    const opened=await compactDecrypt(second.challengeEnvelope,f.target.decryptKey);
    const nonce=JSON.parse(new TextDecoder().decode(opened.plaintext))[4] as string;
    const possession=await sign(f.target,"possession",possessionClaims(second,nonce));
    await expect(f.verifier.approve(f.uid,{id:second.request.id,cases:[f.caseId],possession,approval:await sign(f.original,"approval",await approvalClaims(second,[f.caseId],possession))})).rejects.toThrow("already approved");
    expect(await f.verifier.reconcile(f.uid,second.request.id)).toBeUndefined();
    expect((await await f.verifier.counts()).decisions).toBe(1);
  });
  it("does not let callers mutate a request while queued or after returning it",async()=>{
    const f=await fixture(),next={...f.input,id:crypto.randomUUID()};
    const pending=f.verifier.request(f.uid,next);next.uid="changed";
    const offer=await pending,original=structuredClone(offer);offer.request.newDevice.keyId="changed";
    expect(await f.verifier.request(f.uid,{...f.input,id:original.request.id})).toEqual(original);
  });
});
