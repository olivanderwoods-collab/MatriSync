import { sharingAccount } from "./sharing-client";
import { localSharingDevice, savedTransfers } from "./sharing-storage";
import { readSharedInbox } from "./sharing-inbox";
import { matchesProfileOriginal } from "./sharing-profile";
import { decodeFile } from "./sharing-crypto";
import type { ReceivedReferralOrigin, ReferralDraft } from "./referral-draft";

// Re-open authenticated saved transfers rather than trusting UI-supplied names,
// profile snapshots or route IDs. Saved access does not assert a live grant.
export async function receivedReferralSource(
  uid: string,
  profileId: string,
  revision: string,
) {
  await sharingAccount(uid);
  const records = await readSharedInbox(
    uid,
    "professional",
    await savedTransfers(uid),
    await localSharingDevice(uid),
  );
  const selected = records.profiles.find(
    (p) =>
      p.snapshot.profileId === profileId && p.snapshot.revision === revision,
  );
  if (!selected)
    throw Error(
      "This exact profile version has not been received by this professional account.",
    );
  await sharingAccount(uid);
  return { selected, documents: records.documents };
}

export async function receivedReferralOriginal(
  uid: string,
  origin: ReceivedReferralOrigin,
  reference: ReferralDraft["versions"][number]["documents"][number],
) {
  const { selected, documents } = await receivedReferralSource(
    uid,
    origin.profileId,
    origin.profileRevision,
  );
  const snapshot = selected.snapshot;
  if (
    snapshot.sourceUid !== origin.sourceUid ||
    snapshot.sourcePatientId !== origin.sourcePatientId
  )
    throw Error("The original source identity does not match this draft.");
  const ref = snapshot.documents.find(
    (d) =>
      d.id === reference.id &&
      d.sha256 === reference.sha256 &&
      d.type === reference.type &&
      d.size === reference.size,
  );
  const found =
    ref &&
    documents.find((d) =>
      matchesProfileOriginal(snapshot, ref, {
        sourceUid: d.sourceUid,
        sourcePatientId: d.document.sourcePatientId,
        sourceDocumentId: d.document.sourceDocumentId,
        sha256: d.sha256,
        type: d.document.type,
        size: decodeFile(d.document.bytes).length,
      }),
    );
  if (!found)
    throw Error(
      "This exact original has not been received. Its reference does not contain the file.",
    );
  await sharingAccount(uid);
  return { bytes: decodeFile(found.document.bytes), name: ref!.name };
}
