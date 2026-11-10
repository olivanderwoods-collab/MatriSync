// Synthetic child process only; private test keys arrive by IPC, never logs/argv.
import {importJWK,type JWK} from "jose";
import {ImportDatabase,IsolatedRecoveryImport} from "./recovery-import";
import {IsolatedRecoveryVerifier,type Authority} from "./recovery-verifier";
import {SqliteRecoveryStore,type StoragePoint} from "./recovery-sqlite";
import type {PublicDevice} from "../src/sharing-crypto";
export type ImportJob={path:string;key:string;storeId:string;approvalPath:string;approvalKey:string;approvalStoreId:string;uid:string;id:string;target:PublicDevice;decryptJwk:JWK;signJwk:JWK;authority:Authority;now:number;action:"begin"|"stage"|"finish"|"acknowledge"|"receipt";token?:string;crash?:StoragePoint};
process.once("message",async(job:ImportJob)=>{
  try{
    const target={...job.target,decryptKey:await importJWK(job.decryptJwk,"ECDH-ES",{extractable:false}) as CryptoKey,signKey:await importJWK(job.signJwk,"ES256",{extractable:false}) as CryptoKey};
    const store=new ImportDatabase(job.path,Buffer.from(job.key,"hex"),job.storeId,{fault:point=>{if(point===job.crash)process.exit(73);}});
    const verifier=new IsolatedRecoveryVerifier({store:new SqliteRecoveryStore(job.approvalPath,Buffer.from(job.approvalKey,"hex"),job.approvalStoreId),clock:()=>job.now,authority:uid=>uid===job.uid?job.authority:undefined});
    const receiver=new IsolatedRecoveryImport({uid:job.uid,target,store,verifier,clock:()=>job.now,authority:uid=>uid===job.uid?job.authority:undefined});
    const result=job.action==="begin"?await receiver.begin(job.uid,job.token!):job.action==="stage"?await receiver.stage(job.uid,job.id,job.token!):await receiver[job.action](job.uid,job.id);
    process.send?.({ok:true,result:result??null});
  }catch(error){process.send?.({ok:false,error:(error as Error).message});}
  finally{process.disconnect();}
});
process.send?.({ready:true});
