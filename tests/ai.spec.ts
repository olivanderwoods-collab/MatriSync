import { test, expect } from "@playwright/test";
test("AI safety, unavailable services and unsupported devices preserve Guest privacy", async ({
  page,
}) => {
  const remote: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1"))
      remote.push(request.url());
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", {
      value: undefined,
      configurable: true,
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/auth/login?role=mother");
  await page.getByRole("button", { name: "Continue as Guest" }).click();
  await page.goto("/mother/matrisathi/companion/chat");
  await page
    .getByLabel("Your message", { exact: true })
    .fill("I'm pregnant and bleeding heavily.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("urgent medical care");
  await expect(page.getByRole("log")).toContainText("Not AI-generated");
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page.getByRole("log")).not.toContainText("bleeding");
  await page.getByRole("link", { name: "AI settings", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Install Offline AI" }),
  ).toBeDisabled();
  await expect(page.locator("main")).toContainText("Sign in to install");
  await page.getByRole("link", { name: "AI usage", exact: true }).click();
  await expect(page.locator("main")).toContainText(
    "Provider remaining quota unavailable",
  );
  await expect(page.locator("main")).toContainText("Not measured");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/ai-usage-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(async () => (await indexedDB.databases()).length),
  ).toBe(0);
  expect(remote).toEqual([]);
  await page.getByRole("link", { name: "Back to Chat" }).click();
  await page.screenshot({
    path: "docs/screenshots/ai-chat-mobile.png",
    fullPage: true,
  });
});
