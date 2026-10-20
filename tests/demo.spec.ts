import { test, expect, type Page } from "@playwright/test";
async function guest(page: Page, role = "mother") {
  await page.goto(`/auth/login?role=${role}`);
  await page.getByRole("button", { name: "Continue as Guest" }).click();
  await expect(page.getByText("Guest Demo · Synthetic data")).toBeVisible();
}
test("all workspaces, all navigation, future actions, no service traffic", async ({
  page,
}) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:4173")) external.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  for (const role of ["mother", "professional", "organization"]) {
    await guest(page, role);
    const urls = await page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .locator("a")
      .evaluateAll((links) =>
        links.map((a) => (a as HTMLAnchorElement).pathname),
      );
    for (const url of urls) {
      await page.goto(url);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.getByText("Guest Demo · Synthetic data")).toBeVisible();
      const soon = page.locator("main .soon-button").first();
      if (await soon.count()) {
        await soon.click();
        await expect(page.getByRole("dialog")).toContainText("Coming Soon");
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).not.toBeVisible();
      }
    }
    await page
      .getByRole("button", { name: "Exit Guest", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL("/");
  }
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  const storage = await page.evaluate(async () => ({
    local: Object.keys(localStorage),
    dbs: (await indexedDB.databases()).map((d) => d.name),
    cookies: document.cookie,
  }));
  expect(storage).toEqual({ local: [], dbs: [], cookies: "" });
});
test("child context, tabs, deep-link refresh and browser history", async ({
  page,
}) => {
  await guest(page);
  await page.goto("/mother/children/tara/reports");
  await expect(
    page.getByRole("heading", { name: "Tara · Routine visit summary" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "AS Arun Sen" }).click();
  await expect(
    page.getByRole("heading", { name: "Arun · Growth visit summary" }),
  ).toBeVisible();
  await expect(page.getByText("Tara · Routine visit summary")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Arun · Growth visit summary" }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Tara · Routine visit summary" }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Arun · Growth visit summary" }),
  ).toBeVisible();
  for (const tab of [
    "Overview",
    "Medications",
    "Prescriptions",
    "Test reports",
  ]) {
    await page
      .getByRole("navigation", { name: "Section tabs" })
      .getByRole("link", { name: tab, exact: true })
      .click();
    await expect(page.locator("main")).toContainText("Arun");
  }
});
test("preferences survive reload; reset and exit clear only demo state", async ({
  page,
}) => {
  await guest(page);
  await page.evaluate(() => sessionStorage.setItem("unrelated", "preserve"));
  await page.goto("/mother/settings");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("Bengali");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByLabel("Language", { exact: true })).toHaveValue(
    "Bengali",
  );
  await expect(page.getByRole("status")).toContainText("fall back to English");
  await page.getByRole("button", { name: "Reset Demo", exact: true }).click();
  await page.goto("/mother/settings");
  await expect(page.getByLabel("Language", { exact: true })).toHaveValue(
    "English",
  );
  await page
    .getByRole("button", { name: "Exit Guest", exact: true })
    .first()
    .click();
  expect(
    await page.evaluate(() => sessionStorage.getItem("matrisync.demo.v1")),
  ).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem("unrelated"))).toBe(
    "preserve",
  );
  await page.goBack();
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByText("Guest Demo · Synthetic data")).toHaveCount(0);
});
test("Guest to account clears demo; setup availability is explicit", async ({
  page,
}) => {
  await guest(page);
  await page.goto("/mother/settings");
  await page.getByRole("button", { name: "Exit Guest & sign in" }).click();
  expect(
    await page.evaluate(() => sessionStorage.getItem("matrisync.demo.v1")),
  ).toBeNull();
  const unavailable = await page.getByText("Authentication setup required").isVisible();
  if(unavailable) await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeDisabled();
  else await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
  if(unavailable) await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeDisabled();
  else await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeEnabled();
});
test("blocked and corrupt storage remain usable without persistent fallback", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.addInitScript(() =>
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw Error("blocked");
      },
    }),
  );
  const page = await context.newPage();
  await guest(page);
  await expect(page.getByRole("alert")).toContainText(
    "will not survive a reload",
  );
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "My children" })
    .click();
  await expect(page.getByText("Tara Sen", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Exit Guest", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL("/");
  await context.close();
  const clean = await browser.newContext();
  const p = await clean.newPage();
  await p.goto("/");
  await p.evaluate(() => sessionStorage.setItem("matrisync.demo.v1", "{oops"));
  await p.reload();
  await expect(p.getByRole("alert")).toContainText("could not be restored");
  await guest(p);
  await expect(p.getByText("Guest Demo · Synthetic data")).toBeVisible();
  await clean.close();
});
test("fresh tab is isolated and unknown paths recover", async ({
  page,
  context,
}) => {
  await guest(page);
  const second = await context.newPage();
  await second.goto("/mother/overview");
  await expect(second).toHaveURL(/\/auth\/login/);
  await page.goto("/mother/children/unknown");
  await expect(page.getByText("Let’s find your way back.")).toBeVisible();
  await page.goto("/unknown");
  await expect(page.getByText("Let’s find your way back.")).toBeVisible();
  await second.close();
});
test("public offline shell, deep links, cache allowlist and install manifest", async ({
  page,
  context,
}) => {
  await guest(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.goto("/mother/children/arun/reports");
  await expect(
    page.getByRole("heading", { name: "Arun · Growth visit summary" }),
  ).toBeVisible();
  await expect(page.getByText(/Offline · Guest demo/)).toBeVisible();
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    return (
      await Promise.all(
        names.map(async (n) =>
          (await (await caches.open(n)).keys()).map(
            (r) => new URL(r.url).pathname,
          ),
        ),
      )
    ).flat();
  });
  expect(
    cached.every(
      (p) =>
        p === "/index.html" ||
        p === "/manifest.webmanifest" ||
        p.startsWith("/assets/") ||
        p.startsWith("/icons/"),
    ),
  ).toBeTruthy();
  expect(
    cached.some((p) => p.includes("mother") || p.includes("auth")),
  ).toBeFalsy();
  await context.setOffline(false);
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toHaveLength(3);
});
test("desktop/mobile visual checks, dialog focus, themes and overflow", async ({
  page,
}) => {
  await page.goto("/");
  await page.screenshot({
    path: "docs/screenshots/role-selection-desktop.png",
    fullPage: true,
  });
  await guest(page);
  await page.screenshot({
    path: "docs/screenshots/mother-desktop.png",
    fullPage: true,
  });
  await page.goto("/mother/settings");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.goto("/mother/overview");
  await page.screenshot({
    path: "docs/screenshots/mother-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/mother-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest("dialog")),
  ).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "More", exact: true }),
  ).toBeFocused();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const url of [
      "/mother/overview",
      "/mother/children/tara/reports",
      "/mother/settings",
      "/mother/matrisathi",
    ]) {
      await page.goto(url);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Exit Guest", exact: true })
    .first()
    .click();
  await guest(page, "professional");
  await page.screenshot({
    path: "docs/screenshots/professional-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Exit Guest", exact: true })
    .first()
    .click();
  await guest(page, "organization");
  await page.screenshot({
    path: "docs/screenshots/organization-desktop.png",
    fullPage: true,
  });
});
