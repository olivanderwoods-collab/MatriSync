import { test, expect } from "@playwright/test";

test("only the verified facility can approve a submitted caregiver credential", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/auth/login?role=organization");
  await page.getByRole("button", { name: "Continue as Guest" }).click();
  await page.goto("/organization/more/verification");
  await page.getByRole("link", { name: "Test linking & assignment" }).click();
  await page
    .getByRole("combobox", { name: "Test actor", exact: true })
    .selectOption("unverified");
  await page.getByLabel("Fictional credential reference").fill("TEST-GNM-123");
  await page.getByRole("button", { name: "Submit test credentials" }).click();
  await expect(
    page.getByText("Credential status: pending", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Username", { exact: true }).fill("test.mother");
  await page.getByLabel("Profile code", { exact: true }).fill("TEST-M-001");
  await page.getByRole("button", { name: "Load test profile" }).click();
  await expect(page.getByRole("alert")).toContainText("permission");
  await page
    .getByRole("combobox", { name: "Test actor", exact: true })
    .selectOption("unverified-facility");
  const candidate = page.getByRole("article", {
    name: "Unverified Test Clinician",
    exact: true,
  });
  await candidate
    .getByLabel("Review reason")
    .fill("Fictional review completed");
  await candidate.getByRole("button", { name: "Record test decision" }).click();
  await expect(page.getByRole("alert")).toContainText("permission");
  await expect(
    candidate.getByText("Credential status: pending", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Test actor", exact: true })
    .selectOption("organization");
  await candidate.getByRole("button", { name: "Record test decision" }).click();
  await expect(
    candidate.getByText("Credential status: approved", { exact: true }),
  ).toBeVisible();
  await candidate
    .getByText("Credential decision history", { exact: true })
    .click();
  await expect(
    candidate.getByText("Fictional review completed", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Test actor", exact: true })
    .selectOption("unverified");
  await page.getByLabel("Username", { exact: true }).fill("test.mother");
  await page.getByLabel("Profile code", { exact: true }).fill("TEST-M-001");
  await page.getByRole("button", { name: "Load test profile" }).click();
  await page.getByRole("link", { name: "Test Mother TEST-M-001" }).click();
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await page.getByRole("button", { name: "Add sample report" }).click();
  await expect(
    page.getByText("Synthetic document copy · No clinical values", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Prescriptions", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save test prescription" }),
  ).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("combobox", { name: "Test actor", exact: true })
    .selectOption("unverified");
  await expect(
    page.getByText("Credential status: unsubmitted", { exact: true }),
  ).toBeVisible();
});

test("suspended clinician reads their saved copy but cannot fetch updates", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/auth/login?role=professional");
  await page.getByRole("button", { name: "Continue as Guest" }).click();
  await page.goto("/professional/patients/test");
  await page.getByLabel("Username", { exact: true }).fill("test.mother");
  await page.getByLabel("Profile code", { exact: true }).fill("TEST-M-001");
  await page.getByRole("button", { name: "Load test profile" }).click();
  await page.getByRole("link", { name: "Test Mother TEST-M-001" }).click();
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await page.getByRole("button", { name: "Add sample report" }).click();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await page
    .getByRole("button", { name: "Save test copy for offline reading" })
    .click();
  await page
    .getByRole("combobox", { name: "Test actor", exact: true })
    .selectOption("organization");
  const doctor = page.getByRole("article", {
    name: "Dr. Test Rao",
    exact: true,
  });
  await doctor
    .getByLabel("Review reason")
    .fill("Fictional credential suspension");
  await doctor.getByRole("button", { name: "Record test decision" }).click();
  await page
    .getByRole("combobox", { name: "Test actor", exact: true })
    .selectOption("doctor");
  await expect(
    page.getByRole("link", { name: "Test Mother TEST-M-001" }),
  ).toHaveCount(0);
  const copies = page.getByRole("region", { name: "Saved test copies" });
  await expect(copies).toContainText(
    "Future sharing blocked. Saved copy remains readable.",
  );
  await context.setOffline(true);
  await expect(copies).toContainText(
    "Synthetic document copy · No clinical values",
  );
  await copies.getByRole("button", { name: "Fetch latest test copy" }).click();
  await expect(page.getByRole("alert")).toContainText("permission");
  await expect(copies).toContainText(
    "Synthetic document copy · No clinical values",
  );
  await context.setOffline(false);
  await copies
    .getByRole("button", { name: "Fetch latest test copy" })
    .evaluate((button) => button.scrollIntoView({ block: "center" }));
  expect(
    await page.locator("body").evaluate((body) => body.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "docs/screenshots/verification-saved-copy-mobile.png",
  });
  await page
    .getByRole("combobox", { name: "Test actor", exact: true })
    .selectOption("nurse");
  await expect(
    page.getByRole("region", { name: "Saved test copies" }),
  ).toHaveCount(0);
});
