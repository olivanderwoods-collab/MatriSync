// ISOLATED encrypted historical receipts. No current-state restoration or send.
import {EncryptedRecoveryDatabase,type StoragePoint} from "./recovery-sqlite";
import {ReceiverChallenge,verifyReceiverEvidence,type ReceiverEvidence,type ReceiverInput} from "./nfc-commit-authority-model";
import type {Trust} from "./nfc-commit-authority-protocol";

export type ReceiptOwner={trust:Omit<Trust,"now">;receiverId:string};
type Receipt={id:string;owner:ReceiptOwner;evidence:ReceiverEvidence};
const json=(v:unknown)=>JSON.stringify(v);
const ownerOf=(e:ReceiverEvidence):ReceiptOwner=>({trust:{authority:e.trust.authority,scope:e.trust.scope,grantId:e.trust.grantId,epoch:e.trust.epoch},receiverId:e.receiverId});
const keyOf=(owner:ReceiptOwner,id:string)=>json([owner.trust.scope.uid,owner.trust.scope.patientId,owner.trust.scope.referralId,owner.receiverId,owner.trust.grantId,id]);
function decode(v:unknown):Map<string,Receipt>{
  if(!Array.isArray(v))throw Error("Invalid receiver evidence store.");
  const rows=new Map<string,Receipt>();
  for(const pair of v){
    if(!Array.isArray(pair)||pair.length!==2)throw Error("Invalid receiver evidence row.");
    const [key,r]=pair as [string,Receipt];
    if(!r||typeof r.id!=="string"||!r.id||r.id.length>200||r.evidence?.version!==1||json(r.owner)!==json(ownerOf(r.evidence))||key!==keyOf(r.owner,r.id)||rows.has(key))throw Error("Invalid receiver evidence identity.");
    rows.set(key,r);
  }
  return rows;
}
export class ReceiverEvidenceStore {
  readonly #db:EncryptedRecoveryDatabase<Receipt>;
  constructor(path:string,key:Uint8Array,storeId:string,options:{fault?:(point:StoragePoint)=>void;lockWaitMs?:number}={}){
    this.#db=new EncryptedRecoveryDatabase(path,key,storeId,{version:1,purpose:"matrisync-isolated-nfc-receiver-v1",limit:8*1024*1024,decode},options);
  }
  initialize(){this.#db.initialize();}
  async accept(id:string,session:ReceiverChallenge,input:ReceiverInput){
    if(typeof id!=="string"||!id||id.length>200)throw Error("Explicit receipt identity required.");
    const {evidence}=await session.capture(input),owner=ownerOf(evidence),record:Receipt={id,owner,evidence};
    return this.#db.transaction(async rows=>{
      const key=keyOf(owner,id),old=rows.get(key);
      if(old){
        // Retry at a later time retains the first observed acceptance time.
        const retry={...record,evidence:{...evidence,acceptedAt:old.evidence.acceptedAt}};
        if(json(old)!==json(retry))throw Error("Receipt ID conflicts with immutable evidence.");
        return structuredClone(old);
      }
      // A challenge cannot acquire different evidence under an alternative ID.
      for(const prior of rows.values())if(json(prior.owner)===json(owner)&&prior.evidence.challenge===evidence.challenge){
        if(prior.evidence.freshness!==evidence.freshness||prior.evidence.completion!==evidence.completion)throw Error("Retained challenge conflicts with immutable evidence.");
      }
      rows.set(key,record);return structuredClone(record);
    });
  }
  async restore(id:string,ownerInput:ReceiptOwner,sectionKey:CryptoKey){
    const owner=structuredClone(ownerInput);
    return this.#db.transaction(async rows=>{
      const record=rows.get(keyOf(owner,id));
      if(!record||json(record.owner)!==json(owner))throw Error("Receipt missing or outside pinned receiver authority; refusing to reset.");
      const verified=await verifyReceiverEvidence(record.evidence,sectionKey);
      return{status:"historical-authority-evidence" as const,receipt:structuredClone(record),...verified};
    });
  }
}
