import { it, expect } from "vitest";
import {
  assertAssignmentContent,
  type AssignmentRoute,
} from "./sharing-assignment";
import { createProfileSnapshot } from "./sharing-profile";
import type { SharedContent } from "./sharing-crypto";
it("binds assignment content to the exact signed source patient, never names or family relationships", async () => {
  const profile = await createProfileSnapshot(
    "source",
    {
      id: "self",
      name: "Asha",
      birthDate: "",
      history: "",
      createdAt: "2026-10-27T00:00:00.000Z",
      updatedAt: "2026-10-27T00:00:00.000Z",
    },
    [],
  );
  const scope: AssignmentRoute = {
    id: "scope",
    enabled: true,
    participants: ["source", "facility", "staff"],
    sourceUid: "source",
    sourcePatientId: "self",
    profileId: profile.profileId,
    facilityUid: "facility",
    staffUid: "staff",
    sourceKeyId: "a".repeat(64),
    facilityKeyId: "b".repeat(64),
    staffKeyId: "c".repeat(64),
  };
  const content: SharedContent = { kind: "profile", profile };
  await expect(
    assertAssignmentContent(scope, content, "source"),
  ).resolves.toBeUndefined();
  for (const changed of [
    { sourceUid: "other" },
    { sourcePatientId: "child" },
    { profileId: "a".repeat(64) },
  ])
    await expect(
      assertAssignmentContent(
        scope,
        { kind: "profile", profile: { ...profile, ...changed } },
        "source",
      ),
    ).rejects.toThrow("outside");
  await expect(
    assertAssignmentContent(scope, content, "other"),
  ).rejects.toThrow("outside");
  const document: SharedContent = {
    kind: "document",
    document: {
      name: "same-name.pdf",
      patientName: "Asha",
      type: "application/pdf",
      source: "",
      sourcePatientId: "self",
      sourceDocumentId: "doc",
      bytes: "YQ==",
    },
  };
  await expect(
    assertAssignmentContent(scope, document, "source"),
  ).resolves.toBeUndefined();
  await expect(
    assertAssignmentContent(
      scope,
      {
        ...document,
        document: { ...document.document, sourcePatientId: "child" },
      },
      "source",
    ),
  ).rejects.toThrow("outside");
});
