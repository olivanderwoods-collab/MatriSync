import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { RecordVault } from "./record-vault";
import { cloudRecords, parseRecords } from "./records-model";
import { readVault } from "./vault-storage";
import {
  returnInput,
  inspectionInput,
  reviewInput,
  returnRevision,
  type ReturnInput,
  type ReviewInput,
} from "./inventory-returns-model";
import type { LedgerInput } from "./inventory-ledger-model";
const authorize = async () => {};
const intake: ReturnInput = {
  reference: "RETURN-001",
  bandId: "PRINTED-BAND-44",
  facility: "Fictional receiving facility",
  date: "2026-10-25",
  notes: "Fictional intake",
};
const ledger: LedgerInput = {
  kind: "refund",
  reference: "REFUND-001",
  bandId: intake.bandId,
  facility: intake.facility,
  currency: "INR",
  amount: "123.45",
  date: intake.date,
  notes: "Pending",
};
const review = (returnId: string): ReviewInput => ({
  returnId,
  outcome: "consistent",
  evidence: "PAPER-REF-22",
  notes: "Compared the recorded identifiers only.",
});
async function opened() {
  const vault = new RecordVault(crypto.randomUUID(), authorize, "organization");
  await vault.openOnDevice();
  return vault;
}

describe("local return intake and reconciliation notes", () => {
  it("validates references, dates, conditions and review outcomes without accepting a settled state", () => {
    expect(
      returnInput({ ...intake, reference: " return-001 " }).reference,
    ).toBe("RETURN-001");
    for (const patch of [
      { date: "2026-02-30" },
      { reference: "!invalid" },
      { bandId: " " },
      { facility: "" },
      { notes: "x".repeat(1001) },
    ])
      expect(() => returnInput({ ...intake, ...patch })).toThrow();
    expect(() =>
      inspectionInput({ condition: "cleared" as "functional", notes: "test" }),
    ).toThrow();
    expect(() =>
      inspectionInput({ condition: "functional", notes: " " }),
    ).toThrow();
    expect(() =>
      reviewInput({
        ...review("return-id"),
        outcome: "settled" as "consistent",
      }),
    ).toThrow();
    expect(() =>
      reviewInput({ ...review("return-id"), evidence: " " }),
    ).toThrow();
  });
  it("encrypts and reloads returns, preserves hidden records across workspaces and excludes cloud backup", async () => {
    const vault = await opened();
    const id = await vault.saveBandReturn(intake);
    await vault.inspectBandReturn(id, {
      condition: "functional",
      notes: "Fictional visual inspection; reuse not cleared",
    });
    const saved = structuredClone(vault.data!.inventoryReturns);
    expect(JSON.stringify(await readVault(vault.uid))).not.toContain(
      intake.bandId,
    );
    expect(JSON.stringify(cloudRecords(vault.data!))).not.toContain(
      intake.bandId,
    );
    for (const workspace of ["mother", "professional"] as const) {
      const other = new RecordVault(vault.uid, authorize, workspace);
      await other.openOnDevice();
      expect(other.data!.inventoryReturns).toBeUndefined();
      await expect(other.saveBandReturn(intake)).rejects.toThrow(
        "organization",
      );
      await expect(
        other.inspectBandReturn(id, {
          condition: "damaged",
          notes: "No authority",
        }),
      ).rejects.toThrow("organization");
      await expect(other.voidBandReturn(id, "No authority")).rejects.toThrow(
        "organization",
      );
      await expect(other.reviewLedgerEntry("fake", review(id))).rejects.toThrow(
        "organization",
      );
      if (workspace === "mother")
        await other.savePatient(
          { name: "Mother retained", birthDate: "", history: "" },
          "self",
        );
    }
    vault.lock();
    await vault.openOnDevice();
    expect(vault.data!.inventoryReturns).toEqual(saved);
    expect((await opened()).data!.inventoryReturns).toBeUndefined();
  });
  it("prevents duplicate active intake and preserves inspections and void corrections", async () => {
    const vault = await opened();
    const id = await vault.saveBandReturn(intake);
    await expect(
      vault.saveBandReturn({
        ...intake,
        reference: "RETURN-002",
        bandId: " printed-band-44 ",
      }),
    ).rejects.toThrow("active return");
    await vault.inspectBandReturn(id, {
      condition: "functional",
      notes: "Initial observation",
    });
    const first = structuredClone(vault.data!.inventoryReturns![0]);
    await vault.inspectBandReturn(id, {
      condition: "damaged",
      notes: "Correction after closer inspection",
    });
    expect(vault.data!.inventoryReturns![0].inspections[0]).toEqual(
      first.inspections[0],
    );
    await expect(vault.voidBandReturn(id, " ")).rejects.toThrow("reason");
    await vault.voidBandReturn(id, "Incorrect intake reference");
    await expect(
      vault.inspectBandReturn(id, {
        condition: "functional",
        notes: "Blocked",
      }),
    ).rejects.toThrow("voided");
    await expect(vault.voidBandReturn(id, "Again")).rejects.toThrow("voided");
    await expect(
      vault.saveBandReturn({ ...intake, reference: "return-001" }),
    ).rejects.toThrow("reference already exists");
    await vault.saveBandReturn({ ...intake, reference: "RETURN-002" });
    vault.lock();
    await vault.openOnDevice();
    expect(vault.data!.inventoryReturns).toHaveLength(2);
    expect(vault.data!.inventoryReturns![0].inspections).toHaveLength(2);
    expect(vault.data!.inventoryReturns![0].voided?.by).toBe(vault.uid);
  });
  it("links only active matching returns and keeps old review history when the return changes", async () => {
    const vault = await opened();
    const id = await vault.saveBandReturn(intake);
    const entryId = await vault.saveLedgerEntry(ledger);
    const original = structuredClone(vault.data!.inventoryLedger![0]);
    const wrong = await vault.saveBandReturn({
      ...intake,
      reference: "RETURN-OTHER",
      bandId: "OTHER-BAND",
    });
    await expect(
      vault.reviewLedgerEntry(entryId, review(wrong)),
    ).rejects.toThrow("same printed");
    await vault.reviewLedgerEntry(entryId, review(id));
    const first = structuredClone(vault.data!.inventoryLedger![0].reviews![0]);
    await vault.inspectBandReturn(id, {
      condition: "damaged",
      notes: "New damage noted",
    });
    expect(returnRevision(vault.data!.inventoryReturns![0])).not.toBe(
      first.returnRevision,
    );
    await vault.reviewLedgerEntry(entryId, {
      ...review(id),
      outcome: "discrepancy",
      notes: "Condition changed; follow up",
    });
    expect(vault.data!.inventoryLedger![0].reviews![0]).toEqual(first);
    expect({ ...vault.data!.inventoryLedger![0], reviews: undefined }).toEqual({
      ...original,
      reviews: undefined,
    });
    await vault.voidBandReturn(id, "Wrong intake");
    await expect(vault.reviewLedgerEntry(entryId, review(id))).rejects.toThrow(
      "same printed",
    );
    vault.lock();
    await vault.openOnDevice();
    expect(vault.data!.inventoryLedger![0].reviews).toHaveLength(2);
    expect(vault.data!.inventoryLedger![0].reviews![0].by).toBe(vault.uid);
    expect(JSON.stringify(cloudRecords(vault.data!))).not.toContain(
      "PAPER-REF-22",
    );
  });
  it("rejects review of deposits or voided entries and rejects corrupt review links on reload parsing", async () => {
    const vault = await opened();
    const id = await vault.saveBandReturn(intake);
    const deposit = await vault.saveLedgerEntry({ ...ledger, kind: "deposit" });
    await expect(vault.reviewLedgerEntry(deposit, review(id))).rejects.toThrow(
      "active refund",
    );
    const entryId = await vault.saveLedgerEntry({
      ...ledger,
      reference: "REFUND-002",
    });
    await vault.reviewLedgerEntry(entryId, review(id));
    const valid = structuredClone(vault.data!);
    const malformed = structuredClone(valid);
    malformed.inventoryLedger![1].reviews![0].returnId = "missing";
    expect(() =>
      parseRecords(new TextEncoder().encode(JSON.stringify(malformed))),
    ).toThrow();
    await vault.voidLedgerEntry(entryId, "Correction");
    await expect(vault.reviewLedgerEntry(entryId, review(id))).rejects.toThrow(
      "active refund",
    );
    expect(vault.data!.inventoryLedger![1].reviews).toHaveLength(1);
    expect(() =>
      parseRecords(new TextEncoder().encode(JSON.stringify(valid))),
    ).not.toThrow();
  });
  it("rejects stale and signed-out mutations without appending history or losing entries", async () => {
    const uid = crypto.randomUUID();
    let allowed = true;
    const one = new RecordVault(
      uid,
      async () => {
        if (!allowed) throw Error("Signed out");
      },
      "organization",
    );
    await one.openOnDevice();
    const id = await one.saveBandReturn(intake);
    const entryId = await one.saveLedgerEntry(ledger);
    const stale = new RecordVault(uid, authorize, "organization");
    await stale.openOnDevice();
    await one.inspectBandReturn(id, {
      condition: "damaged",
      notes: "Current change",
    });
    await expect(
      stale.inspectBandReturn(id, {
        condition: "functional",
        notes: "Stale change",
      }),
    ).rejects.toThrow("another tab");
    allowed = false;
    await expect(
      one.saveBandReturn({
        ...intake,
        reference: "RETURN-003",
        bandId: "OTHER",
      }),
    ).rejects.toThrow("Signed out");
    await expect(
      one.inspectBandReturn(id, { condition: "functional", notes: "Denied" }),
    ).rejects.toThrow("Signed out");
    await expect(one.voidBandReturn(id, "Denied")).rejects.toThrow(
      "Signed out",
    );
    await expect(one.reviewLedgerEntry(entryId, review(id))).rejects.toThrow(
      "Signed out",
    );
    stale.lock();
    await stale.openOnDevice();
    expect(stale.data!.inventoryReturns).toHaveLength(1);
    expect(stale.data!.inventoryReturns![0].inspections).toHaveLength(1);
    expect(stale.data!.inventoryReturns![0].voided).toBeUndefined();
    expect(stale.data!.inventoryLedger![0].reviews).toBeUndefined();
  });
});
