import type { Firestore } from "firebase/firestore";
import { accountAuth } from "./auth";
import { cloudRecords, parseRecords, type RecordData } from "./records-model";
import {
  deriveVaultKey,
  newSalt,
  seal,
  unseal,
  type VaultEnvelope,
} from "./vault-crypto";

export type CloudEnvelope = VaultEnvelope & {
  kind: "patient-records";
  generation: number;
};
export const CLOUD_RECORDS_ENABLED = false;
export const CLOUD_DOCUMENT_UPLOADS_ENABLED = false;

export async function encryptCloudRecords(
  uid: string,
  data: RecordData,
  passphrase: string,
  salt = newSalt(),
): Promise<VaultEnvelope> {
  const key = await deriveVaultKey(passphrase, salt);
  const bytes = new TextEncoder().encode(JSON.stringify(cloudRecords(data)));
  if (bytes.length > 512_000)
    throw Error("The record backup exceeds the current size limit.");
  const revision = crypto.randomUUID();
  return {
    ...(await seal(key, bytes, `${uid}:cloud-records:${revision}`)),
    salt,
    revision,
  };
}
export async function decryptCloudRecords(
  uid: string,
  envelope: VaultEnvelope,
  passphrase: string,
) {
  const key = await deriveVaultKey(passphrase, envelope.salt);
  const bytes = await unseal(
    key,
    envelope,
    `${uid}:cloud-records:${envelope.revision}`,
  );
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (Object.keys(value).some((k) => !["version", "patients"].includes(k)))
    throw Error("Unexpected cloud record fields.");
  return parseRecords(
    new TextEncoder().encode(JSON.stringify({ ...value, documents: [] })),
  );
}

// The data adapter is independently testable against the emulator. Production
// code must obtain it via connectRecordBackup, which is disabled for live hosts.
export function recordBackupAdapter(
  db: Firestore,
  uid: string,
  authorize: () => Promise<void>,
) {
  if (!uid || uid.includes("/")) throw Error("Invalid account identifier.");
  async function sdk() {
    await authorize();
    return import("firebase/firestore");
  }
  return {
    async read(): Promise<CloudEnvelope | undefined> {
      const { doc, getDocFromServer } = await sdk();
      const snapshot = await getDocFromServer(
        doc(db, "recordOwners", uid, "vaults", "patients"),
      );
      await authorize();
      return snapshot.exists() ? (snapshot.data() as CloudEnvelope) : undefined;
    },
    async write(envelope: VaultEnvelope, expectedRevision: string | undefined) {
      const { doc, runTransaction, serverTimestamp } = await sdk();
      const ref = doc(db, "recordOwners", uid, "vaults", "patients");
      return runTransaction(db, async (tx) => {
        await authorize();
        const current = await tx.get(ref);
        if (current.data()?.revision !== expectedRevision)
          throw Error("The cloud copy changed. Review it before replacing it.");
        const generation = (current.data()?.generation ?? 0) + 1;
        // Explicit envelope projection prevents accidental plaintext extra fields.
        tx.set(ref, {
          version: envelope.version,
          kind: "patient-records",
          salt: envelope.salt,
          iv: envelope.iv,
          ciphertext: envelope.ciphertext,
          revision: envelope.revision,
          generation,
          updatedAt: serverTimestamp(),
        });
        await authorize();
        return { revision: envelope.revision, generation };
      });
    },
  };
}
let pending: Promise<Firestore> | undefined;
export async function connectRecordBackup(uid: string) {
  const emulator = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST;
  const localTest =
    import.meta.env.DEV &&
    ["localhost", "127.0.0.1"].includes(location.hostname) &&
    /^127\.0\.0\.1:[0-9]+$/.test(emulator || "") &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID === "demo-matrisync";
  if (!CLOUD_RECORDS_ENABLED && !localTest)
    throw Error(
      "Firebase record backup is not enabled. Documents remain local.",
    );
  const auth = await accountAuth();
  const authorize = async () => {
    if (auth.currentUser?.uid !== uid || auth.currentUser.isAnonymous)
      throw Error("Sign in to the account that owns these records.");
  };
  await authorize();
  pending ??= (async () => {
    const { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } =
      await import("firebase/firestore");
    const db = initializeFirestore(auth.app, {
      localCache: memoryLocalCache(),
    });
    if (localTest)
      connectFirestoreEmulator(db, "127.0.0.1", Number(emulator.split(":")[1]));
    return db;
  })();
  return recordBackupAdapter(await pending, uid, authorize);
}
