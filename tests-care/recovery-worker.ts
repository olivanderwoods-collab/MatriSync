// Spawned only by synthetic durability tests. Inputs arrive by IPC, never arguments/logs.
import {IsolatedRecoveryVerifier,type Approval,type Authority,type RecoveryInput} from "./recovery-verifier";
import {SqliteRecoveryStore,type StoragePoint} from "./recovery-sqlite";

export type WorkerInput={path:string;keyHex:string;storeId:string;uid:string;now:number;authority:Authority;action:"approve"|"reconcile"|"request";approval:Approval;request:RecoveryInput;crash?:StoragePoint};
process.once("message",async(message:WorkerInput)=>{
  const store=new SqliteRecoveryStore(message.path,Buffer.from(message.keyHex,"hex"),message.storeId,{fault:point=>{if(point===message.crash)process.exit(73);}});
  const verifier=new IsolatedRecoveryVerifier({store,clock:()=>message.now,authority:uid=>uid===message.uid?message.authority:undefined});
  try {
    const result=message.action==="approve"?await verifier.approve(message.uid,message.approval):message.action==="request"?await verifier.request(message.uid,message.request):await verifier.reconcile(message.uid,message.request.id);
    process.send?.({ok:true,result:result??null});
  } catch(error){process.send?.({ok:false,error:(error as Error).message});}
  finally{process.disconnect();}
});
process.send?.({ready:true});
