import { openSection, sealSection, SECTION_OVERHEAD, type SectionContext } from "./sections";
// Structural observation kinds only; clinical event labels await professional review.
export type TravelEvent = {
  kind: "heartRate" | "oxygenSaturation" | "bloodPressure" | "temperature";
  subject: "mother" | "baby"; source: "sensor" | "manual" | "reported";
  clockQuality: "unverified" | "device" | "synchronized";
  elapsedSeconds: number; recordedElapsedSeconds: number;
  value: number; secondValue: number | null;
};
export type TravelLog = { tripStartedAt: number; events: TravelEvent[] };
const kinds = ["heartRate", "oxygenSaturation", "bloodPressure", "temperature"] as const;
const subjects = ["mother", "baby"] as const, sources = ["sensor", "manual", "reported"] as const, qualities = ["unverified", "device", "synchronized"] as const;
// Units are frozen: beats/min, percent, mmHg (systolic + diastolic), degrees Celsius.
// IEEE754 retains recorded numerical precision. No interpretation/range diagnosis.
export const TRAVEL_HEADER = 12, TRAVEL_RECORD = 28;
export function eventCapacity(sectionBytes: number) { return Math.max(0, Math.min(255, Math.floor((sectionBytes - SECTION_OVERHEAD - TRAVEL_HEADER) / TRAVEL_RECORD))); }
export function encodeTravel(log: TravelLog, sectionBytes: number) {
  if (!Number.isSafeInteger(log.tripStartedAt) || log.tripStartedAt < 0 || log.tripStartedAt > 8640000000000000 || !Array.isArray(log.events) || log.events.length > eventCapacity(sectionBytes) || sectionBytes < SECTION_OVERHEAD + TRAVEL_HEADER) throw Error("Transport section full or invalid trip time. Preserve additional observations locally; do not overwrite the handoff.");
  const bytes = new Uint8Array(TRAVEL_HEADER + log.events.length * TRAVEL_RECORD), view = new DataView(bytes.buffer);
  bytes.set([77, 84, 1, log.events.length]); view.setFloat64(4, log.tripStartedAt);
  log.events.forEach((e, i) => {
    const kind = kinds.indexOf(e.kind), subject = subjects.indexOf(e.subject), source = sources.indexOf(e.source), quality = qualities.indexOf(e.clockQuality);
    if (kind < 0 || subject < 0 || source < 0 || quality < 0 || !Number.isFinite(e.value) || (e.kind === "bloodPressure" ? typeof e.secondValue !== "number" || !Number.isFinite(e.secondValue) : e.secondValue !== null) || [e.elapsedSeconds, e.recordedElapsedSeconds].some(n => !Number.isInteger(n) || n < 0 || n > 0xffffffff || !Number.isSafeInteger(log.tripStartedAt + n * 1000) || log.tripStartedAt + n * 1000 > 8640000000000000)) throw Error("Invalid transport observation; no value or clock was inferred.");
    const at = TRAVEL_HEADER + i * TRAVEL_RECORD;
    bytes.set([kind + 1, subject, source, quality], at); view.setUint32(at + 4, e.elapsedSeconds); view.setUint32(at + 8, e.recordedElapsedSeconds); view.setFloat64(at + 12, e.value); view.setFloat64(at + 20, e.secondValue ?? 0);
  });
  return bytes;
}
export function decodeTravel(bytes: Uint8Array, sectionBytes: number): TravelLog {
  if (bytes.length < TRAVEL_HEADER || bytes[0] !== 77 || bytes[1] !== 84 || bytes[2] !== 1 || bytes.length !== TRAVEL_HEADER + bytes[3] * TRAVEL_RECORD) throw Error("Incomplete or unsupported transport log.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const log: TravelLog = { tripStartedAt: view.getFloat64(4), events: [] };
  for (let i = 0; i < bytes[3]; i++) {
    const at = TRAVEL_HEADER + i * TRAVEL_RECORD, kind = kinds[bytes[at] - 1], extra = view.getFloat64(at + 20);
    if (kind !== "bloodPressure" && !Object.is(extra, 0)) throw Error("Unexpected secondary measurement.");
    log.events.push({ kind, subject: subjects[bytes[at + 1]], source: sources[bytes[at + 2]], clockQuality: qualities[bytes[at + 3]], elapsedSeconds: view.getUint32(at + 4), recordedElapsedSeconds: view.getUint32(at + 8), value: view.getFloat64(at + 12), secondValue: kind === "bloodPressure" ? extra : null });
  }
  encodeTravel(log, sectionBytes); return log;
}
export async function prepareTravel(log: TravelLog, key: CryptoKey, context: SectionContext, capacity: number) {
  if (context.section !== "b") throw Error("Travel observations require Section B.");
  const bytes = encodeTravel(log, capacity), packet = await sealSection(bytes, key, context, capacity);
  const copy = await openSection(packet, key, context, capacity);
  if (copy.length !== bytes.length || copy.some((v, i) => v !== bytes[i])) throw Error("Travel read-back validation failed.");
  decodeTravel(copy, capacity); return packet;
}
export async function readTravel(packet: Uint8Array, key: CryptoKey, context: SectionContext, capacity: number) {
  if (context.section !== "b") throw Error("Travel observations require Section B.");
  return decodeTravel(await openSection(packet, key, context, capacity), capacity);
}
