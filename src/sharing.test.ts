import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  newSharingDevice,
  encryptTransfer,
  decryptTransfer,
  encodeFile,
  decodeFile,
  type TransferContext,
} from "./sharing-crypto";
import {
  localSharingDevice,
  verifyPeerPin,
  saveReceived,
  savedTransfers,
  transfersForWorkspace,
} from "./sharing-storage";
import { readSharedInbox } from "./sharing-inbox";
const document = {
  name: "private-report.pdf",
  type: "application/pdf",
  bytes: encodeFile(
    new TextEncoder().encode("%PDF-1.4 fictional original bytes"),
  ),
  source: "Fictional clinic",
  patientName: "Private test name",
  sourcePatientId: "patient-123",
  sourceDocumentId: "doc-456",
};
async function fixture() {
  const sender = await newSharingDevice(),
    recipient = await newSharingDevice();
  const context: TransferContext = {
    id: crypto.randomUUID(),
    channelId: "approved-pair",
    senderUid: "sender",
    recipientUid: "recipient",
    senderKeyId: sender.keyId,
    recipientKeyId: recipient.keyId,
  };
  const ciphertext = await encryptTransfer(
    context,
    document,
    sender,
    recipient,
  );
  return { sender, recipient, context, ciphertext };
}
describe("signed encrypted sharing envelopes", () => {
  it("isolates received records by account and verified receiving workspace", async () => {
    const { sender, recipient, context, ciphertext } = await fixture();
    const item = {
      ...context,
      ciphertext,
      sender,
      savedAt: "2026-10-20T00:00:00Z",
    };
    const scoped = {
      ...item,
      recipientRole: "professional",
      kind: "profile" as const,
    };
    expect(
      transfersForWorkspace(
        [item, scoped],
        context.recipientUid,
        "professional",
      ),
    ).toEqual([scoped]);
    expect(
      transfersForWorkspace([scoped], "unrelated", "professional"),
    ).toEqual([]);
    expect(
      await readSharedInbox(
        context.recipientUid,
        "organization",
        [scoped],
        recipient,
      ),
    ).toEqual({ profiles: [], documents: [] });
    const opened = await readSharedInbox(
      context.recipientUid,
      "professional",
      [scoped],
      recipient,
    );
    expect(opened.profiles).toEqual([]); // Unsigned kind metadata cannot relabel content.
    expect(opened.documents[0].document).toEqual(document);
    await expect(
      readSharedInbox(
        context.recipientUid,
        "professional",
        [{ ...scoped, ciphertext: ciphertext + "x" }],
        recipient,
      ),
    ).rejects.toThrow();
  });
  it("atomically annotates legacy copies on authorized re-fetch without replacing receipt or allowing workspace races", async () => {
    const { sender, context, ciphertext } = await fixture();
    const item = {
      ...context,
      ciphertext,
      sender,
      savedAt: "2026-10-20T00:00:00Z",
    };
    await saveReceived(context.recipientUid, item);
    const attempts = await Promise.allSettled(
      ["professional", "organization"].map((recipientRole) =>
        saveReceived(context.recipientUid, {
          ...item,
          recipientRole,
          savedAt: "2026-10-27T00:00:00Z",
        }),
      ),
    );
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((r) => r.status === "rejected")).toHaveLength(1);
    const saved = (await savedTransfers(context.recipientUid)).find(
      (s) => s.id === item.id,
    )!;
    expect(saved).toEqual({ ...item, recipientRole: saved.recipientRole });
    expect(["professional", "organization"]).toContain(saved.recipientRole);
    await saveReceived(context.recipientUid, item);
    expect(
      (await savedTransfers(context.recipientUid)).find(
        (s) => s.id === item.id,
      ),
    ).toEqual(saved);
  });
  it("preserves original bytes and keeps document fields out of the relay envelope", async () => {
    const { sender, recipient, context, ciphertext } = await fixture();
    expect(ciphertext.split(".")).toHaveLength(5);
    for (const value of [document.name, document.patientName, document.bytes])
      expect(ciphertext).not.toContain(value);
    expect(
      await decryptTransfer(ciphertext, context, recipient, sender),
    ).toEqual(document);
    expect(recipient.decryptKey.extractable).toBe(false);
    expect(sender.signKey.extractable).toBe(false);
    await expect(
      crypto.subtle.exportKey("jwk", recipient.decryptKey),
    ).rejects.toThrow();
  });
  it("rejects the wrong device, tampering, changed context and false sender", async () => {
    const { sender, recipient, context, ciphertext } = await fixture();
    const stranger = await newSharingDevice();
    await expect(
      decryptTransfer(ciphertext, context, stranger, sender),
    ).rejects.toThrow();
    const parts = ciphertext.split(".");
    parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
    await expect(
      decryptTransfer(parts.join("."), context, recipient, sender),
    ).rejects.toThrow();
    for (const field of [
      "id",
      "channelId",
      "senderUid",
      "recipientUid",
    ] as const)
      await expect(
        decryptTransfer(
          ciphertext,
          { ...context, [field]: "substituted" },
          recipient,
          sender,
        ),
      ).rejects.toThrow("does not match");
    await expect(
      decryptTransfer(
        ciphertext,
        { ...context, senderKeyId: stranger.keyId },
        recipient,
        stranger,
      ),
    ).rejects.toThrow();
    await expect(
      encryptTransfer(context, document, sender, {
        ...recipient,
        keyId: "a".repeat(64),
      }),
    ).rejects.toThrow("fingerprint");
  });
  it("enforces file limits and refuses invalid document formats", async () => {
    expect(() => encodeFile(new Uint8Array(0))).toThrow();
    expect(() => encodeFile(new Uint8Array(256 * 1024 + 1))).toThrow();
    expect(() => decodeFile("!")).toThrow();
    const { sender, recipient, context } = await fixture();
    await expect(
      encryptTransfer(
        context,
        { ...document, type: "text/html" },
        sender,
        recipient,
      ),
    ).rejects.toThrow();
    const maximal = {
      ...document,
      bytes: encodeFile(new Uint8Array(256 * 1024).fill(71)),
    };
    const cipher = await encryptTransfer(context, maximal, sender, recipient);
    expect(cipher.length).toBeLessThanOrEqual(700000);
    expect(
      decodeFile(
        (await decryptTransfer(cipher, context, recipient, sender)).bytes,
      ),
    ).toHaveLength(256 * 1024);
  });
  it("persists nonextractable device keys and binds verified peer pins without silent replacement", async () => {
    const uid = crypto.randomUUID();
    const device = await localSharingDevice(uid),
      reloaded = await localSharingDevice(uid);
    expect(reloaded.keyId).toBe(device.keyId);
    expect(reloaded.decryptKey.extractable).toBe(false);
    await expect(
      verifyPeerPin(uid, "peer", "a".repeat(64), "b".repeat(64)),
    ).rejects.toThrow("fingerprint");
    await verifyPeerPin(uid, "peer", "a".repeat(64), "a".repeat(64));
    await verifyPeerPin(uid, "peer", "a".repeat(64), "");
    await expect(
      verifyPeerPin(uid, "peer", "b".repeat(64), "b".repeat(64)),
    ).rejects.toThrow("changed");
  });
  it("retains encrypted received copies across reload and deduplicates without exposing another account", async () => {
    const { sender, recipient, context, ciphertext } = await fixture();
    const uid = context.recipientUid;
    const item = {
      ...context,
      ciphertext,
      sender: {
        encryption: sender.encryption,
        signing: sender.signing,
        keyId: sender.keyId,
      },
      savedAt: new Date().toISOString(),
    };
    await saveReceived(uid, item);
    await saveReceived(uid, item);
    const saved = await savedTransfers(uid);
    expect(saved.filter((s) => s.id === item.id)).toHaveLength(1);
    expect(JSON.stringify(saved)).not.toContain(document.name);
    expect(await savedTransfers("unrelated")).toEqual([]);
    await expect(saveReceived("unrelated", item)).rejects.toThrow("Wrong");
    await expect(
      saveReceived(uid, { ...item, ciphertext: "replacement" }),
    ).rejects.toThrow("cannot be replaced");
    expect(
      await decryptTransfer(
        saved.find((s) => s.id === item.id)!.ciphertext,
        context,
        recipient,
        sender,
      ),
    ).toEqual(document);
  });
});
