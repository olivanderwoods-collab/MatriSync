import { CompactEncrypt, CompactSign, compactDecrypt, compactVerify, importJWK } from "jose";
import { existingSharingDevice, localSharingDevice } from "./sharing-storage";
import { checkPublicDevice, type PublicDevice } from "./sharing-crypto";
import { base64, unbase64, seal, unseal } from "./vault-crypto";
export const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
export const readJson = (bytes: Uint8Array) => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
export async function careHash(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value.slice();
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), n => n.toString(16).padStart(2, "0")).join("");
}
export const newCareKey = () => base64(crypto.getRandomValues(new Uint8Array(32)));
async function aes(raw: string) {
  const bytes = unbase64(raw); if (bytes.length !== 32) throw Error("Invalid record key.");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function sealCare(key: string, context: string, value: unknown) { return JSON.stringify(await seal(await aes(key), jsonBytes(value), context)); }
export async function openCare(key: string, context: string, value: string) { return readJson(await unseal(await aes(key), JSON.parse(value), context)); }
export async function wrapCare(value: unknown, recipient: PublicDevice) {
  return wrapCareBytes(jsonBytes(value), recipient);
}
export async function wrapCareBytes(bytes: Uint8Array, recipient: PublicDevice) {
  await checkPublicDevice(recipient);
  return new CompactEncrypt(bytes).setProtectedHeader({ alg: "ECDH-ES", enc: "A256GCM", typ: "matrisync-care+jwe", kid: recipient.keyId }).encrypt(await importJWK(recipient.encryption, "ECDH-ES"));
}
export async function unwrapCare(uid: string, envelope: string) {
  return readJson(await unwrapCareBytes(uid, envelope));
}
export async function unwrapCareBytes(uid: string, envelope: string) {
  // Reading existing ciphertext must never enroll a replacement identity.
  const device = await existingSharingDevice(uid);
  if (!device) throw Error("The saved device key is missing. Use the original browser with its saved data. No replacement key was created.");
  const result = await compactDecrypt(envelope, device.decryptKey, { keyManagementAlgorithms: ["ECDH-ES"], contentEncryptionAlgorithms: ["A256GCM"] });
  if (result.protectedHeader.kid !== device.keyId || result.protectedHeader.typ !== "matrisync-care+jwe") throw Error("Handoff belongs to another enrolled device.");
  return result.plaintext;
}
export async function signCare(uid: string, value: unknown) {
  const device = await localSharingDevice(uid);
  return new CompactSign(jsonBytes(value)).setProtectedHeader({ alg: "ES256", typ: "matrisync-care+jws", kid: device.keyId }).sign(device.signKey);
}
export async function verifyCare(signed: string, sender: PublicDevice) {
  await checkPublicDevice(sender);
  const result = await compactVerify(signed, await importJWK(sender.signing, "ES256"), { algorithms: ["ES256"] });
  if (result.protectedHeader.kid !== sender.keyId || result.protectedHeader.typ !== "matrisync-care+jws") throw Error("Handoff signing key differs.");
  return readJson(result.payload);
}
