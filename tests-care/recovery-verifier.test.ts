import {describe,expect,it} from "vitest";
import {CompactSign,compactDecrypt} from "jose";
import {newSharingDevice,type PublicDevice,type SharingDevice} from "../src/sharing-crypto";
import {IsolatedRecoveryVerifier,RECOVERY_DOMAIN,approvalClaims,closureClaims,bytes,digest,possessionClaims,requestClaims,type Approval,type ClosureStatus} from "./recovery-verifier";

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
  expect((await f.verifier.counts()).decisions).toBe(0);
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
    const recovered=await f.verifier.reconcile(f.uid,f.input.id);
    expect(recovered?.status==="approved"?recovered.cases:undefined).toEqual([f.caseId]);
    expect(recovered?.status==="approved"?recovered.epoch.keyId:undefined).toBe(f.target.keyId);
    expect((await f.verifier.counts()).decisions).toBe(1);
  });
  it("reconciles a lost response without another approval or changed time",async()=>{
    const f=await fixture();
    f.state.fault=point=>{if(point==="after-commit"){f.state.fault=undefined;throw Error("Injected lost response");}};
    await expect(f.verifier.approve(f.uid,f.submitted)).rejects.toThrow("lost response");
    const receipt=await f.verifier.reconcile(f.uid,f.input.id);
    f.state.now+=900000;f.state.enabled=false;
    expect(await f.verifier.approve(f.uid,f.submitted)).toEqual(receipt);
    expect((await f.verifier.counts()).decisions).toBe(1);
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
    expect((await f.verifier.counts()).decisions).toBe(0);
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
    expect((await f.verifier.counts()).decisions).toBe(1);
  });
  it("does not let callers mutate a request while queued or after returning it",async()=>{
    const f=await fixture(),next={...f.input,id:crypto.randomUUID()};
    const pending=f.verifier.request(f.uid,next);next.uid="changed";
    const offer=await pending,original=structuredClone(offer);offer.request.newDevice.keyId="changed";
    expect(await f.verifier.request(f.uid,{...f.input,id:original.request.id})).toEqual(original);
  });
});


async function closureFor(f:Awaited<ReturnType<typeof fixture>>,status:ClosureStatus="cancelled"){
  return {id:f.input.id,status,proof:await sign(f.original,status,closureClaims(f.offer,status))};
}
describe("isolated signed recovery closure",()=>{
  it.each(["cancelled","rejected"] as const)("persists an immutable %s outcome without an epoch",async status=>{
    const f=await fixture(),submitted=await closureFor(f,status);
    const result=await f.verifier.close(f.uid,submitted);
    expect(result).toEqual({version:1,status,id:f.input.id,uid:f.uid,requestDigest:f.offer.digest,oldKeyId:f.original.keyId,newKeyId:f.target.keyId,decidedAt:f.state.now,proofDigest:await digest(submitted.proof)});
    expect(result).not.toHaveProperty("epoch");
    expect(await f.verifier.reconcile(f.uid,f.input.id)).toEqual(result);
    await expect(f.verifier.approve(f.uid,f.submitted)).rejects.toThrow(status);
    await expect(f.verifier.request(f.uid,f.input)).rejects.toThrow(status);
    expect(await f.verifier.counts()).toEqual({requests:1,decisions:0});
    f.state.now+=900000;f.state.enabled=false;
    expect(await f.verifier.close(f.uid,submitted)).toEqual(result);
  });
  it("requires both the matching account and original-device signature",async()=>{
    const f=await fixture(),submitted=await closureFor(f);
    await expect(f.verifier.close("foreign",submitted)).rejects.toThrow("account");
    for(const device of [f.target,f.stranger])await expect(f.verifier.close(f.uid,{...submitted,proof:await sign(device,"cancelled",closureClaims(f.offer,"cancelled"),f.original.keyId)})).rejects.toThrow();
    expect(await f.verifier.reconcile(f.uid,f.input.id)).toBeUndefined();
    await f.verifier.close(f.uid,submitted);
    await expect(f.verifier.close("foreign",submitted)).rejects.toThrow("account");
    await expect(f.verifier.reconcile("foreign",f.input.id)).rejects.toThrow("account");
  });
  it("never turns malformed or unsupported commands into a terminal rejection",async()=>{
    const f=await fixture(),valid=await closureFor(f);
    for(const bad of [null,{}, {...valid,status:"approved"},{...valid,id:"bad"},{...valid,extra:true},{...valid,proof:42},{...valid,proof:"x".repeat(8193)},{...valid,proof:"x".repeat(17000)}])await expect(f.verifier.close(f.uid,bad)).rejects.toThrow();
    expect(await f.verifier.reconcile(f.uid,f.input.id)).toBeUndefined();
    expect((await f.verifier.approve(f.uid,f.submitted)).status).toBe("approved");
  });
  it.each(["purpose","key id","payload","status"])("rejects changed closure %s without poisoning a valid request",async change=>{
    const f=await fixture(),submitted=await closureFor(f),claims=closureClaims(f.offer,"cancelled");
    const proof=await sign(f.original,change==="purpose"?"approval":"cancelled",change==="payload"?[...claims,"extra"]:claims,change==="key id"?f.target.keyId:f.original.keyId);
    await expect(f.verifier.close(f.uid,{...submitted,proof,status:change==="status"?"rejected":"cancelled"})).rejects.toThrow();
    expect(await f.verifier.reconcile(f.uid,f.input.id)).toBeUndefined();
  });
  it("prevents replaying a closure into another operation",async()=>{
    const f=await fixture(),submitted=await closureFor(f),other=await f.verifier.request(f.uid,{...f.input,id:crypto.randomUUID()});
    await expect(f.verifier.close(f.uid,{...submitted,id:other.request.id})).rejects.toThrow();
    expect(await f.verifier.reconcile(f.uid,other.request.id)).toBeUndefined();
    expect(await f.verifier.reconcile(f.uid,f.input.id)).toBeUndefined();
  });
  it.each(["membership","key","expiry"])("rechecks %s immediately before closure",async change=>{
    const f=await fixture(),submitted=await closureFor(f);
    f.state.fault=point=>{if(point!=="before-commit")return;if(change==="membership")f.state.enabled=false;if(change==="key")f.state.device=publicOnly(f.stranger);if(change==="expiry")f.state.now+=600000;};
    await expect(f.verifier.close(f.uid,submitted)).rejects.toThrow();
    expect(await f.verifier.reconcile(f.uid,f.input.id)).toBeUndefined();
  });
  it.each([-1,600000,NaN])("does not create a terminal outcome with invalid time offset %s",async offset=>{
    const f=await fixture(),submitted=await closureFor(f);f.state.now+=offset;
    await expect(f.verifier.close(f.uid,submitted)).rejects.toThrow();
    expect(await f.verifier.reconcile(f.uid,f.input.id)).toBeUndefined();
  });
  it.each(["cancelled","rejected"] as const)("recovers a lost %s response with the exact signed command",async status=>{
    const f=await fixture(),submitted=await closureFor(f,status);
    f.state.fault=point=>{if(point==="after-commit")throw Error("Lost closure response");};
    await expect(f.verifier.close(f.uid,submitted)).rejects.toThrow("Lost closure response");
    const stored=await f.verifier.reconcile(f.uid,f.input.id);
    expect(await f.verifier.close(f.uid,submitted)).toEqual(stored);
  });
  it("leaves a pre-commit failure pending and still approvable",async()=>{
    const f=await fixture(),submitted=await closureFor(f);f.state.fault=()=>{throw Error("Before closure");};
    await expect(f.verifier.close(f.uid,submitted)).rejects.toThrow("Before closure");
    expect(await f.verifier.reconcile(f.uid,f.input.id)).toBeUndefined();
    f.state.fault=undefined;expect((await f.verifier.approve(f.uid,f.submitted)).status).toBe("approved");
  });
  it.each(["cancelled","rejected"] as const)("never overwrites an approval with %s",async status=>{
    const f=await fixture(),approved=await f.verifier.approve(f.uid,f.submitted);
    await expect(f.verifier.close(f.uid,await closureFor(f,status))).rejects.toThrow("Approved recovery");
    expect(await f.verifier.reconcile(f.uid,f.input.id)).toEqual(approved);
    expect(await f.verifier.approve(f.uid,f.submitted)).toEqual(approved);
  });
  it("requires identical closure bytes for retries and preserves returned snapshots",async()=>{
    const f=await fixture(),submitted=await closureFor(f),result=await f.verifier.close(f.uid,submitted),original=structuredClone(result);
    result.newKeyId="changed";result.status="rejected";
    await expect(f.verifier.close(f.uid,await closureFor(f))).rejects.toThrow("conflicts");
    await expect(f.verifier.close(f.uid,await closureFor(f,"rejected"))).rejects.toThrow("conflicts");
    expect(await f.verifier.reconcile(f.uid,f.input.id)).toEqual(original);
  });
  it("copies a closure before queueing and never reserves a device epoch when closed",async()=>{
    const f=await fixture(),submitted=await closureFor(f),copy=structuredClone(submitted);
    const pending=f.verifier.close(f.uid,submitted);submitted.proof="changed";
    expect((await pending).proofDigest).toBe(await digest(copy.proof));
    const next=await f.verifier.request(f.uid,{...f.input,id:crypto.randomUUID()});
    expect(next.request.newDevice.keyId).toBe(f.target.keyId);
  });
  it("can decline an unscoped request without granting access to any case",async()=>{
    const f=await fixture();f.state.cases=[];
    expect((await f.verifier.close(f.uid,await closureFor(f,"rejected"))).status).toBe("rejected");
    expect((await f.verifier.counts()).decisions).toBe(0);
  });
  it.each(["cancelled","rejected"] as const)("serializes equivalent concurrent %s commands",async status=>{
    const f=await fixture(),submitted=await closureFor(f,status);
    const results=await Promise.all(Array.from({length:8},()=>f.verifier.close(f.uid,submitted)));
    for(const result of results)expect(result).toEqual(results[0]);
    expect((await f.verifier.counts()).decisions).toBe(0);
  });
  it.each(["approval","closure"])("keeps the first committed %s when approval and closure compete",async first=>{
    const f=await fixture(),submitted=await closureFor(f);
    const approve=()=>f.verifier.approve(f.uid,f.submitted),close=()=>f.verifier.close(f.uid,submitted);
    const results=await Promise.allSettled(first==="approval"?[approve(),close()]:[close(),approve()]);
    expect(results[0].status).toBe("fulfilled");expect(results[1].status).toBe("rejected");
    expect((await f.verifier.reconcile(f.uid,f.input.id))?.status).toBe(first==="approval"?"approved":"cancelled");
  });
  it("does not replace cancellation with rejection when both are submitted",async()=>{
    const f=await fixture(),cancelled=await closureFor(f),rejected=await closureFor(f,"rejected");
    const results=await Promise.allSettled([f.verifier.close(f.uid,cancelled),f.verifier.close(f.uid,rejected)]);
    expect(results[0].status).toBe("fulfilled");expect(results[1].status).toBe("rejected");
    expect((await f.verifier.reconcile(f.uid,f.input.id))?.status).toBe("cancelled");
  });
});
