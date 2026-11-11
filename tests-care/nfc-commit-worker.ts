// Synthetic IPC fixture; key bytes never appear in arguments, logs or production.
import {NfcCommitJournal,type JournalScope} from "./nfc-commit-journal";
import {PendingTagCommit,type CommitSnapshot} from "./nfc-commit-model";
import type {StoragePoint} from "./recovery-sqlite";
export type JournalJob={path:string;storageKey:string;storeId:string;scope:JournalScope;id:string;sectionKey:number[];snapshot:CommitSnapshot;head:string|null;action:"save"|"restore"|"complete";image?:[number,number[]][];crash?:StoragePoint|"before"};
process.once("message",async(job:JournalJob)=>{
  try{
    if(job.crash==="before")process.exit(73);
    const key=await crypto.subtle.importKey("raw",new Uint8Array(job.sectionKey),"AES-GCM",false,["encrypt","decrypt"]);
    const journal=new NfcCommitJournal(job.path,Buffer.from(job.storageKey,"hex"),job.storeId,{fault:point=>{if(point===job.crash)process.exit(73);}});
    let result:unknown;
    if(job.action==="save")result=await journal.save(job.scope,job.id,await PendingTagCommit.restore(job.snapshot,key),job.head);
    else if(job.action==="complete")result=await journal.complete(job.scope,job.id,new Map((job.image??[]).map(([n,b])=>[n,new Uint8Array(b)])),key);
    else{
      const restored=await journal.restore(job.scope,job.id,key);
      result={snapshot:restored.pending.snapshot(),steps:restored.pending.steps().map(s=>({...s,bytes:[...s.bytes]})),completion:restored.completion,head:restored.head};
    }
    process.send?.({ok:true,result});
  }catch(error){process.send?.({ok:false,error:(error as Error).message});}
  finally{process.disconnect();}
});
process.send?.({ready:true});
