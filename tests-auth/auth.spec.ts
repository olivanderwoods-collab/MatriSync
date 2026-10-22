import { test, expect } from "@playwright/test";
test("emulator signup, restoration, logout, errors, login and transition to Guest", async ({
  page,
}) => {
  const email = `meeting-${Date.now()}@example.test`;
  const password = "Synthetic-test-42!";
  const external: string[] = [];
  page.on("request", (r) => {
    if (!["127.0.0.1", "localhost"].includes(new URL(r.url()).hostname))
      external.push(r.url());
  });
  await page.goto("/auth/signup?role=professional");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("different-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("do not match");
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByText(
      /Account Demo · Synthetic data|Private records · Device storage/,
    ),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(
      /Account Demo · Synthetic data|Private records · Device storage/,
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Log Out", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL("/");
  await page.goto("/auth/login?role=mother");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("incorrect");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText(
      /Account Demo · Synthetic data|Private records · Device storage/,
    ),
  ).toBeVisible();
  await page.goto("/auth/login?role=mother");
  await page.getByRole("button", { name: "Continue as Guest" }).click();
  await expect(page.getByText("Guest Demo · Synthetic data")).toBeVisible();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("matrisync.account.active"),
    ),
  ).toBeNull();
  expect(external).toEqual([]);
});
test("configured Guest never initializes Auth and offline account actions are blocked", async ({
  page,
  context,
}) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes(":9099")) calls.push(r.url());
  });
  await page.goto("/auth/login?role=organization");
  await page.getByRole("button", { name: "Continue as Guest" }).click();
  await page.goto("/organization/settings");
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  expect(
    await page.evaluate(() => sessionStorage.getItem("matrisync.demo.v1")),
  ).toBeNull();
  await context.setOffline(true);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
  expect(calls).toEqual([]);
});

test("new login observes SDK sign-out without a reload", async ({ page }) => {
  await page.goto("/auth/signup?role=professional");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`observer-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-test-42!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Synthetic-test-42!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByText(
      /Account Demo · Synthetic data|Private records · Device storage/,
    ),
  ).toBeVisible();
  await page.evaluate(async () => {
    const modulePath = "/src/auth.ts";
    const { accountAuth } = await import(modulePath);
    await (await accountAuth()).signOut();
  });
  await expect(page).toHaveURL(/\/auth\/login\?role=professional$/);
  await expect(
    page.getByText(
      /Account Demo · Synthetic data|Private records · Device storage/,
    ),
  ).toHaveCount(0);
});

test("failed account attempt clears Guest memory as well as tab storage", async ({
  page,
}) => {
  await page.goto("/auth/login?role=mother");
  await page.getByRole("button", { name: "Continue as Guest" }).click();
  await page.goto("/auth/login?role=mother");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("no-such-user@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-test-42!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("incorrect");
  expect(
    await page.evaluate(() => sessionStorage.getItem("matrisync.demo.v1")),
  ).toBeNull();
  // Exercise same-document navigation, so reloading cannot hide stale React Guest state.
  await page.evaluate(() => {
    history.pushState(null, "", "/mother/overview");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).toHaveURL(/\/auth\/login\?role=mother$/);
  await expect(page.getByText("Guest Demo · Synthetic data")).toHaveCount(0);
});
