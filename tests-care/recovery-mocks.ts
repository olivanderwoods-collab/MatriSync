import { readCareCopy, saveCareCopy, saveCareHandoff } from "../src/care-storage";
import { base64 } from "../src/vault-crypto";
import { frameHandoff } from "../src/handoff-frame";
import type { CareView } from "../src/care-model";
import type { ReferralFields } from "../src/referral-draft";
export const fixture = { uid: "isolated-recovery-doctor", creates: 0 };
export const accountAuth = async () => ({ currentUser: { uid: fixture.uid, isAnonymous: false } });
export const useRecords = () => ({});
export const enrollCareDevice = async () => undefined;
export const careMembership = async () => ({ staff: { enabled: true, role: "doctor", name: "Synthetic Doctor", facilityId: "source" } });
export const listCareProfiles = async () => ["patient-a", "patient-b"];
export const listCareFacilities = async () => [{ id: "recipient", name: "Synthetic receiving facility", enabled: true }];
export const loadCareProfile = async (uid: string, id: string) => {
  const view = await readCareCopy(uid, id); if (!view) throw Error("Fixture patient missing");
  return view;
};
export async function createCareHandoff(uid: string, view: CareView, recipientUid: string, fields: ReferralFields, capacity: number) {
  const id = crypto.randomUUID(), recordedAt = new Date().toISOString(), actorName = "Synthetic Doctor";
  const packet = frameHandoff(new TextEncoder().encode("Synthetic packet for " + id), capacity);
  await saveCareHandoff(uid, { version: 1, id, caseId: view.id, sourceUid: uid, recipientUid, profile: view.profile, fields, packet: base64(packet), actorName, recordedAt });
  fixture.creates++; sessionStorage.setItem("fixture-creates", String(fixture.creates));
  return { packet, id, fields, actorName, recordedAt, savedLocally: true };
}
export async function seed() {
  fixture.creates = Number(sessionStorage.getItem("fixture-creates") || 0);
  for (const [id, name] of [["patient-a", "Synthetic Patient A"], ["patient-b", "Synthetic Patient B"]]) {
    if (await readCareCopy(fixture.uid, id)) continue;
    await saveCareCopy(fixture.uid, { id, key: "fixture-key", profile: { name, birthDate: "", sourceLocalId: id, sourceUid: fixture.uid }, entries: [], verified: true, snapshotOnly: false, receivedAt: new Date().toISOString() });
  }
}
const unsupported = async () => { throw Error("Outside this isolated UI test"); };
export const activateCareFacility = unsupported, assignCareStaff = unsupported, contributeCare = unsupported, grantCareProfile = unsupported, receiveCareHandoff = unsupported, registerCareProfile = unsupported;
