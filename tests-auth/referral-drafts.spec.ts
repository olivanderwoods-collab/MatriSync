import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("referral drafts preserve earlier versions and patient context across offline editing and reload", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(60000);
  await context.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printRequested = "true";
    };
  });
  await page.setViewportSize({ width: 551, height: 850 });
  await page.goto("/auth/signup?role=professional");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`referral-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-test-42!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Synthetic-test-42!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator(".demo-banner")).toContainText("Signed-in account");
  await page.goto("/professional/patients/add");
  await page
    .getByRole("button", { name: "Create patient profile", exact: true })
    .click();
  await page
    .getByLabel("Full name", { exact: true })
    .fill("Referral Test Mother");
  await page
    .getByRole("button", { name: "Create patient profile", exact: true })
    .last()
    .click();
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await page
    .getByRole("button", { name: "Upload From Device", exact: true })
    .click();
  const originalBytes = Buffer.from(
    "%PDF-1.7\nSynthetic referral original bytes",
  );
  await page.getByLabel("Document", { exact: true }).setInputFiles({
    name: "referral-original.pdf",
    mimeType: "application/pdf",
    buffer: originalBytes,
  });
  await page
    .getByLabel("Issuing facility / source (optional)")
    .fill("Fictional source clinic");
  await page.getByLabel("Document date (optional)").fill("2026-10-20");
  await page
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  await expect(
    page.getByText("referral-original.pdf", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Referrals", exact: true }).click();
  await page.getByRole("button", { name: "New referral draft" }).click();
  await page
    .getByRole("textbox", { name: "Reason for referral", exact: true })
    .fill("Clinician-entered referral reason");
  await page.getByRole("checkbox", { name: /referral-original.pdf/ }).check();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Save draft version" }).click();
  await expect(page.locator("main").getByRole("status")).toContainText(
    "saved encrypted",
  );
  const preview = page.getByRole("article", { name: "Referral draft preview" });
  await expect(preview).toContainText("Not approved · Not sent");
  await expect(preview).toContainText("Referral Test Mother");
  await page.getByRole("button", { name: "Edit latest draft" }).click();
  await page
    .getByLabel("Recorded instructions (optional)", { exact: true })
    .fill("Recorded instruction from clinician");
  await page.getByRole("button", { name: "Save draft version" }).click();
  await expect(preview).toContainText("Recorded instruction from clinician");
  await page
    .getByRole("combobox", { name: "Referral version", exact: true })
    .selectOption({ index: 0 });
  await expect(preview).not.toContainText(
    "Recorded instruction from clinician",
  );
  const draftDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download draft copy", exact: true })
    .click();
  const draftDownload = await draftDownloadPromise;
  expect(draftDownload.suggestedFilename()).toBe(
    "MatriSync-referral-draft.html",
  );
  const html = await readFile((await draftDownload.path())!, "utf8");
  expect(html).toContain("Version 1");
  expect(html).toContain("Fictional source clinic");
  expect(html).not.toContain("Recorded instruction from clinician");
  const originalDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Download original referral-original.pdf",
      exact: true,
    })
    .click();
  const originalDownload = await originalDownloadPromise;
  expect(await readFile((await originalDownload.path())!)).toEqual(
    originalBytes,
  );
  await page
    .getByRole("button", { name: "Print / Save as PDF", exact: true })
    .click();
  await expect(
    page
      .frameLocator('iframe[title="Referral print document"]')
      .locator("html"),
  ).toHaveAttribute("data-print-requested", "true");
  await expect(
    page
      .frameLocator('iframe[title="Referral print document"]')
      .locator("body"),
  ).toContainText("Version 1");
  await expect(
    page
      .frameLocator('iframe[title="Referral print document"]')
      .locator("body"),
  ).not.toContainText("Recorded instruction from clinician");
  await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>(
      'iframe[title="Referral print document"]',
    );
    frame!.contentWindow!.dispatchEvent(new Event("afterprint"));
  });
  await expect(
    page.locator('iframe[title="Referral print document"]'),
  ).toHaveCount(0);
  await context.setOffline(false);
  const documentPage = await context.newPage();
  await documentPage.route("**/referral-export-check", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await documentPage.goto("/referral-export-check");
  await documentPage.emulateMedia({ media: "print" });
  const pdf = await documentPage.pdf({
    path: testInfo.outputPath("referral-draft.pdf"),
    preferCSSPageSize: true,
  });
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  await documentPage.screenshot({
    path: testInfo.outputPath("referral-print-layout.png"),
    fullPage: true,
  });
  await documentPage.close();
  await page.reload();
  await page
    .getByRole("combobox", { name: "Saved referral draft", exact: true })
    .selectOption({ index: 1 });
  await expect(preview).toContainText("Recorded instruction from clinician");
  await expect(
    page
      .getByRole("combobox", { name: "Referral version", exact: true })
      .locator("option"),
  ).toHaveCount(2);
  await page.screenshot({
    path: testInfo.outputPath("referral-draft-mobile.png"),
    fullPage: true,
  });
  // Check that a longer clinical note keeps its final line in the printable copy.
  await page.getByRole("button", { name: "Edit latest draft" }).click();
  const longReason = Array.from(
    { length: 65 },
    (_, i) =>
      `Source note ${i + 1}: recorded facts for referral review, without generated conclusions.`,
  ).join("\n");
  await page
    .getByRole("textbox", { name: "Reason for referral", exact: true })
    .fill(longReason);
  await page.getByRole("button", { name: "Save draft version" }).click();
  const longDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download draft copy", exact: true })
    .click();
  const longHtml = await readFile(
    (await (await longDownloadPromise).path())!,
    "utf8",
  );
  const longPage = await context.newPage();
  await longPage.route("**/referral-export-long-check", (route) =>
    route.fulfill({ contentType: "text/html", body: longHtml }),
  );
  await longPage.goto("/referral-export-long-check");
  await expect(longPage.locator("body")).toContainText(longReason);
  await longPage.pdf({
    path: testInfo.outputPath("referral-draft-long.pdf"),
    preferCSSPageSize: true,
  });
  await longPage.close();
  await page.getByRole("link", { name: "Back to Patients" }).click();
  await expect(
    page.getByRole("link", { name: /Referral Test Mother/ }),
  ).toBeVisible();
});
