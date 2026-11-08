import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { RecordVault } from "./record-vault";
import { readVault } from "./vault-storage";
import { cloudRecords } from "./records-model";
import { emptyReferralFields, referralInput } from "./referral-draft";
const authorize = async () => {};
it("preserves encrypted referral versions, original bytes and patient attribution across reload", async () => {
  const uid = crypto.randomUUID();
  const vault = new RecordVault(uid, authorize);
  await vault.openOnDevice();
  const patient = await vault.savePatient({
    name: "Referral Mother",
    birthDate: "",
    history: "Original history",
  });
  const other = await vault.savePatient({
    name: "Other patient",
    birthDate: "",
    history: "",
  });
  const bytes = "%PDF-1.7\nOriginal referral source";
  await vault.addDocument(
    patient,
    "reports",
    new File([bytes], "original.pdf", { type: "application/pdf" }),
    "Fictional source",
    "2026-10-20",
  );
  const document = vault.data!.documents[0].id;
  const fields = {
    ...emptyReferralFields(),
    reason: "PRIVATE REFERRAL REASON",
  };
  const id = await vault.saveReferralDraft(patient, fields, [document]);
  const version = vault.data!.referralDrafts![0].versions[0];
  await vault.saveReferralDraft(
    patient,
    { ...fields, instructions: "Clinician entered text" },
    [document],
    id,
    version.id,
  );
  expect(vault.data!.referralDrafts![0].versions).toHaveLength(2);
  expect(vault.data!.referralDrafts![0].versions[0]).toEqual(version);
  await expect(
    vault.saveReferralDraft(patient, fields, [], id, version.id),
  ).rejects.toThrow("changed");
  await expect(
    vault.saveReferralDraft(other, fields, [document]),
  ).rejects.toThrow("not available");
  await expect(
    vault.saveReferralDraft(other, fields, [], id, version.id),
  ).rejects.toThrow("changed");
  expect(JSON.stringify(await readVault(uid))).not.toContain(fields.reason);
  expect(JSON.stringify(cloudRecords(vault.data!))).not.toContain(
    fields.reason,
  );
  vault.lock();
  const reopened = new RecordVault(uid, authorize);
  await reopened.openOnDevice();
  expect(reopened.data!.referralDrafts![0].versions).toHaveLength(2);
  expect(
    reopened.data!.referralDrafts![0].versions[0].documents[0].source,
  ).toBe("Fictional source");
  const original = await reopened.document(document);
  expect(new TextDecoder().decode(original.bytes)).toBe(bytes);
  const mother = new RecordVault(uid, authorize, "mother");
  await mother.openOnDevice();
  expect(mother.data!.referralDrafts).toBeUndefined();
  await expect(mother.saveReferralDraft(patient, fields, [])).rejects.toThrow(
    "professional",
  );
  const unrelated = new RecordVault(crypto.randomUUID(), authorize);
  await unrelated.openOnDevice();
  await expect(
    unrelated.saveReferralDraft(patient, fields, []),
  ).rejects.toThrow("not available");
});
it("allows missing clinical facts including the reason without inventing entries", () => {
  expect(referralInput(emptyReferralFields())).toEqual(emptyReferralFields());
  const fields = { ...emptyReferralFields(), reason: "Recorded reason" };
  expect(referralInput(fields)).toEqual(fields);
  expect(() =>
    referralInput({ ...fields, treatment: "x".repeat(8001) }),
  ).toThrow("8,000");
});
it("rejects a stale browser tab save without replacing the newer draft", async () => {
  const uid = crypto.randomUUID();
  const first = new RecordVault(uid, authorize);
  await first.openOnDevice();
  const patient = await first.savePatient({
    name: "Saved patient name",
    birthDate: "",
    history: "",
  });
  const fields = { ...emptyReferralFields(), reason: "Original reason" };
  const id = await first.saveReferralDraft(patient, fields, []);
  const revision = first.data!.referralDrafts![0].versions[0].id;
  const stale = new RecordVault(uid, authorize);
  await stale.openOnDevice();
  await first.savePatient(
    { name: "Updated patient name", birthDate: "", history: "" },
    patient,
  );
  await first.saveReferralDraft(
    patient,
    { ...fields, reason: "Newer reason" },
    [],
    id,
    revision,
  );
  await expect(
    stale.saveReferralDraft(
      patient,
      { ...fields, reason: "Stale reason" },
      [],
      id,
      revision,
    ),
  ).rejects.toThrow();
  const reopened = new RecordVault(uid, authorize);
  await reopened.openOnDevice();
  const versions = reopened.data!.referralDrafts![0].versions;
  expect(versions).toHaveLength(2);
  expect(versions[0].patient.name).toBe("Saved patient name");
  expect(versions[1].patient.name).toBe("Updated patient name");
  expect(versions[1].fields.reason).toBe("Newer reason");
});
