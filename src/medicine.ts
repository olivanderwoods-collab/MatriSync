export type Source = { title: string; url: string };
export type CatalogueMedicine = {
  id: string; name: string; routes: string[];
  plain_language: { drug_class: string; mechanism: string; uses: string };
  pregnancy_context: string; context_source_ids: string[];
  review_status: string; release_to_clinical_checker: boolean;
};
export type Medicine = { id: string; legacy_id: string; name: string; aliases: string[]; routes: string[] };
export type Rule = {
  id: string; severity: string; conditions: string;
  plain_language: { effect: string; action: string };
  source_ids: string[]; source_locator: string;
  route_scope_by_medicine: Record<string, { included_routes: string[]; unreviewed_routes: string[] }>;
};
export type Pair = {
  id: string; drug_a_id: string; drug_b_id: string;
  assessment_status: string; severity: string | null; rule_ids: string[];
  potential_shared_ingredients: string[]; may_display_no_interactions: boolean;
};
export type DemoDatabase = {
  catalogue: { medicines: CatalogueMedicine[]; sources: Record<string, Source> };
  interactions: {
    medicines: Medicine[]; name_index: Record<string, string[]>;
    pairs_by_id: Record<string, Pair>; rules_by_id: Record<string, Rule>;
    sources_by_id: Record<string, Source>;
  };
};
export const normalizeName = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en-IN").trim().replace(/\s+/g, " ");
export function lookup(db: DemoDatabase, value: string): Medicine[] {
  const normalized = normalizeName(value);
  if (!normalized) return [];
  const ids = new Set<string>();
  for (const [alias, matches] of Object.entries(db.interactions.name_index)) {
    if (normalizeName(alias) === normalized) matches.forEach(id => ids.add(id));
  }
  return db.interactions.medicines.filter(m => ids.has(m.id) || normalizeName(m.name) === normalized);
}
export function suggestions(db: DemoDatabase, query: string): Medicine[] {
  const value = normalizeName(query);
  if (value.length < 2) return [];
  return db.interactions.medicines.filter(m => [m.name, ...m.aliases].some(n => normalizeName(n).includes(value))).slice(0, 8);
}
export function pairKey(a: string, b: string) {
  if (a === b || !/^MS-MED-\d{4}$/.test(a) || !/^MS-MED-\d{4}$/.test(b)) return null;
  return `MS-DDI-${[a, b].sort().map(id => id.slice(-4)).join("-")}`;
}
export function checkPairs(db: DemoDatabase, medicines: Medicine[]) {
  const ids = new Set(medicines.map(m => m.id));
  if (medicines.length < 2 || medicines.length > 10 || ids.size !== medicines.length || medicines.some(m => !db.interactions.medicines.some(known => known.id === m.id))) {
    throw new Error("Choose between 2 and 10 different catalogue medicines.");
  }
  return medicines.flatMap((a, i) => medicines.slice(i + 1).map(b => {
    const pair = db.interactions.pairs_by_id[pairKey(a.id, b.id)!];
    return { a, b, pair, rules: (pair?.rule_ids || []).map(id => db.interactions.rules_by_id[id]).filter(Boolean) };
  }));
}
// Clinical release cannot be enabled by changing imported file metadata.
export const clinicalUseEnabled = false;
export const demoDatabaseEnabled = import.meta.env.MODE === "demo";
let pending: Promise<DemoDatabase> | undefined;
export function loadDemoDatabase(): Promise<DemoDatabase> {
  if (!demoDatabaseEnabled) return Promise.reject(new Error("Test database is not included in this build."));
  if (!pending) pending = import("./medicine-demo-loader").then(m => m.load()).catch(error => { pending = undefined; throw error; });
  return pending;
}
