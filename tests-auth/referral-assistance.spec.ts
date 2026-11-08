import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("clinician organizer preserves sources offline, requires fresh review and saves a separate version", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!["127.0.0.1", "localhost"].includes(new URL(request.url()).hostname))
      external.push(request.url());
  });
  await page.goto("/auth/signup?role=professional");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`assistant-${Date.now()}@example.test`);
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
    .fill("Synthetic Documentation Mother");
  await page
    .getByRole("button", { name: "Create patient profile", exact: true })
    .last()
    .click();
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await page
    .getByRole("button", { name: "Upload From Device", exact: true })
    .click();
  const original = Buffer.from(
    "%PDF-1.7\nSynthetic untouched source original\n%%EOF",
  );
  await page
    .getByLabel("Document", { exact: true })
    .setInputFiles({
      name: "source-original.pdf",
      mimeType: "application/pdf",
      buffer: original,
    });
  await page
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  await expect(
    page.getByText("source-original.pdf", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Referrals", exact: true }).click();
  await page.getByRole("button", { name: "New referral draft" }).click();
  const reason = page.getByRole("textbox", {
    name: "Reason for referral",
    exact: true,
  });
  await reason.fill("Existing clinician reason");
  await page.getByRole("checkbox", { name: /source-original.pdf/ }).check();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Save draft version" }).click();
  const preview = page.getByRole("article", { name: "Referral draft preview" });
  await expect(preview).toContainText("Existing clinician reason");
  await page.getByRole("button", { name: "Edit latest draft" }).click();
  const assist = page.getByRole("region", {
    name: "Clinician documentation assistance",
  });
  await assist.getByText("Organize supplied notes", { exact: true }).click();
  await assist
    .getByLabel("Source label", { exact: true })
    .fill("Clinician bedside note");
  await assist.getByLabel("Source date (optional)").fill("2026-11-01");
  const notes =
    "Supplied reason detail; no inferred destination.\nHistory: no new conclusion; recorded 0.5 mg — not administered. Unknown?";
  await assist.getByLabel("Clinician-supplied notes").fill(notes);
  await assist
    .getByRole("button", { name: "Organize text for review" })
    .click();
  await expect(assist.getByLabel("Place passage 1 in")).toHaveValue("");
  await expect(assist.getByLabel("Place passage 2 in")).toHaveValue("history");
  await expect(reason).toHaveValue("Existing clinician reason");
  await expect(assist).toContainText("explicit uncertainty marker");
  await assist.getByLabel("Place passage 1 in").selectOption("reason");
  await expect(
    assist.getByRole("button", { name: "Add reviewed text to draft" }),
  ).toBeDisabled();
  await assist.getByRole("checkbox").check();
  await page
    .getByRole("textbox", {
      name: "Recorded instructions (optional)",
      exact: true,
    })
    .fill("Existing clinician instruction");
  await expect(assist).toContainText("draft or source changed");
  await expect(
    assist.getByRole("button", { name: "Add reviewed text to draft" }),
  ).toHaveCount(0);
  await assist
    .getByRole("button", { name: "Organize text for review" })
    .click();
  await assist.getByLabel("Place passage 1 in").selectOption("reason");
  await assist.getByRole("checkbox").check();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await assist.getByRole("heading", { name: "Proposed fields · Not applied", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("documentation-review-mobile.png"),
  });
  await assist
    .getByRole("button", { name: "Add reviewed text to draft" })
    .click();
  await expect(reason).toHaveValue(
    /Existing clinician reason\n\n\[Clinician-supplied source: Clinician bedside note · Date: 2026-11-01\]/,
  );
  await expect(
    page.getByRole("textbox", {
      name: "Relevant history (optional)",
      exact: true,
    }),
  ).toHaveValue(
    /History: no new conclusion; recorded 0.5 mg — not administered. Unknown\?/,
  );
  await expect(
    page.getByRole("textbox", {
      name: "Recorded treatment (optional)",
      exact: true,
    }),
  ).toHaveValue("");
  await expect(
    page.getByRole("textbox", {
      name: "Recorded instructions (optional)",
      exact: true,
    }),
  ).toHaveValue("Existing clinician instruction");
  await page.getByRole("button", { name: "Save draft version" }).click();
  await expect(preview).toContainText(
    "Clinician-supplied source: Clinician bedside note",
  );
  await page
    .getByRole("combobox", { name: "Referral version", exact: true })
    .selectOption({ index: 0 });
  await expect(preview).not.toContainText("Clinician bedside note");
  await context.setOffline(false);
  await page.reload();
  await page
    .getByRole("combobox", { name: "Saved referral draft", exact: true })
    .selectOption({ index: 1 });
  await expect(preview).toContainText("Clinician bedside note");
  await context.setOffline(true);
  const exporting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download draft copy", exact: true })
    .click();
  const html = await readFile((await (await exporting).path())!, "utf8");
  expect(html).toContain(
    "Clinician-supplied source: Clinician bedside note · Date: 2026-11-01",
  );
  expect(html).toContain("0.5 mg — not administered. Unknown?");
  expect(html).toContain("Version 2");
  const downloading = page.waitForEvent("download");
  await preview
    .getByRole("button", {
      name: "Download original source-original.pdf",
      exact: true,
    })
    .click();
  expect(await readFile((await (await downloading).path())!)).toEqual(original);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
