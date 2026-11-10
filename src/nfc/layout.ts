export type MemoryEvidence = { model: "unknown" | "classic-1k" | "classic-4k"; verifiedDataBlocks: readonly number[]; reservedBlocks: readonly number[] };
export type MemoryLayout = Readonly<{ blocks: readonly number[]; a: readonly number[]; b: readonly number[]; c: readonly number[]; aBytes: number; bBytes: number; cBytes: number; totalBytes: number }>;
export const currentTagEvidence: MemoryEvidence = Object.freeze({ model: "unknown", verifiedDataBlocks: Object.freeze([4, 5, 6]), reservedBlocks: Object.freeze([]) });
export function memoryLayout(evidence: MemoryEvidence): MemoryLayout {
  if (!["unknown", "classic-1k", "classic-4k"].includes(evidence.model)) throw Error("Unsupported tag model.");
  const { verifiedDataBlocks: blocks, reservedBlocks } = evidence;
  if (!Array.isArray(blocks) || !Array.isArray(reservedBlocks) || new Set(blocks).size !== blocks.length || !blocks.length || blocks.length > 215) throw Error("Invalid verified NFC block map.");
  const limit = evidence.model === "classic-1k" ? 64 : 256;
  for (const block of [...blocks, ...reservedBlocks]) {
    if (!Number.isInteger(block) || block < 1 || block >= limit || (block < 128 ? block % 4 === 3 : block % 16 === 15)) throw Error("NFC map contains a manufacturer, trailer or invalid block.");
    if (evidence.model === "unknown" && ![4, 5, 6].includes(block)) throw Error("Unknown tag model: only the existing verified blocks 4–6 are permitted.");
  }
  const usable = [...blocks].filter(b => !reservedBlocks.includes(b)).sort((a, b) => a - b);
  // Whole blocks only. C has a minimum two-block metadata/recovery reservation.
  const cCount = Math.max(2, Math.ceil(usable.length * 0.1));
  const bCount = Math.max(1, Math.floor(usable.length * 0.35));
  const aCount = Math.max(0, Math.min(Math.floor(usable.length * 0.55), usable.length - cCount - bCount));
  const a = Object.freeze(usable.slice(0, aCount)), b = Object.freeze(usable.slice(aCount, aCount + Math.min(bCount, usable.length - aCount)));
  const c = Object.freeze(usable.slice(aCount + b.length));
  return Object.freeze({ blocks: Object.freeze(usable), a, b, c, aBytes: a.length * 16, bBytes: b.length * 16, cBytes: c.length * 16, totalBytes: usable.length * 16 });
}
export function assertSectionFits(bytes: Uint8Array, layout: MemoryLayout, section: "a" | "b") {
  if (!bytes.length || bytes.length > layout[`${section}Bytes`]) throw Error(`Section ${section.toUpperCase()} needs ${bytes.length} bytes; reserved capacity is ${layout[`${section}Bytes`]} bytes. Nothing was truncated or borrowed.`);
}
// A logical block write plan, NOT a hardware writer. Only consume after physical
// capacity/readback/provisioning acceptance. It never includes another section.
export function sectionWritePlan(bytes: Uint8Array, layout: MemoryLayout, section: "a" | "b") {
  assertSectionFits(bytes, layout, section);
  // Refuse caller-forged layouts, including overlapping section maps.
  const all = [...layout.a, ...layout.b, ...layout.c];
  if (new Set(all).size !== all.length || layout.aBytes !== layout.a.length * 16 || layout.bBytes !== layout.b.length * 16 || layout.cBytes !== layout.c.length * 16 || all.some(b => b < 1 || b > 254 || !Number.isInteger(b) || (b < 128 ? b % 4 === 3 : b % 16 === 15))) throw Error("Unsafe NFC section layout.");
  return layout[section].map((block, i) => { const data = new Uint8Array(16); data.set(bytes.slice(i * 16, i * 16 + 16)); return { block, data }; });
}
