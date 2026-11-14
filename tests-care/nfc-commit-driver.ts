// SYNTHETIC TRANSPORT ONLY. No BLE, serial, NFC, firmware or hardware access.
import {NfcCommitJournal,type JournalScope,type WriteLease} from "./nfc-commit-journal";
import {PendingTagCommit,type TagImage,type WriteStep} from "./nfc-commit-model";
const copy=(image:TagImage)=>new Map([...image].map(([n,b])=>[n,new Uint8Array(b)]));
const json=(value:unknown)=>JSON.stringify(value);
const guardedExchange=Symbol("synthetic guarded exchange");
export type SyntheticFault={step:number;cut?:number;lostAck?:boolean;badReadback?:boolean};

// Binding and fence are synthetic fixture state, not an attested UID/bridge.
// Reconstructing this object loses its fence: a real gateway needs persistent,
// rollback-resistant fencing and command-drain guarantees before deployment.
export class SyntheticTagPort {
  readonly #binding:{storeId:string;scope:JournalScope;transportId:string;tagId:string};
  #image:Map<number,Uint8Array>;
  #fence=0;
  #token="";
  #writes:WriteStep[]=[];
  constructor(binding:{storeId:string;scope:JournalScope;transportId:string;tagId:string},image:TagImage){this.#binding=structuredClone(binding);this.#image=copy(image);}
  read(){return copy(this.#image);}
  get writes(){return this.#writes.map(s=>({...s,bytes:new Uint8Array(s.bytes)}));}
  async [guardedExchange](lease:WriteLease,pending:PendingTagCommit,key:CryptoKey,options:{fault?:SyntheticFault;beforeStep?:(step:number)=>Promise<void>}={}){
    const handle=structuredClone(lease),fault=options.fault?structuredClone(options.fault):undefined,beforeStep=options.beforeStep;
    if(json(this.#binding)!==json({storeId:handle.storeId,scope:handle.scope,transportId:handle.transportId,tagId:handle.tagId}))throw Error("Synthetic target differs from the leased journal/tag binding.");
    if(handle.fence<this.#fence||(handle.fence===this.#fence&&handle.token!==this.#token))throw Error("Synthetic gateway rejected a stale fence.");
    if(fault&&(!Number.isInteger(fault.step)||fault.step<0||(fault.cut!==undefined&&(!Number.isInteger(fault.cut)||fault.cut<0||fault.cut>16))))throw Error("Invalid synthetic fault.");
    this.#fence=handle.fence;this.#token=handle.token;
    // A lost final acknowledgement is reconciled without writing again.
    if((await pending.reconcile(this.read(),key)).status==="confirmed-in-model")return this.read();
    const session=pending.retryFrom(this.read()).begin();let index=0;
    for(let step=session.next();step;step=session.next()){
      await beforeStep?.(index);
      if(handle.fence!==this.#fence||handle.token!==this.#token)throw Error("Synthetic gateway fence changed before command application.");
      const cut=fault?.step===index?fault.cut:undefined;
      const current=this.#image.get(step.block);if(!current)throw Error("Synthetic target block missing.");
      current.set(step.bytes.subarray(0,cut??16));this.#writes.push({...step,bytes:new Uint8Array(step.bytes)});
      if(cut!==undefined)throw Error("Synthetic interrupted block; fresh readback and explicit retry required.");
      if(fault?.step===index&&fault.lostAck)throw Error("Synthetic acknowledgement lost after write.");
      const read=this.read();if(fault?.step===index&&fault.badReadback)read.get(step.block)![0]^=1;
      session.acceptReadback(read);index++;
    }
    return this.read();
  }
}

export class SyntheticNfcDriver {
  constructor(private readonly journal:NfcCommitJournal,private readonly port:SyntheticTagPort){}
  run(input:WriteLease,key:CryptoKey,options:Parameters<SyntheticTagPort[typeof guardedExchange]>[3]={}){
    const lease=structuredClone(input),settings={...options,fault:options.fault?structuredClone(options.fault):undefined};
    return this.journal.runWithWriteLease(lease,key,pending=>this.port[guardedExchange](lease,pending,key,settings));
  }
}
