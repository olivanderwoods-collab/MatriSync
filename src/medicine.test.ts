import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkPairs, clinicalUseEnabled, lookup, pairKey, type DemoDatabase } from "./medicine";
const catalogueText = readFileSync("fixtures/medicine-demo/catalogue.json", "utf8");
const catalogue = JSON.parse(catalogueText);
const interactions = JSON.parse(readFileSync("fixtures/medicine-demo/interactions.json", "utf8"));
const db: DemoDatabase = { catalogue, interactions };
describe("supplied research drafts", () => {
  it("preserves all identities and clinical-release blocks; records the version conflict", () => {
    expect(catalogue.medicines).toHaveLength(162);
    expect(interactions.medicines).toHaveLength(162);
    for (const medicine of db.interactions.medicines) {
      const record = db.catalogue.medicines.find(m => m.id === medicine.legacy_id);
      expect(record?.name).toBe(medicine.name);
      expect(record?.release_to_clinical_checker).toBe(false);
    }
    expect(clinicalUseEnabled).toBe(false);
    expect(interactions.metadata.approved_for_clinical_use).toBe(false);
    expect(createHash("sha256").update(catalogueText).digest("hex")).not.toBe(interactions.metadata.source_catalogue.sha256);
  });
  it("every unordered pair exists once, with valid rule/source references and no false safe status", () => {
    const medicines = db.interactions.medicines;
    expect(Object.keys(db.interactions.pairs_by_id)).toHaveLength(13041);
    let flagged = 0, unresolved = 0;
    const severity = { mild: 1, moderate: 2, severe: 3 };
    for (let i = 0; i < medicines.length; i++) for (let j = i + 1; j < medicines.length; j++) {
      const a = medicines[i], b = medicines[j];
      const key = pairKey(a.id, b.id)!;
      const pair = db.interactions.pairs_by_id[key];
      expect(pair.id).toBe(key);
      expect(new Set([pair.drug_a_id, pair.drug_b_id])).toEqual(new Set([a.id, b.id]));
      expect(pair.may_display_no_interactions).toBe(false);
      if (pair.assessment_status === "unresolved") {
        unresolved++; expect(pair.severity).toBeNull(); expect(pair.rule_ids).toHaveLength(0);
      } else {
        flagged++; expect(pair.assessment_status).toBe("draft_interaction_identified");
        expect(pair.rule_ids.length).toBeGreaterThan(0);
        const levels = pair.rule_ids.map(id => {
          const rule = db.interactions.rules_by_id[id];
          expect(rule).toBeDefined();
          expect(rule.route_scope_by_medicine[a.id]).toBeDefined();
          expect(rule.route_scope_by_medicine[b.id]).toBeDefined();
          for (const source of rule.source_ids) expect(db.interactions.sources_by_id[source]).toBeDefined();
          return severity[rule.severity as keyof typeof severity];
        });
        expect(severity[pair.severity as keyof typeof severity]).toBe(Math.max(...levels));
      }
    }
    expect({ flagged, unresolved }).toEqual({ flagged: 652, unresolved: 12389 });
    for (const record of db.catalogue.medicines) for (const id of record.context_source_ids) expect(db.catalogue.sources[id]).toBeDefined();
  });
  it("resolves aliases without guessed translations or substring matches", () => {
    expect(lookup(db, "  ACETAMINOPHEN ")[0].name).toBe("Paracetamol (acetaminophen)");
    expect(lookup(db, "Vitamin B9")[0].name).toBe("Folic acid");
    expect(lookup(db, "cal")).toEqual([]);
    expect(lookup(db, "unknown herb")).toEqual([]);
    expect(lookup(db, "__proto__")).toEqual([]);
  });
  it("keeps pair results bidirectional, unresolved and distinct from self or unknown entries", () => {
    const [a, b] = db.interactions.medicines;
    expect(pairKey(a.id, b.id)).toBe(pairKey(b.id, a.id));
    expect(checkPairs(db, [a, b])[0].pair.assessment_status).toBe("unresolved");
    expect(() => checkPairs(db, [a, a])).toThrow();
    expect(() => checkPairs(db, [a, { ...b, id: "MS-MED-9999" }])).toThrow();
    expect(() => checkPairs(db, [a])).toThrow();
    expect(() => checkPairs(db, db.interactions.medicines.slice(0, 11))).toThrow();
    expect(checkPairs(db, db.interactions.medicines.slice(0, 10))).toHaveLength(45);
  });
});
