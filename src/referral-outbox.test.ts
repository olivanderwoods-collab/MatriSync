import { it, expect } from "vitest";
import "fake-indexeddb/auto";
import { newSharingDevice } from "./sharing-crypto";
import { emptyReferralFields, type ReferralDraft } from "./referral-draft";
import { referralApprovalHash, referralApprovalId } from "./referral-approval";
import {
  referralPackage,
  encryptReferralPackage,
  decryptReferralPackage,
  originalReferralSignature,
} from "./referral-package";
import {
  encryptForwardedReferral,
  decryptForwardedReferral,
  type ForwardAuthority,
} from "./referral-forward-package";
import {
  prepareQueuedReferral,
  openQueuedReferral,
  saveQueuedReferral,
  queuedReferrals,
  acknowledgeQueuedReferral,
  type PreparedReferral,
} from "./referral-outbox";

async function fixture() {
  const doctor = await newSharingDevice(),
    facility = await newSharingDevice(),
    destination = await newSharingDevice();
  const uid = crypto.randomUUID(),
    now = new Date().toISOString();
  const draft: ReferralDraft = {
    id: crypto.randomUUID(),
    patientId: "local-patient",
    authorUid: uid,
    versions: [
      {
        id: crypto.randomUUID(),
        savedAt: now,
        patient: {
          name: "Private fictional patient",
          birthDate: "",
          updatedAt: now,
        },
        fields: { ...emptyReferralFields(), reason: "Exact supplied reason" },
        documents: [],
      },
    ],
  };
  const approval = {
    id: referralApprovalId(draft, draft.versions[0].id),
    doctorUid: uid,
    doctorKeyId: doctor.keyId,
    facilityUid: `${uid}-facility`,
    credentialEventId: crypto.randomUUID(),
    contentHash: await referralApprovalHash(draft, draft.versions[0].id),
    createdAt: now,
  };
  const context = {
    id: approval.id,
    channelId: crypto.randomUUID(),
    senderUid: uid,
    recipientUid: approval.facilityUid,
    senderKeyId: doctor.keyId,
    recipientKeyId: facility.keyId,
  };
  const value = await referralPackage(draft, draft.versions[0].id, approval);
  const prepared: PreparedReferral = {
    kind: "approved",
    context,
    approval,
    ciphertext: await encryptReferralPackage(value, context, doctor, facility),
  };
  return { doctor, facility, destination, prepared, value, now };
}
it("persists the exact encrypted referral and acknowledgement across reads without exposing clinical text", async () => {
  const f = await fixture(),
    q = await prepareQueuedReferral(f.prepared, f.doctor);
  await saveQueuedReferral(q);
  const [saved] = await queuedReferrals(q.senderUid, "professional");
  expect(JSON.stringify(saved)).not.toContain("Private fictional patient");
  expect(JSON.stringify(saved)).not.toContain("Exact supplied reason");
  expect(JSON.stringify(saved)).not.toContain(f.prepared.ciphertext);
  const opened = await openQueuedReferral(
    saved,
    q.senderUid,
    "professional",
    f.doctor,
  );
  expect(opened).toEqual(f.prepared);
  expect(
    await decryptReferralPackage(
      opened.ciphertext,
      opened.context,
      f.facility,
      f.doctor,
    ),
  ).toEqual(f.value);
  await acknowledgeQueuedReferral(q, f.now);
  await acknowledgeQueuedReferral(q, f.now);
  const [confirmed] = await queuedReferrals(q.senderUid, "professional");
  expect(confirmed.sealed).toBe(q.sealed);
  expect(confirmed.acknowledgedAt).toBe(f.now);
  await expect(
    acknowledgeQueuedReferral(q, "2026-01-01T00:00:00.000Z"),
  ).rejects.toThrow();
});
it("rejects duplicate replacement, wrong account/workspace/device and tampered routing", async () => {
  const f = await fixture(),
    q = await prepareQueuedReferral(f.prepared, f.doctor);
  await saveQueuedReferral(q);
  await expect(
    saveQueuedReferral({ ...q, sealed: "replacement" }),
  ).rejects.toThrow();
  expect((await queuedReferrals(q.senderUid, "professional"))[0]).toEqual(q);
  expect(await queuedReferrals(q.senderUid, "organization")).toEqual([]);
  expect(await queuedReferrals("outsider", "professional")).toEqual([]);
  for (const [uid, role, device] of [
    ["outsider", "professional", f.doctor],
    [q.senderUid, "organization", f.doctor],
    [q.senderUid, "professional", f.facility],
  ] as const)
    await expect(openQueuedReferral(q, uid, role, device)).rejects.toThrow();
  for (const changed of [
    { ...q, channelId: "other" },
    { ...q, id: "other" },
    { ...q, kind: "forwarded" as const },
    { ...q, sealed: q.sealed.slice(0, -10) },
  ])
    await expect(
      openQueuedReferral(changed, q.senderUid, "professional", f.doctor),
    ).rejects.toThrow();
});
it("preserves the original doctor signature through queued forwarding and binds its selected destination", async () => {
  const f = await fixture(),
    source = f.prepared.context;
  const context = {
    id: source.id,
    channelId: crypto.randomUUID(),
    senderUid: source.recipientUid,
    recipientUid: "destination",
    senderKeyId: f.facility.keyId,
    recipientKeyId: f.destination.keyId,
  };
  const authority: ForwardAuthority = {
    source,
    doctor: f.doctor,
    approval: f.prepared.approval,
    initiation: {
      approvalId: source.id,
      contentHash: f.prepared.approval.contentHash,
      initiatedBy: context.senderUid,
      destinationChannelId: context.channelId,
      destinationUid: context.recipientUid,
      destinationKeyId: context.recipientKeyId,
      createdAt: f.now,
    },
  };
  const original = await originalReferralSignature(
    f.prepared.ciphertext,
    source,
    f.facility,
    f.doctor,
  );
  const prepared: PreparedReferral = {
    kind: "forwarded",
    context,
    authority,
    approval: f.prepared.approval,
    ciphertext: await encryptForwardedReferral(
      original,
      context,
      authority,
      f.facility,
      f.destination,
    ),
  };
  const q = await prepareQueuedReferral(prepared, f.facility);
  await saveQueuedReferral(q);
  const reopened = await openQueuedReferral(
    (await queuedReferrals(context.senderUid, "organization"))[0],
    context.senderUid,
    "organization",
    f.facility,
  );
  expect(reopened.ciphertext).toBe(prepared.ciphertext);
  expect(
    await decryptForwardedReferral(
      reopened.ciphertext,
      context,
      authority,
      f.destination,
      f.facility,
    ),
  ).toEqual(f.value);
  await expect(
    prepareQueuedReferral(
      { ...prepared, context: { ...context, recipientUid: "wrong" } },
      f.facility,
    ),
  ).rejects.toThrow();
  await expect(
    prepareQueuedReferral(
      {
        ...prepared,
        authority: {
          ...authority,
          initiation: { ...authority.initiation, contentHash: "b".repeat(64) },
        },
      },
      f.facility,
    ),
  ).rejects.toThrow();
});
