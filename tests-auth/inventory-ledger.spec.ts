import { test, expect } from "@playwright/test";
test("pending Inventory ledger saves offline, rejects duplicates and retains correction history", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 551, height: 651 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/auth/signup?role=organization");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`ledger-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-test-42!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Synthetic-test-42!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator(".demo-banner")).toContainText(
    "Signed-in account",
    { timeout: 15000 },
  );
  await page.goto("/organization/inventory/refunds");
  await expect(page.getByText("No inventory records saved yet.")).toBeVisible();
  await page.getByRole("button", { name: "Add pending record" }).click();
  await page
    .getByLabel("Record reference", { exact: true })
    .fill("REFUND-TEST-001");
  await page
    .getByLabel("Printed Band Inventory ID")
    .fill("PRINTED-TEST-BAND-01");
  await page.getByLabel("Facility name / reference").fill("Fictional Facility");
  await page.getByLabel("Amount", { exact: true }).fill("125.50");
  await page.getByLabel("Record date", { exact: true }).fill("2026-10-25");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Save pending record" }).click();
  await expect(page.locator("main").getByRole("status")).toContainText(
    "Payment has not been confirmed",
  );
  const record = page
    .getByRole("article")
    .filter({ hasText: "REFUND-TEST-001" });
  await expect(record).toContainText("Pending reconciliation");
  await expect(record).toContainText("125.50");
  await context.setOffline(false);
  await page.reload();
  await expect(record).toContainText("PRINTED-TEST-BAND-01");
  await page.getByRole("button", { name: "Add pending record" }).click();
  await page
    .getByLabel("Record reference", { exact: true })
    .fill("refund-test-001");
  await page
    .getByLabel("Printed Band Inventory ID")
    .fill("PRINTED-TEST-BAND-01");
  await page.getByLabel("Facility name / reference").fill("Fictional Facility");
  await page.getByLabel("Amount", { exact: true }).fill("125.50");
  await page.getByLabel("Record date", { exact: true }).fill("2026-10-25");
  await page.getByRole("button", { name: "Save pending record" }).click();
  await expect(page.getByRole("alert")).toContainText("already exists");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await record.getByRole("button", { name: "Void pending record" }).click();
  await record
    .getByLabel("Correction reason")
    .fill("Synthetic correction; no payment was reversed.");
  await record.getByRole("button", { name: "Confirm void" }).click();
  await expect(record).toContainText("Voided record");
  await page.reload();
  await record.getByText("Record history", { exact: true }).click();
  await expect(record).toContainText("Synthetic correction");
  await expect(record).toContainText("125.50");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByLabel("Show records").selectOption("deposit");
  await expect(page.getByText("No records of this type.")).toBeVisible();
  await page.getByLabel("Show records").selectOption("all");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({
    path: "docs/screenshots/inventory-ledger-mobile.png",
    fullPage: true,
  });
  await page.goto("/organization/more/settlements");
  await expect(page).toHaveURL(/\/organization\/inventory\/refunds$/);
  await expect(record).toContainText("Voided record");
});
