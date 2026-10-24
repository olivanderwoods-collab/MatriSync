export const ledgerKinds = {
  deposit: "Deposit",
  refund: "Refund",
  settlement: "Settlement / reimbursement",
} as const;
export const ledgerCurrencies = ["INR", "USD", "EUR", "GBP"] as const;
export type LedgerInput = {
  kind: keyof typeof ledgerKinds;
  reference: string;
  bandId: string;
  facility: string;
  currency: (typeof ledgerCurrencies)[number];
  amount: string;
  date: string;
  notes: string;
};
export type LedgerEntry = Omit<LedgerInput, "amount"> & {
  id: string;
  amountMinor: number;
  createdAt: string;
  createdBy: string;
  voided?: { at: string; by: string; reason: string };
};
function field(value: string, label: string, max: number, required = true) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw Error(`Enter ${label} of up to ${max} characters.`);
  return value.trim();
}
export function ledgerInput(input: LedgerInput) {
  if (
    !Object.hasOwn(ledgerKinds, input.kind) ||
    !ledgerCurrencies.includes(input.currency)
  )
    throw Error("Select a supported record type and currency.");
  const reference = field(
    input.reference,
    "a record reference",
    80,
  ).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]{2,79}$/.test(reference))
    throw Error(
      "Use a reference of 3–80 letters, numbers, dots, slashes, underscores or hyphens.",
    );
  const amount = field(input.amount, "an amount", 12);
  if (!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(amount))
    throw Error("Enter a positive amount with up to two decimal places.");
  const [whole, fraction = ""] = amount.split(".");
  const amountMinor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0)
    throw Error("The amount must be greater than zero.");
  const date = field(input.date, "a record date", 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw Error("Enter a valid record date.");
  return {
    kind: input.kind,
    reference,
    bandId: field(input.bandId, "a printed Band Inventory ID", 120),
    facility: field(input.facility, "a facility name or reference", 120),
    currency: input.currency,
    amountMinor,
    date,
    notes: field(input.notes, "notes", 1000, false),
  };
}
export function validateLedger(entries: LedgerEntry[]) {
  if (!Array.isArray(entries)) throw Error("Invalid inventory records.");
  const ids = new Set<string>(),
    references = new Set<string>();
  for (const entry of entries) {
    if (
      !entry ||
      !Number.isSafeInteger(entry.amountMinor) ||
      entry.amountMinor <= 0
    )
      throw Error("Invalid inventory amount.");
    const checked = ledgerInput({
      ...entry,
      amount: `${Math.floor(entry.amountMinor / 100)}.${String(entry.amountMinor % 100).padStart(2, "0")}`,
    });
    if (
      !entry.id ||
      ids.has(entry.id) ||
      references.has(checked.reference) ||
      !entry.createdBy ||
      !Number.isFinite(Date.parse(entry.createdAt))
    )
      throw Error("Invalid or duplicate inventory record.");
    if (
      entry.voided &&
      (!entry.voided.by ||
        !Number.isFinite(Date.parse(entry.voided.at)) ||
        !field(entry.voided.reason, "a correction reason", 500))
    )
      throw Error("Invalid inventory correction history.");
    ids.add(entry.id);
    references.add(checked.reference);
  }
}
