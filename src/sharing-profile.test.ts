import { describe, it, expect } from "vitest";
import {
  createProfileSnapshot,
  checkProfileSnapshot,
  contentDigest,
  sourceProfileId,
  groupProfileVersions,
  matchesProfileOriginal,
} from "./sharing-profile";
import {
  newSharingDevice,
  encryptProfileTransfer,
  decryptSharedTransfer,
  decryptTransfer,
} from "./sharing-crypto";
import type { Patient } from "./records-model";
const source: Patient = {
  id: "self",
  kind: "mother",
  name: "Fictional Mother",
  birthDate: "1997-01-01",
  history: "Recorded history only",
  createdAt: "2026-10-20T10:00:00.000Z",
  updatedAt: "2026-10-20T10:00:00.000Z",
  profile: {
    username: "private-name",
    profileCode: "secret-permanent-code",
    bloodGroup: "B+",
    allergies: "Recorded allergy",
    emergencyContact: "Fictional contact",
    emergencyPhone: "",
    guardian: "",
    guardianPhone: "",
    residence: "",
    pregnancyWeeks: 22,
    recordedOn: "2026-10-20",
  },
};
async function document() {
  const bytes = new TextEncoder().encode("%PDF Original bytes");
  return {
    id: "original",
    kind: "reports" as const,
    name: "original.pdf",
    type: "application/pdf",
    size: bytes.length,
    addedAt: source.createdAt,
    source: "Fictional clinic",
    reportDate: "2026-10-20",
    sha256: await contentDigest(bytes),
  };
}
describe("shared profile identity and preserved versions", () => {
  it("never substitutes a different patient's or account's original even when bytes match", async () => {
    const ref = await document(),
      profile = await createProfileSnapshot("mother", source, [ref]);
    const original = {
      sourceUid: "mother",
      sourcePatientId: "self",
      sourceDocumentId: ref.id,
      sha256: ref.sha256,
      type: ref.type,
      size: ref.size,
    };
    expect(matchesProfileOriginal(profile, ref, original)).toBe(true);
    for (const change of [
      { sourceUid: "another-account" },
      { sourcePatientId: "child" },
      { sourceDocumentId: "other-original" },
      { sha256: "a".repeat(64) },
      { type: "image/png" },
      { size: ref.size + 1 },
    ]) {
      expect(
        matchesProfileOriginal(profile, ref, { ...original, ...change }),
      ).toBe(false);
    }
  });
  it("keeps source identity stable across revisions and excludes permanent credentials", async () => {
    const first = await createProfileSnapshot("mother", source, [
      await document(),
    ]);
    const next = await createProfileSnapshot(
      "mother",
      {
        ...source,
        name: "Updated name",
        updatedAt: "2026-10-21T10:00:00.000Z",
      },
      [await document()],
    );
    expect(next.profileId).toBe(first.profileId);
    expect(next.revision).not.toBe(first.revision);
    expect(first.patient.name).toBe(source.name);
    expect(JSON.stringify(first)).not.toContain("private-name");
    expect(JSON.stringify(first)).not.toContain("secret-permanent-code");
    expect(first.patient.details?.pregnancyWeeks).toBe(22);
    expect(await checkProfileSnapshot(first, "mother")).toEqual(first);
  });
  it("separates same-name patients, accounts and family members without implicit access", async () => {
    const first = await createProfileSnapshot("one", source, []);
    const otherAccount = await createProfileSnapshot("two", source, []);
    const otherPatient = await createProfileSnapshot(
      "one",
      { ...source, id: "different" },
      [],
    );
    expect(
      new Set([first.profileId, otherAccount.profileId, otherPatient.profileId])
        .size,
    ).toBe(3);
    const child = await createProfileSnapshot(
      "one",
      {
        id: "child",
        kind: "child",
        parentId: "self",
        name: "Fictional Child",
        birthDate: "2024-01-01",
        history: "",
        child: { sex: "", bloodGroup: "", allergies: "" },
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
      },
      [],
    );
    expect(child.profileId).not.toBe(first.profileId);
    expect(child.patient.parentProfileId).toBe(first.profileId);
    expect(child).not.toHaveProperty("parentRecords");
  });
  it("rejects identity substitution, secret fields, modified revisions and malformed references", async () => {
    const snapshot = await createProfileSnapshot("mother", source, [
      await document(),
    ]);
    await expect(checkProfileSnapshot(snapshot, "intruder")).rejects.toThrow(
      "signed sender",
    );
    await expect(
      checkProfileSnapshot(
        { ...snapshot, profileId: await sourceProfileId("other", "self") },
        "mother",
      ),
    ).rejects.toThrow("identity");
    await expect(
      checkProfileSnapshot(
        { ...snapshot, patient: { ...snapshot.patient, name: "Altered" } },
        "mother",
      ),
    ).rejects.toThrow("revision");
    await expect(
      checkProfileSnapshot(
        {
          ...snapshot,
          patient: {
            ...snapshot.patient,
            details: { ...snapshot.patient.details, profileCode: "injected" },
          },
        },
        "mother",
      ),
    ).rejects.toThrow("fields");
    await expect(
      checkProfileSnapshot(
        {
          ...snapshot,
          documents: [snapshot.documents[0], snapshot.documents[0]],
        },
        "mother",
      ),
    ).rejects.toThrow("Duplicate");
    await expect(
      checkProfileSnapshot(
        {
          ...snapshot,
          documents: [{ ...snapshot.documents[0], sha256: "wrong" }],
        },
        "mother",
      ),
    ).rejects.toThrow();
    await expect(
      checkProfileSnapshot(
        { ...snapshot, sourceUpdatedAt: "not-a-date" },
        "mother",
      ),
    ).rejects.toThrow();
  });
  it("canonicalizes document order and hashes original bytes, not filenames", async () => {
    const a = await document(),
      b = { ...(await document()), id: "another" };
    const one = await createProfileSnapshot("mother", source, [a, b]),
      two = await createProfileSnapshot("mother", source, [b, a]);
    expect(one.revision).toBe(two.revision);
    expect(a.sha256).not.toBe(
      await contentDigest(new TextEncoder().encode("different bytes")),
    );
  });
  it("deduplicates identical versions, retains earlier records, and never merges lookalikes", async () => {
    const one = await createProfileSnapshot("mother", source, []),
      two = await createProfileSnapshot(
        "mother",
        { ...source, history: "A later correction" },
        [],
      ),
      other = await createProfileSnapshot("stranger", source, []);
    const received = [one, two, one, other].map((snapshot, i) => ({
      snapshot,
      savedAt: `2026-10-2${i}T10:00:00.000Z`,
      transferId: `packet-${i}`,
    }));
    const groups = groupProfileVersions(received);
    expect(groups).toHaveLength(2);
    expect(groups[0].versions.map((v) => v.snapshot.patient.history)).toEqual([
      source.history,
      "A later correction",
    ]);
    expect(one.patient.history).toBe(source.history);
    const shuffled = groupProfileVersions([
      received[2],
      received[1],
      received[0],
    ]);
    expect(shuffled[0].versions.map((v) => v.snapshot.revision)).toEqual([
      one.revision,
      two.revision,
    ]);
    expect(shuffled[0].versions[0].savedAt).toBe(received[0].savedAt);
  });
  it("encrypts and signs profile versions with context binding and an original-file type boundary", async () => {
    const sender = await newSharingDevice(),
      recipient = await newSharingDevice();
    const profile = await createProfileSnapshot("mother", source, [
      await document(),
    ]);
    const context = {
      id: crypto.randomUUID(),
      channelId: "approved",
      senderUid: "mother",
      recipientUid: "doctor",
      senderKeyId: sender.keyId,
      recipientKeyId: recipient.keyId,
    };
    const cipher = await encryptProfileTransfer(
      context,
      profile,
      sender,
      recipient,
    );
    expect(cipher).not.toContain(source.name);
    expect(cipher).not.toContain(profile.documents[0].name);
    expect(
      await decryptSharedTransfer(cipher, context, recipient, sender),
    ).toEqual({ kind: "profile", profile });
    await expect(
      decryptTransfer(cipher, context, recipient, sender),
    ).rejects.toThrow("contains a profile");
    await expect(
      decryptSharedTransfer(
        cipher,
        { ...context, channelId: "other" },
        recipient,
        sender,
      ),
    ).rejects.toThrow("does not match");
    await expect(
      encryptProfileTransfer(
        { ...context, senderUid: "forged" },
        profile,
        sender,
        recipient,
      ),
    ).rejects.toThrow("signed sender");
  });
});
