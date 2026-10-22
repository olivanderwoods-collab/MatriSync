// Server-side contract only: a browser counter is not a shared quota boundary.
// A deployed proxy must supply a durable, authenticated atomic transaction store.
export type Budget = {
  allocation: number;
  used: number;
  reservations: Record<string, number>;
  resetAt: number;
};
export interface AtomicBudgetStore {
  transaction<T>(update: (budget: Budget) => T): Promise<T>;
}
export const EXHAUSTED =
  "Free research credits exhausted. Research will become available again after the next reset.";
export function remaining(budget: Budget) {
  return Math.max(
    0,
    budget.allocation -
      budget.used -
      Object.values(budget.reservations).reduce((a, b) => a + b, 0),
  );
}
export async function reserve(
  store: AtomicBudgetStore,
  id: string,
  cost: number,
  now: number,
) {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/.test(id) ||
    !Number.isSafeInteger(cost) ||
    cost <= 0
  )
    throw Error("Invalid reservation");
  return store.transaction((budget) => {
    // A provider-confirmed reset is required; wall-clock arrival alone cannot
    // replenish a shared allowance or refund an uncertain network failure.
    if (now >= budget.resetAt)
      throw Error("Allowance reset requires reconciliation");
    if (Object.prototype.hasOwnProperty.call(budget.reservations, id))
      throw Error("Duplicate request");
    if (remaining(budget) < cost) throw Error(EXHAUSTED);
    budget.reservations[id] = cost;
    return remaining(budget);
  });
}
export async function settle(
  store: AtomicBudgetStore,
  id: string,
  outcome: "charged" | "confirmed-not-charged" | "unknown",
) {
  return store.transaction((budget) => {
    const cost = budget.reservations[id];
    if (cost === undefined || outcome === "unknown") return;
    if (outcome === "charged") budget.used += cost;
    delete budget.reservations[id];
  });
}
