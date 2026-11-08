import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";
vi.mock("./sharing-config", () => ({ sharingPilotEnabled: true }));
vi.mock("./sharing-client", () => ({ sharingAccount: async () => {} }));
import { RecordVault } from "./record-vault";
import { createProfileSnapshot, contentDigest } from "./sharing-profile";
import { localSharingDevice, saveReceived } from "./sharing-storage";
import {
  newSharingDevice,
  encryptProfileTransfer,
  encryptTransfer,
  encodeFile,
} from "./sharing-crypto";
import { emptyReferralFields } from "./referral-draft";
import { receivedReferralOriginal } from "./shared-referral-source";
import { readVault } from "./vault-storage";
import { cloudRecords } from "./records-model";

it("drafts from a signed received version without copying a local patient or weakening source/file isolation", async () => {
  const uid = crypto.randomUUID(),
    sourceUid = crypto.randomUUID();
  const sender = await newSharingDevice(),
    receiver = await localSharingDevice(uid);
  const bytes = new TextEncoder().encode("%PDF unchanged signed original");
  const date = "2026-10-29T00:00:00.000Z";
  const ref = {
    id: "report-1",
    name: "source.pdf",
    kind: "reports" as const,
    type: "application/pdf",
    size: bytes.length,
    source: "Recorded source",
    reportDate: "2026-10-20",
    addedAt: date,
    sha256: await contentDigest(bytes),
  };
  const profile = await createProfileSnapshot(
    sourceUid,
    {
      id: "self",
      name: "PRIVATE SHARED MOTHER",
      birthDate: "",
      history: "Source history",
      createdAt: date,
      updatedAt: date,
    },
    [ref],
  );
  const context = {
    id: crypto.randomUUID(),
    channelId: "source-doctor",
    senderUid: sourceUid,
    recipientUid: uid,
    senderKeyId: sender.keyId,
    recipientKeyId: receiver.keyId,
  };
  const encrypted = await encryptProfileTransfer(
    context,
    profile,
    sender,
    receiver,
  );
  await saveReceived(uid, {
    ...context,
    ciphertext: encrypted,
    sender,
    savedAt: date,
    recipientRole: "professional",
  });
  const vault = new RecordVault(uid, async () => {});
  await vault.openOnDevice();
  const fields = {
    ...emptyReferralFields(),
    reason: "PRIVATE REFERRAL REASON",
  };
  const id = await vault.saveReceivedReferralDraft(
    profile.profileId,
    profile.revision,
    fields,
    [ref.id],
  );
  const draft = vault.data!.referralDrafts![0];
  expect(vault.data!.patients).toEqual([]);
  expect(vault.data!.documents).toEqual([]);
  expect(draft.receivedOrigin).toMatchObject({
    profileId: profile.profileId,
    profileRevision: profile.revision,
    sourceUid,
    sourcePatientId: "self",
    transferId: context.id,
  });
  expect(draft.versions[0].documents[0].sha256).toBe(ref.sha256);
  await expect(
    receivedReferralOriginal(
      uid,
      draft.receivedOrigin!,
      draft.versions[0].documents[0],
    ),
  ).rejects.toThrow("not been received");
  // Same bytes under another patient's identity must not satisfy the reference.
  const doc = {
    name: ref.name,
    type: ref.type,
    bytes: encodeFile(bytes),
    source: ref.source,
    patientName: profile.patient.name,
    sourcePatientId: "another-patient",
    sourceDocumentId: ref.id,
  };
  const wrongContext = { ...context, id: crypto.randomUUID() };
  await saveReceived(uid, {
    ...wrongContext,
    ciphertext: await encryptTransfer(wrongContext, doc, sender, receiver),
    sender,
    savedAt: date,
    recipientRole: "professional",
  });
  await expect(
    receivedReferralOriginal(
      uid,
      draft.receivedOrigin!,
      draft.versions[0].documents[0],
    ),
  ).rejects.toThrow("not been received");
  const rightContext = { ...context, id: crypto.randomUUID() };
  await saveReceived(uid, {
    ...rightContext,
    ciphertext: await encryptTransfer(
      rightContext,
      { ...doc, sourcePatientId: "self" },
      sender,
      receiver,
    ),
    sender,
    savedAt: date,
    recipientRole: "professional",
  });
  expect(
    (
      await receivedReferralOriginal(
        uid,
        draft.receivedOrigin!,
        draft.versions[0].documents[0],
      )
    ).bytes,
  ).toEqual(bytes);
  await expect(
    vault.saveReceivedReferralDraft(
      profile.profileId,
      "a".repeat(64),
      fields,
      [],
    ),
  ).rejects.toThrow("exact profile version");
  await expect(
    vault.saveReceivedReferralDraft(
      profile.profileId,
      profile.revision,
      fields,
      ["foreign-document"],
    ),
  ).rejects.toThrow("outside");
  await vault.saveReceivedReferralDraft(
    profile.profileId,
    profile.revision,
    { ...fields, instructions: "Recorded instruction" },
    [ref.id],
    id,
    draft.versions[0].id,
  );
  expect(vault.data!.referralDrafts![0].versions[0]).toEqual(draft.versions[0]);
  await expect(
    vault.saveReceivedReferralDraft(
      profile.profileId,
      profile.revision,
      fields,
      [],
      id,
      draft.versions[0].id,
    ),
  ).rejects.toThrow("changed");
  expect(JSON.stringify(await readVault(uid))).not.toContain(fields.reason);
  expect(JSON.stringify(cloudRecords(vault.data!))).not.toContain(
    profile.patient.name,
  );
  vault.lock();
  await vault.openOnDevice();
  expect(vault.data!.referralDrafts![0].versions).toHaveLength(2);
  const mother = new RecordVault(uid, async () => {}, "mother");
  await mother.openOnDevice();
  expect(mother.data!.referralDrafts).toBeUndefined();
  await expect(
    mother.saveReceivedReferralDraft(
      profile.profileId,
      profile.revision,
      fields,
      [],
    ),
  ).rejects.toThrow("professional");
  const outsider = new RecordVault(crypto.randomUUID(), async () => {});
  await outsider.openOnDevice();
  await expect(
    outsider.saveReceivedReferralDraft(
      profile.profileId,
      profile.revision,
      fields,
      [],
    ),
  ).rejects.toThrow("exact profile version");
});

it("does not treat an Organization receipt as professional access", async () => {
  const uid = crypto.randomUUID(),
    receiver = await localSharingDevice(uid),
    sender = await newSharingDevice();
  const date = "2026-10-29T00:00:00.000Z";
  const profile = await createProfileSnapshot(
    "mother",
    {
      id: "self",
      name: "Organization copy",
      birthDate: "",
      history: "",
      createdAt: date,
      updatedAt: date,
    },
    [],
  );
  const context = {
    id: crypto.randomUUID(),
    channelId: "org-only",
    senderUid: "mother",
    recipientUid: uid,
    senderKeyId: sender.keyId,
    recipientKeyId: receiver.keyId,
  };
  await saveReceived(uid, {
    ...context,
    ciphertext: await encryptProfileTransfer(
      context,
      profile,
      sender,
      receiver,
    ),
    sender,
    savedAt: date,
    recipientRole: "organization",
  });
  const vault = new RecordVault(uid, async () => {});
  await vault.openOnDevice();
  await expect(
    vault.saveReceivedReferralDraft(
      profile.profileId,
      profile.revision,
      { ...emptyReferralFields(), reason: "Attempted draft" },
      [],
    ),
  ).rejects.toThrow("exact profile version");
});
