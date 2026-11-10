import {beforeAll,describe,expect,it,vi} from "vitest";
import {build} from "esbuild";
import {createContext,runInContext} from "node:vm";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {CompactSign,compactDecrypt} from "jose";
import {recoveryBrowserBoundary} from "../scripts/recovery-browser-boundary.mjs";
import {newSharingDevice,type SharingDevice} from "../src/sharing-crypto";
import {emptyReferralFields} from "../src/referral-draft";
import {IsolatedRecoveryVerifier,MemoryRecoveryStore,bytes,requestClaims,approvalClaims,closureClaims,possessionClaims,digest,RECOVERY_DOMAIN} from "./recovery-verifier";
import type * as Browser from "./recovery-browser";
import type {ImportRow,RecoveryTransactionStore} from "./recovery-browser";
import wire from "./recovery-wire-v1.fixture.json";

let browser:typeof Browser;
let inputs:string[];
const fetch=vi.fn(()=>{throw Error("Unexpected network call on import");});
const indexedDB=new Proxy({}, {get(){throw Error("Unexpected database access on import");}});
const buildOptions={bundle:true,write:false,format:"iife" as const,globalName:"Recovery",platform:"browser" as const,target:"es2022",logLevel:"silent" as const,metafile:true,define:{"import.meta.env":"{}","process.env.NODE_ENV":"\"test\""},plugins:[recoveryBrowserBoundary()]};
beforeAll(async()=>{
  const result=await build({...buildOptions,entryPoints:["tests-care/recovery-browser.ts"]});
  inputs=Object.keys(result.metafile!.inputs);
  // A JS realm with Web APIs and NO Node globals. This is not a rendered browser
  // or a durable browser-storage test; it exercises the actual browser bundle.
  const context=createContext({crypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,CryptoKey,structuredClone,URL,URLSearchParams,AbortController,AbortSignal,atob,btoa,setTimeout,clearTimeout,fetch,indexedDB});
  runInContext(result.outputFiles![0].text,context,{timeout:5000});
  browser=runInContext("Recovery",context) as typeof Browser;
});
const pub=(d:SharingDevice)=>({encryption:d.encryption,signing:d.signing,keyId:d.keyId});
class BrowserFixtureStore implements RecoveryTransactionStore<ImportRow>{
  private rows=new Map<string,ImportRow>();private queue:Promise<unknown>=Promise.resolve();
  fail=false;
  transaction<T>(work:(rows:Map<string,ImportRow>)=>Promise<T>,beforeCommit?:()=>void):Promise<T>{
    const task=this.queue.then(async()=>{const draft=structuredClone(this.rows),result=await work(draft);beforeCommit?.();if(this.fail)throw Error("Injected fixture commit failure");this.rows=structuredClone(draft);return result;});
    this.queue=task.catch(()=>undefined);return task;
  }
}
async function fixture(){
  const source=await newSharingDevice(),target=await newSharingDevice(),uid=`synthetic-${crypto.randomUUID()}`,id=crypto.randomUUID(),caseId=crypto.randomUUID();
  const authority={enabled:true,device:pub(source),cases:[caseId]},now=Date.now();
  const verifier=new IsolatedRecoveryVerifier({clock:()=>now,authority:u=>u===uid?authority:undefined,store:new MemoryRecoveryStore()});
  const offer=await verifier.request(uid,{version:1,id,uid,oldKeyId:source.keyId,newDevice:pub(target)});
  const nonce=JSON.parse(new TextDecoder().decode((await compactDecrypt(offer.challengeEnvelope,target.decryptKey)).plaintext))[4];
  const sign=(d:SharingDevice,purpose:string,value:unknown)=>new CompactSign(browser.bytes(value)).setProtectedHeader({alg:"ES256",typ:`${browser.RECOVERY_DOMAIN}:${purpose}`,kid:d.keyId}).sign(d.signKey);
  const possession=await sign(target,"possession",browser.possessionClaims(offer,nonce));
  const decision=await verifier.approve(uid,{id,cases:[caseId],possession,approval:await sign(source,"approval",await browser.approvalClaims(offer,[caseId],possession))});
  const fields={...emptyReferralFields(),remarks:"  original wording — বাংলা  "};
  const draft={version:1,caseId,sourceUid:uid,revision:crypto.randomUUID(),fields,destination:"",capacity:"",updatedAt:"2026-11-10T00:00:00.000Z"};
  const handoff={version:1,id:crypto.randomUUID(),caseId,sourceUid:uid,recipientUid:"synthetic-recipient",profile:{name:"Synthetic Mother",birthDate:"",sourceLocalId:"synthetic",sourceUid:uid},fields,packet:"original-encrypted-packet",actorName:"Synthetic Doctor",recordedAt:draft.updatedAt};
  const pending={version:1,status:"pending",handoff,approvalRevision:draft.revision,capacity:32768,sourceFacility:"synthetic-facility",senderKeyId:source.keyId,recipientKeyId:target.keyId,entryEncrypted:"original-entry",grantWrapped:"original-grant"};
  const proof=await new CompactSign(bytes(pending)).setProtectedHeader({alg:"ES256",typ:"matrisync-care+jws",kid:source.keyId}).sign(source.signKey);
  const raws=[new TextEncoder().encode(JSON.stringify(draft,null,2)),new TextEncoder().encode(JSON.stringify({value:pending,proof},null,2))];
  const objects=await Promise.all(raws.map(async(raw,i)=>({id:crypto.randomUUID(),caseId,sourceId:`${i?"pending":"draft"}:${caseId}`,kind:i?"pending" as const:"draft" as const,length:raw.length,sha256:await browser.rawDigest(raw)})));
  const manifest:Browser.Manifest={version:1,id,uid,requestDigest:offer.digest,decisionDigest:await browser.digest(decision),sourceKeyId:source.keyId,targetKeyId:target.keyId,cases:[caseId],objects};
  const envelope=await browser.sealImportManifest(manifest,source,target),tokens=await Promise.all(raws.map((raw,i)=>browser.sealImportObject(manifest,objects[i].id,raw,target)));
  const store=new BrowserFixtureStore();
  const receiver=()=>new browser.IsolatedRecoveryImport({uid,target,store,verifier,authority:u=>u===uid?authority:undefined,clock:()=>now});
  return {uid,id,caseId,source,target,offer,nonce,possession,manifest,raws,envelope,tokens,store,receiver,authority};
}
describe("isolated recovery browser boundary",()=>{
  it("bundles the complete browser entry without Node or verifier infrastructure",()=>{
    expect(inputs).toContain("tests-care/recovery-protocol.ts");expect(inputs).toContain("tests-care/recovery-export.ts");expect(inputs).toContain("tests-care/recovery-import.ts");
    expect(inputs.some(p=>/recovery-(sqlite|databases|emulator|verifier|.*worker)\./.test(p))).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    for(const name of ["ImportDatabase","ExportDatabase","IsolatedRecoveryVerifier","EmulatorRecoveryBoundary","emulatorAccount","initialize"])expect(name in browser).toBe(false);
  });
  it.each(["node:sqlite","fs","./tests-care/recovery-databases","./tests-care/recovery-emulator","./tests-care/recovery-verifier","./tests-care/recovery-import-worker"])("rejects even an unused import of %s",async path=>{
    await expect(build({...buildOptions,stdin:{contents:`import ${JSON.stringify(path)}; export const harmless=1;`,resolveDir:process.cwd(),loader:"ts"}})).rejects.toThrow("Privileged dependency is forbidden");
  });
  it("rejects a nested privileged dependency",async()=>{
    await expect(build({...buildOptions,stdin:{contents:'import "./tests-care/recovery-browser-negative";',resolveDir:process.cwd(),loader:"ts"},plugins:[{name:"nested-negative-fixture",setup(b){b.onResolve({filter:/recovery-browser-negative$/},()=>({path:"negative-fixture",namespace:"fixture"}));b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:'import "node:crypto";',loader:"js"}));}},recoveryBrowserBoundary()]})).rejects.toThrow("Privileged dependency is forbidden");
  });
  it("keeps original canonical claims and digests unchanged across the browser bundle",async()=>{
    const f=await fixture();
    expect(browser.bytes(browser.requestClaims(f.offer.request))).toEqual(bytes(requestClaims(f.offer.request)));
    expect(browser.possessionClaims(f.offer,f.nonce)).toEqual(possessionClaims(f.offer,f.nonce));
    expect(await browser.approvalClaims(f.offer,[f.caseId],f.possession)).toEqual(await approvalClaims(f.offer,[f.caseId],f.possession));
    expect(browser.closureClaims(f.offer,"cancelled")).toEqual(closureClaims(f.offer,"cancelled"));
    expect(await browser.digest(browser.requestClaims(f.offer.request))).toBe(await digest(requestClaims(f.offer.request)));
    expect(browser.RECOVERY_DOMAIN).toBe(RECOVERY_DOMAIN);
  });
  it("matches frozen v1 bytes captured from the pre-separation commit",async()=>{
    const offer={...wire.offer,request:{...wire.offer.request,version:1 as const}};
    const actual={request:browser.requestClaims(offer.request),possession:browser.possessionClaims(offer,wire.nonce),approval:await browser.approvalClaims(offer,wire.cases,wire.possession),cancelled:browser.closureClaims(offer,"cancelled"),rejected:browser.closureClaims(offer,"rejected")};
    for(const name of Object.keys(actual) as (keyof typeof actual)[]){
      expect(JSON.stringify(actual[name])).toBe(wire.expected[name].json);
      expect(await browser.digest(actual[name])).toBe(wire.expected[name].sha256);
    }
  });
  it("stages, retries and publishes exact original bytes with pending values quarantined",async()=>{
    const f=await fixture(),receiver=f.receiver();await receiver.begin(f.uid,f.envelope);
    await receiver.stage(f.uid,f.id,f.tokens[0]);expect(await receiver.read(f.uid,f.manifest.objects[0].sourceId)).toBeUndefined();
    await expect(receiver.finish(f.uid,f.id)).rejects.toThrow("incomplete");
    const resumed=f.receiver();await resumed.begin(f.uid,f.envelope);await resumed.stage(f.uid,f.id,f.tokens[0]);await resumed.stage(f.uid,f.id,f.tokens[1]);
    f.store.fail=true;await expect(resumed.finish(f.uid,f.id)).rejects.toThrow("commit failure");f.store.fail=false;
    expect(await resumed.read(f.uid,f.manifest.objects[0].sourceId)).toBeUndefined();
    const receipt=await resumed.finish(f.uid,f.id);expect(await f.receiver().finish(f.uid,f.id)).toEqual(receipt);
    for(let i=0;i<2;i++){const result=await resumed.read(f.uid,f.manifest.objects[i].sourceId);expect(result?.bytes).toEqual(f.raws[i]);expect(result?.quarantined).toBe(i===1);}
    const ack=await resumed.acknowledge(f.uid,f.id);await browser.verifyImportAcknowledgement(ack,f.manifest,receipt,f.target);expect(await f.receiver().acknowledge(f.uid,f.id)).toBe(ack);
    await expect(resumed.read("foreign-account",f.manifest.objects[0].sourceId)).rejects.toThrow("account");
    expect(f.source.decryptKey.extractable).toBe(false);expect(f.target.signKey.extractable).toBe(false);expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps changed-authority and corrupted-envelope refusals in the browser bundle",async()=>{
    const f=await fixture(),receiver=f.receiver();await receiver.begin(f.uid,f.envelope);
    await expect(receiver.stage(f.uid,f.id,f.tokens[0].slice(0,-8)+"AAAAAAAA")).rejects.toThrow();
    f.authority.enabled=false;await expect(receiver.stage(f.uid,f.id,f.tokens[0])).rejects.toThrow("authority");
    expect(await receiver.read(f.uid,f.manifest.objects[0].sourceId)).toBeUndefined();
  });
  it("keeps the public app source separate from isolated recovery entry points",async()=>{
    const source=readFileSync(resolve("src/main.tsx"),"utf8");expect(source).not.toContain("recovery-browser");
    // Real public entry graph; imports remain unexecuted and nothing is emitted.
    const graph=await build({entryPoints:["src/main.tsx"],bundle:true,write:false,outdir:"unused",metafile:true,platform:"browser",format:"esm",logLevel:"silent",external:["*.wasm"],loader:{".svg":"dataurl",".png":"dataurl"},define:{"import.meta.env":"{}","process.env.NODE_ENV":"\"production\""}});
    expect(Object.keys(graph.metafile!.inputs).some(p=>p.startsWith("tests-care/")||p.includes("scripts/identity/"))).toBe(false);
  });
});
