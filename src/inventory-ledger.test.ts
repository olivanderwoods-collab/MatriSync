import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  ledgerInput,
  validateLedger,
  type LedgerInput,
} from "./inventory-ledger-model";
import { RecordVault } from "./record-vault";
import { cloudRecords } from "./records-model";
import { readVault } from "./vault-storage";
const authorize = async () => {};
const input: LedgerInput = {
  kind: "refund",
  reference: "Refund-001",
  bandId: "PRINTED-BAND-44",
  facility: "Fictional Facility",
  currency: "INR",
  amount: "123.45",
  date: "2026-10-25",
  notes: "Pending external verification",
};
describe("pending inventory records", () => {
  it("uses exact minor units and rejects malformed amounts, dates and types", () => {
    expect(ledgerInput(input).amountMinor).toBe(12345);
    expect(ledgerInput({ ...input, amount: "0.01" }).amountMinor).toBe(1);
    expect(ledgerInput({ ...input, amount: "12.1" }).amountMinor).toBe(1210);
    for (const amount of [
      "0",
      "-1",
      "1.001",
      "1e3",
      "NaN",
      "100000000",
      "01.20",
    ])
      expect(() => ledgerInput({ ...input, amount })).toThrow();
    expect(() => ledgerInput({ ...input, date: "2026-02-30" })).toThrow();
    expect(() =>
      ledgerInput({ ...input, kind: "paid" as LedgerInput["kind"] }),
    ).toThrow();
  });
  it("persists encrypted, blocks duplicates, retains void history and excludes other workspaces and cloud backup", async () => {
    const uid = crypto.randomUUID();
    const vault = new RecordVault(uid, authorize, "organization");
    await vault.openOnDevice();
    const id = await vault.saveLedgerEntry(input);
    const original = structuredClone(vault.data!.inventoryLedger![0]);
    expect(JSON.stringify(await readVault(uid))).not.toContain(input.bandId);
    expect(JSON.stringify(cloudRecords(vault.data!))).not.toContain(
      input.bandId,
    );
    await expect(
      vault.saveLedgerEntry({ ...input, reference: " refund-001 " }),
    ).rejects.toThrow("already exists");
    await expect(vault.voidLedgerEntry(id, " ")).rejects.toThrow("reason");
    await vault.voidLedgerEntry(
      id,
      "Wrong amount; replacement will use REFUND-002.",
    );
    vault.lock();
    await vault.openOnDevice();
    const saved = vault.data!.inventoryLedger![0];
    expect({ ...saved, voided: undefined }).toEqual({
      ...original,
      voided: undefined,
    });
    expect(saved.voided?.reason).toContain("Wrong amount");
    expect(saved.voided?.by).toBe(uid);
    await expect(vault.voidLedgerEntry(id, "Again")).rejects.toThrow(
      "already voided",
    );
    await expect(vault.saveLedgerEntry(input)).rejects.toThrow(
      "already exists",
    );
    expect(() => validateLedger([saved, saved])).toThrow();
    const mother = new RecordVault(uid, authorize, "mother");
    await mother.openOnDevice();
    expect(mother.data!.inventoryLedger).toBeUndefined();
    await expect(mother.saveLedgerEntry(input)).rejects.toThrow("organization");
    await expect(mother.voidLedgerEntry(id, "No authority")).rejects.toThrow(
      "organization",
    );
    await mother.savePatient(
      { name: "Mother record", birthDate: "", history: "" },
      "self",
    );
    vault.lock();
    await vault.openOnDevice();
    expect(vault.data!.inventoryLedger![0]).toEqual(saved);
    const other = new RecordVault(
      crypto.randomUUID(),
      authorize,
      "organization",
    );
    await other.openOnDevice();
    expect(other.data!.inventoryLedger).toBeUndefined();
  });
  it("rejects stale and unauthenticated writes without duplicating entries", async () => {
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
    const two = new RecordVault(uid, authorize, "organization");
    await two.openOnDevice();
    await one.saveLedgerEntry(input);
    await expect(
      two.saveLedgerEntry({ ...input, reference: "REFUND-002" }),
    ).rejects.toThrow("another tab");
    allowed = false;
    await expect(
      one.saveLedgerEntry({ ...input, reference: "REFUND-003" }),
    ).rejects.toThrow("Signed out");
    two.lock();
    await two.openOnDevice();
    expect(two.data!.inventoryLedger).toHaveLength(1);
  });
});
