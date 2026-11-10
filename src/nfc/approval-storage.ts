import { CompactSign } from "jose";
import { careAccount } from "../care-storage";
import { jsonBytes, verifyCare, wrapCare, unwrapCare } from "../care-crypto";
import { existingSharingDevice } from "../sharing-storage";
import { validateCompactApproval, type CompactApproval } from "./approval";

const DB = "matrisync-compact-approvals-v1";
async function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("records"); r.result.createObjectStore("heads"); };
    r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); resolve(r.result); };
    r.onerror = r.onblocked = () => reject(Error("Unable to open compact approval storage. No saved data was reset."));
  });
}
function guard(auth: Awaited<ReturnType<typeof careAccount>>, uid: string) {
  if (auth.currentUser?.uid !== uid || auth.currentUser.isAnonymous) throw Error("Sign in to the original approval account.");
}
async function readRaw(uid: string, patientId: string, id?: string) {
  const auth = await careAccount(uid), db = await open();
  return new Promise<{head: string | null; sealed?: string}>((resolve, reject) => {
    const tx = db.transaction(["heads", "records"], "readonly"); let head: string | null = null, sealed: string | undefined;
    const h = tx.objectStore("heads").get([uid,patientId]);
    h.onsuccess = () => {
      try {
        guard(auth,uid); head = h.result ?? null;
        if (head !== null && typeof head !== "string") throw Error("Invalid approval head.");
        const target = id || head;
        if (target) { const r = tx.objectStore("records").get([uid,patientId,target]); r.onsuccess = () => { sealed = r.result; }; }
      } catch { tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); try { guard(auth,uid); if ((id || head) && (typeof sealed !== "string" || sealed.length > 1048576)) throw Error("Saved compact approval is missing or damaged. No replacement was created."); resolve({head,sealed}); } catch(e) {reject(e);} };
    tx.onabort = tx.onerror = () => { db.close(); reject(Error("Unable to read the original compact approval.")); };
  });
}
async function decode(uid: string, patientId: string, id: string, sealed: string) {
  const device = await existingSharingDevice(uid);
  if (!device) throw Error("The original device key is missing. No replacement key was created.");
  const wrapped = await unwrapCare(uid,sealed);
  if (!wrapped || typeof wrapped.proof !== "string" || wrapped.kind !== "matrisync-compact-approval-v1") throw Error("Invalid compact approval envelope.");
  const value = await verifyCare(wrapped.proof,device) as CompactApproval;
  await validateCompactApproval(value,uid,patientId);
  if (value.id !== id) throw Error("Compact approval was substituted under a different ID.");
  await careAccount(uid); return value;
}
export async function readCompactApproval(uid: string, patientId: string, id?: string) {
  const raw = await readRaw(uid,patientId,id);
  return raw.sealed ? decode(uid,patientId,id || raw.head!,raw.sealed) : undefined;
}
export async function saveCompactApproval(uid: string, candidate: CompactApproval, isCurrent: () => boolean = () => true) {
  // Copy before first await to retain precisely the clicked approval.
  const value = structuredClone(candidate);
  const auth = await careAccount(uid);
  await validateCompactApproval(value,uid,value.patientId);
  const before = await readRaw(uid,value.patientId);
  if (before.head === value.id && before.sealed) {
    const old = await decode(uid,value.patientId,value.id,before.sealed);
    if (JSON.stringify(old) !== JSON.stringify(value)) throw Error("This approval ID already has different content. The original was preserved.");
    return old; // Exact reconciliation after an uncertain local completion.
  }
  if (before.head !== value.previousId) throw Error("Another tab approved a different selection. Reload to review the saved approval; nothing was overwritten.");
  if (before.head && before.sealed) await decode(uid,value.patientId,before.head,before.sealed);
  const device = await existingSharingDevice(uid);
  if (!device) throw Error("The original enrolled device key is required. No replacement key was created.");
  const proof = await new CompactSign(jsonBytes(value)).setProtectedHeader({alg:"ES256",typ:"matrisync-care+jws",kid:device.keyId}).sign(device.signKey);
  const sealed = await wrapCare({kind:"matrisync-compact-approval-v1",proof},device);
  if(sealed.length>1048576)throw Error("Encrypted compact approval exceeds the local record limit. Nothing was truncated.");
  await careAccount(uid);
  const currentDevice = await existingSharingDevice(uid);
  if (!currentDevice || currentDevice.keyId !== device.keyId) throw Error("Original device identity changed during approval.");
  const db = await open();
  await new Promise<void>((resolve,reject) => {
    const tx = db.transaction(["heads","records"],"readwrite",{durability:"strict"});
    let failure = "Unable to save compact approval. Reload to check its original ID before retrying.";
    const check = () => { guard(auth,uid); if (!isCurrent()) throw Error("Source changed before approval was saved. Prepare and review again."); };
    const head = tx.objectStore("heads").get([uid,value.patientId]);
    head.onsuccess = () => {
      try {
        check(); if ((head.result ?? null) !== value.previousId) throw Error("Another tab approved a different selection. Reload before approving again.");
        const add = tx.objectStore("records").add(sealed,[uid,value.patientId,value.id]);
        add.onsuccess = () => { try { check(); const put=tx.objectStore("heads").put(value.id,[uid,value.patientId]); put.onsuccess=()=>{try{check();}catch(e){failure=(e as Error).message;tx.abort();}}; } catch(e){failure=(e as Error).message;tx.abort();} };
      } catch(e) { failure=(e as Error).message;tx.abort(); }
    };
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onabort=tx.onerror=()=>{db.close();reject(Error(failure));};
  });
  await careAccount(uid); return value;
}
