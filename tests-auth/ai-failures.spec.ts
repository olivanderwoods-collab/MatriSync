import { test, expect, type Page } from "@playwright/test";
async function account(page: Page) {
  await page.goto("/auth/signup?role=mother");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`ai-failure-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-test-42!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Synthetic-test-42!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByText("Account Demo · Synthetic data")).toBeVisible();
  await page.goto("/mother/matrisathi/companion/settings");
}
test("signed-in unsupported devices retain normal navigation", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "gpu", {
      value: undefined,
      configurable: true,
    }),
  );
  await account(page);
  await expect(
    page.getByRole("button", { name: "Install Offline AI" }),
  ).toBeDisabled();
  await expect(page.locator("main")).toContainText(
    "Device compatibility could not be checked",
  );
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Home", exact: true })
    .click();
  await expect(page.locator("main")).toContainText("Welcome");
});
test("failed and cancelled model downloads never break the companion or trigger another provider", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  await context.route("https://huggingface.co/**", (route) =>
    route.abort("internetdisconnected"),
  );
  await account(page);
  await page.getByRole("button", { name: "Install Offline AI" }).click();
  await page.getByRole("button", { name: "Confirm download" }).click();
  await expect(page.locator(".ai-workspace")).toHaveAttribute(
    "data-model-status",
    "error",
    { timeout: 20000 },
  );
  await expect(page.locator("main")).toContainText("could not start");
  await page.getByRole("button", { name: "Install Offline AI" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm download" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Back to Chat" }).click();
  await page
    .getByLabel("Your message", { exact: true })
    .fill("I don't want to live anymore.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("immediate human support");
  await expect(page.getByRole("log")).toContainText("Not AI-generated");
});
