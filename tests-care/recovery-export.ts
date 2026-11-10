// Isolated exporter. Source access is read-only; prepared packages are durably
// saved in a separate encrypted store so retries never regenerate signatures.
import {checkPublicDevice,type PublicDevice} from "../src/sharing-crypto";
import {type Authority,type RecoveryReconciler,type RecoveryTransactionStore,digest} from "./recovery-protocol";
import {rawDigest,sealImportManifest,sealImportObject,type Manifest} from "./recovery-import";
import {sourceChoices,sourceIdentity,sourceSession,captureSourceSelection} from "./recovery-source";
import {uuidPattern} from "./recovery-import-records";

export type ExportPackage={id:string;uid:string;selection:string;decisionDigest:string;manifest:Manifest;manifestEnvelope:string;objects:{id:string;envelope:string}[]};
const pub=(v:PublicDevice)=>({encryption:v.encryption,signing:v.signing,keyId:v.keyId});
export class IsolatedRecoveryExport{
  constructor(private readonly options:{store:RecoveryTransactionStore<ExportPackage>;verifier:RecoveryReconciler;authority:(uid:string)=>Authority|undefined}){}
  async prepare(uid:string,id:string,value:unknown):Promise<ExportPackage>{
    if(!uuidPattern.test(id))throw Error("Invalid recovery operation.");
    const choices=sourceChoices(value),selection=JSON.stringify(choices),session=await sourceSession(uid);
    const decision=await this.options.verifier.reconcile(uid,id);
    if(!decision||decision.status!=="approved"||decision.uid!==uid||decision.epoch.parentKeyId!==session.device.keyId)throw Error("Source export requires its original approved recovery operation.");
    const cases=[...new Set(choices.map(c=>sourceIdentity(c.sourceId).caseId))].sort();
    if(!cases.every(c=>decision.cases.includes(c)))throw Error("Selected cases were not approved for recovery.");
    await checkPublicDevice(decision.epoch.device);
    const guard=()=>{
      session.guard();const current=this.options.authority(uid);
      if(!current?.enabled||JSON.stringify(pub(current.device))!==JSON.stringify(pub(session.device))||!cases.every(c=>current.cases.includes(c)))throw Error("Current source identity or case authority changed.");
    };
    guard();const decisionDigest=await digest(decision);
    return this.options.store.transaction(async rows=>{
      const existing=rows.get(id);
      if(existing){if(existing.uid!==uid||existing.selection!==selection||existing.decisionDigest!==decisionDigest)throw Error("Prepared export conflicts; retain its original selection.");return structuredClone(existing);}
      const captured=await captureSourceSelection(uid,choices,session.device);
      const objects:Manifest["objects"]=[];
      for(const item of captured)objects.push({id:crypto.randomUUID(),sourceId:item.sourceId,caseId:item.caseId,kind:item.kind,length:item.raw.length,sha256:await rawDigest(item.raw)});
      const manifest:Manifest={version:1,id,uid,requestDigest:decision.requestDigest,decisionDigest,sourceKeyId:session.device.keyId,targetKeyId:decision.epoch.keyId,cases,objects};
      const manifestEnvelope=await sealImportManifest(manifest,session.device,decision.epoch.device),envelopes:ExportPackage["objects"]=[];
      for(let i=0;i<captured.length;i++)envelopes.push({id:objects[i].id,envelope:await sealImportObject(manifest,objects[i].id,captured[i].raw,decision.epoch.device)});
      const result:ExportPackage={id,uid,selection,decisionDigest,manifest,manifestEnvelope,objects:envelopes};
      rows.set(id,result);return structuredClone(result);
    },guard);
  }
}
