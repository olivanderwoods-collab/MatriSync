import { describe, expect, it } from "vitest";
import {
  applyTestCommand as apply,
  emptyTestState,
  hasTestAccess,
  type Actor,
} from "./workflow-test-model";

const load = {
  type: "load" as const,
  username: "test.mother",
  code: "TEST-M-001",
};
const review = {
  type: "review-credentials" as const,
  clinician: "unverified" as const,
  decision: "approved" as const,
  reason: "Reviewed fictional caregiver evidence",
};
const copy = { type: "save-copy" as const, patient: "test-mother" };
const publish = {
  type: "document" as const,
  patient: "test-mother",
  kind: "report" as const,
  text: "Synthetic report v1",
};
const suspend = {
  type: "review-credentials" as const,
  clinician: "doctor" as const,
  decision: "suspended" as const,
  reason: "Fictional suspension decision",
};

describe("facility verification and retained offline copies", () => {
  it("keeps direct grants separate from facility revocation and preserves a saved assignment copy", () => {
    let state = apply(emptyTestState(), "organization", {
      ...load,
      type: "request",
    });
    state = apply(state, "mother", {
      type: "consent",
      patient: "test-mother",
      target: "organization",
      approve: true,
    });
    state = apply(state, "organization", {
      type: "assign",
      patient: "test-mother",
      staff: "doctor",
    });
    state = apply(state, "doctor", { type: "accept", patient: "test-mother" });
    state = apply(state, "doctor", publish);
    state = apply(state, "doctor", copy);
    state = apply(state, "organization", {
      type: "revoke",
      patient: "test-mother",
      staff: "doctor",
    });
    expect(hasTestAccess(state, "doctor", "test-mother")).toBe(false);
    expect(() => apply(state, "doctor", copy)).toThrow("permission");
    expect(state.savedCopies[0].documents[0].text).toBe(publish.text);
    state = apply(state, "doctor", load);
    state = apply(state, "mother", {
      type: "consent",
      patient: "test-mother",
      target: "organization",
      approve: false,
    });
    expect(hasTestAccess(state, "doctor", "test-mother")).toBe(true);
    expect(apply(state, "doctor", copy).savedCopies).toHaveLength(1);
  });
  it("requires submission and a verified facility approver, with immutable attributed decisions", () => {
    const original = emptyTestState();
    expect(() => apply(original, "organization", review)).toThrow("permission");
    let state = apply(original, "unverified", {
      type: "submit-credentials",
      evidence: "TEST-GNM-123",
    });
    expect(() => apply(state, "unverified", load)).toThrow("permission");
    for (const actor of [
      "unverified",
      "unverified-facility",
      "mother",
      "doctor",
    ] as Actor[]) {
      expect(() => apply(state, actor, review)).toThrow("permission");
    }
    expect(() =>
      apply(state, "organization", { ...review, reason: " " }),
    ).toThrow("reason");
    state = apply(state, "organization", review);
    const credential = state.credentials.find(
      (c) => c.clinician === "unverified",
    )!;
    expect(credential.history.map((h) => [h.action, h.actor])).toEqual([
      ["pending", "unverified"],
      ["approved", "organization"],
    ]);
    expect(
      original.credentials.find((c) => c.clinician === "unverified")!.status,
    ).toBe("unsubmitted");
    expect(() => apply(state, "organization", review)).toThrow("permission");
    state = apply(state, "unverified", load);
    expect(hasTestAccess(state, "unverified", "test-mother")).toBe(true);
    expect(() =>
      apply(state, "unverified", { ...publish, kind: "prescription" }),
    ).toThrow("permission");
    expect(() =>
      apply(state, "unverified", {
        type: "refer",
        patient: "test-mother",
        reason: "Fake referral",
      }),
    ).toThrow("permission");
    expect(apply(state, "unverified", publish).documents).toHaveLength(1);
  });

  it("allows a rejected applicant to resubmit but does not invent suspended reinstatement", () => {
    let state = apply(emptyTestState(), "unverified", {
      type: "submit-credentials",
      evidence: "TEST-1",
    });
    state = apply(state, "organization", { ...review, decision: "rejected" });
    expect(() => apply(state, "unverified", load)).toThrow("permission");
    state = apply(state, "unverified", {
      type: "submit-credentials",
      evidence: "TEST-2",
    });
    state = apply(state, "organization", review);
    state = apply(state, "organization", { ...review, decision: "suspended" });
    expect(() =>
      apply(state, "unverified", {
        type: "submit-credentials",
        evidence: "TEST-3",
      }),
    ).toThrow("permission");
    expect(() => apply(state, "organization", review)).toThrow("permission");
  });

  it("suspension denies new loading, creation, downloads and publication but retains saved bytes", () => {
    let state = apply(emptyTestState(), "doctor", load);
    state = apply(state, "doctor", publish);
    state = apply(state, "doctor", copy);
    const saved = structuredClone(state.savedCopies);
    state = apply(state, "doctor", { ...publish, text: "Synthetic report v2" });
    expect(state.savedCopies).toEqual(saved);
    state = apply(state, "organization", suspend);
    expect(hasTestAccess(state, "doctor", "test-mother")).toBe(false);
    for (const command of [
      load,
      copy,
      publish,
      {
        type: "create-patient" as const,
        name: "Fictional",
        username: "fictional",
      },
    ]) {
      expect(() => apply(state, "doctor", command)).toThrow("permission");
    }
    expect(state.savedCopies).toEqual(saved);
    expect(state.savedCopies[0].documents).toHaveLength(1);
    expect(hasTestAccess(state, "mother", "test-mother")).toBe(true);
  });

  it("requires current verification for assignment and acceptance", () => {
    let state = apply(emptyTestState(), "organization", {
      ...load,
      type: "request",
    });
    state = apply(state, "mother", {
      type: "consent",
      patient: "test-mother",
      target: "organization",
      approve: true,
    });
    expect(() =>
      apply(state, "organization", {
        type: "assign",
        patient: "test-mother",
        staff: "unverified",
      }),
    ).toThrow("permission");
    state = apply(state, "organization", {
      type: "assign",
      patient: "test-mother",
      staff: "doctor",
    });
    expect(() => apply(state, "doctor", copy)).toThrow("permission");
    state = apply(state, "organization", suspend);
    expect(() =>
      apply(state, "doctor", { type: "accept", patient: "test-mother" }),
    ).toThrow("permission");
  });

  it("retains an old copy after direct revocation and denies further fetches and queued publications", () => {
    let state = apply(emptyTestState(), "doctor", load);
    state = apply(state, "doctor", publish);
    state = apply(state, "doctor", copy);
    state = apply(state, "mother", {
      type: "consent",
      patient: "test-mother",
      target: "doctor",
      approve: false,
    });
    expect(state.savedCopies[0].documents[0].text).toBe(publish.text);
    expect(() => apply(state, "doctor", copy)).toThrow("permission");
    expect(() => apply(state, "doctor", publish)).toThrow("permission");
    expect(() => apply(state, "doctor", load)).toThrow(
      "cannot override revocation",
    );
    expect(state.savedCopies.filter((c) => c.actor === "nurse")).toHaveLength(
      0,
    );
  });
});
