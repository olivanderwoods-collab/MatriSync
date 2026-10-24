import {
  deriveVaultKey,
  newSalt,
  seal,
  unseal,
  type VaultEnvelope,
} from "./vault-crypto";
import {
  commitVault,
  readFile,
  readVault,
  readDeviceKey,
} from "./vault-storage";
import {
  emptyRecords,
  parseRecords,
  patientInput,
  validatedDocument,
  motherProfileInput,
  type MotherProfile,
  type RecordData,
  type LocalDocument,
} from "./records-model";
import {
  validateAccountFields,
  type AccountProfileKind,
} from "./account-profile-model";

export class RecordVault {
  private key?: CryptoKey;
  private envelope?: VaultEnvelope;
  private epoch = 0;
  private writing = false;
  data?: RecordData;
  constructor(
    readonly uid: string,
    private authorize: () => Promise<void>,
  ) {}
  lock() {
    this.epoch++;
    this.key = undefined;
    this.envelope = undefined;
    this.data = undefined;
  }
  async exists() {
    await this.authorize();
    return !!(await readVault(this.uid));
  }
  // Device-local access only. This is not a shared-key or cloud E2EE protocol.
  async openOnDevice(): Promise<boolean> {
    const epoch = this.epoch;
    await this.authorize();
    const envelope = await readVault(this.uid);
    let key = await readDeviceKey(this.uid);
    if (envelope && !key) return false; // Preserve legacy passphrase records.
    if (!envelope && key)
      throw Error(
        "Record metadata is missing. Existing device key was preserved.",
      );
    if (!key)
      key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    const data = envelope
      ? parseRecords(
          await unseal(
            key,
            envelope,
            `${this.uid}:records:${envelope.revision}`,
          ),
        )
      : emptyRecords();
    await this.authorize();
    if (epoch !== this.epoch)
      throw Error("Account changed. Open records again.");
    this.key = key;
    this.envelope = envelope;
    this.data = data;
    if (!envelope) {
      try {
        await this.persist(data, newSalt(), undefined, key);
      } catch (error) {
        this.lock();
        throw error;
      }
    }
    return true;
  }
  async enableDeviceAccess() {
    const epoch = this.epoch;
    const key = this.key,
      envelope = this.envelope;
    if (!key || !envelope) throw Error("Open the existing records first.");
    await this.authorize();
    if (epoch !== this.epoch)
      throw Error("Account changed. Nothing was saved.");
    // Atomic revision check: never replace a newer record or re-encrypt files.
    await commitVault(this.uid, envelope.revision, envelope, undefined, key);
  }
  async unlock(passphrase: string, create: boolean) {
    const epoch = this.epoch;
    await this.authorize();
    const envelope = await readVault(this.uid);
    if (create && envelope)
      throw Error(
        "A vault already exists. Unlock it with its original passphrase.",
      );
    if (!create && !envelope) throw Error("No vault was found on this device.");
    const salt = envelope?.salt ?? newSalt();
    const key = await deriveVaultKey(passphrase, salt);
    let data = emptyRecords();
    if (envelope) {
      try {
        data = parseRecords(
          await unseal(
            key,
            envelope,
            `${this.uid}:records:${envelope.revision}`,
          ),
        );
      } catch {
        throw Error(
          "Unable to unlock. Check the passphrase; damaged records also cannot be opened.",
        );
      }
    }
    await this.authorize();
    if (epoch !== this.epoch) throw Error("The vault was locked. Try again.");
    this.key = key;
    this.envelope = envelope;
    this.data = data;
    if (!envelope) {
      try {
        await this.persist(data, salt);
      } catch (error) {
        this.lock();
        throw error;
      }
    }
  }
  private async persist(
    data: RecordData,
    salt = this.envelope?.salt,
    file?: { id: string; sealed: Awaited<ReturnType<typeof seal>> },
    deviceKey?: CryptoKey,
  ) {
    if (!this.key || !salt || this.writing)
      throw Error(
        this.writing
          ? "A save is already in progress."
          : "Unlock your records first.",
      );
    const epoch = this.epoch;
    this.writing = true;
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(data));
      if (bytes.length > 512_000)
        throw Error(
          "This vault has reached its current record limit. Nothing was changed.",
        );
      const revision = crypto.randomUUID();
      const envelope: VaultEnvelope = {
        ...(await seal(this.key, bytes, `${this.uid}:records:${revision}`)),
        salt,
        revision,
      };
      await this.authorize();
      if (epoch !== this.epoch)
        throw Error("The vault was locked. Nothing was saved.");
      await commitVault(
        this.uid,
        this.envelope?.revision,
        envelope,
        file,
        deviceKey,
      );
      if (epoch !== this.epoch) return;
      this.envelope = envelope;
      this.data = data;
    } finally {
      this.writing = false;
    }
  }
  async savePatient(
    input: {
      name: string;
      birthDate: string;
      history: string;
      profile?: MotherProfile;
      kind?: "mother" | "child";
      child?: { sex: string; bloodGroup: string; allergies: string };
    },
    id?: string,
  ) {
    if (!this.data) throw Error("Unlock your records first.");
    const fields = patientInput(input.name, input.birthDate, input.history);
    const previous = id
      ? this.data.patients.find((p) => p.id === id)
      : undefined;
    if (id && !previous && id !== "self") throw Error("Patient not found.");
    const now = new Date().toISOString();
    if (
      input.kind === "child" &&
      (!input.birthDate ||
        !input.child ||
        Object.values(input.child).some(
          (v) => typeof v !== "string" || v.length > 1000,
        ))
    )
      throw Error("Enter the child's birth date and valid profile details.");
    const profileId = id ?? crypto.randomUUID();
    const patient = {
      ...previous,
      ...fields,
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.kind === "child"
        ? { parentId: "self", child: input.child }
        : {}),
      ...(input.profile
        ? {
            profile: motherProfileInput({
              ...input.profile,
              username:
                input.profile.username ||
                previous?.profile?.username ||
                `mother.${profileId === "self" ? crypto.randomUUID().slice(0, 8) : profileId.slice(0, 8)}`,
              profileCode:
                previous?.profile?.profileCode ||
                `LOCAL-${crypto.randomUUID()}`,
            }),
          }
        : {}),
      id: profileId,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    await this.persist({
      ...this.data,
      patients: [
        ...this.data.patients.filter((p) => p.id !== patient.id),
        patient,
      ],
    });
    return patient.id;
  }
  async saveAccountProfile(
    kind: AccountProfileKind,
    input: Record<string, string>,
    attachment?: File,
  ) {
    if (!this.key || !this.data) throw Error("Open your records first.");
    const fields = validateAccountFields(kind, input);
    const epoch = this.epoch;
    const previous = this.data.accountProfiles?.[kind];
    let file;
    let credential = previous?.credential;
    if (attachment) {
      if (attachment.name.length > 240)
        throw Error("Use a shorter attachment filename.");
      const bytes = await validatedDocument(attachment);
      if (epoch !== this.epoch || !this.key) throw Error("Account changed.");
      const id = crypto.randomUUID();
      file = {
        id,
        sealed: await seal(this.key, bytes, `${this.uid}:file:${id}`),
      };
      credential = {
        id,
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
      };
    }
    if (epoch !== this.epoch || !this.data) throw Error("Account changed.");
    await this.persist(
      {
        ...this.data,
        accountProfiles: {
          ...this.data.accountProfiles,
          [kind]: {
            fields,
            code: previous?.code || `LOCAL-${crypto.randomUUID()}`,
            updatedAt: new Date().toISOString(),
            ...(credential ? { credential } : {}),
          },
        },
      },
      this.envelope?.salt,
      file,
    );
  }
  async accountCredential(kind: AccountProfileKind) {
    const epoch = this.epoch;
    await this.authorize();
    const credential = this.data?.accountProfiles?.[kind]?.credential;
    const key = this.key;
    if (!credential || !key) throw Error("No saved credential document.");
    const bytes = await unseal(
      key,
      await readFile(this.uid, credential.id),
      `${this.uid}:file:${credential.id}`,
    );
    await this.authorize();
    if (epoch !== this.epoch) throw Error("Account changed.");
    return { bytes, credential };
  }
  async ownCompanionProfile() {
    const epoch = this.epoch;
    await this.authorize();
    const envelope = await readVault(this.uid);
    if (!envelope) return undefined;
    const key = await readDeviceKey(this.uid);
    if (!key)
      throw Error("Open your existing profile once to enable local context.");
    const data = parseRecords(
      await unseal(key, envelope, `${this.uid}:records:${envelope.revision}`),
    );
    await this.authorize();
    if (epoch !== this.epoch)
      throw Error("Account changed. Open the companion again.");
    return data.patients.find((p) => p.id === "self");
  }
  async addDocument(
    patientId: string,
    kind: LocalDocument["kind"],
    file: File,
    source: string,
    reportDate: string,
  ) {
    if (!this.key || !this.data?.patients.some((p) => p.id === patientId))
      throw Error("Unlock the patient's records first.");
    if (
      source.length > 200 ||
      file.name.length > 240 ||
      (reportDate &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate) ||
          !Number.isFinite(Date.parse(reportDate)) ||
          new Date(reportDate).toISOString().slice(0, 10) !== reportDate))
    )
      throw Error("Check the source, date and filename.");
    const epoch = this.epoch;
    const bytes = await validatedDocument(file);
    if (epoch !== this.epoch || !this.key || !this.data)
      throw Error("The vault was locked. Select the file again.");
    const id = crypto.randomUUID();
    const sealed = await seal(this.key, bytes, `${this.uid}:file:${id}`);
    if (epoch !== this.epoch || !this.data)
      throw Error("The vault was locked. Select the file again.");
    const doc: LocalDocument = {
      id,
      patientId,
      kind,
      name: file.name,
      type: file.type,
      size: file.size,
      addedAt: new Date().toISOString(),
      source: source.trim(),
      reportDate,
    };
    await this.persist(
      { ...this.data, documents: [...this.data.documents, doc] },
      undefined,
      { id, sealed },
    );
  }
  async document(id: string) {
    if (!this.key || !this.data) throw Error("Unlock your records first.");
    const doc = this.data.documents.find((d) => d.id === id);
    if (!doc) throw Error("Document not found.");
    const epoch = this.epoch;
    await this.authorize();
    const sealed = await readFile(this.uid, id);
    if (epoch !== this.epoch || !this.key) throw Error("The vault was locked.");
    const bytes = await unseal(this.key, sealed, `${this.uid}:file:${id}`);
    await this.authorize();
    if (epoch !== this.epoch) throw Error("The vault was locked.");
    return { doc, bytes };
  }
}
