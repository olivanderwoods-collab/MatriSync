import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newSharingDevice, encryptTransfer, encodeFile, decryptTransfer } from "./sharing-crypto";
import { prepareQueuedTransfer, openQueuedTransfer, saveQueuedTransfer, queuedTransfers, acknowledgeQueuedTransfer } from "./sharing-outbox";
async function fixture() {
  const sender = await newSharingDevice(), recipient = await newSharingDevice();
  const context = { id: crypto.randomUUID(), channelId: "test-channel", senderUid: crypto.randomUUID(),
    recipientUid: crypto.randomUUID(), senderKeyId: sender.keyId, recipientKeyId: recipient.keyId };
  const document = { name: "private-original.pdf", patientName: "Private Mother", source: "Private clinic", type: "application/pdf",
    sourcePatientId: "self", sourceDocumentId: "original", bytes: encodeFile(new TextEncoder().encode("%PDF-1.7 Original private bytes")) };
  const ciphertext = await encryptTransfer(context, document, sender, recipient);
  const item = await prepareQueuedTransfer(context, "mother", { kind: "document", document }, ciphertext, sender);
  return { sender, recipient, context, document, ciphertext, item };
}
describe("durable encrypted sharing outbox", () => {
  it("retains the exact encrypted envelope and original bytes without plaintext in persisted records", async () => {
    const f = await fixture();
    await saveQueuedTransfer(f.item);
    const [saved] = await queuedTransfers(f.context.senderUid, "mother");
    for (const secret of [f.document.name, f.document.patientName, f.document.source, f.document.bytes, f.ciphertext])
      expect(JSON.stringify(saved)).not.toContain(secret);
    const opened = await openQueuedTransfer(saved, f.context.senderUid, "mother", f.sender);
    expect(opened.ciphertext).toBe(f.ciphertext);
    expect(await decryptTransfer(opened.ciphertext, f.context, f.recipient, f.sender)).toEqual(f.document);
    expect(saved.acknowledgedAt).toBeNull();
  });
  it("isolates account/workspace/device and rejects substituted routing metadata or sealed bytes", async () => {
    const f = await fixture();
    await saveQueuedTransfer(f.item);
    expect(await queuedTransfers("unrelated", "mother")).toEqual([]);
    expect(await queuedTransfers(f.context.senderUid, "organization")).toEqual([]);
    for (const args of [
      [f.item, "other", "mother", f.sender], [f.item, f.context.senderUid, "organization", f.sender],
      [f.item, f.context.senderUid, "mother", f.recipient],
    ] as const) await expect(openQueuedTransfer(args[0], args[1], args[2], args[3])).rejects.toThrow();
    for (const item of [{ ...f.item, channelId: "other" }, { ...f.item, id: crypto.randomUUID() }, { ...f.item, sealed: f.item.sealed.slice(0, -9) }])
      await expect(openQueuedTransfer(item, f.context.senderUid, "mother", f.sender)).rejects.toThrow();
  });
  it("allows only one concurrent enqueue and never replaces the first chosen original", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([saveQueuedTransfer(f.item), saveQueuedTransfer(f.item)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await queuedTransfers(f.context.senderUid, "mother"))[0].sealed).toBe(f.item.sealed);
  });
  it("records an immutable relay timestamp and rejects acknowledgement for altered envelopes", async () => {
    const f = await fixture();
    await saveQueuedTransfer(f.item);
    const at = new Date().toISOString();
    await expect(acknowledgeQueuedTransfer({ ...f.item, sealed: "changed" }, at)).rejects.toThrow();
    expect((await queuedTransfers(f.context.senderUid, "mother"))[0].acknowledgedAt).toBeNull();
    await acknowledgeQueuedTransfer(f.item, at);
    await acknowledgeQueuedTransfer(f.item, at);
    await expect(acknowledgeQueuedTransfer(f.item, "2020-01-01T00:00:00.000Z")).rejects.toThrow();
    expect((await queuedTransfers(f.context.senderUid, "mother"))[0].acknowledgedAt).toBe(at);
  });
});
