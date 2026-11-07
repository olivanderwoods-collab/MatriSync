import { describe, expect, it } from "vitest";
import {
  profileContext,
  conversationInstructions,
  BEHAVIOR_VERSION,
  profileQuestion,
  savedProfileAnswer,
  addressReply,
  confusesCompanionWithUser,
} from "./behavior";
import { safetyCheck } from "./safety";
describe("approved profile-only companion context", () => {
  it("rejects calling the user by the companion's name without blocking the companion introduction", () => {
    const profile = { name: "Mira Sen" };
    for (const text of [
      "I'm here to support you, MatriSathi.",
      "MatriSathi, tell me about your day.",
      "Dear MatriSathi, hello.",
    ])
      expect(confusesCompanionWithUser(text, profile)).toBe(true);
    expect(
      confusesCompanionWithUser(
        "I'm MatriSathi, your offline AI companion.",
        profile,
      ),
    ).toBe(false);
    expect(confusesCompanionWithUser("Hello, Mira!", profile)).toBe(false);
    expect(
      confusesCompanionWithUser("MatriSathi, how are you?", { name: "MatriSathi Sen" }),
    ).toBe(false);
  });
  it("addresses the saved first name without inventing one or repeating it", () => {
    expect(addressReply("Hello! How can I help?", { name: "Mira Sen" })).toBe(
      "Hello, Mira! How can I help?",
    );
    expect(addressReply("Hello, Mira!", { name: "Mira Sen" })).toBe(
      "Hello, Mira!",
    );
    expect(addressReply("I cannot answer that.", { name: "Ann Test" })).toBe(
      "Ann, I cannot answer that.",
    );
    expect(addressReply("Hello!")).toBe("Hello!");
  });
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
      "exact read-back",
    );
    expect(BEHAVIOR_VERSION).toBe("2026-11-07-connected-care-readback");
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
