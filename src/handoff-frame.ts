// Public completeness framing for a device that cannot decrypt patient data.
// CRC32 detects truncation/corruption only; signature + AEAD verification is
// still mandatory in the receiving app. Never treat CRC as authentication.
export const HANDOFF_HEADER = "MATRISYNC-HANDOFF/2\n";
export const HANDOFF_FOOTER = "\nEND-MATRISYNC-HANDOFF\n";
export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}
export function frameHandoff(payload: Uint8Array, capacity = 32768) {
  const prefix = new TextEncoder().encode(`${HANDOFF_HEADER}Length:${payload.length}\nCRC32:${crc32(payload)}\n\n`);
  const footer = new TextEncoder().encode(HANDOFF_FOOTER);
  const result = new Uint8Array(prefix.length + payload.length + footer.length);
  if (result.length > capacity || result.length > 32768) throw Error(`Handoff is too large: ${result.length} bytes; capacity ${Math.min(capacity, 32768)}. Nothing was truncated. Use a larger supported tag or a shorter reviewed handoff.`);
  result.set(prefix); result.set(payload, prefix.length); result.set(footer, prefix.length + payload.length);
  return result;
}
export function unframeHandoff(bytes: Uint8Array) {
  if (bytes.length > 32768) throw Error("Handoff exceeds the supported capacity.");
  // Read only the ASCII prefix: a byte boundary inside a Unicode payload is
  // not a decoding error in an otherwise complete packet.
  const boundary = bytes.findIndex((byte, i) => i > 0 && byte === 10 && bytes[i - 1] === 10);
  if (boundary < 0 || boundary > 90) throw Error("Missing or invalid handoff header.");
  const header = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, boundary + 1));
  const match = /^MATRISYNC-HANDOFF\/2\nLength:([1-9][0-9]{0,4})\nCRC32:([a-f0-9]{8})\n\n/.exec(header);
  if (!match) throw Error("Missing or invalid handoff header.");
  const length = Number(match[1]), start = match[0].length;
  if (bytes.length !== start + length + HANDOFF_FOOTER.length || new TextDecoder().decode(bytes.subarray(start + length)) !== HANDOFF_FOOTER)
    throw Error("Incomplete handoff: length or footer does not match.");
  const payload = bytes.slice(start, start + length);
  if (crc32(payload) !== match[2]) throw Error("Handoff checksum differs. Read the complete tag again.");
  return payload;
}
