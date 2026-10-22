import { test, expect, chromium } from "@playwright/test";
// Explicit opt-in downloads public weights. The ignored profile retains only
// public model/runtime caches and synthetic emulator test data between runs.
test("genuine Qwen generation and cached restart work offline", async () => {
  test.skip(
    process.env.TEST_OFFLINE_MODEL !== "1",
    "Explicit model download test only",
  );
  test.setTimeout(20 * 60_000);
  const context = await chromium.launchPersistentContext(
    ".local-tools/ai-browser-test",
    { channel: "msedge", headless: true },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on("console", (message) => {
    if (message.type() === "error")
      console.log("Browser:", message.text().slice(0, 600));
  });
  try {
    await page.goto("http://127.0.0.1:4174/");
    await page.evaluate(async () => {
      sessionStorage.clear();
      for (const r of await navigator.serviceWorker.getRegistrations())
        await r.unregister();
      for (const key of await caches.keys())
        if (key.startsWith("matrisync-shell-")) await caches.delete(key);
    });
    await page.goto("about:blank");
    await page.goto("http://127.0.0.1:4174/auth/signup?role=mother");
    await page
      .getByLabel("Email address", { exact: true })
      .fill(`offline-ai-${Date.now()}@example.test`);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Synthetic-test-42!");
    await page
      .getByLabel("Confirm password", { exact: true })
      .fill("Synthetic-test-42!");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page.getByText("Account Demo · Synthetic data")).toBeVisible();
    await page.goto(
      "http://127.0.0.1:4174/mother/matrisathi/companion/settings",
    );
    if (process.env.TEST_AI_PRODUCTION === "1") {
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await page.reload();
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    }
    await expect(page.locator("main")).toContainText("WebGPU detected");
    if (
      await page.getByRole("button", { name: "Install Offline AI" }).count()
    ) {
      await page.getByRole("button", { name: "Install Offline AI" }).click();
      await page.getByRole("button", { name: "Confirm download" }).click();
    } else await page.getByRole("button", { name: "Load Offline AI" }).click();
    await expect
      .poll(
        async () => {
          const state = await page
            .locator(".ai-workspace")
            .getAttribute("data-model-status");
          console.log(
            "Model:",
            state,
            (
              await page
                .locator(".ai-operation")
                .textContent()
                .catch(() => "")
            ).slice(0, 100),
          );
          return state;
        },
        { timeout: 15 * 60_000, intervals: [5000, 15000, 30000] },
      )
      .not.toBe("loading");
    await expect(page.locator(".ai-workspace")).toHaveAttribute(
      "data-model-status",
      "ready",
    );
    await page.getByRole("link", { name: "Back to Chat" }).click();
    const calls: string[] = [];
    page.on("request", (request) => calls.push(request.url()));
    await context.setOffline(true);
    for (const message of [
      "I feel lonely during my pregnancy.",
      "I'm scared about giving birth.",
    ]) {
      await page.getByLabel("Your message", { exact: true }).fill(message);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(page.locator(".ai-workspace")).toHaveAttribute(
        "data-model-status",
        "ready",
        { timeout: 120_000 },
      );
    }
    console.log(
      "Synthetic offline conversation:",
      await page.getByRole("log").innerText(),
    );
    await expect(
      page.getByRole("log").getByText("Offline AI", { exact: true }),
    ).toHaveCount(2);
    if (process.env.TEST_AI_PRODUCTION === "1") {
      await page
        .getByLabel("Your message", { exact: true })
        .fill("I feel lonely today");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      await page
        .getByRole("button", { name: "Load Offline AI", exact: true })
        .click();
      await expect
        .poll(
          () => page.locator(".ai-workspace").getAttribute("data-model-status"),
          { timeout: 90_000 },
        )
        .not.toBe("loading");
      console.log(
        "Restart state:",
        await page.locator(".ai-workspace").innerText(),
      );
      await expect(page.locator(".ai-workspace")).toHaveAttribute(
        "data-model-status",
        "ready",
      );
      await page
        .getByLabel("Your message", { exact: true })
        .fill("I'm scared about giving birth.");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(page.locator(".ai-workspace")).toHaveAttribute(
        "data-model-status",
        "ready",
        { timeout: 120_000 },
      );
      await expect(
        page.getByRole("log").getByText("Offline AI", { exact: true }),
      ).toHaveCount(3);
    }
    expect(
      calls.filter((url) => !url.startsWith("http://127.0.0.1:4174")),
    ).toEqual([]);
  } finally {
    await context.close();
  }
});
