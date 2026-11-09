import { checkManualRecord, manualRecordText, type ManualRecord } from "./record-entry";
import {
  deriveVaultKey,
  newSalt,
  seal,
  unseal,
  type VaultEnvelope,
} from "./vault-crypto";
import {
  referralInput,
  validateReferralDrafts,
  type ReferralFields,
} from "./referral-draft";
import { sharingPilotEnabled } from "./sharing-config";
import {
  checkReferralApproval,
  validateReferralApprovals,
} from "./referral-approval";
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
  type Patient,
} from "./records-model";
import {
  validateAccountFields,
  type AccountProfileKind,
} from "./account-profile-model";
import {
  ledgerInput,
  type LedgerInput,
  type LedgerEntry,
} from "./inventory-ledger-model";

export type RecordWorkspace = "mother" | "professional" | "organization";
import {
  returnInput,
  inspectionInput,
  reviewInput,
  inventoryText,
  bandKey,
  returnRevision,
  type ReturnInput,
  type InspectionInput,
  type ReviewInput,
  type BandReturn,
} from "./inventory-returns-model";

// Local provenance boundary, not a verified role or a cross-account sharing grant.
// Existing child records already carry parentId=self; no destructive migration.
function inWorkspace(patient: Patient, workspace: RecordWorkspace) {
  if (workspace === "mother")
    return (
      patient.id === "self" ||
      (patient.kind === "child" && patient.parentId === "self")
    );
  if (workspace === "professional")
    return (
      patient.id !== "self" &&
      patient.kind !== "child" &&
      patient.parentId === undefined
    );
  return false; // Live facility/patient sharing is not connected.
}

export class RecordVault {
  private key?: CryptoKey;
  private envelope?: VaultEnvelope;
  private epoch = 0;
  private writing = false;
  private records?: RecordData;
  constructor(
    readonly uid: string,
    private authorize: () => Promise<void>,
    private readonly workspace: RecordWorkspace = "professional",
  ) {}
  get data(): RecordData | undefined {
    if (!this.records) return undefined;
    const patients = this.records.patients.filter((p) =>
      inWorkspace(p, this.workspace),
    );
    const ids = new Set(patients.map((p) => p.id));
    return {
      ...this.records,
      patients,
      documents: this.records.documents.filter((d) => ids.has(d.patientId)),
      referralDrafts:
        this.workspace === "professional"
          ? this.records.referralDrafts?.filter(
              (d) =>
                (ids.has(d.patientId) || !!d.receivedOrigin) &&
                d.authorUid === this.uid,
            )
          : undefined,
      inventoryLedger:
        this.workspace === "organization"
          ? this.records.inventoryLedger
          : undefined,
      referralApprovals:
        this.workspace === "professional"
          ? this.records.referralApprovals?.filter(
              (a) => a.doctorUid === this.uid,
            )
          : undefined,
      inventoryReturns:
        this.workspace === "organization"
          ? this.records.inventoryReturns
          : undefined,
    };
  }
  private requirePatientAccess(id: string) {
    const patient = this.records?.patients.find((p) => p.id === id);
    if (!patient || !inWorkspace(patient, this.workspace))
      throw Error(
        "This record is not available in this workspace. Linking is required.",
      );
  }
  lock() {
    this.epoch++;
    this.key = undefined;
    this.envelope = undefined;
    this.records = undefined;
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
    this.records = data;
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
    this.records = data;
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
      this.records = data;
    } finally {
      this.writing = false;
    }
  }
  async saveReferralDraft(
    patientId: string,
    fields: ReferralFields,
    documentIds: string[],
    draftId?: string,
    expectedVersion?: string,
  ) {
    await this.authorize();
    if (this.workspace !== "professional" || !this.records)
      throw Error("Open the professional records workspace first.");
    this.requirePatientAccess(patientId);
    const records = this.records;
    const patient = records.patients.find((p) => p.id === patientId)!;
    const drafts = records.referralDrafts || [];
    const previous = draftId
      ? drafts.find(
          (d) =>
            d.id === draftId &&
            !d.receivedOrigin &&
            d.patientId === patientId &&
            d.authorUid === this.uid,
        )
      : undefined;
    if (
      (draftId && !previous) ||
      previous?.versions.at(-1)?.id !== expectedVersion
    )
      throw Error(
        "The draft changed. Reopen its latest saved version before saving.",
      );
    if (
      documentIds.length > 50 ||
      new Set(documentIds).size !== documentIds.length
    )
      throw Error("Choose up to 50 distinct original documents.");
    const documents = documentIds.map((id) => {
      const document = records.documents.find(
        (d) => d.id === id && d.patientId === patientId,
      );
      if (!document)
        throw Error("A selected document is not available for this patient.");
      return {
        id,
        name: document.name,
        source: document.source,
        reportDate: document.reportDate,
      };
    });
    const item = {
      id: previous?.id || crypto.randomUUID(),
      patientId,
      authorUid: this.uid,
      versions: [
        ...(previous?.versions || []),
        {
          id: crypto.randomUUID(),
          savedAt: new Date().toISOString(),
          fields: referralInput(fields),
          patient: {
            name: patient.name,
            birthDate: patient.birthDate,
            updatedAt: patient.updatedAt,
          },
          documents,
        },
      ],
    };
    const next = [...drafts.filter((d) => d.id !== item.id), item];
    validateReferralDrafts(next);
    await this.persist({ ...records, referralDrafts: next });
    return item.id;
  }
  async cacheReferralApproval(draftId: string, versionId: string) {
    if (!sharingPilotEnabled)
      throw Error("Referral approval is not enabled in this build.");
    await this.authorize();
    const draft = this.data?.referralDrafts?.find((d) => d.id === draftId);
    if (this.workspace !== "professional" || !draft)
      throw Error("Open the professional referral first.");
    const epoch = this.epoch;
    const { readReferralApproval } = await import(
      "./sharing-referral-approval"
    );
    const approval = await readReferralApproval(this.uid, draft, versionId);
    if (!approval) return undefined;
    await checkReferralApproval(draft, versionId, approval);
    await this.authorize();
    if (epoch !== this.epoch || !this.records)
      throw Error(
        "The record session changed. No offline approval copy was saved.",
      );
    const previous = this.records.referralApprovals || [];
    const existing = previous.find((a) => a.id === approval.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(approval))
        throw Error(
          "The approval receipt changed. The saved copy was preserved.",
        );
      return existing;
    }
    const next = [...previous, approval];
    validateReferralApprovals(next, this.records.referralDrafts || []);
    await this.persist({ ...this.records, referralApprovals: next });
    return approval;
  }
  async saveReceivedReferralDraft(
    profileId: string,
    profileRevision: string,
    fields: ReferralFields,
    documentIds: string[],
    draftId?: string,
    expectedVersion?: string,
  ) {
    if (!sharingPilotEnabled)
      throw Error("Received-profile drafting is not enabled in this build.");
    await this.authorize();
    if (this.workspace !== "professional" || !this.records)
      throw Error("Open the professional records workspace first.");
    const epoch = this.epoch;
    const { receivedReferralSource } = await import("./shared-referral-source");
    const { selected } = await receivedReferralSource(
      this.uid,
      profileId,
      profileRevision,
    );
    await this.authorize();
    if (epoch !== this.epoch || !this.records)
      throw Error("The record session changed. Nothing was saved.");
    const records = this.records,
      snapshot = selected.snapshot;
    const drafts = records.referralDrafts || [];
    const previous = draftId
      ? drafts.find(
          (d) =>
            d.id === draftId &&
            d.authorUid === this.uid &&
            d.receivedOrigin?.profileId === profileId &&
            d.receivedOrigin.profileRevision === profileRevision &&
            d.receivedOrigin.sourceUid === snapshot.sourceUid &&
            d.receivedOrigin.sourcePatientId === snapshot.sourcePatientId,
        )
      : undefined;
    if (
      (draftId && !previous) ||
      previous?.versions.at(-1)?.id !== expectedVersion
    )
      throw Error(
        "The draft or its source version changed. Reopen the matching saved version before editing.",
      );
    if (
      documentIds.length > 50 ||
      new Set(documentIds).size !== documentIds.length
    )
      throw Error("Choose up to 50 distinct original documents.");
    const documents = documentIds.map((id) => {
      const d = snapshot.documents.find((document) => document.id === id);
      if (!d)
        throw Error("The document is outside this received patient version.");
      return {
        id: d.id,
        name: d.name,
        source: d.source,
        reportDate: d.reportDate,
        sha256: d.sha256,
        type: d.type,
        size: d.size,
      };
    });
    const item = {
      id: previous?.id || crypto.randomUUID(),
      patientId: `shared-${profileId}`,
      authorUid: this.uid,
      receivedOrigin: previous?.receivedOrigin || {
        profileId,
        profileRevision,
        sourceUid: snapshot.sourceUid,
        sourcePatientId: snapshot.sourcePatientId,
        transferId: selected.transferId,
        receivedAt: selected.savedAt,
      },
      versions: [
        ...(previous?.versions || []),
        {
          id: crypto.randomUUID(),
          savedAt: new Date().toISOString(),
          fields: referralInput(fields),
          patient: {
            name: snapshot.patient.name,
            birthDate: snapshot.patient.birthDate,
            updatedAt: snapshot.sourceUpdatedAt,
          },
          documents,
        },
      ],
    };
    const next = [...drafts.filter((d) => d.id !== item.id), item];
    validateReferralDrafts(next);
    await this.persist({ ...records, referralDrafts: next });
    return item.id;
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
    if (!this.records) throw Error("Unlock your records first.");
    const fields = patientInput(input.name, input.birthDate, input.history);
    const previous = id
      ? this.records.patients.find((p) => p.id === id)
      : undefined;
    if (id && !previous && id !== "self") throw Error("Patient not found.");
    if (previous) this.requirePatientAccess(previous.id);
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
    if (!inWorkspace(patient, this.workspace))
      throw Error(
        "This record cannot be created or moved into this workspace.",
      );
    await this.persist({
      ...this.records,
      patients: [
        ...this.records.patients.filter((p) => p.id !== patient.id),
        patient,
      ],
    });
    return patient.id;
  }
  async saveLedgerEntry(input: LedgerInput) {
    if (this.workspace !== "organization")
      throw Error(
        "Inventory records are only available in the organization workspace.",
      );
    if (!this.records) throw Error("Open your records first.");
    const checked = ledgerInput(input);
    const entries = this.records.inventoryLedger || [];
    if (entries.some((e) => e.reference.toUpperCase() === checked.reference))
      throw Error(
        "This record reference already exists, including voided records. Use a unique reference.",
      );
    const entry: LedgerEntry = {
      ...checked,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      createdBy: this.uid,
    };
    await this.persist({
      ...this.records,
      inventoryLedger: [...entries, entry],
    });
    return entry.id;
  }
  private requireInventory() {
    if (this.workspace !== "organization")
      throw Error(
        "Inventory records are only available in the organization workspace.",
      );
    if (!this.records) throw Error("Open your records first.");
    return this.records;
  }
  async saveBandReturn(input: ReturnInput) {
    const records = this.requireInventory();
    const checked = returnInput(input);
    const entries = records.inventoryReturns || [];
    if (
      entries.some((item) => item.reference.toUpperCase() === checked.reference)
    )
      throw Error(
        "This return reference already exists, including voided records.",
      );
    if (
      entries.some(
        (item) =>
          !item.voided && bandKey(item.bandId) === bandKey(checked.bandId),
      )
    )
      throw Error(
        "This band already has an active return record. Record an inspection on that entry instead.",
      );
    const item: BandReturn = {
      ...checked,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      createdBy: this.uid,
      inspections: [],
    };
    await this.persist({ ...records, inventoryReturns: [...entries, item] });
    return item.id;
  }
  async inspectBandReturn(id: string, input: InspectionInput) {
    const records = this.requireInventory();
    const checked = inspectionInput(input);
    const item = records.inventoryReturns?.find((item) => item.id === id);
    if (!item || item.voided)
      throw Error("This return record is unavailable or voided.");
    await this.persist({
      ...records,
      inventoryReturns: records.inventoryReturns!.map((item) =>
        item.id === id
          ? {
              ...item,
              inspections: [
                ...item.inspections,
                {
                  ...checked,
                  id: crypto.randomUUID(),
                  at: new Date().toISOString(),
                  by: this.uid,
                },
              ],
            }
          : item,
      ),
    });
  }
  async voidBandReturn(id: string, reason: string) {
    const records = this.requireInventory();
    const checked = inventoryText(reason, "a correction reason", 500);
    const item = records.inventoryReturns?.find((item) => item.id === id);
    if (!item || item.voided)
      throw Error("This return record is unavailable or already voided.");
    await this.persist({
      ...records,
      inventoryReturns: records.inventoryReturns!.map((item) =>
        item.id === id
          ? {
              ...item,
              voided: {
                reason: checked,
                at: new Date().toISOString(),
                by: this.uid,
              },
            }
          : item,
      ),
    });
  }
  async reviewLedgerEntry(id: string, input: ReviewInput) {
    const records = this.requireInventory();
    const checked = reviewInput(input);
    const entry = records.inventoryLedger?.find((entry) => entry.id === id);
    const linked = records.inventoryReturns?.find(
      (item) => item.id === checked.returnId,
    );
    if (!entry || entry.voided || entry.kind === "deposit")
      throw Error("Select an active refund or settlement record.");
    if (
      !linked ||
      linked.voided ||
      bandKey(linked.bandId) !== bandKey(entry.bandId)
    )
      throw Error(
        "Select an active return with the same printed Band Inventory ID.",
      );
    await this.persist({
      ...records,
      inventoryLedger: records.inventoryLedger!.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              reviews: [
                ...(entry.reviews || []),
                {
                  ...checked,
                  id: crypto.randomUUID(),
                  returnRevision: returnRevision(linked),
                  at: new Date().toISOString(),
                  by: this.uid,
                },
              ],
            }
          : entry,
      ),
    });
  }
  async voidLedgerEntry(id: string, reason: string) {
    if (this.workspace !== "organization")
      throw Error(
        "Inventory records are only available in the organization workspace.",
      );
    if (!this.records) throw Error("Open your records first.");
    if (typeof reason !== "string" || !reason.trim() || reason.length > 500)
      throw Error("Enter a correction reason of up to 500 characters.");
    const entries = this.records.inventoryLedger || [];
    const entry = entries.find((e) => e.id === id);
    if (!entry || entry.voided)
      throw Error("This pending record is unavailable or already voided.");
    await this.persist({
      ...this.records,
      inventoryLedger: entries.map((e) =>
        e.id === id
          ? {
              ...e,
              voided: {
                at: new Date().toISOString(),
                by: this.uid,
                reason: reason.trim(),
              },
            }
          : e,
      ),
    });
  }
  async saveAccountProfile(
    kind: AccountProfileKind,
    input: Record<string, string>,
    attachment?: File,
  ) {
    if (!this.key || !this.records) throw Error("Open your records first.");
    const fields = validateAccountFields(kind, input);
    const epoch = this.epoch;
    const previous = this.records.accountProfiles?.[kind];
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
    if (epoch !== this.epoch || !this.records) throw Error("Account changed.");
    await this.persist(
      {
        ...this.records,
        accountProfiles: {
          ...this.records.accountProfiles,
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
    const credential = this.records?.accountProfiles?.[kind]?.credential;
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
    if (this.workspace !== "mother") return undefined;
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
  async addManualDocument(patientId: string, kind: LocalDocument["kind"], input: ManualRecord, source: string, reportDate: string) {
    if (!this.key || !this.records?.patients.some(p=>p.id===patientId)) throw Error("Unlock the patient's records first.");
    this.requirePatientAccess(patientId);
    if (source.length>200 || (reportDate && (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || !Number.isFinite(Date.parse(reportDate)) || new Date(reportDate).toISOString().slice(0,10)!==reportDate))) throw Error("Check source and document date.");
    const manual=checkManualRecord(input), now=new Date().toISOString();
    const doc:LocalDocument={id:crypto.randomUUID(),patientId,kind,name:manual.title+".txt",type:"text/plain",size:new TextEncoder().encode(manualRecordText(manual)).length,addedAt:now,source:source.trim(),reportDate,manual,enteredBy:this.uid};
    await this.persist({...this.records,documents:[...this.records.documents,doc]});
  }
  async addDocument(
    patientId: string,
    kind: LocalDocument["kind"],
    file: File,
    source: string,
    reportDate: string,
  ) {
    if (!this.key || !this.records?.patients.some((p) => p.id === patientId))
      throw Error("Unlock the patient's records first.");
    this.requirePatientAccess(patientId);
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
    if (epoch !== this.epoch || !this.key || !this.records)
      throw Error("The vault was locked. Select the file again.");
    const id = crypto.randomUUID();
    const sealed = await seal(this.key, bytes, `${this.uid}:file:${id}`);
    if (epoch !== this.epoch || !this.records)
      throw Error("The vault was locked. Select the file again.");
    const doc: LocalDocument = {
      id,
      patientId,
      kind,
      name: file.name,
      type: file.type,
      size: file.size,
      addedAt: new Date().toISOString(),
      enteredBy: this.uid,
      source: source.trim(),
      reportDate,
    };
    await this.persist(
      { ...this.records, documents: [...this.records.documents, doc] },
      undefined,
      { id, sealed },
    );
  }
  async document(id: string) {
    if (!this.key || !this.records) throw Error("Unlock your records first.");
    const doc = this.records.documents.find((d) => d.id === id);
    if (!doc) throw Error("Document not found.");
    this.requirePatientAccess(doc.patientId);
    const epoch = this.epoch;
    await this.authorize();
    if (epoch !== this.epoch || !this.key) throw Error("The vault was locked.");
    if (doc.manual) return {doc, bytes:new TextEncoder().encode(manualRecordText(doc.manual))};
    const sealed = await readFile(this.uid, id);
    if (epoch !== this.epoch || !this.key) throw Error("The vault was locked.");
    const bytes = await unseal(this.key, sealed, `${this.uid}:file:${id}`);
    await this.authorize();
    if (epoch !== this.epoch) throw Error("The vault was locked.");
    return { doc, bytes };
  }
}
