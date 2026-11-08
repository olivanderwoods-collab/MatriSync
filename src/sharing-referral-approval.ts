import {
  doc,
  getDocFromServer,
  runTransaction,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { database, sharingAccount, sharingChannels } from "./sharing-client";
import { localSharingDevice } from "./sharing-storage";
import type { ReferralDraft } from "./referral-draft";
import {
  checkReferralApproval,
  referralApprovalHash,
  referralApprovalId,
  type ReferralApproval,
} from "./referral-approval";
import type {
  ClinicalCredential,
  CredentialScope,
} from "./sharing-credentials";

export async function readReferralApproval(
  uid: string,
  draft: ReferralDraft,
  versionId: string,
) {
  if (uid !== draft.authorUid)
    throw Error("Open the account that prepared this referral.");
  const db = await database(uid),
    id = referralApprovalId(draft, versionId);
  const result = await getDocFromServer(
    doc(db, "referralApprovals", uid, "versions", id),
  );
  await sharingAccount(uid);
  if (!result.exists()) return undefined;
  const d = result.data() as Omit<ReferralApproval, "id" | "createdAt"> & {
    createdAt: Timestamp;
  };
  const approval: ReferralApproval = {
    ...d,
    id,
    createdAt: d.createdAt.toDate().toISOString(),
  };
  await checkReferralApproval(draft, versionId, approval);
  await sharingAccount(uid);
  return approval;
}
export async function approveReferralVersion(
  uid: string,
  draft: ReferralDraft,
  versionId: string,
) {
  if (!navigator.onLine)
    throw Error(
      "Go online to confirm doctor authority and approve this version. Nothing was approved offline.",
    );
  if (uid !== draft.authorUid)
    throw Error(
      "Only the account that prepared this version can approve it here.",
    );
  const device = await localSharingDevice(uid);
  await sharingChannels(uid, "professional", device);
  const db = await database(uid),
    id = referralApprovalId(draft, versionId),
    contentHash = await referralApprovalHash(draft, versionId);
  await runTransaction(db, async (tx) => {
    await sharingAccount(uid);
    const ref = doc(db, "referralApprovals", uid, "versions", id),
      existing = await tx.get(ref);
    if (existing.exists()) {
      if (
        existing.data().doctorUid !== uid ||
        existing.data().contentHash !== contentHash
      )
        throw Error(
          "This version already has a different approval. Nothing was replaced.",
        );
      return;
    }
    const scope = (await tx.get(doc(db, "credentialScopes", uid))).data() as
      | CredentialScope
      | undefined;
    const credential = (
      await tx.get(doc(db, "clinicalCredentials", uid))
    ).data() as ClinicalCredential | undefined;
    if (
      !scope?.enabled ||
      scope.category !== "doctor" ||
      scope.staffKeyId !== device.keyId ||
      credential?.status !== "approved"
    )
      throw Error(
        "An active facility-approved doctor credential is required. No approval was recorded.",
      );
    tx.set(ref, {
      doctorUid: uid,
      doctorKeyId: device.keyId,
      facilityUid: scope.facilityUid,
      credentialEventId: credential.lastEventId,
      contentHash,
      createdAt: serverTimestamp(),
    });
  });
  // The rules independently check both members, the facility approver, the
  // category, the current credential event and keys at commit time.
  const approval = await readReferralApproval(uid, draft, versionId);
  if (!approval)
    throw Error("Approval was not confirmed. Refresh before retrying.");
  return approval;
}
