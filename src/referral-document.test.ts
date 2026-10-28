import { expect, it } from "vitest";
import {
  emptyReferralFields,
  validateReferralDrafts,
  type ReferralDraft,
} from "./referral-draft";
import { referralDocumentHtml } from "./referral-document";
const draft = (): ReferralDraft => ({
  id: "referral-1",
  patientId: "patient-1",
  authorUid: "author-1",
  versions: [
    {
      id: "version-1",
      savedAt: "2026-10-28T00:00:00.000Z",
      patient: {
        name: "Recorded Mother",
        birthDate: "",
        updatedAt: "2026-10-27T00:00:00.000Z",
      },
      fields: {
        ...emptyReferralFields(),
        reason: "Exact recorded reason\nNext line",
      },
      documents: [
        {
          id: "original-1",
          name: "Original.pdf",
          source: "Fictional clinic",
          reportDate: "2026-10-20",
        },
      ],
    },
  ],
});
it("exports exactly the selected immutable version, unknown fields and source identities", () => {
  const item = draft();
  item.versions.push({
    ...item.versions[0],
    id: "version-2",
    fields: { ...item.versions[0].fields, reason: "Newer reason" },
  });
  const html = referralDocumentHtml(item, "version-1");
  expect(html).toContain("Exact recorded reason\nNext line");
  expect(html).not.toContain("Newer reason");
  for (const text of [
    "DRAFT",
    "Not approved · Not sent",
    "Version 1",
    "patient-1",
    "referral-1",
    "version-1",
    "author-1",
    "original-1",
    "Fictional clinic",
    "2026-10-20",
    "Not recorded",
  ])
    expect(html).toContain(text);
  expect(() => referralDocumentHtml(item, "absent")).toThrow("saved referral");
});
it("treats all patient, source and clinician text as inert text in an offline document", () => {
  const item = draft();
  const attack =
    '<script>alert("x")</script><img src="https://invalid.test/leak">';
  item.versions[0].patient.name = attack;
  item.versions[0].fields.reason = attack;
  item.versions[0].documents[0].name = attack;
  item.versions[0].documents[0].source = attack;
  const html = referralDocumentHtml(item, "version-1");
  expect(html).not.toContain("<script");
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  expect(html).toContain("default-src 'none'");
  expect(html).toContain("base-uri 'none'");
});
it("rejects malformed saved dates and document references before printing", () => {
  const item = draft();
  item.versions[0].patient.birthDate = "2026-02-30";
  expect(() => validateReferralDrafts([item])).toThrow("version");
  item.versions[0].patient.birthDate = "";
  item.versions[0].documents[0].reportDate = "2026-02-30";
  expect(() => validateReferralDrafts([item])).toThrow("document");
});
