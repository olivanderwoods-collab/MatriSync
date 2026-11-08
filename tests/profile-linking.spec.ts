import { test, expect } from "@playwright/test";

test("permanent identifiers load for verified test clinicians and allow exactly one Mother claim", async ({
  page,
}) => {
  await page.goto("/auth/login?role=professional");
  await page.getByRole("button", { name: "Continue as Guest" }).click();
  await page.goto("/professional/patients/test");
  await page.getByLabel("Username", { exact: true }).fill("test.mother");
  await page.getByLabel("Profile code", { exact: true }).fill("TEST-M-001");
  await page.getByRole("button", { name: "Load test profile" }).click();
  await expect(
    page.getByRole("link", { name: "Test Mother TEST-M-001" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve link" })).toHaveCount(
    0,
  );
  await page.getByLabel("Test actor").selectOption("unverified");
  await page.getByRole("button", { name: "Load test profile" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "does not have permission",
  );
  await expect(
    page.getByRole("link", { name: "Test Mother TEST-M-001" }),
  ).toHaveCount(0);
  await page.getByLabel("Test actor").selectOption("doctor");
  await page.getByLabel("Test patient name").fill("New Fictional Mother");
  await page.getByLabel("Test username").fill("new.fictional");
  await page.getByRole("button", { name: "Create test profile" }).click();
  const identity = await page
    .locator(".record-id")
    .filter({ hasText: "new.fictional /" })
    .innerText();
  const code = identity.split(" / ")[1].split(" · ")[0];
  await page.getByLabel("Test actor").selectOption("mother");
  await page.getByLabel("Username", { exact: true }).fill("new.fictional");
  await page.getByLabel("Profile code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Load test profile" }).click();
  await expect(
    page.getByRole("link", { name: `New Fictional Mother ${code}` }),
  ).toBeVisible();
  await page.getByLabel("Test actor").selectOption("mother2");
  await page.getByRole("button", { name: "Load test profile" }).click();
  await expect(page.getByRole("alert")).toContainText("already been claimed");
  await expect(
    page.getByRole("link", { name: `New Fictional Mother ${code}` }),
  ).toHaveCount(0);
});

test("facility assignment appears on clinician Home and moves to Patients only after Accept", async ({
  page,
}) => {
  await page.setViewportSize({ width: 551, height: 651 });
  await page.goto("/auth/login?role=professional");
  await page.getByRole("button", { name: "Continue as Guest" }).click();
  await page.goto("/professional/patients/test");
  await page.getByLabel("Test actor").selectOption("organization");
  await page.getByLabel("Username", { exact: true }).fill("test.mother");
  await page.getByLabel("Profile code", { exact: true }).fill("TEST-M-001");
  await page.getByRole("button", { name: "Request test link" }).click();
  await page.getByLabel("Test actor").selectOption("mother");
  await page.getByRole("button", { name: "Approve link" }).click();
  await page.getByLabel("Test actor").selectOption("organization");
  await page.getByRole("link", { name: "Test Mother TEST-M-001" }).click();
  await page.getByRole("link", { name: "Assigned Staff", exact: true }).click();
  await page
    .getByRole("article")
    .filter({ hasText: "Dr. Test Rao" })
    .getByRole("button", { name: "Assign staff" })
    .click();
  // SPA navigation preserves the intentionally memory-only synthetic workflow.
  await page.evaluate(() => {
    history.pushState({}, "", "/professional/overview");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("heading", { name: "Patient assignments · Synthetic test" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Patients", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Open test profile" }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Home", exact: true })
    .click();
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Accept", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Patients", exact: true })
    .click();
  await page.getByRole("link", { name: "Open test profile" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Test Mother",
  );
});
