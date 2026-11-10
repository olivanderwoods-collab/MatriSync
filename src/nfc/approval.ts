import { allReferralFields, type ReferralFields } from "../referral-draft";
import { base64, unbase64 } from "../vault-crypto";
import { sameBinary } from "./binary";
import { prepareCompactReview, type ClinicalIdentity, type CompactReview } from "./review";

export type CompactApproval = {
  version: 1; dictionaryVersion: 1; uid: string; patientId: string; id: string;
  previousId: string | null; approvedAt: string; identity: ClinicalIdentity;
  source: ReferralFields; included: string[]; binary: string; sourceHash: string; selectionHash: string;
};
const identityKeys = ["patientId", "referralId", "subject", "patientName", "createdAt", "sendingFacilityId", "professionalId"] as const;
const approvalKeys = ["version", "dictionaryVersion", "uid", "patientId", "id", "previousId", "approvedAt", "identity", "source", "included", "binary", "sourceHash", "selectionHash"];
const uuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(s);
const instant = (s: unknown) => typeof s === "string" && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
const hash = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice())), n => n.toString(16).padStart(2, "0")).join("");
// Original source is local provenance, not NFC content. Its digest must not
// require excluded information to fit the compact binary/tag capacity.
function sourceBytes(identity: ClinicalIdentity, source: ReferralFields) {
  return new TextEncoder().encode(JSON.stringify([
    "matrisync-compact-source-v1",
    identityKeys.map(k=>[k,identity[k]]),
    allReferralFields.filter(k=>Object.hasOwn(source,k)).map(k=>[k,source[k]]),
  ]));
}
function shape(value: CompactApproval, uid: string, patientId: string) {
  if (!value || Object.keys(value).sort().join() !== [...approvalKeys].sort().join() || value.version !== 1 || value.dictionaryVersion !== 1 || value.uid !== uid || value.patientId !== patientId || !uuid(value.id) || (value.previousId !== null && (!uuid(value.previousId) || value.previousId === value.id)) || !instant(value.approvedAt) || !value.identity || Object.keys(value.identity).sort().join() !== [...identityKeys].sort().join() || value.identity.professionalId !== uid || value.identity.patientId !== patientId || value.identity.referralId !== value.id || Object.values(value.identity).some(v => typeof v !== "string" || v.length > 256) || !value.source || typeof value.source !== "object" || Array.isArray(value.source) || Object.keys(value.source).some(k => !(allReferralFields as readonly string[]).includes(k)) || Object.values(value.source).some(v => typeof v !== "string" || v.length > 8000) || !Array.isArray(value.included) || value.included.length > allReferralFields.length || typeof value.binary !== "string" || value.binary.length > 44000 || !/^[a-f0-9]{64}$/.test(value.sourceHash) || !/^[a-f0-9]{64}$/.test(value.selectionHash)) throw Error("Saved compact approval identity or format differs. Original records were preserved.");
}
export async function validateCompactApproval(value: CompactApproval, uid: string, patientId: string) {
  shape(value, uid, patientId);
  const canonicalSelection = allReferralFields.filter(k => value.included.includes(k));
  if (JSON.stringify(canonicalSelection) !== JSON.stringify(value.included)) throw Error("Compact approval selection is invalid.");
  const review = await prepareCompactReview(value.identity, value.source, value.included);
  if (value.binary !== base64(unbase64(value.binary)) || !sameBinary(unbase64(value.binary), review.binary) || await hash(sourceBytes(value.identity,value.source)) !== value.sourceHash || await hash(review.binary) !== value.selectionHash) throw Error("Compact approval content or source digest differs. Nothing was restored or sent.");
  return value;
}
export async function buildCompactApproval(uid: string, review: CompactReview, previousId: string | null): Promise<CompactApproval> {
  // Snapshot synchronously before crypto/compression yields; later form edits cannot
  // alter this explicit approval. Never trust a passed binary independently of rows.
  const identity = Object.fromEntries(identityKeys.map(k => [k, review.document[k]])) as ClinicalIdentity;
  const source = Object.fromEntries(review.rows.filter(r => r.original !== undefined).map(r => [r.key, r.original])) as ReferralFields;
  const included = allReferralFields.filter(k => review.rows.find(r => r.key === k)?.included);
  const binary = review.binary.slice();
  const value: CompactApproval = { version: 1, dictionaryVersion: 1, uid, patientId: identity.patientId, id: identity.referralId, previousId, approvedAt: new Date().toISOString(), identity, source, included: [...included], binary: base64(binary), sourceHash: await hash(sourceBytes(identity,source)), selectionHash: await hash(binary) };
  return validateCompactApproval(value, uid, identity.patientId);
}
export function sourceMatchesApproval(value: CompactApproval, identity: Pick<ClinicalIdentity, "patientId" | "patientName" | "professionalId" | "sendingFacilityId">, fields: ReferralFields) {
  return Object.entries(identity).every(([k,v]) => value.identity[k as keyof ClinicalIdentity] === v) && allReferralFields.every(k => Object.hasOwn(value.source,k) === Object.hasOwn(fields,k) && value.source[k] === fields[k]);
}
