import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Timestamp,
} from "firebase/firestore";
import { database, sharingAccount, sharingChannels } from "./sharing-client";
import type { SharingDevice } from "./sharing-crypto";

export type CredentialScope = {
  enabled: boolean;
  staffUid: string;
  facilityUid: string;
  staffKeyId: string;
  facilityKeyId: string;
  category: "doctor" | "caregiver";
};
export type CredentialStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "suspended";
export type ClinicalCredential = {
  status: CredentialStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy: string;
  lastEventId: string;
};
export type CredentialEvent = {
  status: CredentialStatus;
  actorUid: string;
  at: Timestamp;
  previousEventId: string;
};
export type CredentialEntry = {
  scope: CredentialScope;
  credential?: ClinicalCredential;
  events: CredentialEvent[];
};

export async function sharingCredentials(
  uid: string,
  role: string,
  device: SharingDevice,
): Promise<CredentialEntry[]> {
  if (!["professional", "organization"].includes(role))
    throw Error("This workspace does not review credentials.");
  await sharingChannels(uid, role, device);
  const db = await database(uid);
  const scopes =
    role === "organization"
      ? (
          await getDocsFromServer(
            query(
              collection(db, "credentialScopes"),
              where("facilityUid", "==", uid),
              limit(20),
            ),
          )
        ).docs
      : [await getDocFromServer(doc(db, "credentialScopes", uid))];
  const entries: CredentialEntry[] = [];
  for (const scopeDoc of scopes) {
    if (!scopeDoc.exists()) continue;
    const scope = scopeDoc.data() as CredentialScope;
    if (
      (role === "professional" &&
        (scope.staffUid !== uid || scope.staffKeyId !== device.keyId)) ||
      (role === "organization" &&
        (scope.facilityUid !== uid || scope.facilityKeyId !== device.keyId))
    )
      throw Error("The credential scope does not match this enrolled account.");
    const credential = await getDocFromServer(
      doc(db, "clinicalCredentials", scope.staffUid),
    );
    const history = await getDocsFromServer(
      query(
        collection(db, "clinicalCredentials", scope.staffUid, "events"),
        orderBy("at", "desc"),
        limit(20),
      ),
    );
    entries.push({
      scope,
      credential: credential.exists()
        ? (credential.data() as ClinicalCredential)
        : undefined,
      events: history.docs.map((e) => e.data() as CredentialEvent),
    });
  }
  await sharingAccount(uid);
  return entries;
}

export async function changeClinicalCredential(
  uid: string,
  role: string,
  device: SharingDevice,
  staffUid: string,
  action: "submit" | "approve" | "reject" | "suspend",
  expectedEvent: string,
) {
  if (!navigator.onLine)
    throw Error(
      "Go online to submit or review credentials. No decision was confirmed.",
    );
  await sharingChannels(uid, role, device);
  const db = await database(uid),
    eventId = crypto.randomUUID();
  await runTransaction(db, async (tx) => {
    await sharingAccount(uid);
    const scopeDoc = await tx.get(doc(db, "credentialScopes", staffUid));
    if (!scopeDoc.exists() || !scopeDoc.data().enabled)
      throw Error("This credential scope is unavailable.");
    const scope = scopeDoc.data() as CredentialScope;
    const ref = doc(db, "clinicalCredentials", staffUid),
      previous = await tx.get(ref);
    const old = previous.data() as ClinicalCredential | undefined;
    if ((old?.lastEventId || "") !== expectedEvent)
      throw Error(
        "The credential decision changed. Refresh before continuing.",
      );
    let status: CredentialStatus;
    if (action === "submit") {
      if (
        role !== "professional" ||
        uid !== scope.staffUid ||
        (old && old.status !== "rejected")
      )
        throw Error(
          "Only the named professional can submit a new or rejected request.",
        );
      status = "pending";
    } else {
      if (
        role !== "organization" ||
        uid !== scope.facilityUid ||
        (action === "suspend"
          ? old?.status !== "approved"
          : old?.status !== "pending")
      )
        throw Error("Only the named approved facility can make this decision.");
      status =
        action === "approve"
          ? "approved"
          : action === "reject"
            ? "rejected"
            : "suspended";
    }
    tx.set(ref, {
      status,
      createdAt: old?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: uid,
      lastEventId: eventId,
    });
    tx.set(doc(ref, "events", eventId), {
      status,
      actorUid: uid,
      at: serverTimestamp(),
      previousEventId: old?.lastEventId || "",
    });
  });
  await sharingAccount(uid);
}
