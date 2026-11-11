// ISOLATED NODE MODEL. No browser imports, device driver, grants or key custody.
import {EncryptedRecoveryDatabase,type StoragePoint} from "./recovery-sqlite";
import {PendingTagCommit,packetDigest,type CommitSnapshot,type TagImage} from "./nfc-commit-model";
import {referralBinding} from "../src/nfc/sections";

export type JournalScope={uid:string;patientId:string;referralId:string};
type Operation={kind:"operation";scope:JournalScope;id:string;previousId:string|null;snapshot:CommitSnapshot};
export type Completion={kind:"completion";scope:JournalScope;id:string;operationDigest:string;imageDigest:string;status:"confirmed-in-model"};
type Row=Operation|Completion|{kind:"head";scope:JournalScope;id:string};
const json=(v:unknown)=>JSON.stringify(v);
const digest=(v:unknown)=>packetDigest(new TextEncoder().encode(json(v)));
const validId=(id:unknown):id is string=>typeof id==="string"&&id.length>0&&id.length<=256;
function scopeCopy(s:JournalScope):JournalScope{
  if(!s||!validId(s.uid)||!validId(s.patientId)||!validId(s.referralId))throw Error("Explicit account/patient/referral scope required.");
  return{uid:s.uid,patientId:s.patientId,referralId:s.referralId};
}
const rowKey=(kind:Row["kind"],scope:JournalScope,id?:string)=>json([kind,scope.uid,scope.patientId,scope.referralId,...(kind==="head"?[]:[id])]);
function decode(value:unknown):Map<string,Row>{
  if(!Array.isArray(value))throw Error("Invalid NFC journal state.");
  const rows=new Map<string,Row>();
  for(const pair of value){
    if(!Array.isArray(pair)||pair.length!==2||typeof pair[0]!=="string")throw Error("Invalid NFC journal row.");
    const r=pair[1] as Row,s=scopeCopy(r?.scope);
    if(!["operation","completion","head"].includes(r.kind)||!validId(r.id)||rowKey(r.kind,s,r.id)!==pair[0]||rows.has(pair[0]))throw Error("Invalid or duplicate NFC journal identity.");
    if(r.kind==="operation"&&(!r.snapshot||r.snapshot.version!==1||(r.previousId!==null&&!validId(r.previousId))))throw Error("Invalid retained operation.");
    if(r.kind==="completion"&&(r.status!=="confirmed-in-model"||!/^[a-f0-9]{64}$/.test(r.operationDigest)||!/^[a-f0-9]{64}$/.test(r.imageDigest)))throw Error("Invalid completion evidence.");
    rows.set(pair[0],r);
  }
  // Every retained operation must belong to exactly one complete head chain.
  // Missing rows, cycles and disconnected/forked operations are corruption.
  const visited=new Set<string>();
  for(const r of rows.values())if(r.kind==="head"){
    let id:string|null=r.id;
    while(id!==null){
      const key=rowKey("operation",r.scope,id),op=rows.get(key);
      if(visited.has(key)||op?.kind!=="operation")throw Error("Broken NFC journal chain.");
      visited.add(key);
      if(op.previousId!==null&&!rows.has(rowKey("completion",r.scope,op.previousId)))throw Error("Uncompleted NFC journal predecessor.");
      id=op.previousId;
    }
  }
  for(const r of rows.values())if(r.kind!=="head"&&!visited.has(rowKey("operation",r.scope,r.id)))throw Error("Orphan NFC journal evidence.");
  return rows;
}

export class NfcCommitJournal {
  readonly #db:EncryptedRecoveryDatabase<Row>;
  constructor(path:string,storageKey:Uint8Array,storeId:string,options:{fault?:(point:StoragePoint)=>void;lockWaitMs?:number}={}){
    this.#db=new EncryptedRecoveryDatabase(path,storageKey,storeId,{version:1,purpose:"matrisync-isolated-nfc-journal-v1",limit:8*1024*1024,decode},options);
  }
  initialize(){this.#db.initialize();}
  private async bind(scope:JournalScope,snapshot:CommitSnapshot){
    const binding=await referralBinding(scope.patientId,scope.referralId);
    if(json([...binding])!==json(snapshot.expected.context.binding))throw Error("Operation belongs to a different patient/referral.");
  }
  // Call before any explicit transport work. This model itself has no transport.
  async save(scopeInput:JournalScope,id:string,pending:PendingTagCommit,expectedHead:string|null){
    const scope=scopeCopy(scopeInput),snapshot=pending.snapshot();
    if(!validId(id)||(expectedHead!==null&&!validId(expectedHead)))throw Error("Invalid operation/head identity.");
    await this.bind(scope,snapshot);
    const record:Operation={kind:"operation",scope,id,previousId:expectedHead,snapshot};
    return this.#db.transaction(async rows=>{
      const key=rowKey("operation",scope,id),existing=rows.get(key);
      if(existing){if(json(existing)!==json(record))throw Error("Operation ID conflicts with immutable original.");return structuredClone(existing as Operation);}
      const head=rows.get(rowKey("head",scope));
      if((head?.id??null)!==expectedHead)throw Error("Stale journal head; reconcile the retained operation.");
      if(head){
        const prior=rows.get(rowKey("operation",scope,head.id)) as Operation;
        const complete=rows.get(rowKey("completion",scope,head.id));
        if(complete?.kind!=="completion"||complete.operationDigest!==await digest(prior)||complete.imageDigest!==await digest(snapshot.before))throw Error("Predecessor is pending or baseline differs from completed evidence.");
        if(json(prior.snapshot.layout)!==json(snapshot.layout))throw Error("Layout changed within the referral journal.");
        const old=prior.snapshot.expected.context,next=snapshot.expected.context;
        if(next.section!=="b"||(old.section==="b"&&(next.sequence!==old.sequence+1||json(snapshot.previous)!==json(prior.snapshot.expected)))||(old.section==="a"&&(next.sequence!==1||json(snapshot.original)!==json(prior.snapshot.expected))))throw Error("Cannot replace A or advance a stale generation.");
      }
      rows.set(key,record);rows.set(rowKey("head",scope),{kind:"head",scope,id});
      return structuredClone(record);
    });
  }
  async restore(scopeInput:JournalScope,id:string,sectionKey:CryptoKey){
    const scope=scopeCopy(scopeInput);
    return this.#db.transaction(async rows=>{
      const record=rows.get(rowKey("operation",scope,id));
      if(record?.kind!=="operation")throw Error("Operation missing in this account/referral; refusing to reset.");
      await this.bind(scope,record.snapshot);
      const pending=await PendingTagCommit.restore(record.snapshot,sectionKey);
      const completion=rows.get(rowKey("completion",scope,id));
      if(completion){
        if(completion.kind!=="completion"||completion.operationDigest!==await digest(record)||completion.imageDigest!==await digest([...pending.finalImage()].map(([n,b])=>[n,[...b]])))throw Error("Completion evidence conflicts with original operation.");
      }
      return{pending,completion:completion?structuredClone(completion as Completion):null,head:rows.get(rowKey("head",scope))!.id};
    });
  }
  async complete(scopeInput:JournalScope,id:string,image:TagImage,sectionKey:CryptoKey){
    const scope=scopeCopy(scopeInput),read=new Map([...image].map(([n,b])=>[n,b.slice()]));
    return this.#db.transaction(async rows=>{
      const record=rows.get(rowKey("operation",scope,id));
      if(record?.kind!=="operation")throw Error("Operation missing in this account/referral.");
      await this.bind(scope,record.snapshot);
      const pending=await PendingTagCommit.restore(record.snapshot,sectionKey);
      if((await pending.reconcile(read,sectionKey)).status!=="confirmed-in-model")throw Error("Exact approved final readback required; operation remains pending.");
      const evidence:Completion={kind:"completion",scope,id,operationDigest:await digest(record),imageDigest:await digest([...pending.finalImage()].map(([n,b])=>[n,[...b]])),status:"confirmed-in-model"};
      const key=rowKey("completion",scope,id),existing=rows.get(key);
      if(existing){if(json(existing)!==json(evidence))throw Error("Immutable completion conflicts.");return structuredClone(evidence);}
      if(rows.get(rowKey("head",scope))?.id!==id)throw Error("Stale operation cannot complete or advance the journal.");
      rows.set(key,evidence);return structuredClone(evidence);
    });
  }
}
