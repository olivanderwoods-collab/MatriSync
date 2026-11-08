import { beforeEach, describe, expect, it, vi } from "vitest";
import { newSharingDevice, type SharingDevice } from "./sharing-crypto";
import { emptyReferralFields } from "./referral-draft";
import { newCareKey } from "./care-crypto";
import { createCareHandoff } from "./care-client";
import type { CareView } from "./care-model";

const mocks = vi.hoisted(() => ({ commit: vi.fn(), save: vi.fn(), device: vi.fn(), data: new Map<string, unknown>(), sets: vi.fn() }));
vi.mock("./care-model", async importOriginal => ({ ...await importOriginal<object>(), careEnabled: true }));
vi.mock("./care-storage", () => ({ careAccount: async () => ({ app: { options: { projectId: "isolated-test" } } }), saveCareHandoff: mocks.save }));
vi.mock("./sharing-storage", () => ({ localSharingDevice: mocks.device }));
vi.mock("firebase/firestore", () => ({
  getFirestore: () => ({}), doc: (_db: unknown, ...path: string[]) => path.join("/"),
  getDocFromServer: async (path: string) => ({ exists: () => mocks.data.has(path), data: () => mocks.data.get(path) }),
  writeBatch: () => ({ set: mocks.sets, commit: mocks.commit }), serverTimestamp: () => "test-server-timestamp",
}));
let view: CareView, sender: SharingDevice;
beforeEach(async () => {
  vi.clearAllMocks(); mocks.data.clear(); mocks.commit.mockResolvedValue(undefined); mocks.save.mockResolvedValue(undefined);
  sender = await newSharingDevice(); const recipient = await newSharingDevice();
  mocks.device.mockResolvedValue(sender);
  mocks.data.set("careStaff/doctor", { name: "Synthetic doctor", role: "doctor", enabled: true, facilityId: "source-facility" });
  mocks.data.set("careDevices/doctor", sender); mocks.data.set("careDevices/recipient", recipient);
  mocks.data.set("careFacilities/recipient", { enabled: true });
  view = { id: crypto.randomUUID(), key: newCareKey(), profile: { name: "Synthetic mother", birthDate: "", sourceLocalId: "local", sourceUid: "doctor" }, entries: [], verified: true, snapshotOnly: false, receivedAt: "" };
});
describe("connected-care cloud commit and offline recovery boundary", () => {
  it("saves the completed packet only after the cloud batch confirms", async () => {
    const result = await createCareHandoff("doctor", view, "recipient", emptyReferralFields(), 32768);
    expect(result.savedLocally).toBe(true);
    expect(mocks.commit).toHaveBeenCalledTimes(1); expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.commit.mock.invocationCallOrder[0]).toBeLessThan(mocks.save.mock.invocationCallOrder[0]);
    expect(mocks.save.mock.calls[0][1]).toMatchObject({ id: result.id, caseId: view.id, recipientUid: "recipient", recordedAt: result.recordedAt, profile: view.profile });
    expect(mocks.save.mock.calls[0][1]).not.toHaveProperty("key");
  });
  it("returns a confirmed packet with a recovery warning flag when local saving fails", async () => {
    mocks.save.mockRejectedValueOnce(Error("Local storage quota exceeded"));
    const result = await createCareHandoff("doctor", view, "recipient", emptyReferralFields(), 32768);
    expect(result.savedLocally).toBe(false); expect(result.packet.length).toBeGreaterThan(0);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });
  it("does not retain a handoff as completed when the cloud batch fails", async () => {
    mocks.commit.mockRejectedValueOnce(Error("Permission denied"));
    await expect(createCareHandoff("doctor", view, "recipient", emptyReferralFields(), 32768)).rejects.toThrow("Permission denied");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not write a cloud or local handoff when the packet exceeds the selected capacity", async () => {
    await expect(createCareHandoff("doctor", view, "recipient", emptyReferralFields(), 48)).rejects.toThrow();
    expect(mocks.commit).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
});
