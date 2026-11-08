import { test, expect } from "@playwright/test";

test("return intake, inspection history and linked reconciliation notes persist without clearing reuse or payment", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/auth/signup?role=organization");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`returns-${Date.now()}@example.test`);
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
  await page.goto("/organization/inventory/return");
  await page
    .getByRole("button", { name: "Record return", exact: true })
    .click();
  async function fillReturn(reference: string) {
    await page.getByLabel("Return reference", { exact: true }).fill(reference);
    await page
      .getByLabel("Printed Band Inventory ID")
      .fill("PRINTED-RETURN-01");
    await page
      .getByLabel("Receiving facility", { exact: true })
      .fill("Fictional return facility");
    await page.getByLabel("Return date", { exact: true }).fill("2026-10-25");
  }
  await fillReturn("RETURN-TEST-001");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Save return record" }).click();
  await expect(page.locator("main").getByRole("status")).toContainText(
    "saved on this device",
  );
  await context.setOffline(false);
  await page.reload();
  const returned = page
    .getByRole("article")
    .filter({ hasText: "RETURN-TEST-001" });
  await expect(returned).toContainText("Return recorded · Reuse not cleared");
  await page
    .getByRole("button", { name: "Record return", exact: true })
    .click();
  await fillReturn("RETURN-TEST-002");
  await page.getByRole("button", { name: "Save return record" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "already has an active return",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await returned.getByRole("button", { name: "Record inspection" }).click();
  await returned.getByLabel("Observed condition").selectOption("functional");
  await returned
    .getByLabel("Inspection notes")
    .fill("Fictional visual observation only");
  await returned.getByRole("button", { name: "Save inspection" }).click();
  await expect(returned).toContainText("Appears functional");
  await expect(returned).toContainText("Reuse not cleared");

  await page.goto("/organization/inventory/refunds");
  await page.getByRole("button", { name: "Add pending record" }).click();
  await page
    .getByLabel("Record reference", { exact: true })
    .fill("REFUND-RETURN-001");
  await page.getByLabel("Printed Band Inventory ID").fill("PRINTED-RETURN-01");
  await page
    .getByLabel("Facility name / reference")
    .fill("Fictional return facility");
  await page.getByLabel("Amount", { exact: true }).fill("125.50");
  await page.getByLabel("Record date", { exact: true }).fill("2026-10-25");
  await page.getByRole("button", { name: "Save pending record" }).click();
  const ledger = page
    .getByRole("article")
    .filter({ hasText: "REFUND-RETURN-001" });
  await ledger.getByRole("button", { name: "Review against return" }).click();
  await ledger.getByLabel("Linked return").selectOption({
    label: "RETURN-TEST-001 · Fictional return facility · 2026-10-25",
  });
  await ledger.getByLabel("Local review outcome").selectOption("consistent");
  await ledger
    .getByLabel("Administrative evidence reference")
    .fill("PAPER-TEST-001");
  await ledger
    .getByLabel("Review notes")
    .fill("Printed identifier checked against local intake");
  await context.setOffline(true);
  await ledger
    .getByRole("button", { name: "Save reconciliation note" })
    .click();
  await expect(ledger).toContainText("Local check: return details consistent");
  await expect(ledger).toContainText("Pending reconciliation");
  await expect(ledger).toContainText("Payment remains unconfirmed");
  await context.setOffline(false);
  await page.reload();
  await ledger
    .getByText("Reconciliation note history", { exact: true })
    .click();
  await expect(ledger).toContainText("PAPER-TEST-001");
  await page.goto("/organization/inventory/return");
  await returned.getByRole("button", { name: "Record inspection" }).click();
  await returned.getByLabel("Observed condition").selectOption("damaged");
  await returned
    .getByLabel("Inspection notes")
    .fill("Later inspection found fictional damage");
  await returned.getByRole("button", { name: "Save inspection" }).click();
  await returned
    .getByText("Return and inspection history", { exact: true })
    .click();
  await expect(returned).toContainText("Fictional visual observation only");
  await expect(returned).toContainText(
    "Later inspection found fictional damage",
  );
  await expect(returned).toContainText("Keep out of reuse");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await returned
    .getByText("Return and inspection history", { exact: true })
    .click();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await returned.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  await page.screenshot({
    path: "docs/screenshots/inventory-return-mobile.png",
  });

  await page.goto("/organization/inventory/refunds");
  await expect(ledger).toContainText(
    "Linked return changed or was voided. Review again.",
  );
  await ledger.getByRole("button", { name: "Review against return" }).click();
  await ledger
    .getByLabel("Linked return")
    .selectOption({
      label: "RETURN-TEST-001 · Fictional return facility · 2026-10-25",
    });
  await ledger
    .getByLabel("Administrative evidence reference")
    .fill("PAPER-TEST-002");
  await ledger
    .getByLabel("Review notes")
    .fill("Updated condition requires follow-up");
  await ledger
    .getByRole("button", { name: "Save reconciliation note" })
    .click();
  await expect(ledger).toContainText("Local check: discrepancy recorded");
  await ledger
    .getByText("Reconciliation note history", { exact: true })
    .click();
  await expect(ledger).toContainText("PAPER-TEST-001");
  await expect(ledger).toContainText("PAPER-TEST-002");
  await page.goto("/organization/inventory/return");
  await returned.getByRole("button", { name: "Void return record" }).click();
  await returned
    .getByLabel("Correction reason")
    .fill("Synthetic intake correction");
  await returned.getByRole("button", { name: "Confirm void return" }).click();
  await page.reload();
  await expect(returned).toContainText("Voided return record");
  await expect(
    returned.getByRole("button", { name: "Record inspection" }),
  ).toHaveCount(0);
  await page.goto("/organization/inventory/refunds");
  await expect(ledger).toContainText("Pending reconciliation");
  await ledger.getByRole("button", { name: "Review against return" }).click();
  await expect(ledger).toContainText("No active return matches");
  await expect(
    ledger.getByRole("button", { name: "Save reconciliation note" }),
  ).toBeDisabled();
});
