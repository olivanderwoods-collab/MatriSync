// Fictional authority records only. Never derive production authority from these fixtures.
export type TestCredential = {
  clinician: "doctor" | "nurse" | "anm" | "unverified";
  category: "doctor" | "caregiver";
  status: "unsubmitted" | "pending" | "approved" | "rejected" | "suspended";
  evidence: string;
  history: { action: string; actor: string; reason: string; at: string }[];
};
export type VerificationCommand =
  | { type: "submit-credentials"; evidence: string }
  | {
      type: "review-credentials";
      clinician: TestCredential["clinician"];
      decision: "approved" | "rejected" | "suspended";
      reason: string;
    };

export const initialTestCredentials = (): TestCredential[] =>
  (["doctor", "nurse", "anm", "unverified"] as const).map((clinician) => ({
    clinician,
    category: clinician === "doctor" ? "doctor" : "caregiver",
    status: clinician === "unverified" ? "unsubmitted" : "approved",
    evidence: clinician === "unverified" ? "" : "FICTIONAL-CREDENTIAL-FIXTURE",
    history:
      clinician === "unverified"
        ? []
        : [
            {
              action: "approved",
              actor: "organization",
              reason: "Pre-approved fictional fixture",
              at: "2026-10-25T00:00:00.000Z",
            },
          ],
  }));

export function verifiedTestClinician(
  credentials: TestCredential[],
  actor: string,
) {
  return credentials.some(
    (c) => c.clinician === actor && c.status === "approved",
  );
}

export function updateTestCredentials(
  credentials: TestCredential[],
  actor: string,
  command: VerificationCommand,
) {
  const next = structuredClone(credentials);
  const credential = next.find(
    (c) =>
      c.clinician ===
      (command.type === "submit-credentials" ? actor : command.clinician),
  );
  const deny = () => {
    throw Error(
      "This test actor does not have permission for that credential action.",
    );
  };
  if (!credential) return deny();
  let reason: string;
  if (command.type === "submit-credentials") {
    if (!["unsubmitted", "rejected"].includes(credential.status)) return deny();
    reason = command.evidence.trim();
    if (!reason || reason.length > 200)
      throw Error(
        "Enter a fictional credential reference of 1–200 characters.",
      );
    credential.evidence = reason;
    credential.status = "pending";
  } else {
    // Only this fixture represents both a verified facility and its authorized approver.
    if (actor !== "organization") return deny();
    if (!["approved", "rejected", "suspended"].includes(command.decision))
      return deny();
    if (
      command.decision === "suspended"
        ? credential.status !== "approved"
        : credential.status !== "pending"
    )
      return deny();
    reason = command.reason.trim();
    if (!reason || reason.length > 500)
      throw Error("Enter a review reason of 1–500 characters.");
    credential.status = command.decision;
  }
  credential.history.push({
    action: credential.status,
    actor,
    reason,
    at: new Date().toISOString(),
  });
  return next;
}
