// Isolated synthetic verifier storage. Never imported by the browser application.
import {DatabaseSync} from "node:sqlite";
import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {closeSync,existsSync,openSync} from "node:fs";
import {setTimeout as delay} from "node:timers/promises";
import {RECOVERY_DOMAIN,type RecoveryStore,type Stored} from "./recovery-verifier";

const LIMIT=8*1024*1024;
export type StoragePoint="after-write"|"after-commit";
export class SqliteRecoveryStore implements RecoveryStore {
  private readonly key:Buffer;
  private readonly aad:Buffer;
  constructor(private readonly path:string,key:Uint8Array,storeId:string,private readonly options:{fault?:(point:StoragePoint)=>void; lockWaitMs?:number}={}) {
    if(key.byteLength!==32 || !/^[a-f0-9-]{36}$/.test(storeId))throw Error("Invalid isolated store configuration.");
    const wait=options.lockWaitMs??5000;
    if(!Number.isSafeInteger(wait)||wait<0||wait>30000)throw Error("Invalid lock wait.");
    this.key=Buffer.from(key);
    this.aad=Buffer.from(`${RECOVERY_DOMAIN}:sqlite-v1:${storeId}`);
  }
  // Creation is explicit and exclusive. Reopening never initializes missing state.
  initialize() {
    closeSync(openSync(this.path,"wx",0o600));
    const db=new DatabaseSync(this.path);
    try {
      db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; BEGIN IMMEDIATE");
      db.exec("CREATE TABLE recovery (id INTEGER PRIMARY KEY CHECK(id=1), envelope BLOB NOT NULL) STRICT; PRAGMA user_version=1");
      db.prepare("INSERT INTO recovery VALUES (1,?)").run(this.seal("[]"));
      db.exec("COMMIT");
    } finally {db.close();}
  }
  private seal(text:string) {
    const plaintext=Buffer.from(text);
    if(plaintext.length>LIMIT)throw Error("Isolated store capacity exceeded.");
    const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",this.key,nonce);
    cipher.setAAD(this.aad);
    return Buffer.concat([nonce,cipher.update(plaintext),cipher.final(),cipher.getAuthTag()]);
  }
  private open(envelope:unknown):Map<string,Stored> {
    if(!(envelope instanceof Uint8Array)||envelope.length<28||envelope.length>LIMIT+28)throw Error("Invalid isolated store envelope.");
    const data=Buffer.from(envelope),decipher=createDecipheriv("aes-256-gcm",this.key,data.subarray(0,12));
    decipher.setAAD(this.aad);decipher.setAuthTag(data.subarray(-16));
    const decoded:unknown=JSON.parse(Buffer.concat([decipher.update(data.subarray(12,-16)),decipher.final()]).toString("utf8"));
    if(!Array.isArray(decoded)||decoded.some(entry=>!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=="string"||!entry[1]||entry[1].offer?.request?.id!==entry[0])||new Set(decoded.map(entry=>entry[0])).size!==decoded.length)throw Error("Invalid isolated store state.");
    return new Map(decoded);
  }
  async transaction<T>(work:(records:Map<string,Stored>)=>Promise<T>,beforeCommit?:()=>void):Promise<T> {
    if(!existsSync(this.path))throw Error("Isolated recovery store missing; refusing to reset.");
    const db=new DatabaseSync(this.path);
    let active=false;
    try {
      const deadline=performance.now()+(this.options.lockWaitMs??5000);
      const waitForLock=async(work:()=>void)=>{
        for(;;){
          try{work();return;}
          catch(error){
            if((error as {errcode?:number}).errcode!==5)throw error;
            if(performance.now()>=deadline)throw Error("Recovery store busy; retry the same operation.");
            await delay(10);
          }
        }
      };
      // Opening/configuring a connection can also encounter another process's
      // exclusive commit lock. Retry that phase as well as BEGIN and COMMIT.
      await waitForLock(()=>db.exec("PRAGMA busy_timeout=0; PRAGMA synchronous=FULL"));
      await waitForLock(()=>{db.exec("BEGIN IMMEDIATE");active=true;});
      if(db.prepare("PRAGMA user_version").get()?.user_version!==1)throw Error("Unsupported isolated store version.");
      const row=db.prepare("SELECT envelope FROM recovery WHERE id=1").get();
      if(!row)throw Error("Isolated store state missing; refusing to reset.");
      const records=this.open(row.envelope),before=JSON.stringify([...records]);
      const result=await work(records),after=JSON.stringify([...records]);
      if(after!==before){
        db.prepare("UPDATE recovery SET envelope=? WHERE id=1").run(this.seal(after));
        this.options.fault?.("after-write");
      }
      await waitForLock(()=>{beforeCommit?.();db.exec("COMMIT");active=false;});
      if(after!==before)this.options.fault?.("after-commit");
      return result;
    } catch(error){
      if(active)db.exec("ROLLBACK");
      throw error;
    } finally {db.close();}
  }
}
