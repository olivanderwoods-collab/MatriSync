import { emptyReferralFields, referralInput, type ReferralFields } from "./referral-draft";
import { jsonBytes, readJson } from "./care-crypto";
import { base64, unbase64 } from "./vault-crypto";
import { frameHandoff, unframeHandoff } from "./handoff-frame";
import type { PublicDevice } from "./sharing-crypto";
import type { CareProfile } from "./care-model";

// Frozen v2 order: changing the app form order must never change wire meanings.
const wireFields = ["patientReference", "contact", "bloodGroup", "pregnancyStage", "allergies", "usg", "bloodSugar", "bloodPressure", "situation", "drugsGiven", "remarks", "reason", "history", "treatment", "instructions"] as const;

type Payload = { version: number; id: string; caseId: string; sourceUid: string; sourceName: string; sourceFacility: string; recipientUid: string; recordedAt: string; profile: CareProfile; fields: ReferralFields };
// Format version 2 is a field-position dictionary, not a medical-code dictionary.
// The bit mask preserves absent optional fields versus explicitly blank values.
export function compactCarePayload(p: Payload) {
  let mask = 0;
  const values: string[] = [];
  wireFields.forEach((key, i) => { if (p.fields[key] !== undefined) { mask |= 1 << i; values.push(p.fields[key]!); } });
  return [2, p.id, p.caseId, p.sourceUid, p.sourceName, p.sourceFacility, p.recipientUid, p.recordedAt,
    [p.profile.name, p.profile.birthDate, p.profile.sourceLocalId, p.profile.sourceUid], mask, ...values];
}
export function expandCarePayload(value: unknown): Payload {
  if (!Array.isArray(value)) return value as Payload; // Original signed v1 packets.
  if (value[0] !== 2 || value.length < 10 || !value.slice(1,8).every(v => typeof v === "string") || !Array.isArray(value[8]) || value[8].length !== 4 || !value[8].every(v => typeof v === "string") || !Number.isInteger(value[9]) || value[9] < 0 || value[9] >= 1 << wireFields.length) throw Error("Unsupported compact handoff schema.");
  const fields = emptyReferralFields(); let cursor = 10;
  wireFields.forEach((key, i) => { if (value[9] & (1 << i)) { if (typeof value[cursor] !== "string") throw Error("Incomplete compact handoff fields."); fields[key] = value[cursor++]; } });
  if (cursor !== value.length) throw Error("Unexpected compact handoff fields.");
  return {version:1,id:value[1],caseId:value[2],sourceUid:value[3],sourceName:value[4],sourceFacility:value[5],recipientUid:value[6],recordedAt:value[7],profile:{name:value[8][0],birthDate:value[8][1],sourceLocalId:value[8][2],sourceUid:value[8][3]},fields:referralInput(fields)};
}
const MAX_EXPANDED_BYTES = 1024 * 1024;
async function transform(bytes: Uint8Array, decompress: boolean) {
  const stream = decompress ? new DecompressionStream("deflate-raw") : new CompressionStream("deflate-raw");
  const reader = new Blob([bytes.slice()]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      length += value.length;
      if (length > MAX_EXPANDED_BYTES) { await reader.cancel(); throw Error("Expanded handoff exceeds the safe decoding limit."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
export async function compactCareWrapper(signed: string, sender: PublicDevice) {
  const raw = jsonBytes([2,signed,[sender.keyId,sender.encryption.x,sender.encryption.y,sender.signing.x,sender.signing.y]]);
  if (raw.length > MAX_EXPANDED_BYTES) throw Error("Handoff exceeds the safe encoding limit.");
  let compressed: Uint8Array | undefined;
  if (typeof CompressionStream !== "undefined") { try { compressed = await transform(raw,false); } catch { /* Plain encoding remains supported. */ } }
  const useCompressed = compressed && compressed.length < raw.length;
  const body = useCompressed ? compressed! : raw;
  const result = new Uint8Array(body.length + 1); result[0] = useCompressed ? 1 : 0; result.set(body,1); return result;
}
export async function expandCareWrapper(bytes: Uint8Array): Promise<{signed:string; sender:PublicDevice}> {
  if (bytes.length > MAX_EXPANDED_BYTES) throw Error("Handoff exceeds the safe decoding limit.");
  if (bytes[0] === 123) return readJson(bytes); // Legacy encrypted JSON object.
  if (bytes[0] !== 0 && bytes[0] !== 1) throw Error("Unsupported compact handoff encoding.");
  const value = readJson(bytes[0] === 1 ? await transform(bytes.slice(1),true) : bytes.slice(1));
  if (!Array.isArray(value) || value.length !== 3 || value[0] !== 2 || typeof value[1] !== "string" || !Array.isArray(value[2]) || value[2].length !== 5 || !value[2].every(v => typeof v === "string")) throw Error("Invalid compact handoff signature metadata.");
  const [keyId,x,y,sx,sy] = value[2];
  return {signed:value[1],sender:{keyId,encryption:{kty:"EC",crv:"P-256",x,y},signing:{kty:"EC",crv:"P-256",x:sx,y:sy}}};
}
const urlEncode = (bytes:Uint8Array) => base64(bytes).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
const urlDecode = (s:string) => unbase64(s.replaceAll("-","+").replaceAll("_","/") + "=".repeat((4-s.length%4)%4));
// Binary transport removes base64/JSON overhead from the JWE, without changing
// its authenticated bytes, JOSE algorithms, or public device-readable framing.
export function compactCarePacket(id:string, ciphertext:string, capacity=32768) {
  const parts=ciphertext.split(".");
  if (parts.length!==5 || parts[1]!=="" || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) throw Error("Unsupported encrypted handoff.");
  const [header,iv,body,tag]=[parts[0],parts[2],parts[3],parts[4]].map(urlDecode);
  if(header.length>65535 || iv.length!==12 || tag.length!==16 || !body.length) throw Error("Invalid encrypted handoff lengths.");
  const payload=new Uint8Array(3+16+2+header.length+iv.length+body.length+tag.length);
  payload.set([77,83,51]); payload.set(id.replaceAll("-","").match(/../g)!.map(n=>parseInt(n,16)),3);
  new DataView(payload.buffer).setUint16(19,header.length);
  let offset=21; for(const bytes of [header,iv,body,tag]) {payload.set(bytes,offset);offset+=bytes.length;}
  return frameHandoff(payload,capacity);
}
export function readCarePacket(bytes:Uint8Array): {kind:string;id:string;ciphertext:string} {
  const payload=unframeHandoff(bytes);
  if(payload[0]!==77 || payload[1]!==83 || payload[2]!==51) return readJson(payload);
  if(payload.length<50) throw Error("Incomplete compact handoff.");
  const headerLength=new DataView(payload.buffer,payload.byteOffset,payload.byteLength).getUint16(19), start=21+headerLength;
  if(!headerLength || start+28>=payload.length) throw Error("Invalid compact handoff length.");
  const rawId=Array.from(payload.slice(3,19),n=>n.toString(16).padStart(2,"0")).join("");
  const id=`${rawId.slice(0,8)}-${rawId.slice(8,12)}-${rawId.slice(12,16)}-${rawId.slice(16,20)}-${rawId.slice(20)}`;
  return {kind:"care-referral",id,ciphertext:[urlEncode(payload.slice(21,start)),"",urlEncode(payload.slice(start,start+12)),urlEncode(payload.slice(start+12,-16)),urlEncode(payload.slice(-16))].join(".")};
}
