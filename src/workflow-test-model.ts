// Isolated in-memory fixtures. Never use these actors or grants as real authorization.
export type Actor = "mother" | "organization" | "doctor" | "nurse" | "anm";
export const staff = ["doctor", "nurse", "anm"] as const;
export const actorNames: Record<Actor, string> = {
  mother: "Test Mother",
  organization: "Test Facility",
  doctor: "Dr. Test Rao",
  nurse: "Test Nurse · GNM",
  anm: "Test Health Worker · ANM",
};
export const testPatients = [
  {
    id: "test-mother",
    name: "Test Mother",
    username: "test.mother",
    code: "TEST-M-001",
  },
  {
    id: "test-child",
    name: "Test Child",
    username: "test.child",
    code: "TEST-C-001",
  },
];
export type Grant = {
  patient: string;
  target: Actor;
  status: "requested" | "approved" | "revoked";
};
export type Assignment = {
  patient: string;
  staff: Actor;
  status: "pending" | "accepted" | "revoked";
};
export type Referral = {
  id: string;
  patient: string;
  reason: string;
  status: "approved" | "initiated";
};
export type FollowUp = {
  id: string;
  patient: string;
  date: string;
  instructions: string;
  investigations: string;
  status: "upcoming" | "completed" | "cancelled";
};
export type TestDocument = {
  id: string;
  patient: string;
  kind: "report" | "copy" | "prescription";
  text: string;
  author: Actor;
};
export type Audit = {
  actor: Actor;
  action: string;
  patient: string;
  at: string;
};
export type TestState = {
  grants: Grant[];
  assignments: Assignment[];
  referrals: Referral[];
  followUps: FollowUp[];
  documents: TestDocument[];
  audit: Audit[];
};
export const emptyTestState = (): TestState => ({
  grants: [],
  assignments: [],
  referrals: [],
  followUps: [],
  documents: [],
  audit: [],
});
export type Command =
  | { type: "request"; username: string; code: string }
  | { type: "consent"; patient: string; target: Actor; approve: boolean }
  | { type: "assign" | "revoke"; patient: string; staff: Actor }
  | { type: "accept"; patient: string }
  | {
      type: "document";
      patient: string;
      kind: TestDocument["kind"];
      text: string;
    }
  | { type: "refer"; patient: string; reason: string }
  | { type: "initiate"; patient: string; id: string }
  | {
      type: "follow-up";
      patient: string;
      date: string;
      instructions: string;
      investigations: string;
    }
  | {
      type: "follow-status";
      patient: string;
      id: string;
      status: "completed" | "cancelled";
    };
export function hasTestAccess(
  state: TestState,
  actor: Actor,
  patient: string,
): boolean {
  if (!testPatients.some((p) => p.id === patient)) return false;
  if (actor === "mother") return true;
  if (
    state.grants.some(
      (g) =>
        g.patient === patient && g.target === actor && g.status === "approved",
    )
  )
    return true;
  return (
    staff.includes(actor as (typeof staff)[number]) &&
    state.grants.some(
      (g) =>
        g.patient === patient &&
        g.target === "organization" &&
        g.status === "approved",
    ) &&
    state.assignments.some(
      (a) =>
        a.patient === patient && a.staff === actor && a.status === "accepted",
    )
  );
}
function required(value: string, max = 2000) {
  const result = value.trim();
  if (!result || result.length > max) throw Error(`Enter 1–${max} characters.`);
  return result;
}
export function applyTestCommand(
  state: TestState,
  actor: Actor,
  command: Command,
): TestState {
  const next = structuredClone(state);
  let patient = "patient" in command ? command.patient : "";
  const deny = () => {
    throw Error("This test actor does not have permission for that action.");
  };
  if (command.type === "request") {
    if (actor !== "doctor" && actor !== "organization") deny();
    const match = testPatients.find(
      (p) =>
        p.username === command.username.trim() &&
        p.code === command.code.trim(),
    );
    if (!match) throw Error("The test username and profile code do not match.");
    patient = match.id;
    const previous = next.grants.find(
      (g) => g.patient === patient && g.target === actor,
    );
    if (previous && previous.status !== "revoked")
      throw Error(
        "This link already exists or is awaiting the mother's approval.",
      );
    next.grants = next.grants.filter(
      (g) => !(g.patient === patient && g.target === actor),
    );
    next.grants.push({ patient, target: actor, status: "requested" });
  } else {
    if (!testPatients.some((p) => p.id === patient)) deny();
    if (command.type === "consent") {
      if (actor !== "mother") deny();
      const grant = next.grants.find(
        (g) => g.patient === patient && g.target === command.target,
      );
      if (!grant) deny();
      grant!.status = command.approve ? "approved" : "revoked";
      if (!command.approve && command.target === "organization")
        next.assignments
          .filter((a) => a.patient === patient)
          .forEach((a) => {
            a.status = "revoked";
          });
    } else {
      // Acceptance exposes no clinical records before the pending invitation is accepted.
      if (command.type === "accept") {
        const assignment = next.assignments.find(
          (a) =>
            a.patient === patient &&
            a.staff === actor &&
            a.status === "pending",
        );
        if (!assignment || !hasTestAccess(next, "organization", patient))
          deny();
        assignment!.status = "accepted";
      } else {
        if (!hasTestAccess(next, actor, patient)) deny();
        switch (command.type) {
          case "assign":
          case "revoke": {
            if (
              actor !== "organization" ||
              !staff.includes(command.staff as (typeof staff)[number])
            )
              deny();
            const existing = next.assignments.find(
              (a) => a.patient === patient && a.staff === command.staff,
            );
            if (
              command.type === "assign" &&
              existing &&
              existing.status !== "revoked"
            )
              throw Error(
                "This staff assignment is already active or pending.",
              );
            if (command.type === "revoke" && !existing) deny();
            next.assignments = next.assignments.filter(
              (a) => !(a.patient === patient && a.staff === command.staff),
            );
            next.assignments.push({
              patient,
              staff: command.staff,
              status: command.type === "assign" ? "pending" : "revoked",
            });
            break;
          }
          case "document":
            if (
              actor === "organization" ||
              (command.kind === "prescription" && actor !== "doctor") ||
              (actor === "mother" && command.kind !== "copy")
            )
              deny();
            next.documents.push({
              id: crypto.randomUUID(),
              patient,
              kind: command.kind,
              text: required(command.text),
              author: actor,
            });
            break;
          case "refer":
            if (actor !== "doctor") deny();
            next.referrals.push({
              id: crypto.randomUUID(),
              patient,
              reason: required(command.reason),
              status: "approved",
            });
            break;
          case "initiate": {
            if (actor !== "organization") deny();
            const referral = next.referrals.find(
              (r) =>
                r.id === command.id &&
                r.patient === patient &&
                r.status === "approved",
            );
            if (!referral) throw Error("Select a clinician-approved referral.");
            referral.status = "initiated";
            break;
          }
          case "follow-up":
            if (actor !== "doctor") deny();
            if (!command.date || !Number.isFinite(Date.parse(command.date)))
              throw Error("Choose a valid date and time.");
            next.followUps.push({
              id: crypto.randomUUID(),
              patient,
              date: command.date,
              instructions: required(command.instructions),
              investigations: command.investigations.trim().slice(0, 2000),
              status: "upcoming",
            });
            break;
          case "follow-status": {
            if (actor !== "doctor") deny();
            const followUp = next.followUps.find(
              (f) =>
                f.id === command.id &&
                f.patient === patient &&
                f.status === "upcoming",
            );
            if (!followUp) throw Error("This follow-up is no longer upcoming.");
            followUp.status = command.status;
            break;
          }
        }
      }
    }
  }
  next.audit.push({
    actor,
    action: command.type,
    patient,
    at: new Date().toISOString(),
  });
  return next;
}
