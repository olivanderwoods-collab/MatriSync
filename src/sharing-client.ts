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
  type Firestore,
} from "firebase/firestore";
import {
  checkPublicDevice,
  encryptTransfer,
  decryptTransfer,
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

export type SharingChannel = {
  id: string;
  enabled: boolean;
  members: string[];
  senderUid: string;
  recipientUid: string;
  sender: PublicDevice;
  recipient: PublicDevice;
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
async function database(uid: string) {
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
async function checkedChannel(
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
  await sharingAccount(uid);
  return { db, channel };
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
  const { db, channel } = await checkedChannel(uid, channelId, device, role);
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
  const ref = doc(db, "channels", channelId, "transfers", transferId);
  const previous = await getDocFromServer(ref);
  // A repeated send ID is never overwritten or silently called success.
  if (previous.exists())
    throw Error(
      "This transfer ID is already stored. Check the recipient before sending another copy.",
    );
  const ciphertext = await encryptTransfer(
    context,
    document,
    device,
    channel.recipient,
  );
  await sharingAccount(uid);
  await setDoc(ref, {
    version: 1,
    senderUid: uid,
    recipientUid: channel.recipientUid,
    senderKeyId: device.keyId,
    recipientKeyId: channel.recipient.keyId,
    ciphertext,
    createdAt: serverTimestamp(),
  });
  await sharingAccount(uid);
  return transferId;
}
export async function receiveSharedDocuments(
  uid: string,
  role: string,
  device: SharingDevice,
  channelId: string,
  fingerprint: string,
) {
  const { db, channel } = await checkedChannel(uid, channelId, device, role);
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
      id: snap.id,
      channelId,
      senderUid: channel.senderUid,
      recipientUid: uid,
      senderKeyId: channel.sender.keyId,
      recipientKeyId: device.keyId,
      ciphertext: data.ciphertext,
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
    await decryptTransfer(item.ciphertext, item, device, channel.sender);
    await sharingAccount(uid);
    await saveReceived(uid, item);
    await sharingAccount(uid);
  }
  return result.size;
}
