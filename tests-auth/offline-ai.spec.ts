import { test, expect, chromium } from "@playwright/test";
// Explicit opt-in downloads public weights. The ignored profile retains only
// public model/runtime caches and synthetic emulator test data between runs.
test("genuine MatriSathi conversation, clinical refusals, context opt-out and cached restart work offline", async () => {
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
    await expect(
      page.locator(".demo-banner").getByText("Signed-in account"),
    ).toBeVisible();
    // A newly registered user has no Mother profile yet. The bundled behavior
    // must still support genuine conversation once the local model is loaded.
    await page.goto("http://127.0.0.1:4174/mother/matrisathi/companion/settings");
    if (await page.getByRole("button", { name: "Install MatriSathi" }).count()) {
      await page.getByRole("button", { name: "Install MatriSathi" }).click();
      await page.getByRole("button", { name: "Confirm download" }).click();
    } else await page.getByRole("button", { name: "Load MatriSathi" }).click();
    await expect(page.locator(".ai-workspace")).toHaveAttribute("data-model-status", "ready", { timeout: 900000 });
    await page.getByRole("link", { name: "Back to Chat" }).click();
    await page.getByLabel("Your message", { exact: true }).fill("Hello, how are you?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator(".chat-bubble.assistant")).toContainText("MatriSathi · Offline AI", { timeout: 120000 });
    await expect(page.locator(".chat-bubble.assistant")).not.toContainText("Mira");
    await page.goto("http://127.0.0.1:4174/mother/more/profile");
    await page.getByLabel("Full name", { exact: true }).fill("Mira Synthetic");
    await page.getByLabel("Recorded pregnancy week (optional)").fill("22");
    await page.getByLabel("Pregnancy week recorded on").fill("2026-10-23");
    await page.getByRole("button", { name: "Save mother profile" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Profile saved encrypted",
    );
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
    if (await page.getByRole("button", { name: "Install MatriSathi" }).count()) {
      await page.getByRole("button", { name: "Install MatriSathi" }).click();
      await page.getByRole("button", { name: "Confirm download" }).click();
    } else await page.getByRole("button", { name: "Load MatriSathi" }).click();
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
    let replyCount = 0;
    for (const message of [
      "How are you?",
      "Do you know me?",
      "What is my name?",
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
      await expect(page.locator(".chat-bubble.assistant")).toHaveCount(
        ++replyCount,
        { timeout: 120_000 },
      );
      if (message === "Do you know me?")
        await expect(
          page.locator(".chat-bubble.assistant").last(),
        ).toContainText(
          /Mira|only|don't know|do not know|can't see|cannot see|share|tell me/i,
        );
      if (message === "What is my name?")
        await expect(
          page.locator(".chat-bubble.assistant").last(),
        ).toContainText("Mira");
      await expect(
        page.locator(".chat-bubble.assistant").last(),
      ).not.toContainText(
        /I(?:'m| am|’m) (?:not )?(?:scared|afraid|pregnant|lonely)/i,
      );
      await expect(
        page.locator(".chat-bubble.assistant").last(),
      ).not.toContainText(/you, MatriSathi|Dear MatriSathi|^MatriSathi,/i);
    }
    console.log(
      "Synthetic offline conversation:",
      await page.getByRole("log").innerText(),
    );
    // Require actual inference; safety fallback counts may legitimately vary
    // with model output and must never be mistaken for generated replies.
    expect(
      await page
        .getByRole("log")
        .getByText("MatriSathi · Offline AI", { exact: true })
        .count(),
    ).toBeGreaterThan(0);
    await expect(page.locator(".chat-bubble.assistant").first()).toContainText(
      "Mira",
    );
    for (const [message, answer] of [
      ["What medicine should I take?", "Please consult your physician"],
      ["What does this report represent?", "not enabled yet"],
      ["What is my recorded pregnancy week?", "week 22 on 2026-10-23"],
    ]) {
      await page.getByLabel("Your message", { exact: true }).fill(message);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(page.locator(".chat-bubble.assistant")).toHaveCount(
        ++replyCount,
      );
      await expect(page.locator(".chat-bubble.assistant").last()).toContainText(
        answer,
      );
      await expect(page.locator(".chat-bubble.assistant").last()).toContainText(
        "Not AI-generated",
      );
    }
    await page.getByRole("link", { name: "AI settings", exact: true }).click();
    await page
      .getByLabel("Use saved name and recorded pregnancy stage")
      .uncheck();
    await page.getByRole("link", { name: "Back to Chat" }).click();
    await page
      .getByLabel("Your message", { exact: true })
      .fill("What is my name?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator(".chat-bubble.assistant")).toHaveCount(
      ++replyCount,
    );
    await expect(page.locator(".chat-bubble.assistant").last()).toContainText(
      "don't have saved profile details",
    );
    await expect(
      page.locator(".chat-bubble.assistant").last(),
    ).not.toContainText("Mira");
    if (process.env.TEST_AI_PRODUCTION === "1") {
      await page
        .getByLabel("Your message", { exact: true })
        .fill("I feel lonely today");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      await page
        .getByRole("button", { name: "Load MatriSathi", exact: true })
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
      await page.getByLabel("Your message", { exact: true }).fill("Hello");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(page.locator(".ai-workspace")).toHaveAttribute(
        "data-model-status",
        "ready",
        { timeout: 120_000 },
      );
      await expect(page.locator(".chat-bubble.assistant")).toHaveCount(
        ++replyCount,
        {
          timeout: 120_000,
        },
      );
      await expect(
        page.locator(".chat-bubble.assistant").last(),
      ).not.toContainText(
        /I(?:'m| am|’m) (?:not )?(?:scared|afraid|pregnant|lonely)/i,
      );
      console.log(
        "Reply after cached restart:",
        await page.locator(".chat-bubble.assistant").last().innerText(),
      );
      await expect(page.locator(".chat-bubble.assistant").last()).toContainText(
        "MatriSathi · Offline AI",
      );
      await expect(
        page.locator(".chat-bubble.assistant").last(),
      ).not.toContainText("Mira");
      // Cold page reload stays offline; the shell, preference and model cache
      // must restore without an external provider or silently enabling context.
      await page.reload();
      await page
        .getByRole("button", { name: "Load MatriSathi", exact: true })
        .click();
      await expect
        .poll(
          () => page.locator(".ai-workspace").getAttribute("data-model-status"),
          { timeout: 120_000 },
        )
        .toBe("ready");
      await page.getByLabel("Your message", { exact: true }).fill("Hello");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(page.locator(".chat-bubble.assistant")).toHaveCount(1, {
        timeout: 120_000,
      });
      await expect(page.locator(".chat-bubble.assistant")).toContainText(
        "MatriSathi · Offline AI",
      );
      await expect(page.locator(".chat-bubble.assistant")).not.toContainText(
        "Mira",
      );
    }
    expect(
      calls.filter(
        (url) => !["127.0.0.1", "localhost"].includes(new URL(url).hostname),
      ),
    ).toEqual([]);
  } finally {
    await context.close();
  }
});
