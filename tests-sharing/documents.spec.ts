import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  approveMember,
  approveChannel,
  revokeChannel,
  revokeMember,
} from "../scripts/sharing-operator.mjs";

async function enroll(page: Page, role: string) {
  await page.goto(`/auth/signup?role=${role}`);
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`sharing-${role}-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-test-42!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Synthetic-test-42!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator(".demo-banner")).toContainText("Signed-in account");
  await page.goto(`/${role}/more/sharing`);
  await expect(page.getByTestId("sharing-fingerprint")).toHaveText(
    /^[a-f0-9]{64}$/,
  );
  const uid = (await page.getByTestId("sharing-uid").innerText()).trim();
  const fingerprint = (
    await page.getByTestId("sharing-fingerprint").innerText()
  ).trim();
  await page
    .getByRole("button", { name: "Request approval / Refresh connections" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "awaiting explicit pilot approval",
  );
  return { uid, fingerprint, role };
}
async function refresh(page: Page, channel: string) {
  await page
    .getByRole("button", { name: "Request approval / Refresh connections" })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Approved connections refreshed" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Approved connection", exact: true })
    .selectOption(channel);
}
async function download(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download original" }).click();
  const result = await pending;
  return readFile((await result.path())!);
}
test("separate accounts exchange original encrypted bytes; revocation preserves offline copies", async ({
  browser,
}, testInfo) => {
  test.setTimeout(90000);
  const contexts = await Promise.all([
    browser.newContext({ baseURL: "http://127.0.0.1:4175" }),
    browser.newContext({ baseURL: "http://127.0.0.1:4175" }),
    browser.newContext({ baseURL: "http://127.0.0.1:4175" }),
  ]);
  const [mother, clinician, organization] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  const external: string[] = [];
  for (const page of [mother, clinician, organization])
    page.on("request", (request) => {
      if (!["127.0.0.1", "localhost"].includes(new URL(request.url()).hostname))
        external.push(request.url());
    });
  try {
    const m = await enroll(mother, "mother"),
      c = await enroll(clinician, "professional"),
      o = await enroll(organization, "organization");
    await expect(approveMember(m.uid, m.role, "0".repeat(64))).rejects.toThrow(
      "Fingerprint does not match",
    );
    for (const account of [m, c, o])
      await approveMember(account.uid, account.role, account.fingerprint);
    const connection = `mother-doctor-${Date.now()}`,
      second = `doctor-organization-${Date.now()}`;
    await approveChannel(connection, m.uid, c.uid);
    await approveChannel(second, c.uid, o.uid);
    const original = Buffer.from(
      "%PDF-1.7\nFictional confidential original document\n%%EOF",
    );
    await mother.goto("/mother/more/profile");
    await mother
      .getByLabel("Full name", { exact: true })
      .fill("Fictional Sharing Mother");
    await mother.getByRole("button", { name: "Save mother profile" }).click();
    await expect(mother.getByRole("status")).toContainText("saved encrypted");
    await mother.goto("/mother/health/reports");
    await mother.getByRole("button", { name: "Upload From Device" }).click();
    await mother.getByLabel("Document", { exact: true }).setInputFiles({
      name: "fictional-original.pdf",
      mimeType: "application/pdf",
      buffer: original,
    });
    await mother
      .getByRole("button", { name: "Save document", exact: true })
      .click();
    await expect(mother.getByRole("status")).toContainText("Saved encrypted");
    await mother.goto("/mother/more/sharing");
    await refresh(mother, connection);
    await refresh(clinician, connection);
    await mother
      .getByRole("combobox", { name: "Saved local document", exact: true })
      .selectOption({ label: "fictional-original.pdf" });
    await mother.getByLabel("Other device fingerprint").fill("0".repeat(64));
    await mother
      .getByRole("button", { name: "Encrypt and send document" })
      .click();
    await expect(mother.getByRole("alert")).toContainText(
      "Enter the fingerprint",
    );
    await mother.getByLabel("Other device fingerprint").fill(c.fingerprint);
    await mother
      .getByRole("button", { name: "Encrypt and send document" })
      .click();
    await expect(
      mother
        .getByRole("status")
        .filter({ hasText: "Encrypted document stored" }),
    ).toBeVisible();
    const response = await fetch(
      `http://127.0.0.1:8087/v1/projects/demo-matrisync/databases/(default)/documents/channels/${connection}/transfers`,
      { headers: { Authorization: "Bearer owner" } },
    );
    expect(response.ok).toBeTruthy();
    const relay = await response.text();
    expect(relay).not.toContain("fictional-original.pdf");
    expect(relay).not.toContain("Fictional Sharing Mother");
    expect(relay).not.toContain(original.toString());
    expect(relay).not.toContain(original.toString("base64"));
    expect(JSON.parse(relay).documents).toHaveLength(1);
    await clinician.getByLabel("Other device fingerprint").fill(m.fingerprint);
    await clinician
      .getByRole("button", { name: "Fetch approved records" })
      .click();
    await expect(
      clinician
        .getByRole("status")
        .filter({ hasText: "1 encrypted transfer(s) checked" }),
    ).toBeVisible();
    await clinician
      .getByRole("button", { name: "Fetch approved records" })
      .click();
    await expect(
      clinician.getByRole("button", { name: "Open saved document" }),
    ).toHaveCount(1);
    await clinician
      .getByRole("button", { name: "Open saved document" })
      .click();
    expect(await download(clinician)).toEqual(original);
    await expect(
      clinician.getByText("Source patient: Fictional Sharing Mother", {
        exact: true,
      }),
    ).toBeVisible();
    // A second real, separately approved connection covers the Organization role.
    await clinician.setViewportSize({ width: 551, height: 850 });
    await clinician.screenshot({
      path: testInfo.outputPath("received-document.png"),
      fullPage: true,
    });
    await clinician
      .getByRole("combobox", { name: "Approved connection", exact: true })
      .selectOption(second);
    await clinician.getByLabel("Other device fingerprint").fill(o.fingerprint);
    await clinician.getByLabel("Original test document").setInputFiles({
      name: "fictional-handoff.pdf",
      mimeType: "application/pdf",
      buffer: original,
    });
    await clinician
      .getByRole("button", { name: "Encrypt and send document" })
      .click();
    await expect(
      clinician
        .getByRole("status")
        .filter({ hasText: "Encrypted document stored" }),
    ).toBeVisible();
    await refresh(organization, second);
    await organization
      .getByLabel("Other device fingerprint")
      .fill(c.fingerprint);
    await organization
      .getByRole("button", { name: "Fetch approved records" })
      .click();
    await expect(
      organization.getByRole("button", { name: "Open saved document" }),
    ).toHaveCount(1);
    await organization
      .getByRole("button", { name: "Open saved document" })
      .click();
    expect(await download(organization)).toEqual(original);
    await revokeChannel(connection);
    await clinician
      .getByRole("combobox", { name: "Approved connection", exact: true })
      .selectOption(connection);
    await clinician
      .getByRole("button", { name: "Fetch approved records" })
      .click();
    await expect(clinician.getByRole("alert")).toContainText(
      "Future sharing is blocked",
    );
    await clinician.reload();
    await expect(
      clinician.getByRole("button", { name: "Open saved document" }),
    ).toBeEnabled();
    await contexts[1].setOffline(true);
    await clinician
      .getByRole("button", { name: "Open saved document" })
      .click();
    expect(await download(clinician)).toEqual(original);
    await contexts[1].setOffline(false);
    await revokeMember(o.uid);
    await organization
      .getByRole("button", { name: "Fetch approved records" })
      .click();
    await expect(organization.getByRole("alert")).toContainText("not approved");
    await organization
      .getByRole("button", { name: "Open saved document" })
      .click();
    expect(await download(organization)).toEqual(original);
    // A route selection is not an approval for another workspace.
    await mother.goto("/professional/more/sharing");
    await mother
      .getByRole("button", { name: "Request approval / Refresh connections" })
      .click();
    await expect(mother.getByRole("alert")).toContainText(
      "workspace or device is not approved",
    );
    await mother.goto("/mother/health/reports");
    await expect(
      mother.getByText("fictional-original.pdf", { exact: true }),
    ).toBeVisible();
    expect(external).toEqual([]);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
