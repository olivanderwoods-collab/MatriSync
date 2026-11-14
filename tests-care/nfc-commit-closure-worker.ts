// Synthetic child-process test only. Keys arrive over private IPC, never argv.
import {importJWK,type JWK} from "jose";
import {NfcCommitJournal} from "./nfc-commit-journal";
import {PendingTagCommit,type CommitSnapshot} from "./nfc-commit-model";
import {ReceiverChallenge} from "./nfc-commit-authority-model";
import {ReceiverEvidenceStore,type ReceiptOwner} from "./nfc-commit-receiver";
import type {Trust} from "./nfc-commit-authority-protocol";
import type {PublicDevice} from "../src/sharing-crypto";
import type {MemoryLayout} from "../src/nfc/layout";
import type {StoragePoint} from "./recovery-sqlite";
export type ClosureJob={action:"close"|"save"|"accept"|"restore";path:string;key:number[];storeId:string;sectionKey:number[];trust:Trust;grantToken:string;operationId:string;image:[number,number[]][];layout:MemoryLayout;logger:PublicDevice;loggerJwk:JWK;receiverId:string;completion:string;snapshot?:CommitSnapshot;crash?:StoragePoint|"before"};
process.once("message",async(job:ClosureJob)=>{
  try{
    if(job.crash==="before")process.exit(73);
    const sectionKey=await crypto.subtle.importKey("raw",new Uint8Array(job.sectionKey),"AES-GCM",false,["encrypt","decrypt"]);
    const options={fault:(point:StoragePoint)=>{if(point===job.crash)process.exit(73);}},image=new Map(job.image.map(([n,b])=>[n,new Uint8Array(b)]));
    let result:unknown;
    if(job.action==="close"||job.action==="save"){
      const journal=new NfcCommitJournal(job.path,new Uint8Array(job.key),job.storeId,options);
      if(job.action==="save")result=await journal.save(job.trust.scope,"b2",await PendingTagCommit.restore(job.snapshot!,sectionKey),job.operationId);
      else{
        const signKey=await importJWK(job.loggerJwk,"ES256",{extractable:false}) as CryptoKey;
        // Unused decryptKey is not supplied with any A material.
        result=await journal.closeLogger({grantToken:job.grantToken,trust:job.trust,logger:{...job.logger,signKey,decryptKey:signKey},operationId:job.operationId,sectionKey,image});
      }
    }else{
      const store=new ReceiverEvidenceStore(job.path,new Uint8Array(job.key),job.storeId,options);
      if(job.action==="restore"){
        const owner:ReceiptOwner={trust:{authority:job.trust.authority,scope:job.trust.scope,grantId:job.trust.grantId,epoch:job.trust.epoch},receiverId:job.receiverId};
        result=await store.restore("receipt",owner,sectionKey);
      }else{
        const session=new ReceiverChallenge(job.trust,job.receiverId);
        const response=new Promise<string>(resolve=>process.once("message",(r:{freshness:string})=>resolve(r.freshness)));
        process.send?.({challenge:session.nonce});
        result=await store.accept("receipt",session,{grantToken:job.grantToken,completion:job.completion,freshness:await response,now:job.trust.now,image,layout:job.layout,sectionKey});
      }
    }
    process.send?.({ok:true,result});
  }catch(error){process.send?.({ok:false,error:(error as Error).message});}
  finally{process.disconnect();}
});
process.send?.({ready:true});
