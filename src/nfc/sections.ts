import { compressBinary, decodeBinary, encodeBinary, expandBinary, sameBinary, type NfcValue } from "./binary";
import { dictionary } from "./dictionary";
// Independently authenticated section prototype. No key creation/import/provisioning
// side effects: caller must supply a separately authorized, per-journey key per section.
export const SECTION_OVERHEAD = 60;
const HEADER = 30, NONCE = 12, TAG = 16;
export type SectionContext = { section: "a" | "b"; dictionaryVersion: number; sequence: number; binding: Uint8Array };
function checkedContext(context: SectionContext) {
  dictionary(context.dictionaryVersion);
  if (!["a", "b"].includes(context.section) || !Number.isInteger(context.sequence) || context.sequence < 1 || context.sequence > 0xffffffff || context.binding.length !== 16) throw Error("Invalid NFC section context.");
}
function checkKey(key: CryptoKey, usage: "encrypt" | "decrypt") {
  if (key.type !== "secret" || key.extractable || key.algorithm.name !== "AES-GCM" || (key.algorithm as AesKeyAlgorithm).length !== 256 || !key.usages.includes(usage)) throw Error("A non-extractable, authorized AES-256-GCM section key is required.");
}
export async function referralBinding(patientId: string, referralId: string): Promise<Uint8Array<ArrayBuffer>> {
  if (!patientId || !referralId || patientId.length > 200 || referralId.length > 200) throw Error("Invalid NFC referral identity.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(["matrisync-nfc-binding-v1", patientId, referralId])));
  return new Uint8Array(digest).slice(0, 16);
}
export async function sealSection(body: Uint8Array, key: CryptoKey, context: SectionContext, capacity: number) {
  checkedContext(context); checkKey(key, "encrypt");
  if (!body.length || body.length > 32769 || !Number.isInteger(capacity) || capacity < body.length + SECTION_OVERHEAD) throw Error(`Encrypted section requires ${body.length + SECTION_OVERHEAD} bytes; capacity ${capacity}. Nothing was truncated.`);
  const header = new Uint8Array(HEADER), view = new DataView(header.buffer);
  header.set([77, 78, 1, context.section === "a" ? 1 : 2]); view.setUint16(4, context.dictionaryVersion); view.setUint32(6, context.sequence); view.setUint16(10, body.length); header.set(context.binding, 12); header.set([0, 0], 28);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: header, tagLength: 128 }, key, body.slice()));
  const result = new Uint8Array(body.length + SECTION_OVERHEAD);
  result.set(header); result.set(nonce, HEADER); result.set(encrypted, HEADER + NONCE); result.set([0x45, 0x4e], result.length - 2);
  return result;
}
export async function openSection(packet: Uint8Array, key: CryptoKey, context: SectionContext, capacity: number) {
  checkedContext(context); checkKey(key, "decrypt");
  if (!Number.isInteger(capacity) || packet.length > capacity || packet.length < SECTION_OVERHEAD + 1 || packet.length > 32769 + SECTION_OVERHEAD) throw Error("Incomplete or oversized NFC section.");
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength), size = view.getUint16(10);
  if (packet[0] !== 77 || packet[1] !== 78 || packet[2] !== 1 || packet[3] !== (context.section === "a" ? 1 : 2) || packet[28] || packet[29] || view.getUint16(4) !== context.dictionaryVersion || view.getUint32(6) !== context.sequence || !sameBinary(packet.slice(12, 28), context.binding) || packet.length !== size + SECTION_OVERHEAD || packet.at(-2) !== 0x45 || packet.at(-1) !== 0x4e) throw Error("NFC section is incomplete, stale, unsupported or belongs to a different referral.");
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: packet.slice(HEADER, HEADER + NONCE), additionalData: packet.slice(0, HEADER), tagLength: TAG * 8 }, key, packet.slice(HEADER + NONCE, -2)));
  } catch { throw Error("NFC section authentication failed. Its contents must not be displayed as verified."); }
}
export async function prepareSection(value: NfcValue, key: CryptoKey, context: SectionContext, capacity: number) {
  const binary = encodeBinary(value, context.dictionaryVersion), body = await compressBinary(binary);
  const packet = await sealSection(body, key, context, capacity);
  // Mandatory local decrypt/decode comparison before any writer can receive it.
  const decoded = decodeBinary(await expandBinary(await openSection(packet, key, context, capacity)));
  if (!sameBinary(binary, encodeBinary(decoded, context.dictionaryVersion))) throw Error("NFC round-trip validation failed.");
  return { packet, decoded, sizes: { structured: new TextEncoder().encode(JSON.stringify(value)).length, dictionary: binary.length, compressed: body.length - 1, compressionApplied: body[0] === 1, encryptionAndFraming: SECTION_OVERHEAD, compressionFlag: 1, final: packet.length } };
}
export async function readClinicalSection(packet: Uint8Array, key: CryptoKey, context: SectionContext, capacity: number) {
  if (context.section !== "a") throw Error("Clinical data requires Section A.");
  const binary = await expandBinary(await openSection(packet, key, context, capacity));
  if (binary[3] !== context.dictionaryVersion >> 8 || binary[4] !== (context.dictionaryVersion & 255)) throw Error("NFC section and dictionary versions differ.");
  const result = decodeBinary(binary);
  if (!result || typeof result !== "object" || Array.isArray(result) || typeof result.patientId !== "string" || typeof result.referralId !== "string" || !sameBinary(await referralBinding(result.patientId, result.referralId), context.binding)) throw Error("Clinical identity does not match the authenticated referral context.");
  return result;
}
