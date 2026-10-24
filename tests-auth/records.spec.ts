import { test, expect } from "@playwright/test";
const phrase = "Synthetic private records phrase";
test("existing passphrase records migrate once without losing their original document", async ({
  page,
}) => {
  await page.goto("/auth/signup?role=mother");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`legacy-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-test-42!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Synthetic-test-42!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator(".demo-banner")).toContainText("Signed-in account");
  await expect(page.locator("main")).not.toContainText("Mira");
  await expect(page.locator("main")).not.toContainText("34");
  await page.evaluate(async (pass) => {
    const authPath = "/src/auth.ts",
      vaultPath = "/src/record-vault.ts";
    const { accountAuth } = await import(authPath);
    const { RecordVault } = await import(vaultPath);
    const uid = (await accountAuth()).currentUser.uid;
    const vault = new RecordVault(uid, async () => {});
    await vault.unlock(pass, true);
    await vault.savePatient(
      { name: "Legacy Mother", birthDate: "", history: "" },
      "self",
    );
    await vault.addDocument(
      "self",
      "prescriptions",
      new File(["%PDF-1.7\nLegacy original"], "legacy.pdf", {
        type: "application/pdf",
      }),
      "",
      "",
    );
    vault.lock();
  }, phrase);
  await page.goto("/mother/health/prescriptions");
  await expect(
    page.getByRole("heading", { name: "Connect your existing records" }),
  ).toBeVisible();
  await page
    .getByLabel("Previous vault passphrase")
    .fill("Incorrect legacy phrase");
  await page.getByRole("button", { name: "Keep records and continue" }).click();
  await expect(page.getByRole("alert")).toContainText("Unable to unlock");
  await page.getByLabel("Previous vault passphrase").fill(phrase);
  await page.getByRole("button", { name: "Keep records and continue" }).click();
  await expect(page.getByText("legacy.pdf", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("legacy.pdf", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Previous vault passphrase")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Take Photo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Create.*prescription|Save test prescription/,
    }),
  ).toHaveCount(0);
});
test("mother uploads remain on-device offline without an extra lockscreen", async ({
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
  await expect(
    page.locator(".demo-banner").getByText("Signed-in account"),
  ).toBeVisible();
  await page.clock.install();
  await page.goto("/mother/health/reports");
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
  await page
    .getByRole("button", { name: "Upload From Device", exact: true })
    .click();
  await page.getByLabel("Document", { exact: true }).setInputFiles({
    name: "offline.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nOffline test report"),
  });
  await page
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  await expect(page.getByText("offline.pdf", { exact: true })).toBeVisible();
  await page.clock.fastForward(6 * 60_000);
  await expect(page.getByText("offline.pdf", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Vault passphrase", { exact: true }),
  ).toHaveCount(0);
  await context.setOffline(false);
});
test("encrypted records open automatically, persist, download and isolate accounts", async ({
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
    page.locator(".demo-banner").getByText("Signed-in account"),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Ishani");
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Patients", exact: true })
    .click();
  await expect(
    page.getByLabel("Vault passphrase", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Add patient", exact: true }).click();
  await page
    .getByRole("button", { name: "Create patient profile", exact: true })
    .click();
  await page
    .getByLabel("Full name", { exact: true })
    .fill("Private Patient Test");
  await page.getByLabel("Date of birth (optional)").fill("2000-02-29");
  await page
    .getByLabel("Medical history / profile notes (optional)")
    .fill("Private notes for testing");
  await page
    .getByRole("button", { name: "Create patient profile", exact: true })
    .last()
    .click();
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
  await page
    .getByRole("button", { name: "Upload From Device", exact: true })
    .click();
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
    page.getByText("Private-test.pdf", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Vault passphrase", { exact: true }),
  ).toHaveCount(0);
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
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Log out", exact: true })
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
    page.locator(".demo-banner").getByText("Signed-in account"),
  ).toBeVisible();
  await page.goto(oldRoute);
  await expect(
    page.getByText("No record is available at this address."),
  ).toBeVisible();
  await expect(
    page.getByLabel("Vault passphrase", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Private Patient Test");
  await expect(page.locator("main")).not.toContainText("Private-test.pdf");
  expect(external).toEqual([]);
});
