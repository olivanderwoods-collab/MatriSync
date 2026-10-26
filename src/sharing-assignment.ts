import type { SharedContent } from "./sharing-crypto";
import { sourceProfileId } from "./sharing-profile";

export type AssignmentRoute = {
  id: string;
  enabled: boolean;
  participants: string[];
  sourceUid: string;
  sourcePatientId: string;
  profileId: string;
  facilityUid: string;
  staffUid: string;
  sourceKeyId: string;
  facilityKeyId: string;
  staffKeyId: string;
};
export type StaffAssignment = { status: "pending" | "accepted" | "revoked" };

// Channel approval is scoped to one source patient. A parent's assignment
// never imports a child; a matching name is never sufficient.
export async function assertAssignmentContent(
  route: AssignmentRoute,
  content: SharedContent,
  senderUid: string,
) {
  const patientId =
    content.kind === "profile"
      ? content.profile.sourcePatientId
      : content.document.sourcePatientId;
  if (
    senderUid !== route.sourceUid ||
    patientId !== route.sourcePatientId ||
    (await sourceProfileId(senderUid, patientId)) !== route.profileId ||
    (content.kind === "profile" &&
      (content.profile.profileId !== route.profileId ||
        content.profile.sourceUid !== senderUid))
  )
    throw Error(
      "This record is outside the assigned patient profile. Linked family profiles require their own approval.",
    );
}
