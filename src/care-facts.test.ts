import { expect, it } from "vitest";
import { careFactQuestion, type CareView } from "./care-model";
import { careFactAnswer } from "./care-facts";
import { frameHandoff, unframeHandoff } from "./handoff-frame";
it("reads only the latest recorded handoff, with attribution and no missing-value substitution", () => {
  const view = { snapshotOnly: false, entries: [{ kind: "referral", fields: { allergies: "Old allergy entry" } }, { kind: "referral", fields: { bloodPressure: "123/81 at 10:00 demo" }, actorName: "Dr Demo", role: "doctor", serverAt: "2026-11-07T10:00:00Z" }] } as CareView;
  expect(careFactAnswer("What is my blood pressure?", view)).toContain("123/81 at 10:00 demo");
  expect(careFactAnswer("What is my blood pressure?", view)).toContain("Dr Demo");
  expect(careFactAnswer("What are my allergies?", view)).toContain("Not recorded");
  expect(careFactAnswer("What are my allergies?", view)).not.toContain("Old allergy");
  expect(careFactQuestion("What is my blood pressure and is it safe?")).toBeUndefined();
  expect(careFactQuestion("What drugs should I take?")).toBeUndefined();
  expect(careFactAnswer("What is my blood group?")).toContain("Load your linked care profile");
});
it("frames Unicode payload bytes without cutting a UTF-8 character while reading the header", () => {
  const bytes = new TextEncoder().encode("বাংলা हिन्दी 🌿 ".repeat(20));
  expect(unframeHandoff(frameHandoff(bytes))).toEqual(bytes);
});
