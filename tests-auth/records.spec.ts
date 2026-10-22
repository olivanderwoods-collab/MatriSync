import { test, expect } from "@playwright/test";
const phrase = "Synthetic private records phrase";
test("mother uploads remain on-device offline and idle timeout locks the vault", async ({
  page,
  context,
}) => {
  await page.goto("/auth/signup?role=mother");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`mother-records-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-test-42!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Synthetic-test-42!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByText("Account Demo · Synthetic data")).toBeVisible();
  await page.clock.install();
  await page.goto("/mother/health/reports");
  await page.getByLabel("Vault passphrase", { exact: true }).fill(phrase);
  await page
    .getByLabel("Confirm vault passphrase", { exact: true })
    .fill(phrase);
  await page.getByRole("button", { name: "Create vault", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Test Mother");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Section tabs" }).getByRole("link"),
  ).toHaveText([
    "Overview",
    "Prescriptions",
    "Reports",
    "Referrals",
    "Follow-ups",
  ]);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Add Report", exact: true }).click();
  await page
    .getByLabel("Document", { exact: true })
    .setInputFiles({
      name: "offline.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nOffline test report"),
    });
  await page
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  await expect(page.getByText("offline.pdf", { exact: true })).toBeVisible();
  await page.clock.fastForward(6 * 60_000);
  await expect(
    page.getByRole("heading", { name: "Unlock records", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("offline.pdf", { exact: true })).toHaveCount(0);
  await page.getByLabel("Vault passphrase", { exact: true }).fill(phrase);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByText("offline.pdf", { exact: true })).toBeVisible();
  await context.setOffline(false);
});
test("encrypted records and local reports persist, lock, download and isolate accounts", async ({
  page,
}) => {
  test.setTimeout(90000);
  const external: string[] = [];
  page.on("request", (req) => {
    if (!["127.0.0.1", "localhost"].includes(new URL(req.url()).hostname))
      external.push(req.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/auth/signup?role=professional");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`vault-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-test-42!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Synthetic-test-42!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByText("Private records · Device storage"),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Ishani");
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Patients", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Set up encrypted records" }),
  ).toBeVisible();
  await page.getByLabel("Vault passphrase", { exact: true }).fill(phrase);
  await page
    .getByLabel("Confirm vault passphrase", { exact: true })
    .fill(phrase);
  await page.getByRole("button", { name: "Create vault", exact: true }).click();
  await page.getByRole("link", { name: "Add patient", exact: true }).click();
  await page
    .getByLabel("Full name", { exact: true })
    .fill("Private Patient Test");
  await page.getByLabel("Date of birth (optional)").fill("2000-02-29");
  await page
    .getByLabel("Medical history / profile notes (optional)")
    .fill("Private notes for testing");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Private Patient Test", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Section tabs" }).getByRole("link"),
  ).toHaveText([
    "Overview",
    "Reports",
    "Prescriptions",
    "Referrals",
    "Follow-ups",
  ]);
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await page.getByRole("button", { name: "Add Report", exact: true }).click();
  await page.getByLabel("Document", { exact: true }).setInputFiles({
    name: "Private-test.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nPrivate test document"),
  });
  await page
    .getByLabel("Issuing facility / source (optional)")
    .fill("Private testing facility");
  await page
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Saved encrypted");
  await expect(
    page.getByText("Private-test.pdf", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "docs/screenshots/local-reports-mobile.png",
    fullPage: true,
  });
  const dump = await page.evaluate(
    async () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open("matrisync-encrypted-records-v1");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(["vaults", "files"], "readonly");
          const a = tx.objectStore("vaults").getAll(),
            b = tx.objectStore("files").getAll();
          tx.oncomplete = () => {
            db.close();
            resolve(JSON.stringify([a.result, b.result]));
          };
        };
      }),
  );
  for (const secret of [
    "Private Patient Test",
    "Private-test.pdf",
    "Private notes for testing",
    "Private testing facility",
    phrase,
  ])
    expect(dump).not.toContain(secret);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Unlock records", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Private-test.pdf", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByLabel("Vault passphrase", { exact: true })
    .fill("An incorrect vault phrase");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Unable to unlock");
  await page.getByLabel("Vault passphrase", { exact: true }).fill(phrase);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(
    page.getByText("Private-test.pdf", { exact: true }),
  ).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Document", exact: true })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("Private-test.pdf");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe(
    "%PDF-1.7\nPrivate test document",
  );
  const oldRoute = page.url();
  await page
    .getByRole("button", { name: "Log Out", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL("/");
  await page.goto("/auth/signup?role=professional");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`other-vault-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-test-42!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Synthetic-test-42!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByText("Private records · Device storage"),
  ).toBeVisible();
  await page.goto(oldRoute);
  await expect(
    page.getByRole("heading", { name: "Set up encrypted records" }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Private Patient Test");
  await expect(page.locator("main")).not.toContainText("Private-test.pdf");
  expect(external).toEqual([]);
});
