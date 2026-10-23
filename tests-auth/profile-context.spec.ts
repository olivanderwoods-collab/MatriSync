import { test, expect } from "@playwright/test";
test("encrypted mother profile feeds only approved local fields to a mocked worker; clinical requests never reach it", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    Object.assign(window, { testWorkerCalls: calls });
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: {
        requestAdapter: async () => ({ features: new Set(["shader-f16"]) }),
      },
    });
    class TestWorker {
      onmessage?: (event: { data: unknown }) => void;
      onerror?: unknown;
      postMessage(data: { type: string }) {
        calls.push(data);
        setTimeout(
          () =>
            this.onmessage?.({
              data:
                data.type === "load"
                  ? { type: "ready" }
                  : {
                      type: "result",
                      text: "Hello! What would you like to talk about today?",
                    },
            }),
          0,
        );
      }
      terminate() {
        this.onmessage = undefined;
      }
    }
    Object.defineProperty(window, "Worker", {
      configurable: true,
      value: TestWorker,
    });
  });
  await page.goto("/auth/signup?role=mother");
  const email = `profile-${Date.now()}@example.test`;
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-test-42!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Synthetic-test-42!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator(".demo-banner")).toContainText("Signed-in account");
  await page.goto("/mother/more/profile");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(email);
  await page.getByLabel("Full name", { exact: true }).fill("Synthetic Mira");
  await page.getByLabel("Recorded pregnancy week (optional)").fill("22");
  await page.getByLabel("Pregnancy week recorded on").fill("2026-10-23");
  await page.getByLabel("Allergies (as recorded)").fill("PRIVATE ALLERGY");
  await page.getByLabel("Emergency contact phone").fill("PRIVATE PHONE");
  await page.getByLabel("Username", { exact: true }).fill("synthetic.mira");
  await page.getByRole("button", { name: "Save mother profile" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Profile saved encrypted",
  );
  await page.reload();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Synthetic Mira",
  );
  await page.goto("/mother/matrisathi/companion/settings");
  await page.getByRole("button", { name: "Install Offline AI" }).click();
  await page.getByRole("button", { name: "Confirm download" }).click();
  await expect(page.locator(".ai-workspace")).toHaveAttribute(
    "data-model-status",
    "ready",
  );
  await page.getByRole("link", { name: "Back to Chat" }).click();
  for (const message of [
    "Hello",
    "What medicine should I take?",
    "What does my report represent?",
    "What is my name?",
  ]) {
    await page.getByLabel("Your message", { exact: true }).fill(message);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator(".ai-workspace")).toHaveAttribute(
      "data-model-status",
      "ready",
    );
  }
  await expect(page.getByRole("log")).toContainText(
    "Your saved name is Synthetic Mira",
  );
  const calls = await page.evaluate(() =>
    (
      window as unknown as {
        testWorkerCalls: { type: string; profile?: unknown }[];
      }
    ).testWorkerCalls.filter((c) => c.type === "generate"),
  );
  expect(calls).toHaveLength(1);
  expect(calls[0].profile).toEqual({
    name: "Synthetic Mira",
    pregnancyWeeks: 22,
    recordedOn: "2026-10-23",
  });
  expect(JSON.stringify(calls)).not.toContain("PRIVATE");
  await expect(page.getByRole("log")).toContainText(
    "Please consult your physician",
  );
  await expect(page.getByRole("log")).toContainText("not enabled yet");
  await page.getByRole("link", { name: "AI settings", exact: true }).click();
  await page
    .getByLabel("Use saved name and recorded pregnancy stage")
    .uncheck();
  await page.getByRole("link", { name: "Back to Chat" }).click();
  await page.getByLabel("Your message", { exact: true }).fill("Hello again");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".chat-bubble.assistant")).toHaveCount(5);
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            testWorkerCalls: { type: string; profile?: unknown }[];
          }
        ).testWorkerCalls
          .filter((c) => c.type === "generate")
          .at(-1)?.profile,
    ),
  ).toBeUndefined();
});
