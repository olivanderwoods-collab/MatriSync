import { describe, expect, it } from "vitest";
import {
  applyTestCommand as apply,
  emptyTestState,
  hasTestAccess,
} from "./workflow-test-model";
function assigned() {
  let s = apply(emptyTestState(), "organization", {
    type: "request",
    username: "test.mother",
    code: "TEST-M-001",
  });
  s = apply(s, "mother", {
    type: "consent",
    patient: "test-mother",
    target: "organization",
    approve: true,
  });
  return apply(s, "organization", {
    type: "assign",
    patient: "test-mother",
    staff: "doctor",
  });
}
describe("synthetic sharing authorization model", () => {
  it("requires matching identifiers, mother's approval and staff acceptance before access", () => {
    expect(() =>
      apply(emptyTestState(), "organization", {
        type: "request",
        username: "test.mother",
        code: "TEST-C-001",
      }),
    ).toThrow("do not match");
    const requested = apply(emptyTestState(), "organization", {
      type: "request",
      username: "test.mother",
      code: "TEST-M-001",
    });
    expect(hasTestAccess(requested, "organization", "test-mother")).toBe(false);
    expect(() =>
      apply(requested, "organization", {
        type: "consent",
        patient: "test-mother",
        target: "organization",
        approve: true,
      }),
    ).toThrow("permission");
    const pending = assigned();
    expect(hasTestAccess(pending, "doctor", "test-mother")).toBe(false);
    expect(() =>
      apply(pending, "doctor", {
        type: "refer",
        patient: "test-mother",
        reason: "Synthetic reason",
      }),
    ).toThrow("permission");
    const accepted = apply(pending, "doctor", {
      type: "accept",
      patient: "test-mother",
    });
    expect(hasTestAccess(accepted, "doctor", "test-mother")).toBe(true);
    expect(hasTestAccess(accepted, "doctor", "test-child")).toBe(false);
    expect(() =>
      apply(accepted, "doctor", { type: "accept", patient: "test-child" }),
    ).toThrow("permission");
  });
  it("revokes staff access, preserves the mother and requires fresh acceptance on reassignment", () => {
    let s = apply(assigned(), "doctor", {
      type: "accept",
      patient: "test-mother",
    });
    s = apply(s, "organization", {
      type: "revoke",
      patient: "test-mother",
      staff: "doctor",
    });
    expect(hasTestAccess(s, "doctor", "test-mother")).toBe(false);
    expect(hasTestAccess(s, "mother", "test-mother")).toBe(true);
    expect(() =>
      apply(s, "organization", {
        type: "revoke",
        patient: "test-mother",
        staff: "mother",
      }),
    ).toThrow();
    s = apply(s, "organization", {
      type: "assign",
      patient: "test-mother",
      staff: "doctor",
    });
    expect(hasTestAccess(s, "doctor", "test-mother")).toBe(false);
    s = apply(s, "mother", {
      type: "consent",
      patient: "test-mother",
      target: "organization",
      approve: false,
    });
    expect(() =>
      apply(s, "doctor", { type: "accept", patient: "test-mother" }),
    ).toThrow();
  });
  it("separates doctor creation from organization initiation and records the actual test actor", () => {
    let s = apply(assigned(), "doctor", {
      type: "accept",
      patient: "test-mother",
    });
    expect(() =>
      apply(s, "organization", {
        type: "refer",
        patient: "test-mother",
        reason: "Synthetic",
      }),
    ).toThrow();
    s = apply(s, "doctor", {
      type: "refer",
      patient: "test-mother",
      reason: "Synthetic review",
    });
    const id = s.referrals[0].id;
    expect(() =>
      apply(s, "doctor", { type: "initiate", patient: "test-mother", id }),
    ).toThrow();
    s = apply(s, "organization", {
      type: "initiate",
      patient: "test-mother",
      id,
    });
    expect(s.referrals[0].status).toBe("initiated");
    expect(s.audit.at(-1)?.actor).toBe("organization");
    expect(() =>
      apply(s, "organization", {
        type: "initiate",
        patient: "test-mother",
        id,
      }),
    ).toThrow("clinician-approved");
  });
  it("protects digital prescriptions while allowing caregiver reports and mother copies", () => {
    let s = apply(assigned(), "organization", {
      type: "assign",
      patient: "test-mother",
      staff: "nurse",
    });
    s = apply(s, "nurse", { type: "accept", patient: "test-mother" });
    for (const actor of ["nurse", "mother", "organization"] as const)
      expect(() =>
        apply(s, actor, {
          type: "document",
          patient: "test-mother",
          kind: "prescription",
          text: "Test",
        }),
      ).toThrow();
    s = apply(s, "nurse", {
      type: "document",
      patient: "test-mother",
      kind: "report",
      text: "Synthetic report",
    });
    s = apply(s, "mother", {
      type: "document",
      patient: "test-mother",
      kind: "copy",
      text: "Synthetic prescription copy",
    });
    expect(s.documents.map((d) => d.author)).toEqual(["nurse", "mother"]);
  });
  it("shares clinician follow-ups with mother and makes terminal transitions irreversible", () => {
    let s = apply(assigned(), "doctor", {
      type: "accept",
      patient: "test-mother",
    });
    s = apply(s, "doctor", {
      type: "follow-up",
      patient: "test-mother",
      date: "2026-11-01T10:00",
      instructions: "Synthetic instructions",
      investigations: "",
    });
    const id = s.followUps[0].id;
    expect(hasTestAccess(s, "mother", "test-mother")).toBe(true);
    expect(() =>
      apply(s, "mother", {
        type: "follow-status",
        patient: "test-mother",
        id,
        status: "completed",
      }),
    ).toThrow();
    s = apply(s, "doctor", {
      type: "follow-status",
      patient: "test-mother",
      id,
      status: "cancelled",
    });
    expect(() =>
      apply(s, "doctor", {
        type: "follow-status",
        patient: "test-mother",
        id,
        status: "completed",
      }),
    ).toThrow("no longer upcoming");
  });
});
