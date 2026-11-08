import { AI_FLAGS, PROVIDER_BLOCKERS } from "./config";
export type GeminiUsage = {
  input?: number;
  output?: number;
  thinking?: number;
  total?: number;
};
// Read only actual SDK metadata. Missing fields remain unavailable, never
// estimated from character counts or replaced with fictional provider quotas.
export function readGeminiUsage(metadata?: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}): GeminiUsage {
  const count = (value?: number) =>
    Number.isSafeInteger(value) && value! >= 0 ? value : undefined;
  return {
    input: count(metadata?.promptTokenCount),
    output: count(metadata?.candidatesTokenCount),
    thinking: count(metadata?.thoughtsTokenCount),
    total: count(metadata?.totalTokenCount),
  };
}
export function requireGemini() {
  if (!AI_FLAGS.gemini) throw Error(PROVIDER_BLOCKERS.gemini);
  // Deliberately fails closed even if someone flips a frontend flag: secure
  // project-wide enforcement and App Check have not yet been implemented.
  throw Error("Verified free-tier gateway unavailable");
}
