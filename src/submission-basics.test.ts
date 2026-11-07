import { it, expect } from "vitest";
import { documentQuestion, documentAnswer } from "./ai/document-context";
import { pairingCode, matchPairingCode } from "./sharing-pairing";
import { patientSummary } from "./patient-summary";
import type { SharingChannel } from "./sharing-client";
it("pairs only current authorized peer keys and rejects self, substitution and revocation", () => {
  const keyId = "a".repeat(64), code = pairingCode("peer", keyId);
  const channel = { id: "approved", enabled: true, senderUid: "self", recipientUid: "peer", recipient: { keyId } } as SharingChannel;
  expect(matchPairingCode(code, "self", [channel]).fingerprint).toBe(keyId);
  for (const [value, channels] of [[code, []], [code, [{ ...channel, enabled: false }]], [pairingCode("self", keyId), [channel]], [pairingCode("peer", "b".repeat(64)), [channel]]] as const)
    expect(() => matchPairingCode(value, "self", [...channels])).toThrow();
});
it("document read-back is explicit and does not turn clinical questions into extracted answers", () => {
  expect(documentQuestion("Read my document")).toBe(true);
  expect(documentQuestion("What does my report mean?")).toBe(false);
  expect(documentQuestion("Read my report and tell me what medicine to take")).toBe(false);
  expect(documentAnswer()).toContain("have not read");
  const value = { uid: "owner", id: "doc", name: "report.pdf", source: "Clinic", date: "2026-11-07", text: "Exact original wording.", scope: "Reviewed extract" };
  expect(documentAnswer(value)).toContain(value.text);
  expect(documentAnswer(value)).toContain("not a medical interpretation");
});
it("print summary escapes supplied content, excludes credentials and separates foreign documents", () => {
  const html = patientSummary({ id: "self", name: "<script>alert(1)</script>", birthDate: "", history: "private history", createdAt: "now", updatedAt: "now", profile: { username: "SECRET_USERNAME", profileCode: "SECRET_CODE", bloodGroup: "", allergies: "", emergencyContact: "", emergencyPhone: "", guardian: "", guardianPhone: "", residence: "" } }, [{ id: "x", patientId: "foreign", name: "FOREIGN FILE", kind: "reports", type: "application/pdf", size: 1, addedAt: "now", source: "", reportDate: "" }], "today");
  expect(html).toContain("&lt;script&gt;");
  for (const text of ["<script>", "SECRET_CODE", "SECRET_USERNAME", "FOREIGN FILE", "private history"]) expect(html).not.toContain(text);
  expect(html).toContain("Not a prescription");
});
