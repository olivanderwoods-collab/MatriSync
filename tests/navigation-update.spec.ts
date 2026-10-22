import { test, expect } from "@playwright/test";

test("mother and professional annotation changes stay compact and preserve bookmark recovery", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/auth/login?role=mother");
  await page.getByRole("button", { name: "Continue as Guest" }).click();
  await expect(page.locator("header").getByLabel("Language")).toBeVisible();
  await page.locator("header").getByLabel("Language").selectOption("Bengali");
  await expect(page.getByRole("status")).toContainText("Reviewed translations are pending");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.goto("/mother/more");
  const menu = page.getByRole("navigation", { name: "More menu" });
  await expect(menu.getByRole("link").first()).toHaveText("Profile Settings");
  for (const name of ["My Referrals", "Appointments & Follow-ups", "Notifications", "My Documents", "Language"]) await expect(menu.getByRole("link", { name, exact: true })).toHaveCount(0);
  await page.goto("/mother/health/visits");
  await expect(page).toHaveURL(/\/mother\/health\/overview$/);
  await expect(page.getByRole("navigation", { name: "Section tabs" }).getByRole("link")).toHaveText(["Overview", "Prescriptions", "Reports", "Referrals", "Follow-ups"]);
  await page.getByRole("button", { name: "Exit Guest", exact: true }).first().click();
  await expect(page).toHaveURL("/");
  await page.goto("/auth/login?role=professional");
  await page.getByRole("button", { name: "Continue as Guest" }).click();
  await expect(page.locator("main")).not.toContainText("Recent consultations");
  await expect(page.locator("main")).not.toContainText("Sync state");
  await expect(page.locator("main .action-row")).toHaveCount(0);
  await page.goto("/professional/patients");
  await expect(page.getByRole("link", { name: "Add patient", exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("New Consultation");
  await expect(page.locator("main")).not.toContainText("Find Possible Duplicates");
  for (const removed of ["vitals", "history", "visits"]) {
    await page.goto(`/professional/patients/mira/${removed}`);
    await expect(page).toHaveURL(/\/professional\/patients\/mira\/overview$/);
  }
  await page.goto("/professional/more");
  await expect(menu.getByRole("link")).toHaveText(["Profile", "Notifications", "Professional Verification", "Facility Affiliation", "Help"]);
  await menu.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Appearance", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: false }).click();
  await expect(page).toHaveURL(/\/professional\/more$/);
  await page.goto("/professional/more/settings");
  await expect(page).toHaveURL(/\/professional\/more\/profile$/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "docs/screenshots/professional-profile-desktop.png", fullPage: true });
});
