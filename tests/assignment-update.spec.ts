import { test, expect } from "@playwright/test";
test("synthetic consent, assignment, patient navigation, referrals and revocation", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/auth/login?role=organization");
  await page.getByRole("button", { name: "Continue as Guest" }).click();
  await page.goto("/organization/patients/test");
  await page.getByLabel("Username", { exact: true }).fill("test.mother");
  await page.getByLabel("Profile code", { exact: true }).fill("TEST-M-001");
  await page.getByRole("button", { name: "Request test link" }).click();
  await expect(page.getByText("No accepted patient links yet.")).toBeVisible();
  await page.getByLabel("Test actor").selectOption("mother");
  await page.getByRole("button", { name: "Approve link" }).click();
  await page.getByLabel("Test actor").selectOption("organization");
  await page.getByRole("link", { name: "Test Mother TEST-M-001" }).click();
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Assigned Staff", exact: true }).click();
  await page
    .getByRole("article")
    .filter({ hasText: "Dr. Test Rao" })
    .getByRole("button", { name: "Assign staff" })
    .click();
  await page.getByLabel("Test actor").selectOption("doctor");
  await expect(
    page.getByRole("link", { name: "Test Mother TEST-M-001" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Accept assignment" }).click();
  await page.getByRole("link", { name: "Test Mother TEST-M-001" }).click();
  await page.getByRole("link", { name: "Referrals", exact: true }).click();
  await page
    .getByLabel("Reason for test referral")
    .fill("Synthetic continuity test");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create approved test referral" })
    .click();
  await expect(
    page.getByRole("button", { name: "Initiate test referral" }),
  ).toHaveCount(0);
  await page.getByLabel("Test actor").selectOption("organization");
  await page.getByRole("link", { name: "Test Mother TEST-M-001" }).click();
  await page.getByRole("link", { name: "Referrals", exact: true }).click();
  await page.getByRole("button", { name: "Initiate test referral" }).click();
  await expect(
    page.getByRole("button", {
      name: "Transfer to band · Device not connected",
    }),
  ).toBeDisabled();
  await expect(page.getByText("Initiated · Test only")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "docs/screenshots/patient-referral-test-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Assigned Staff", exact: true }).click();
  await page
    .getByRole("article")
    .filter({ hasText: "Dr. Test Rao" })
    .getByRole("button", { name: "Revoke access" })
    .click();
  await page.getByLabel("Test actor").selectOption("doctor");
  await expect(page.getByText("No accepted patient links yet.")).toBeVisible();
  // SPA deep link retains the test state and must still deny access.
  await page.evaluate(() => {
    history.pushState(
      {},
      "",
      "/organization/patients/test/test-mother/reports",
    );
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("heading", { name: "Patient access unavailable" }),
  ).toBeVisible();
  await page.getByLabel("Test actor").selectOption("mother");
  await page.getByRole("link", { name: "Test Mother TEST-M-001" }).click();
  await page.getByRole("link", { name: "Prescriptions", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save test prescription" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add sample prescription copy" })
    .click();
  await expect(
    page.getByText("Synthetic document copy · No clinical values"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to Patients" }).click();
  await expect(page).toHaveURL(/\/patients\/test$/);
});

test("organization menus, inventory routes and logout confirmation match the revised decisions", async ({
  page,
}) => {
  await page.goto("/auth/login?role=organization");
  await page.getByRole("button", { name: "Continue as Guest" }).click();
  await expect(page.locator("main")).not.toContainText(
    "Other pending administrative work",
  );
  await expect(page.locator("main")).not.toContainText("Low stock");
  await expect(page.locator("main")).toContainText("MatriSync device");
  await page.goto("/organization/more");
  await expect(
    page
      .getByRole("navigation", { name: "More menu" })
      .getByRole("link")
      .first(),
  ).toHaveText("Facility Profile");
  await expect(
    page.getByRole("button", { name: "Exit Guest", exact: true }),
  ).toHaveCount(1);
  await page.goto("/organization/more/settlements");
  await expect(page).toHaveURL(/\/organization\/inventory\/refunds$/);
  await expect(
    page.getByRole("heading", { name: "Refunds / Settlements" }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Financial Records");
  await page.getByRole("button", { name: "Exit Guest", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/organization\/overview$/);
  await page.getByRole("button", { name: "Exit Guest", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Exit Guest", exact: true })
    .click();
  await expect(page).toHaveURL("/");
});
