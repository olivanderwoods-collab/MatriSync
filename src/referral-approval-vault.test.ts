import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";
vi.mock("./sharing-config", () => ({ sharingPilotEnabled: true }));
const serverRead = vi.hoisted(() => vi.fn());
vi.mock("./sharing-referral-approval", () => ({
  readReferralApproval: serverRead,
}));
import { RecordVault } from "./record-vault";
import { emptyReferralFields } from "./referral-draft";
import {
  checkReferralApproval,
  referralApprovalHash,
  referralApprovalId,
} from "./referral-approval";
import { readVault } from "./vault-storage";
import { cloudRecords } from "./records-model";

it("preserves a server-confirmed approval encrypted offline and refuses foreign, mismatched and replacement receipts", async () => {
  const uid = crypto.randomUUID(),
    vault = new RecordVault(uid, async () => {});
  await vault.openOnDevice();
  const patient = await vault.savePatient({
    name: "Approval cache Mother",
    birthDate: "",
    history: "",
  });
  const draftId = await vault.saveReferralDraft(
    patient,
    { ...emptyReferralFields(), reason: "Recorded reason" },
    [],
  );
  const draft = vault.data!.referralDrafts![0],
    version = draft.versions[0];
  const approval = {
    id: referralApprovalId(draft, version.id),
    doctorUid: uid,
    doctorKeyId: "a".repeat(64),
    facilityUid: "PRIVATE-FACILITY-REFERENCE",
    credentialEventId: crypto.randomUUID(),
    contentHash: await referralApprovalHash(draft, version.id),
    createdAt: "2026-10-30T00:00:00.000Z",
  };
  serverRead.mockResolvedValue({ ...approval, contentHash: "b".repeat(64) });
  await expect(
    vault.cacheReferralApproval(draftId, version.id),
  ).rejects.toThrow("does not match");
  serverRead.mockResolvedValue(approval);
  await vault.cacheReferralApproval(draftId, version.id);
  const envelope = await readVault(uid);
  expect(JSON.stringify(envelope)).not.toContain(approval.facilityUid);
  expect(JSON.stringify(cloudRecords(vault.data!))).not.toContain(
    approval.contentHash,
  );
  await vault.cacheReferralApproval(draftId, version.id);
  expect(await readVault(uid)).toEqual(envelope);
  vault.lock();
  await vault.openOnDevice();
  expect(vault.data!.referralApprovals).toEqual([approval]);
  await expect(
    checkReferralApproval(
      vault.data!.referralDrafts![0],
      version.id,
      vault.data!.referralApprovals![0],
    ),
  ).resolves.toBeUndefined();
  serverRead.mockResolvedValue(undefined);
  await vault.cacheReferralApproval(draftId, version.id);
  expect(vault.data!.referralApprovals).toEqual([approval]);
  serverRead.mockResolvedValue({
    ...approval,
    createdAt: "2026-10-30T00:00:01.000Z",
  });
  await expect(
    vault.cacheReferralApproval(draftId, version.id),
  ).rejects.toThrow("changed");
  expect(await readVault(uid)).toEqual(envelope);
  for (const workspace of ["mother", "organization"] as const) {
    const other = new RecordVault(uid, async () => {}, workspace);
    await other.openOnDevice();
    expect(other.data!.referralApprovals).toBeUndefined();
    await expect(
      other.cacheReferralApproval(draftId, version.id),
    ).rejects.toThrow("professional");
  }
  const outsider = new RecordVault(crypto.randomUUID(), async () => {});
  await outsider.openOnDevice();
  await expect(
    outsider.cacheReferralApproval(draftId, version.id),
  ).rejects.toThrow("professional");
});
