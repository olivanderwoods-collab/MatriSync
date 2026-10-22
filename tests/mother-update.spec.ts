import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
async function guest(page: Page) {
  await page.goto("/auth/login?role=mother");
  await page.getByRole("button", { name: "Continue as Guest" }).click();
}
test("mother cleanup, profile picture, greeting, history and help back", async ({ page }) => {
  await guest(page);
  const main = page.locator("main");
  await expect(main).toContainText("Welcome Mira");
  await expect(main).not.toContainText(/Latest recorded vitals|Not initiated|Not scheduled|View All Vitals/);
  await page.getByRole("link", { name: "Open profile settings" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill("Asha Test");
  await page.getByLabel("Profile picture").setInputFiles("public/icons/icon-192.png");
  await expect(page.getByRole("button", { name: "Save Profile" })).toBeEnabled();
  await page.getByRole("button", { name: "Save Profile" }).click();
  await expect(page.locator(".sidebar .profile-photo")).toBeVisible();
  await page.goto("/mother/overview");
  await expect(main).toContainText("Welcome Asha");
  await page.reload();
  await expect(main).toContainText("Welcome Asha");
  for (const path of ["health", "children/tara", "children/arun"]) {
    await page.goto(`/mother/${path}/vitals`);
    await expect(page).toHaveURL(new RegExp(`${path}/overview$`));
    const tabs = page.getByRole("navigation", { name: "Section tabs" });
    await expect(tabs).not.toContainText(/Vitals|Medical History|Medicines/);
    await expect(tabs.getByRole("link", { name: "Prescriptions", exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: "View Reports", exact: true })).toHaveCount(0);
  }
  await page.goto("/mother/children/tara/visits");
  await expect(page).toHaveURL(/tara\/follow-up$/);
  await page.goto("/mother/more");
  await page.getByRole("link", { name: "Help and Support", exact: true }).last().click();
  await main.getByRole("button", { name: "Back", exact: false }).click();
  await expect(page).toHaveURL(/mother\/more$/);
  await page.goto("/mother/more/privacy");
  await page.getByRole("button", { name: "Reset Demo" }).click();
  await expect(main).toContainText("Welcome Mira");
  await expect(page.locator(".profile-photo")).toHaveCount(0);
});
test("education search and article/video placeholders have no fabricated content", async ({ page }) => {
  await guest(page); await page.goto("/mother/matrisathi/information");
  await page.getByLabel("Search topics").fill("pregnancy");
  await expect(page.locator(".topic-card")).toHaveCount(1);
  await page.locator(".topic-card").click();
  await expect(page.getByRole("button", { name: "Watch Video" })).toBeDisabled();
  await expect(page.locator("main")).toContainText("after review");
  await page.getByRole("link", { name: "Back to topics" }).click();
  await page.getByLabel("Browse categories").selectOption("sleep");
  await expect(page.locator(".topic-card")).toHaveCount(1);
});
test("draft lookup, mixed coverage, unresolved pairs, duplicates and offline test data", async ({ page, context }) => {
  const external: string[] = [];
  page.on("request", r => { if (!r.url().startsWith("http://127.0.0.1:4173")) external.push(r.url()); });
  await guest(page); await page.goto("/mother/matrisathi/companion/drugs");
  await expect(page.getByText("Test database · Not clinically verified", { exact: true })).toBeVisible();
  const input = page.getByLabel("Drug or herb name");
  await input.fill("Folic acid"); await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".medicine-result")).toContainText("Demo database · Unverified");
  await page.getByRole("button", { name: "Interaction checker", exact: true }).click();
  const add = page.getByLabel("Add drugs or herbs, one at a time");
  await add.fill("Folic acid"); await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: "Search", exact: true })).toHaveCount(0);
  await add.fill("Vitamin B9"); await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("already added");
  for (const name of ["Ferrous sulfate", "unknown herb"]) { await add.fill(name); await page.getByRole("button", { name: "Add", exact: true }).click(); }
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".drug-results")).toContainText("2 found in the demo database · 1 not found");
  await expect(page.locator(".drug-results")).toContainText("Unresolved");
  await expect(page.getByRole("button", { name: "Search Online", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Remove unknown herb" }).click();
  await add.fill("Calcium carbonate"); await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".drug-results")).toContainText("Potential interaction in supplied draft");
  await page.locator(".interaction-rule > summary").first().click();
  await expect(page.locator(".drug-results")).toContainText("not intravenous iron");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true); await page.reload();
  await expect(page.getByText("Test database · Not clinically verified", { exact: true })).toBeVisible();
  await page.getByLabel("Drug or herb name").fill("Folic acid"); await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".medicine-result h3")).toHaveText("Folic acid");
  expect(external).toEqual([]);
});

test("ten-entry limit and clean responsive mother screens", async ({ page }) => {
  await guest(page); await page.goto("/mother/matrisathi/companion/drugs");
  await page.getByRole("button", { name: "Interaction checker", exact: true }).click();
  const names: string[] = JSON.parse(readFileSync("fixtures/medicine-demo/interactions.json", "utf8")).medicines.slice(0, 10).map((m: { name: string }) => m.name);
  for (const name of names) {
    await page.getByLabel("Add drugs or herbs, one at a time").fill(name);
    await page.getByRole("button", { name: "Add", exact: true }).click();
  }
  await expect(page.locator(".medicine-chips li")).toHaveCount(10);
  await page.getByLabel("Add drugs or herbs, one at a time").fill("Eleventh entry");
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".medicine-result")).toHaveCount(45);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["matrisathi/information", "matrisathi/companion/drugs", "more/profile", "health/prescriptions", "children/tara/follow-up"]) {
      await page.goto(`/mother/${path}`);
      await expect(page.locator("main h1")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      if (path.endsWith("drugs")) {
        await page.getByLabel("Drug or herb name").fill("Folic acid");
        await page.getByRole("button", { name: "Search", exact: true }).click();
        await expect(page.locator(".medicine-result")).toBeVisible();
        if (width === 390 || width === 1440) await page.screenshot({ path: `docs/screenshots/drug-demo-${width}.png`, fullPage: true });
      }
    }
  }
});
