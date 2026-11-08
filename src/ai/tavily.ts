import { AI_FLAGS, PROVIDER_BLOCKERS } from "./config";
export const RESEARCH_LABEL =
  "Unverified Internet Research — Not verified in MatriSync.";
export type ResearchSource = { title: string; url: string; content: string };
export function researchSources(value: unknown): ResearchSource[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ResearchSource => {
      if (
        !item ||
        typeof item.title !== "string" ||
        typeof item.content !== "string" ||
        typeof item.url !== "string"
      )
        return false;
      try {
        const url = new URL(item.url);
        return url.protocol === "https:" && !url.username && !url.password;
      } catch {
        return false;
      }
    })
    .slice(0, 8)
    .map(({ title, url, content }) => ({
      title: title.slice(0, 300),
      url,
      content: content.slice(0, 6000),
    }));
}
export function requireTavily() {
  if (!AI_FLAGS.tavily) throw Error(PROVIDER_BLOCKERS.tavily);
  throw Error("Protected zero-cost research proxy unavailable");
}
