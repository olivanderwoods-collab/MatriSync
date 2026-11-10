// Isolated browser persistence only. Never opens the application's databases.
import {IMPORT_DOMAIN,type ImportRow} from "./recovery-import";
import type {ExportPackage} from "./recovery-export";
import type {RecoveryTransactionStore} from "./recovery-protocol";
import {object,uuidPattern,uidPattern,hashPattern} from "./recovery-import-records";

export type BrowserStoreBinding={uid:string;deviceKeyId:string;storeId:string};
type Envelope={version:1;revision:string;iv:Uint8Array;ciphertext:Uint8Array};
type KeyRecord={id:string;key:CryptoKey};
export type BrowserStoreFault="before-commit"|"after-write"|"after-commit";
type Options={fault?:(point:BrowserStoreFault)=>void};
const limit=32*1024*1024;
const encoder=new TextEncoder();
const equal=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.every((v,i)=>v===b[i]);

class BrowserRecoveryDatabase<Row> implements RecoveryTransactionStore<Row>{
  readonly name:string;
  private readonly binding:BrowserStoreBinding;
  constructor(binding:BrowserStoreBinding,kind:"import"|"export",private readonly decode:(value:unknown)=>Map<string,Row>,private readonly options:Options={}){
    object(binding,["uid","deviceKeyId","storeId"]);
    if(!uidPattern.test(binding.uid)||!hashPattern.test(binding.deviceKeyId)||!uuidPattern.test(binding.storeId))throw Error("Invalid isolated browser store binding.");
    this.binding={...binding};
    this.name=`matrisync-isolated-recovery-${kind}-v1:${binding.uid}:${binding.deviceKeyId}:${binding.storeId}`;
  }
  private aad(revision:string,keyId:string){return encoder.encode(JSON.stringify([IMPORT_DOMAIN,"indexeddb-v1",this.name,this.binding.uid,this.binding.deviceKeyId,this.binding.storeId,revision,keyId]));}
  private envelope(value:unknown):Envelope{
    object(value,["version","revision","iv","ciphertext"]);
    if(value.version!==1||typeof value.revision!=="string"||!uuidPattern.test(value.revision)||!(value.iv instanceof Uint8Array)||value.iv.length!==12||!(value.ciphertext instanceof Uint8Array)||value.ciphertext.length<16||value.ciphertext.length>limit+16)throw Error("Invalid isolated browser ciphertext.");
    return value as Envelope;
  }
  private key(value:unknown):KeyRecord{
    object(value,["id","key"]);
    if(typeof value.id!=="string"||!uuidPattern.test(value.id)||!(value.key instanceof CryptoKey)||value.key.type!=="secret"||value.key.extractable||value.key.algorithm.name!=="AES-GCM"||(value.key.algorithm as AesKeyAlgorithm).length!==256||[...value.key.usages].sort().join()!=="decrypt,encrypt")throw Error("Isolated browser storage key missing or invalid; refusing replacement.");
    return value as KeyRecord;
  }
  private async seal(text:string,key:KeyRecord):Promise<Envelope>{
    const raw=encoder.encode(text);if(raw.length>limit)throw Error("Isolated browser store capacity exceeded.");
    const revision=crypto.randomUUID(),iv=crypto.getRandomValues(new Uint8Array(12));
    const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:this.aad(revision,key.id)},key.key,raw));
    return {version:1,revision,iv,ciphertext};
  }
  private async openExisting(){
    if(!(await indexedDB.databases()).some(db=>db.name===this.name&&db.version===1))throw Error("Isolated browser store missing or unsupported; refusing reset.");
    return new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open(this.name,1);let cancelled=false;
      request.onupgradeneeded=()=>request.transaction?.abort();
      request.onblocked=()=>{cancelled=true;reject(Error("Isolated browser store is blocked."));};
      request.onerror=()=>reject(request.error??Error("Cannot open isolated browser store."));
      request.onsuccess=()=>{
        const db=request.result;
        if(cancelled||[...db.objectStoreNames].sort().join()!=="keys,state"){db.close();reject(Error("Unsupported isolated browser schema."));return;}
        db.onversionchange=()=>db.close();resolve(db);
      };
    });
  }
  async initialize(){
    if((await indexedDB.databases()).some(db=>db.name===this.name))throw Error("Isolated browser store already exists; refusing replacement.");
    const key={id:crypto.randomUUID(),key:await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"])};
    const envelope=await this.seal("[]",key);
    await new Promise<void>((resolve,reject)=>{
      const request=indexedDB.open(this.name,1);let created=false,cancelled=false;
      request.onblocked=()=>{cancelled=true;reject(Error("Isolated browser initialization is blocked."));};
      request.onerror=()=>reject(request.error??Error("Isolated browser initialization failed."));
      request.onupgradeneeded=event=>{
        if(cancelled||event.oldVersion!==0){request.transaction?.abort();return;}
        created=true;request.result.createObjectStore("keys").add(key,"key");request.result.createObjectStore("state").add(envelope,"aggregate");
      };
      request.onsuccess=()=>{request.result.close();if(!created||cancelled)reject(Error("Isolated browser store already exists; refusing replacement."));else resolve();};
    });
  }
  private snapshot(db:IDBDatabase):Promise<{key:KeyRecord;envelope:Envelope}>{
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(["keys","state"],"readonly");
      const key=tx.objectStore("keys").get("key"),state=tx.objectStore("state").get("aggregate");
      tx.onabort=()=>reject(tx.error??Error("Isolated browser read interrupted."));
      tx.oncomplete=()=>{try{resolve({key:this.key(key.result),envelope:this.envelope(state.result)});}catch(error){reject(error);}};
    });
  }
  async transaction<Result>(work:(rows:Map<string,Row>)=>Promise<Result>,beforeCommit?:()=>void):Promise<Result>{
    const db=await this.openExisting();
    try{
      const original=await this.snapshot(db);
      const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:original.envelope.iv.slice(),additionalData:this.aad(original.envelope.revision,original.key.id)},original.key.key,original.envelope.ciphertext.slice());
      const rows=this.decode(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(plain))),before=JSON.stringify([...rows]);
      const result=await work(rows),after=JSON.stringify([...rows]);
      // All asynchronous crypto/work happens OUTSIDE the IndexedDB transaction.
      this.decode(JSON.parse(after));
      const next=after===before?undefined:await this.seal(after,original.key);
      if(next)this.options.fault?.("before-commit");
      await new Promise<void>((resolve,reject)=>{
        const tx=db.transaction(["keys","state"],"readwrite",{durability:"strict"});
        let failure:unknown;
        const abort=(error:unknown)=>{failure=error;tx.abort();};
        const key=tx.objectStore("keys").get("key"),state=tx.objectStore("state").get("aggregate");
        state.onsuccess=()=>{
          try{
            const current=this.envelope(state.result),currentKey=this.key(key.result);
            if(currentKey.id!==original.key.id||current.revision!==original.envelope.revision||!equal(current.iv,original.envelope.iv)||!equal(current.ciphertext,original.envelope.ciphertext))throw Error("Isolated browser store changed; reconcile before retry.");
            beforeCommit?.();
            if(next){
              const put=tx.objectStore("state").put(next,"aggregate");
              put.onsuccess=()=>{try{this.options.fault?.("after-write");beforeCommit?.();}catch(error){abort(error);}};
            }
          }catch(error){abort(error);}
        };
        tx.onabort=()=>reject(failure??tx.error??Error("Isolated browser save interrupted."));
        tx.oncomplete=()=>resolve();
      });
      if(next)this.options.fault?.("after-commit");
      return result;
    }finally{db.close();}
  }
}
export class BrowserImportDatabase extends BrowserRecoveryDatabase<ImportRow>{
  constructor(binding:BrowserStoreBinding,options:Options={}){
    super(binding,"import",value=>{
      if(!Array.isArray(value)||value.some(row=>!Array.isArray(row)||row.length!==2||typeof row[0]!=="string"||!row[1]||row[1].id!==row[0]||!["session","record"].includes(row[1].type))||new Set(value.map(row=>row[0])).size!==value.length)throw Error("Invalid isolated import state.");
      return new Map(value);
    },options);
  }
}
export class BrowserExportDatabase extends BrowserRecoveryDatabase<ExportPackage>{
  constructor(binding:BrowserStoreBinding,options:Options={}){
    super(binding,"export",value=>{
      if(!Array.isArray(value)||value.some(row=>!Array.isArray(row)||row.length!==2||typeof row[0]!=="string"||!row[1]||row[1].id!==row[0])||new Set(value.map(row=>row[0])).size!==value.length)throw Error("Invalid isolated export state.");
      return new Map(value);
    },options);
  }
}
