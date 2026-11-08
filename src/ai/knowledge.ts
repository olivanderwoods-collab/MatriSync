export type VerifiedEntry = {
  id: string;
  title: string;
  text: string;
  sourceUrl: string;
  verified: true;
  reviewer: string;
  reviewedAt: string;
};
// Intentionally empty: the supplied 162-entry dataset is explicitly unverified.
// Replacing test files never changes this allowlist or releases clinical generation.
export const verifiedEntries: readonly VerifiedEntry[] = [];
export const MISSING_VERIFIED =
  "Not available in the verified MatriSync database.";
export function verifiedLookup(
  query: string,
  entries: readonly VerifiedEntry[] = verifiedEntries,
) {
  const term = query.trim().toLowerCase();
  return term
    ? entries.filter(
        (e) =>
          e.verified === true &&
          e.reviewer.trim() &&
          Number.isFinite(Date.parse(e.reviewedAt)) &&
          /^https:\/\//.test(e.sourceUrl) &&
          e.title.toLowerCase() === term,
      )
    : [];
}
