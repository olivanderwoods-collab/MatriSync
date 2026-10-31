import { accountAuth } from "./auth";
import { sharingPilotEnabled } from "./sharing-config";
import {
  initializeFirestore,
  memoryLocalCache,
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  getDocsFromServer,
  collection,
  query,
  where,
  limit,
  orderBy,
  setDoc,
  serverTimestamp,
  runTransaction,
  type Firestore,
  type DocumentReference,
} from "firebase/firestore";
import {
  checkPublicDevice,
  encryptTransfer,
  decryptSharedTransfer,
  encryptProfileTransfer,
  type SharedContent,
  type PublicDevice,
  type SharedDocument,
  type TransferContext,
  type SharingDevice,
} from "./sharing-crypto";
import {
  verifyPeerPin,
  saveReceived,
  type SavedTransfer,
} from "./sharing-storage";
import type { SharedProfileSnapshot } from "./sharing-profile";
import { INLINE_CIPHERTEXT_LIMIT, CIPHERTEXT_CHUNK_SIZE, chunkManifest, checkChunkManifest,
  checkCiphertextChunk, assembleCiphertext, type ChunkManifest } from "./sharing-chunks";
import { queuedTransfers, prepareQueuedTransfer, openQueuedTransfer, saveQueuedTransfer,
  acknowledgeQueuedTransfer, type QueuedTransfer } from "./sharing-outbox";
import {
  assertAssignmentContent,
  type AssignmentRoute,
  type StaffAssignment,
} from "./sharing-assignment";

export type SharingChannel = {
  id: string;
  enabled: boolean;
  members: string[];
  senderUid: string;
  recipientUid: string;
  sender: PublicDevice;
  recipient: PublicDevice;
  assignmentRouteId?: string;
};
export type SharingMember = {
  enabled: boolean;
  role: "mother" | "professional" | "organization";
  keyId: string;
};
let pending: Firestore | undefined;
export async function sharingAccount(uid: string) {
  const auth = await accountAuth();
  if (!uid || auth.currentUser?.uid !== uid || auth.currentUser.isAnonymous)
    throw Error("Sign in to this document's account.");
  return auth;
}
export async function database(uid: string) {
  if (
    !sharingPilotEnabled ||
    !["127.0.0.1", "localhost"].includes(location.hostname) ||
    import.meta.env.VITE_FIREBASE_PROJECT_ID !== "demo-matrisync" ||
    import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL !== "http://127.0.0.1:9099"
  )
    throw Error("Controlled local sharing pilot is not enabled here.");
  const auth = await sharingAccount(uid);
  if (!pending) {
    pending = initializeFirestore(auth.app, { localCache: memoryLocalCache() });
    connectFirestoreEmulator(pending, "127.0.0.1", 8087);
  }
  return pending;
}
export async function requestSharingDevice(uid: string, device: PublicDevice) {
  const db = await database(uid);
  await checkPublicDevice(device);
  const ref = doc(db, "deviceRequests", uid);
  const current = await getDocFromServer(ref);
  if (current.exists()) {
    if (current.data().keyId !== device.keyId)
      throw Error(
        "Another device was enrolled for this account. Recovery/re-enrollment needs operator review; no key was replaced.",
      );
  } else
    await setDoc(ref, {
      encryption: device.encryption,
      signing: device.signing,
      keyId: device.keyId,
    });
  await sharingAccount(uid);
}
export async function sharingChannels(
  uid: string,
  role: string,
  device: SharingDevice,
) {
  const db = await database(uid);
  const snap = await getDocFromServer(doc(db, "members", uid));
  if (!snap.exists() || !snap.data().enabled)
    throw Error(
      "This account/device is awaiting explicit pilot approval, or approval was revoked.",
    );
  const member = snap.data() as SharingMember;
  if (member.role !== role || member.keyId !== device.keyId)
    throw Error("This workspace or device is not approved for this account.");
  const result = await getDocsFromServer(
    query(
      collection(db, "channels"),
      where("members", "array-contains", uid),
      limit(20),
    ),
  );
  await sharingAccount(uid);
  return result.docs.map((d) => ({ ...d.data(), id: d.id }) as SharingChannel);
}
export async function checkedChannel(
  uid: string,
  channelId: string,
  device: SharingDevice,
  role: string,
) {
  const db = await database(uid);
  const member = await getDocFromServer(doc(db, "members", uid));
  if (
    !member.exists() ||
    member.data().role !== role ||
    !member.data().enabled ||
    member.data().keyId !== device.keyId
  )
    throw Error("This workspace or device is not approved.");
  const snap = await getDocFromServer(doc(db, "channels", channelId));
  if (!snap.exists()) throw Error("This connection is unavailable.");
  const channel = { ...snap.data(), id: snap.id } as SharingChannel;
  if (!channel.enabled || !channel.members.includes(uid))
    throw Error("Future sharing is blocked for this connection.");
  await checkPublicDevice(channel.sender);
  await checkPublicDevice(channel.recipient);
  let scope: AssignmentRoute | undefined;
  if (channel.assignmentRouteId) {
    const routeSnap = await getDocFromServer(
      doc(db, "assignmentRoutes", channel.assignmentRouteId),
    );
    const assignment = await getDocFromServer(
      doc(db, "staffAssignments", channel.assignmentRouteId),
    );
    if (
      !routeSnap.exists() ||
      !routeSnap.data().enabled ||
      assignment.data()?.status !== "accepted"
    )
      throw Error(
        "The named staff member must accept this assignment before sharing. Revoked assignments cannot be reopened.",
      );
    scope = { ...routeSnap.data(), id: routeSnap.id } as AssignmentRoute;
    if (
      scope.sourceUid !== channel.senderUid ||
      scope.staffUid !== channel.recipientUid ||
      scope.sourceKeyId !== channel.sender.keyId ||
      scope.staffKeyId !== channel.recipient.keyId
    )
      throw Error("Assignment does not match this approved connection.");
  }
  await sharingAccount(uid);
  return { db, channel, scope };
}
export async function sharingAssignments(
  uid: string,
  role: string,
  device: SharingDevice,
) {
  // Validate the live approved account, workspace and enrolled key first.
  await sharingChannels(uid, role, device);
  const db = await database(uid);
  const routes = await getDocsFromServer(
    query(
      collection(db, "assignmentRoutes"),
      where("participants", "array-contains", uid),
      limit(20),
    ),
  );
  const result = [];
  for (const route of routes.docs) {
    const assignment = await getDocFromServer(
      doc(db, "staffAssignments", route.id),
    );
    result.push({
      route: { ...route.data(), id: route.id } as AssignmentRoute,
      assignment: assignment.exists()
        ? (assignment.data() as StaffAssignment)
        : undefined,
    });
  }
  await sharingAccount(uid);
  return result;
}
export async function changeStaffAssignment(
  uid: string,
  role: string,
  device: SharingDevice,
  routeId: string,
  action: "offer" | "accept" | "revoke",
) {
  if (!navigator.onLine)
    throw Error(
      "Go online to change an assignment. No acceptance or revocation was confirmed.",
    );
  await sharingChannels(uid, role, device);
  const db = await database(uid);
  await runTransaction(db, async (tx) => {
    await sharingAccount(uid);
    const routeSnap = await tx.get(doc(db, "assignmentRoutes", routeId));
    if (!routeSnap.exists() || !routeSnap.data().enabled)
      throw Error("Assignment scope is unavailable.");
    const r = routeSnap.data() as AssignmentRoute;
    const ref = doc(db, "staffAssignments", routeId),
      old = await tx.get(ref);
    if (action === "offer") {
      if (uid !== r.facilityUid || role !== "organization" || old.exists())
        throw Error("Only the approved facility can offer a new assignment.");
      tx.set(ref, {
        status: "pending",
        createdBy: uid,
        updatedBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        acceptedAt: null,
        revokedAt: null,
      });
    } else if (action === "accept") {
      if (
        uid !== r.staffUid ||
        role !== "professional" ||
        old.data()?.status !== "pending"
      )
        throw Error(
          "Only the named professional can accept a pending assignment.",
        );
      tx.update(ref, {
        status: "accepted",
        updatedBy: uid,
        updatedAt: serverTimestamp(),
        acceptedAt: serverTimestamp(),
      });
    } else {
      if (
        uid !== r.facilityUid ||
        role !== "organization" ||
        !["pending", "accepted"].includes(old.data()?.status)
      )
        throw Error(
          "Only the assigning facility can revoke a current assignment.",
        );
      tx.update(ref, {
        status: "revoked",
        updatedBy: uid,
        updatedAt: serverTimestamp(),
        revokedAt: serverTimestamp(),
      });
    }
  });
  await sharingAccount(uid);
}
export async function sendSharedDocument(
  uid: string,
  role: string,
  device: SharingDevice,
  channelId: string,
  fingerprint: string,
  document: SharedDocument,
  transferId: string,
) {
  return sendContent(
    uid,
    role,
    device,
    channelId,
    fingerprint,
    { kind: "document", document },
    transferId,
  );
}
export async function sendSharedProfile(
  uid: string,
  role: string,
  device: SharingDevice,
  channelId: string,
  fingerprint: string,
  profile: SharedProfileSnapshot,
  transferId: string,
) {
  return sendContent(
    uid,
    role,
    device,
    channelId,
    fingerprint,
    { kind: "profile", profile },
    transferId,
  );
}
async function sendContent(
  uid: string,
  role: string,
  device: SharingDevice,
  channelId: string,
  fingerprint: string,
  content: SharedContent,
  transferId: string,
) {
  if (!navigator.onLine) throw Error("Go online to prepare a new delivery. Saved queued deliveries remain available.");
  if ((await queuedTransfers(uid, role)).some(i => i.id === transferId && i.channelId === channelId))
    throw Error("This delivery is already in the encrypted outbox. Resume or check that saved delivery before sending another copy.");
  const { channel, scope } = await checkedChannel(
    uid,
    channelId,
    device,
    role,
  );
  if (scope) await assertAssignmentContent(scope, content, uid);
  if (channel.senderUid !== uid || channel.sender.keyId !== device.keyId)
    throw Error("This account cannot send on this connection.");
  await verifyPeerPin(
    uid,
    channel.recipientUid,
    channel.recipient.keyId,
    fingerprint.trim(),
  );
  const context: TransferContext = {
    id: transferId,
    channelId,
    senderUid: uid,
    recipientUid: channel.recipientUid,
    senderKeyId: device.keyId,
    recipientKeyId: channel.recipient.keyId,
  };
  const ciphertext =
    content.kind === "document"
      ? await encryptTransfer(
          context,
          content.document,
          device,
          channel.recipient,
        )
      : await encryptProfileTransfer(
          context,
          content.profile,
          device,
          channel.recipient,
        );
  await sharingAccount(uid);
  const queued = await prepareQueuedTransfer(context, role, content, ciphertext, device);
  await sharingAccount(uid);
  await saveQueuedTransfer(queued);
  await publishQueuedTransfer(uid, role, device, queued);
  await sharingAccount(uid);
  return transferId;
}
export async function publishQueuedTransfer(uid: string, role: string, device: SharingDevice, item: QueuedTransfer) {
  if (!navigator.onLine) throw Error("Offline. This encrypted delivery is still queued; no relay acknowledgement was confirmed.");
  await sharingAccount(uid);
  const prepared = await openQueuedTransfer(item, uid, role, device);
  const { db, channel, scope } = await checkedChannel(uid, item.channelId, device, role);
  const c = prepared.context;
  if (channel.senderUid !== uid || channel.sender.keyId !== c.senderKeyId ||
      channel.recipientUid !== c.recipientUid || channel.recipient.keyId !== c.recipientKeyId)
    throw Error("The queued recipient or approved device changed. This delivery was not sent.");
  await verifyPeerPin(uid, c.recipientUid, c.recipientKeyId, "");
  if (scope) await assertAssignmentContent(scope, prepared.content, uid);
  const ref = doc(db, "channels", item.channelId, "transfers", item.id);
  const base = { senderUid: uid, recipientUid: c.recipientUid, senderKeyId: c.senderKeyId, recipientKeyId: c.recipientKeyId };
  const manifest = prepared.ciphertext.length > INLINE_CIPHERTEXT_LIMIT ? await chunkManifest(prepared.ciphertext) : undefined;
  const envelope = manifest ? { version: 2, ...base, ...manifest } : { version: 1, ...base, ciphertext: prepared.ciphertext };
  const exact = (value: Record<string, unknown>, expected: Record<string, unknown>) => {
    if (Object.entries(expected).some(([key, v]) => value[key] !== v))
      throw Error("This transfer ID contains a different envelope. No delivery was replaced or acknowledged.");
  };
  const storeExact = async (target: DocumentReference, value: Record<string, unknown>) => {
    if (!navigator.onLine) throw Error("Offline. The encrypted upload remains queued and can resume.");
    await runTransaction(db, async tx => {
      await sharingAccount(uid);
      const previous = await tx.get(target);
      await sharingAccount(uid);
      if (previous.exists()) exact(previous.data(), value);
      else tx.set(target, { ...value, createdAt: serverTimestamp() });
    });
  };
  if (manifest) {
    const upload = doc(db, "channels", item.channelId, "uploads", item.id);
    await storeExact(upload, envelope);
    for (let index = 0; index < manifest.chunkCount; index++) {
      const ciphertext = prepared.ciphertext.slice(index * CIPHERTEXT_CHUNK_SIZE, (index + 1) * CIPHERTEXT_CHUNK_SIZE);
      await storeExact(doc(upload, "chunks", String(index)), { index, ciphertext });
    }
  }
  // The final transfer is discoverable only after every immutable part is stored.
  await storeExact(ref, envelope);
  const confirmed = await getDocFromServer(ref);
  if (!confirmed.exists()) throw Error("Relay storage was not confirmed. The delivery remains queued.");
  exact(confirmed.data(), envelope);
  const at = confirmed.data().createdAt?.toDate()?.toISOString();
  if (!at) throw Error("Relay acknowledgement is missing. The delivery remains queued.");
  await sharingAccount(uid);
  await acknowledgeQueuedTransfer(item, at);
  return item.id;
}
export async function receiveSharedDocuments(
  uid: string,
  role: string,
  device: SharingDevice,
  channelId: string,
  fingerprint: string,
) {
  const { db, channel, scope } = await checkedChannel(
    uid,
    channelId,
    device,
    role,
  );
  if (channel.recipientUid !== uid || channel.recipient.keyId !== device.keyId)
    throw Error("This account cannot receive on this connection.");
  await verifyPeerPin(
    uid,
    channel.senderUid,
    channel.sender.keyId,
    fingerprint.trim(),
  );
  const result = await getDocsFromServer(
    query(
      collection(db, "channels", channelId, "transfers"),
      orderBy("createdAt", "desc"),
      limit(20),
    ),
  );
  for (const snap of result.docs) {
    const data = snap.data();
    const item: SavedTransfer = {
      recipientRole: role,
      id: snap.id,
      channelId,
      senderUid: channel.senderUid,
      recipientUid: uid,
      senderKeyId: channel.sender.keyId,
      recipientKeyId: device.keyId,
      ciphertext: "",
      sender: channel.sender,
      savedAt: new Date().toISOString(),
    };
    if (
      data.senderUid !== item.senderUid ||
      data.recipientUid !== item.recipientUid ||
      data.senderKeyId !== item.senderKeyId ||
      data.recipientKeyId !== item.recipientKeyId
    )
      throw Error("Transfer metadata does not match the approved connection.");
    if (data.version === 2) {
      const manifest = checkChunkManifest(data as ChunkManifest), chunks: string[] = [];
      for (let index = 0; index < manifest.chunkCount; index++) {
        await sharingAccount(uid);
        const part = await getDocFromServer(doc(db, "channels", channelId, "uploads", snap.id, "chunks", String(index)));
        if (!part.exists() || part.data().index !== index)
          throw Error("The encrypted attachment is incomplete. No partial document was saved.");
        chunks.push(checkCiphertextChunk(manifest, index, part.data().ciphertext));
      }
      item.ciphertext = await assembleCiphertext(manifest, chunks);
    } else if (data.version === 1) item.ciphertext = data.ciphertext;
    else throw Error("Unsupported encrypted transfer version.");
    const content = await decryptSharedTransfer(
      item.ciphertext,
      item,
      device,
      channel.sender,
    );
    if (scope) await assertAssignmentContent(scope, content, channel.senderUid);
    item.kind = content.kind;
    await sharingAccount(uid);
    await saveReceived(uid, item);
    await sharingAccount(uid);
  }
  return result.size;
}
