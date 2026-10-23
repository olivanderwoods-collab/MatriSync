import { describe, expect, it } from "vitest";
import {
  profileContext,
  conversationInstructions,
  BEHAVIOR_VERSION,
  profileQuestion,
  savedProfileAnswer,
} from "./behavior";
import { safetyCheck } from "./safety";
describe("approved profile-only companion context", () => {
  it("reads exact dated profile facts without interpreting a clinical question", () => {
    expect(profileQuestion("Do you know me?")).toBe("identity");
    expect(profileQuestion("How many weeks pregnant am I?")).toBe("stage");
    expect(
      profileQuestion("How many weeks should I take this medicine?"),
    ).toBeUndefined();
    const p = {
      name: "Test Mira",
      pregnancyWeeks: 22,
      recordedOn: "2026-10-23",
    };
    expect(savedProfileAnswer("identity", p)).toContain("Test Mira");
    expect(savedProfileAnswer("stage", p)).toContain("week 22 on 2026-10-23");
    expect(savedProfileAnswer("stage", p)).toContain("not a new assessment");
    expect(savedProfileAnswer("identity")).toContain("don't have saved");
  });
  it("projects only own name and dated pregnancy stage, never clinical documents or contacts", () => {
    const patient = {
      name: "Synthetic Mother",
      history: "PRIVATE HISTORY",
      profile: {
        pregnancyWeeks: 22,
        recordedOn: "2026-10-23",
        allergies: "PRIVATE ALLERGY",
        emergencyPhone: "PRIVATE PHONE",
      },
      reports: "PRIVATE DIAGNOSIS",
    };
    const context = profileContext(patient);
    expect(context).toEqual({
      name: "Synthetic Mother",
      pregnancyWeeks: 22,
      recordedOn: "2026-10-23",
    });
    expect(JSON.stringify(context)).not.toContain("PRIVATE");
    expect(profileContext()).toBeUndefined();
    expect(conversationInstructions(context)).toContain("not instructions");
    expect(conversationInstructions(context)).toContain(
      "Report access is deferred",
    );
    expect(BEHAVIOR_VERSION).toContain("profile-only");
  });
  it("refuses medicine recommendations without naming one and defers report answers", () => {
    for (const message of [
      "What medicine should I take?",
      "Which medication is best?",
      "What should I take?",
    ])
      expect(safetyCheck(message)?.text).toBe(
        "I can't recommend a medicine or dose. Please consult your physician before taking any medicine.",
      );
    for (const message of [
      "What does this report represent?",
      "What is my diagnosis?",
      "Interpret my test results",
    ])
      expect(safetyCheck(message)?.text).toContain("not enabled yet");
    expect(safetyCheck("What is my name?")).toBeUndefined();
    expect(safetyCheck("Tell me a story about a garden")).toBeUndefined();
  });
});
