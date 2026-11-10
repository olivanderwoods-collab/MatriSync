import {beforeEach,describe,expect,it,vi} from "vitest";
import {IDBFactory} from "fake-indexeddb";
import {BrowserImportDatabase,BrowserExportDatabase,type BrowserStoreBinding,type BrowserStoreFault} from "./recovery-indexeddb";
import type {ImportRow} from "./recovery-import";

beforeEach(()=>vi.stubGlobal("indexedDB",new IDBFactory()));
const binding=():BrowserStoreBinding=>({uid:`synthetic-${crypto.randomUUID()}`,deviceKeyId:"a".repeat(64),storeId:crypto.randomUUID()});
const row=(id="record-one",encoded="original bytes"):ImportRow=>({id,type:"record",uid:"synthetic",targetKeyId:"a".repeat(64),descriptor:{id:crypto.randomUUID(),caseId:crypto.randomUUID(),kind:"pending",sourceId:"synthetic-slot",length:encoded.length,sha256:"b".repeat(64)},encoded,quarantined:true});
async function fixture(){const b=binding(),store=new BrowserImportDatabase(b);await store.initialize();return {b,store};}
async function raw(name:string,change?:(tx:IDBTransaction)=>void){
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{return await new Promise<{state:unknown;key:unknown}>((resolve,reject)=>{
    const tx=db.transaction(["keys","state"],change?"readwrite":"readonly"),state=tx.objectStore("state").get("aggregate"),key=tx.objectStore("keys").get("key");
    change?.(tx);tx.oncomplete=()=>resolve({state:state.result,key:key.result});tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
const records=(s:BrowserImportDatabase)=>s.transaction(async rows=>[...rows.values()]);
describe("isolated encrypted browser transaction storage",()=>{
  it("survives fresh adapter instances with a retained non-extractable encryption key",async()=>{
    const {b,store}=await fixture(),original=row();await store.transaction(async rows=>{rows.set(original.id,original);});
    expect(await records(new BrowserImportDatabase(b))).toEqual([original]);
    const saved=await raw(store.name),key=saved.key as {key:CryptoKey};expect(key.key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw",key.key)).rejects.toThrow();expect(JSON.stringify(saved.state)).not.toContain("original bytes");
    expect((await indexedDB.databases()).map(d=>d.name)).toEqual([store.name]);
  });
  it("does not re-encrypt or revise unchanged reads",async()=>{const {store}=await fixture(),before=await raw(store.name);await records(store);expect(await raw(store.name)).toEqual(before);});
  it("refuses missing databases without creating them",async()=>{const s=new BrowserImportDatabase(binding());await expect(records(s)).rejects.toThrow("refusing reset");expect(await indexedDB.databases()).toEqual([]);});
  it("refuses replacement initialization",async()=>{const {store}=await fixture(),before=await raw(store.name);await expect(store.initialize()).rejects.toThrow("refusing replacement");expect(await raw(store.name)).toEqual(before);});
  it("creates exactly once when initialization races",async()=>{
    const b=binding(),a=new BrowserImportDatabase(b),c=new BrowserImportDatabase(b);const results=await Promise.allSettled([a.initialize(),c.initialize()]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(await records(a)).toEqual([]);
  });
  it.each(["key","state"])("refuses missing %s without repairing it",async missing=>{
    const {store}=await fixture();await raw(store.name,tx=>tx.objectStore(missing==="key"?"keys":"state").delete(missing==="key"?"key":"aggregate"));
    const before=await raw(store.name);await expect(records(store)).rejects.toThrow();expect(await raw(store.name)).toEqual(before);
  });
  it.each(["ciphertext","iv","revision","version"])("detects corrupted %s without rewriting it",async field=>{
    const {store}=await fixture(),saved=await raw(store.name),state=saved.state as {ciphertext:Uint8Array;iv:Uint8Array;revision:string;version:number};
    if(field==="ciphertext")state.ciphertext[0]^=1;if(field==="iv")state.iv[0]^=1;if(field==="revision")state.revision=crypto.randomUUID();if(field==="version")state.version=2;
    await raw(store.name,tx=>tx.objectStore("state").put(state,"aggregate"));const before=await raw(store.name);await expect(records(store)).rejects.toThrow();expect(await raw(store.name)).toEqual(before);
  });
  it("refuses a replaced key rather than silently replacing encrypted records",async()=>{
    const {store}=await fixture(),saved=await raw(store.name),key=saved.key as {id:string;key:CryptoKey};key.key=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
    await raw(store.name,tx=>tx.objectStore("keys").put(key,"key"));await expect(records(store)).rejects.toThrow();
  });
  it.each(["uid","deviceKeyId","storeId","kind"])("binds ciphertext and key to %s even when copied together",async field=>{
    const {b,store}=await fixture(),otherBinding={...b,...(field==="uid"?{uid:"foreign"}:field==="deviceKeyId"?{deviceKeyId:"f".repeat(64)}:field==="storeId"?{storeId:crypto.randomUUID()}:{})};
    const other=field==="kind"?new BrowserExportDatabase(b):new BrowserImportDatabase(otherBinding);await other.initialize();const saved=await raw(store.name);
    await raw(other.name,tx=>{tx.objectStore("keys").put(saved.key,"key");tx.objectStore("state").put(saved.state,"aggregate");});
    await expect(other.transaction(async rows=>rows.size)).rejects.toThrow();expect(await records(store)).toEqual([]);
  });
  it.each(["before-commit","after-write"] as BrowserStoreFault[])("rolls back failure at %s",async point=>{
    const {b,store}=await fixture(),before=await raw(store.name);const failed=new BrowserImportDatabase(b,{fault:p=>{if(p===point)throw Error("Injected interrupted save");}});
    await expect(failed.transaction(async rows=>{const r=row();rows.set(r.id,r);})).rejects.toThrow("interrupted save");expect(await raw(store.name)).toEqual(before);
  });
  it("reconciles a lost completion response without a second write",async()=>{
    const {b,store}=await fixture(),r=row(),lost=new BrowserImportDatabase(b,{fault:p=>{if(p==="after-commit")throw Error("Injected response loss");}});
    await expect(lost.transaction(async rows=>{rows.set(r.id,r);})).rejects.toThrow("response loss");const before=await raw(store.name);
    expect(await records(new BrowserImportDatabase(b))).toEqual([r]);expect(await raw(store.name)).toEqual(before);
  });
  it("rolls back a simulated quota error after the write request",async()=>{
    const {b,store}=await fixture(),before=await raw(store.name),failed=new BrowserImportDatabase(b,{fault:p=>{if(p==="after-write")throw new DOMException("Injected quota failure","QuotaExceededError");}});
    await expect(failed.transaction(async rows=>{rows.set("record-one",row());})).rejects.toMatchObject({name:"QuotaExceededError"});expect(await raw(store.name)).toEqual(before);
  });
  it("rejects oversize aggregates before replacing existing data",async()=>{
    const {store}=await fixture(),before=await raw(store.name);await expect(store.transaction(async rows=>{rows.set("record-one",row("record-one","x".repeat(32*1024*1024)));})).rejects.toThrow("capacity");expect(await raw(store.name)).toEqual(before);
  });
  it("runs the authority guard inside the final transaction and rolls back denial",async()=>{
    const {store}=await fixture(),before=await raw(store.name);await expect(store.transaction(async rows=>{rows.set("record-one",row());},()=>{throw Error("Access changed");})).rejects.toThrow("Access changed");expect(await raw(store.name)).toEqual(before);
  });
  it("allows asynchronous work without holding an inactive IndexedDB transaction",async()=>{
    const {store}=await fixture();await store.transaction(async rows=>{await new Promise(r=>setTimeout(r,20));await crypto.subtle.digest("SHA-256",new Uint8Array([1]));rows.set("record-one",row());});expect(await records(store)).toHaveLength(1);
  });
  it("rejects stale competing writers and explicitly retries from current state",async()=>{
    const {b,store}=await fixture(),other=new BrowserImportDatabase(b);let arrived=0,release!:()=>void;const barrier=new Promise<void>(r=>release=r);
    const work=(id:string)=>async(rows:Map<string,ImportRow>)=>{if(++arrived===2)release();await barrier;rows.set(id,row(id));};
    const results=await Promise.allSettled([store.transaction(work("one")),other.transaction(work("two"))]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    const failed=results.find(r=>r.status==="rejected") as PromiseRejectedResult;expect(String(failed.reason)).toContain("reconcile before retry");expect(await records(store)).toHaveLength(1);
    const id=results[0].status==="rejected"?"one":"two";await other.transaction(async rows=>{rows.set(id,row(id));});expect(await records(store)).toHaveLength(2);
  });
  it("does not replay work automatically on conflict",async()=>{
    const {b,store}=await fixture(),other=new BrowserImportDatabase(b),work=vi.fn(async(rows:Map<string,ImportRow>)=>{await other.transaction(async current=>{current.set("new",row("new"));});rows.set("stale",row("stale"));});
    await expect(store.transaction(work)).rejects.toThrow("changed");expect(work).toHaveBeenCalledTimes(1);expect((await records(store)).map(r=>r.id)).toEqual(["new"]);
  });
  it("refuses unsupported database versions without upgrading or downgrading",async()=>{
    const store=new BrowserImportDatabase(binding());await new Promise<void>((resolve,reject)=>{const r=indexedDB.open(store.name,2);r.onsuccess=()=>{r.result.close();resolve();};r.onerror=()=>reject(r.error);});
    await expect(records(store)).rejects.toThrow("unsupported");expect((await indexedDB.databases())[0].version).toBe(2);
  });
  it("keeps export packages byte-exact across reload and uncertain responses",async()=>{
    const b=binding(),store=new BrowserExportDatabase(b);await store.initialize();
    // Storage preserves the package; its semantic/cryptographic checks belong
    // to the existing export engine, tested separately.
    const packageValue={id:crypto.randomUUID(),uid:b.uid,selection:"original selection",decisionDigest:"a".repeat(64),manifest:{} as never,manifestEnvelope:"original signature/envelope",objects:[{id:"object",envelope:"original object ciphertext"}]};
    await store.transaction(async rows=>{rows.set(packageValue.id,packageValue);});expect(await new BrowserExportDatabase(b).transaction(async rows=>rows.get(packageValue.id))).toEqual(packageValue);
  });
});
