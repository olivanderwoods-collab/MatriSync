import { describe, expect, it } from "vitest";
import { assembleCiphertext, chunkManifest, checkChunkManifest, checkCiphertextChunk, CIPHERTEXT_CHUNK_SIZE } from "./sharing-chunks";
import { newSharingDevice, encodeFile, decodeFile, encryptTransfer, decryptTransfer, SHARING_FILE_LIMIT } from "./sharing-crypto";
describe("bounded encrypted attachment chunks", () => {
  it("reassembles a signed large original with byte equality and rejects substituted chunks", async () => {
    const sender = await newSharingDevice(), recipient = await newSharingDevice();
    const context = { id: crypto.randomUUID(), channelId: "large", senderUid: "mother", recipientUid: "doctor",
      senderKeyId: sender.keyId, recipientKeyId: recipient.keyId };
    const bytes = new Uint8Array(SHARING_FILE_LIMIT).map((_, i) => i % 251);
    const document = { name: "large.pdf", type: "application/pdf", bytes: encodeFile(bytes),
      source: "Synthetic clinic", patientName: "Synthetic Mother", sourcePatientId: "self", sourceDocumentId: "large" };
    const encrypted = await encryptTransfer(context, document, sender, recipient);
    const manifest = await chunkManifest(encrypted);
    const chunks = Array.from({ length: manifest.chunkCount }, (_, i) => encrypted.slice(i * CIPHERTEXT_CHUNK_SIZE, (i + 1) * CIPHERTEXT_CHUNK_SIZE));
    expect(chunks.length).toBeGreaterThan(2);
    const complete = await assembleCiphertext(manifest, chunks);
    expect(Buffer.from(decodeFile((await decryptTransfer(complete, context, recipient, sender)).bytes)).equals(Buffer.from(bytes))).toBe(true);
    await expect(assembleCiphertext(manifest, chunks.slice(1))).rejects.toThrow("incomplete");
    await expect(assembleCiphertext(manifest, [chunks[1], chunks[0], ...chunks.slice(2)])).rejects.toThrow("digest");
    await expect(assembleCiphertext(manifest, ["a".repeat(chunks[0].length), ...chunks.slice(1)])).rejects.toThrow("digest");
  }, 30000);
  it("bounds manifest counts, sizes and chunk lengths before assembly", async () => {
    const manifest = await chunkManifest("a".repeat(700001));
    for (const change of [{ chunkCount: 71 }, { chunkCount: 1.5 }, { ciphertextLength: 28000001 },
      { ciphertextLength: 700000 }, { ciphertextHash: "bad" }]) expect(() => checkChunkManifest({ ...manifest, ...change })).toThrow();
    for (const index of [-1, 2, 0.5]) expect(() => checkCiphertextChunk(manifest, index, "a".repeat(400000))).toThrow();
    expect(() => checkCiphertextChunk(manifest, 0, "a".repeat(399999))).toThrow();
    expect(() => checkCiphertextChunk(manifest, 0, " ".repeat(400000))).toThrow();
  });
  it("round trips the full 10 MiB boundary and rejects an oversized original", () => {
    const original = new Uint8Array(SHARING_FILE_LIMIT).fill(125);
    expect(Buffer.from(decodeFile(encodeFile(original))).equals(Buffer.from(original))).toBe(true);
    expect(() => encodeFile(new Uint8Array(SHARING_FILE_LIMIT + 1))).toThrow("10 MiB");
  });
});
