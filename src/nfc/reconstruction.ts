import { sameBinary, type NfcValue } from "./binary";
import { readClinicalSection, type SectionContext } from "./sections";
import { readTravel, type TravelLog } from "./travel";
export type SectionResult<T> = { status: "verified"; value: T } | { status: "missing" | "unavailable"; message: string };
export type Reconstruction = { original: SectionResult<NfcValue>; transport: SectionResult<TravelLog> };
type Input = { packet?: Uint8Array; key?: CryptoKey; context: SectionContext; capacity: number };
async function read<T>(input: Input, open: (packet: Uint8Array, key: CryptoKey, context: SectionContext, capacity: number) => Promise<T>): Promise<SectionResult<T>> {
  if (!input.packet) return {status:"missing",message:"No section was supplied. Missing data was not reconstructed."};
  if (!input.key) return {status:"unavailable",message:"The authorized offline section key is unavailable."};
  try { return {status:"verified",value:await open(input.packet,input.key,input.context,input.capacity)}; }
  catch (e) { return {status:"unavailable",message:e instanceof Error?e.message:"Section cannot be verified."}; }
}
// Caller supplies trusted expected referral binding/sequence and authorized keys.
// This does not establish facility authority or freshness from tag content alone.
export async function reconstructSections(a: Input, b: Input): Promise<Reconstruction> {
  if (a.context.section !== "a" || b.context.section !== "b" || !sameBinary(a.context.binding,b.context.binding)) throw Error("Sections must belong to the same expected referral.");
  const [original,transport]=await Promise.all([read(a,readClinicalSection),read(b,readTravel)]);
  return {original,transport};
}
export function orderedTravel(log: TravelLog) {
  return log.events.map((event,index)=>({event,index,eventTime:new Date(log.tripStartedAt+event.elapsedSeconds*1000).toISOString(),recordedTime:new Date(log.tripStartedAt+event.recordedElapsedSeconds*1000).toISOString()})).sort((a,b)=>a.event.elapsedSeconds-b.event.elapsedSeconds||a.index-b.index);
}
