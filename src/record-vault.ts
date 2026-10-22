import {
  deriveVaultKey,
  newSalt,
  seal,
  unseal,
  type VaultEnvelope,
} from "./vault-crypto";
import { commitVault, readFile, readVault } from "./vault-storage";
import {
  emptyRecords,
  parseRecords,
  patientInput,
  validatedDocument,
  type RecordData,
  type LocalDocument,
} from "./records-model";

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
      await commitVault(this.uid, this.envelope?.revision, envelope, file);
      if (epoch !== this.epoch) return;
      this.envelope = envelope;
      this.data = data;
    } finally {
      this.writing = false;
    }
  }
  async savePatient(
    input: { name: string; birthDate: string; history: string },
    id?: string,
  ) {
    if (!this.data) throw Error("Unlock your records first.");
    const fields = patientInput(input.name, input.birthDate, input.history);
    const previous = id
      ? this.data.patients.find((p) => p.id === id)
      : undefined;
    if (id && !previous && id !== "self") throw Error("Patient not found.");
    const now = new Date().toISOString();
    const patient = {
      ...fields,
      id: id ?? crypto.randomUUID(),
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
