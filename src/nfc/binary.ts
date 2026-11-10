import { dictionary, entryFor, fieldId, reviewedTerm, type Codebook } from "./dictionary";
export type NfcValue = null | boolean | number | string | NfcValue[] | { [key: string]: NfcValue };
export const MAX_BINARY_BYTES = 32768;
const encoder = new TextEncoder(), decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
class Writer {
  bytes: number[] = [];
  byte(n: number) { if (this.bytes.length >= MAX_BINARY_BYTES) throw Error("NFC data exceeds the bounded codec limit."); this.bytes.push(n); }
  uint(n: number) { if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) throw Error("Invalid unsigned integer."); do { const b = n % 128; n = Math.floor(n / 128); this.byte(b | (n ? 128 : 0)); } while (n); }
  raw(b: Uint8Array) { for (const n of b) this.byte(n); }
}
class Reader {
  at = 0;
  constructor(readonly bytes: Uint8Array) {}
  byte() { if (this.at >= this.bytes.length) throw Error("Incomplete NFC binary record."); return this.bytes[this.at++]; }
  uint() { let n = 0; for (let i = 0; i < 5; i++) { const b = this.byte(); n += (b & 127) * 2 ** (i * 7); if (!(b & 128)) { if (n > 0xffffffff || (i && b === 0)) throw Error("Noncanonical NFC integer."); return n; } } throw Error("NFC integer overflow."); }
  raw(n: number) { if (n > this.bytes.length - this.at) throw Error("Incomplete NFC binary value."); const b = this.bytes.slice(this.at, this.at + n); this.at += n; return b; }
}
function write(w: Writer, value: NfcValue, book: Codebook, depth: number): void {
  if (depth > 12) throw Error("NFC nesting exceeds the safe limit.");
  if (value === null) return w.byte(0);
  if (typeof value === "boolean") return w.byte(value ? 2 : 1);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw Error("NFC numbers must be finite.");
    if (Number.isInteger(value) && value >= 0 && value <= 0xffffffff && !Object.is(value, -0)) { w.byte(3); w.uint(value); return; }
    const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, value); w.byte(4); w.raw(b); return;
  }
  if (typeof value === "string") {
    const term = reviewedTerm(value, book);
    if (term) { w.byte(6); w.uint(term.id); return; }
    // Only canonical ISO instants: reconstruction preserves the exact original
    // spelling. Offset dates, date-only strings and uncertain dates remain text.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
      const ms = Date.parse(value);
      if (Number.isFinite(ms) && new Date(ms).toISOString() === value) {
        const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, ms); w.byte(9); w.raw(b); return;
      }
    }
    const b = encoder.encode(value);
    if (decoder.decode(b) !== value) throw Error("Invalid Unicode in NFC source; nothing was replaced.");
    w.byte(5); w.uint(b.length); w.raw(b); return;
  }
  if (Array.isArray(value)) { if (value.length > 512) throw Error("Too many NFC values."); w.byte(7); w.uint(value.length); for (const item of value) write(w, item, book, depth + 1); return; }
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) throw Error("Unsupported NFC value.");
  const fields = Object.keys(value).map(key => ({ key, id: fieldId(key, book) })).sort((a, b) => a.id - b.id);
  if (fields.length > 256) throw Error("Too many NFC fields.");
  w.byte(8); w.uint(fields.length);
  for (const {key, id} of fields) { w.uint(id); write(w, value[key], book, depth + 1); }
}
function read(r: Reader, book: Codebook, depth: number): NfcValue {
  if (depth > 12) throw Error("NFC nesting exceeds the safe limit.");
  const type = r.byte();
  if (type === 0) return null;
  if (type === 1 || type === 2) return type === 2;
  if (type === 3) return r.uint();
  if (type === 4) { const b = r.raw(8), n = new DataView(b.buffer).getFloat64(0); if (!Number.isFinite(n)) throw Error("Invalid NFC number."); return n; }
  if (type === 5) return decoder.decode(r.raw(r.uint()));
  if (type === 6) { const e = entryFor(r.uint(), book); if (e.category !== "terminology" || e.status !== "reviewed") throw Error("Unapproved NFC terminology code."); return e.term; }
  if (type === 9) {
    const b = r.raw(8), ms = new DataView(b.buffer).getFloat64(0);
    if (!Number.isSafeInteger(ms) || ms < -62167219200000 || ms > 253402300799999) throw Error("Invalid NFC timestamp.");
    return new Date(ms).toISOString();
  }
  if (type === 7) { const count = r.uint(); if (count > 512) throw Error("Too many NFC values."); return Array.from({ length: count }, () => read(r, book, depth + 1)); }
  if (type === 8) {
    const count = r.uint(); if (count > 256) throw Error("Too many NFC fields.");
    const result: { [key: string]: NfcValue } = {}; let previous = 0;
    for (let i = 0; i < count; i++) {
      const id = r.uint(), e = entryFor(id, book);
      if (id <= previous || e.category !== "structure" || ["__proto__", "constructor", "prototype"].includes(e.term)) throw Error("Invalid NFC field order or kind.");
      previous = id; result[e.term] = read(r, book, depth + 1);
    }
    return result;
  }
  throw Error("Unknown NFC binary value type.");
}
export function encodeBinary(value: NfcValue, version = 1): Uint8Array<ArrayBuffer> {
  const w = new Writer(); w.raw(new Uint8Array([77, 67, 1, version >> 8, version & 255]));
  write(w, value, dictionary(version), 0); return new Uint8Array(w.bytes);
}
export function decodeBinary(bytes: Uint8Array): NfcValue {
  if (bytes.length > MAX_BINARY_BYTES) throw Error("Oversized NFC binary record.");
  const r = new Reader(bytes);
  if (r.byte() !== 77 || r.byte() !== 67 || r.byte() !== 1) throw Error("Unsupported NFC binary format.");
  const book = dictionary((r.byte() << 8) | r.byte()), value = read(r, book, 0);
  if (r.at !== bytes.length) throw Error("Unexpected bytes after NFC record.");
  return value;
}
export function sameBinary(a: Uint8Array, b: Uint8Array) { return a.length === b.length && a.every((v, i) => v === b[i]); }
// Compression flag 0=raw, 1=DEFLATE raw. Expansion always bounded, including hostile inputs.
async function transform(bytes: Uint8Array, decompress: boolean) {
  const stream = decompress ? new DecompressionStream("deflate-raw") : new CompressionStream("deflate-raw");
  const reader = new Blob([bytes.slice()]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > MAX_BINARY_BYTES) { await reader.cancel(); throw Error("NFC expansion limit exceeded."); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const result = new Uint8Array(size); let at = 0; for (const chunk of chunks) { result.set(chunk, at); at += chunk.length; } return result;
}
export async function compressBinary(bytes: Uint8Array) {
  if (bytes.length > MAX_BINARY_BYTES) throw Error("Oversized NFC data.");
  let compressed: Uint8Array | undefined;
  if (typeof CompressionStream !== "undefined") { try { compressed = await transform(bytes, false); } catch { /* Exact raw bytes remain valid. */ } }
  const useful = compressed && compressed.length < bytes.length;
  const body = useful ? compressed! : bytes;
  const result = new Uint8Array(body.length + 1); result[0] = useful ? 1 : 0; result.set(body, 1); return result;
}
export async function expandBinary(bytes: Uint8Array) {
  if (bytes.length < 2 || bytes.length > MAX_BINARY_BYTES + 1 || bytes[0] > 1) throw Error("Unsupported NFC compression.");
  return bytes[0] === 1 ? transform(bytes.slice(1), true) : bytes.slice(1);
}
