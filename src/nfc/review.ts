import { allReferralFields, type ReferralFields } from "../referral-draft";
import { compressBinary, encodeBinary, type NfcValue } from "./binary";
import { SECTION_OVERHEAD } from "./sections";
import { currentTagEvidence, memoryLayout, type MemoryLayout } from "./layout";
import { eventCapacity } from "./travel";
export type ClinicalIdentity = { patientId: string; referralId: string; subject: "mother" | "baby" | "both" | "unknown"; patientName: string; createdAt: string; sendingFacilityId: string; professionalId: string };
export type CompactReview = Awaited<ReturnType<typeof prepareCompactReview>>;
export async function prepareCompactReview(identity: ClinicalIdentity, source: ReferralFields, included: readonly string[], layout: MemoryLayout = memoryLayout(currentTagEvidence)) {
  if (Object.values(identity).some(v => typeof v !== "string") || !identity.patientId || !identity.referralId || !identity.professionalId || !identity.sendingFacilityId || !["mother", "baby", "both", "unknown"].includes(identity.subject) || !Number.isFinite(Date.parse(identity.createdAt)) || new Date(identity.createdAt).toISOString() !== identity.createdAt) throw Error("Invalid compact handoff identity.");
  if (Object.keys(source).some(key => !(allReferralFields as readonly string[]).includes(key)) || new Set(included).size !== included.length || included.some(key => !(allReferralFields as readonly string[]).includes(key))) throw Error("Unencodable source fields require review; nothing was removed automatically.");
  const document: { [key: string]: NfcValue } = { ...identity }, rows: { key: string; original: string | undefined; included: boolean }[] = [];
  for (const key of allReferralFields) {
    const original = source[key], keep = included.includes(key);
    if (original !== undefined && typeof original !== "string") throw Error("Invalid source value.");
    rows.push({ key, original, included: keep });
    if (keep && original !== undefined) document[key] = original;
  }
  const binary = encodeBinary(document), packed = await compressBinary(binary);
  const finalBytes = packed.length + SECTION_OVERHEAD;
  return { document, rows, binary, layout, sizes: { original: new TextEncoder().encode(JSON.stringify({ ...identity, ...source })).length, dictionary: binary.length, compressed: packed.length - 1, compressionApplied: packed[0] === 1, finalBytes, encryptionAndFraming: SECTION_OVERHEAD, compressionFlag: 1, sectionA: layout.aBytes, sectionB: layout.bBytes, sectionC: layout.cBytes, events: eventCapacity(layout.bBytes), remainingA: layout.aBytes - finalBytes }, fits: finalBytes <= layout.aBytes };
}
