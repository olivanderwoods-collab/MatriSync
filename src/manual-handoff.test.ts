import { expect, it } from "vitest";
import { crc32, frameHandoff, unframeHandoff } from "./handoff-frame";
import { emptyReferralFields, handoffDetailFields, missingReferralFields, referralInput, type ReferralDraft } from "./referral-draft";
import { referralApprovalHash } from "./referral-approval";
it("requires matching header, byte length, checksum and footer; never truncates for a tag", () => {
  const bytes = new TextEncoder().encode("123456789");
  expect(crc32(bytes)).toBe("cbf43926");
  const framed = frameHandoff(bytes);
  expect(unframeHandoff(framed)).toEqual(bytes);
  for (const damaged of [framed.slice(1), framed.slice(0, -1), Uint8Array.from([...framed, 0])]) expect(() => unframeHandoff(damaged)).toThrow();
  const changed = framed.slice(); changed[changed.length - 25] ^= 1;
  expect(() => unframeHandoff(changed)).toThrow();
  expect(() => frameHandoff(bytes, framed.length - 1)).toThrow("Nothing was truncated");
});
it("keeps all missing facts optional and binds every supplied manual field to approval", async () => {
  const fields = emptyReferralFields();
  expect(referralInput(fields)).toEqual(fields);
  expect(missingReferralFields(fields)).toContain("reason");
  const d: ReferralDraft = { id: "draft", patientId: "patient", authorUid: "doctor", versions: [{ id: "version", savedAt: "2026-11-07T00:00:00.000Z", patient: { name: "Fictional Mother", birthDate: "", updatedAt: "2026-11-07T00:00:00.000Z" }, fields, documents: [] }] };
  const baseline = await referralApprovalHash(d, "version");
  for (const key of handoffDetailFields) {
    const altered = structuredClone(d); altered.versions[0].fields[key] = "Explicit recorded value";
    expect(await referralApprovalHash(altered, "version")).not.toBe(baseline);
    expect(referralInput(altered.versions[0].fields)[key]).toBe("Explicit recorded value");
  }
});
