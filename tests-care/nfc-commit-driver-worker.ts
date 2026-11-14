// Private IPC test fixture. No production identity export, hardware or network.
import {importJWK,type JWK} from "jose";
import {CompletionAuthority,ProtocolLedger} from "./nfc-commit-authority-model";
import {NfcCommitJournal} from "./nfc-commit-journal";
import type {Trust} from "./nfc-commit-authority-protocol";
import type {StoragePoint} from "./recovery-sqlite";
export type DriverJob={action:"acquire"|"lease-state"|"finalize"|"freshness";path:string;key:number[];storeId:string;sectionKey:number[];trust:Trust;grantToken:string;completion:string;authorityJwk:JWK;loggerId:string;receiverId:string;challenge:string;operationId:string;transportId:string;tagId:string;expectedFence:number;crash?:"before"|StoragePoint};
process.once("message",async(job:DriverJob)=>{
  try{
    if(job.crash==="before")process.exit(73);
    const fault=(point:StoragePoint)=>{if(point===job.crash)process.exit(73);};let result:unknown;
    if(job.action==="acquire"||job.action==="lease-state"){
      const journal=new NfcCommitJournal(job.path,new Uint8Array(job.key),job.storeId,{fault}),key=await crypto.subtle.importKey("raw",new Uint8Array(job.sectionKey),"AES-GCM",false,["encrypt","decrypt"]);
      result=job.action==="acquire"?await journal.acquireWriteLease(job.trust.scope,job.operationId,key,{transportId:job.transportId,tagId:job.tagId},job.expectedFence):(await journal.restore(job.trust.scope,job.operationId,key)).lease;
    }else{
      const signKey=await importJWK(job.authorityJwk,"ES256",{extractable:false}) as CryptoKey;
      const issuer=new CompletionAuthority({ledger:new ProtocolLedger(job.path,new Uint8Array(job.key),job.storeId,"authority",{fault}),device:{...job.trust.authority,signKey,decryptKey:signKey},clock:()=>job.trust.now,current:()=>({enabled:true,grantToken:job.grantToken,trust:job.trust})});
      result=job.action==="finalize"?await issuer.finalize(job.loggerId,job.grantToken,job.completion):await issuer.freshness(job.receiverId,job.grantToken,job.completion,job.challenge);
    }
    process.send?.({ok:true,result});
  }catch(error){process.send?.({ok:false,error:(error as Error).message});}
  finally{process.disconnect();}
});
process.send?.({ready:true});
