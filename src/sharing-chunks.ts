import { contentDigest } from "./sharing-profile";
export const INLINE_CIPHERTEXT_LIMIT = 700000;
export const CIPHERTEXT_CHUNK_SIZE = 400000;
export const MAX_CIPHERTEXT_LENGTH = 28000000;
export type ChunkManifest = { chunkCount: number; ciphertextLength: number; ciphertextHash: string };
export function checkChunkManifest(value: ChunkManifest) {
  if (!Number.isSafeInteger(value.ciphertextLength) || value.ciphertextLength <= INLINE_CIPHERTEXT_LIMIT ||
      value.ciphertextLength > MAX_CIPHERTEXT_LENGTH || !Number.isSafeInteger(value.chunkCount) ||
      value.chunkCount !== Math.ceil(value.ciphertextLength / CIPHERTEXT_CHUNK_SIZE) ||
      !/^[a-f0-9]{64}$/.test(value.ciphertextHash)) throw Error("Invalid encrypted attachment manifest.");
  return value;
}
export async function chunkManifest(ciphertext: string): Promise<ChunkManifest> {
  return checkChunkManifest({ chunkCount: Math.ceil(ciphertext.length / CIPHERTEXT_CHUNK_SIZE),
    ciphertextLength: ciphertext.length, ciphertextHash: await contentDigest(new TextEncoder().encode(ciphertext)) });
}
export function checkCiphertextChunk(manifest: ChunkManifest, index: number, value: unknown) {
  checkChunkManifest(manifest);
  const length = Math.min(CIPHERTEXT_CHUNK_SIZE, manifest.ciphertextLength - index * CIPHERTEXT_CHUNK_SIZE);
  if (!Number.isSafeInteger(index) || index < 0 || index >= manifest.chunkCount ||
      typeof value !== "string" || value.length !== length || !/^[A-Za-z0-9_.-]+$/.test(value))
    throw Error("An encrypted attachment part is missing or invalid. No partial document was saved.");
  return value;
}
export async function assembleCiphertext(manifest: ChunkManifest, chunks: string[]) {
  checkChunkManifest(manifest);
  if (chunks.length !== manifest.chunkCount) throw Error("The encrypted attachment is incomplete.");
  const ciphertext = chunks.map((part, index) => checkCiphertextChunk(manifest, index, part)).join("");
  if (await contentDigest(new TextEncoder().encode(ciphertext)) !== manifest.ciphertextHash)
    throw Error("The encrypted attachment digest does not match. No partial document was saved.");
  return ciphertext;
}
