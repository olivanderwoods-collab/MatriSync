import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  approveMember,
  approveChannel,
  revokeChannel,
  approveTestFacility,
  approveCredentialScope,
} from "../scripts/sharing-operator.mjs";

async function account(page: Page, role: string) {
  await page.goto(`/auth/signup?role=${role}`);
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`profile-sharing-${role}-${Date.now()}@example.test`);
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
  const uid = (await page.getByTestId("sharing-uid").innerText()).trim(),
    fingerprint = (
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
async function connection(page: Page, id: string, fingerprint: string) {
  await page
    .getByRole("button", { name: "Request approval / Refresh connections" })
    .click();
  await page
    .getByRole("combobox", { name: "Approved connection", exact: true })
    .selectOption(id);
  await page.getByLabel("Other device fingerprint").fill(fingerprint);
}
async function sendProfile(page: Page) {
  await page
    .getByRole("combobox", { name: "Local patient profile", exact: true })
    .selectOption({ label: "Asha Profile Test" });
  await page
    .getByRole("button", { name: "Encrypt and share profile", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Encrypted profile version stored" }),
  ).toBeVisible();
}
async function fetchRecords(page: Page) {
  await page.getByRole("button", { name: "Fetch approved records" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "encrypted transfer(s) checked" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open saved profiles", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open saved profiles", exact: true }),
  ).toBeEnabled();
}
test("profile versions retain identity, match original bytes, exclude unshared children and survive revocation", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180000);
  const contexts = await Promise.all(
    [1, 2, 3, 4].map(() =>
      browser.newContext({ baseURL: "http://127.0.0.1:4175" }),
    ),
  );
  const [mother, doctor, outsider, facility] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const external: string[] = [];
  for (const page of [mother, doctor, outsider, facility])
    page.on("request", (r) => {
      if (!["127.0.0.1", "localhost"].includes(new URL(r.url()).hostname))
        external.push(r.url());
    });
  try {
    const m = await account(mother, "mother"),
      d = await account(doctor, "professional");
    const o = await account(facility, "organization");
    await account(outsider, "professional");
    await mother.goto("/mother/more/profile");
    await mother
      .getByLabel("Full name", { exact: true })
      .fill("Asha Profile Test");
    await mother.getByLabel("Recorded pregnancy week (optional)").fill("20");
    await mother.getByLabel("Pregnancy week recorded on").fill("2026-10-20");
    await mother.getByRole("button", { name: "Save mother profile" }).click();
    await expect(mother.getByRole("status")).toContainText("saved encrypted");
    const bytes = Buffer.from(
      "%PDF-1.7\nFictional original profile report\n%%EOF",
    );
    await mother.goto("/mother/health/reports");
    await mother.getByRole("button", { name: "Upload From Device" }).click();
    await mother.getByLabel("Document", { exact: true }).setInputFiles({
      name: "profile-original.pdf",
      mimeType: "application/pdf",
      buffer: bytes,
    });
    await mother
      .getByRole("button", { name: "Save document", exact: true })
      .click();
    await expect(mother.getByRole("status")).toContainText("Saved encrypted");
    await mother.goto("/mother/children/add");
    await mother.getByLabel("Child's full name").fill("Unshared Child Test");
    await mother
      .getByLabel("Date of birth", { exact: true })
      .fill("2024-01-01");
    await mother.getByRole("button", { name: "Save child profile" }).click();
    await expect(mother.getByRole("heading", { level: 1 })).toHaveText(
      "Unshared Child Test",
    );
    for (const value of [m, d, o])
      await approveMember(value.uid, value.role, value.fingerprint);
    const id = `profile-pair-${Date.now()}`;
    await approveChannel(id, m.uid, d.uid);
    await mother.goto("/mother/more/sharing");
    await connection(mother, id, d.fingerprint);
    await connection(doctor, id, m.fingerprint);
    await doctor
      .getByRole("button", { name: "Open saved profiles", exact: true })
      .click();
    await expect(
      doctor.getByText("No profile snapshots saved on this device."),
    ).toBeVisible();
    await sendProfile(mother);
    await fetchRecords(doctor);
    const patientSelect = doctor.getByRole("combobox", {
      name: "Shared patient",
      exact: true,
    });
    await expect(patientSelect.locator("option")).toHaveCount(2);
    await expect(patientSelect).not.toContainText("Unshared Child Test");
    await patientSelect.selectOption({ index: 1 });
    const versionSelect = doctor.getByRole("combobox", {
      name: "Saved profile version",
      exact: true,
    });
    await versionSelect.selectOption({ index: 1 });
    const view = doctor.getByTestId("shared-profile-view");
    await expect(view).toContainText("20 · Recorded 2026-10-20");
    await expect(view).toContainText("Original not received");
    const profileId = await view.getByText(/^Shared profile ID:/).innerText();
    const response = await fetch(
      `http://127.0.0.1:8087/v1/projects/demo-matrisync/databases/(default)/documents/channels/${id}/transfers`,
      { headers: { Authorization: "Bearer owner" } },
    );
    expect(response.ok).toBeTruthy();
    const relay = await response.text();
    for (const privateValue of [
      "Asha Profile Test",
      "profile-original.pdf",
      "Unshared Child Test",
      profileId.replace("Shared profile ID: ", ""),
    ])
      expect(relay).not.toContain(privateValue);
    await mother
      .getByRole("combobox", { name: "Saved local document", exact: true })
      .selectOption({ label: "profile-original.pdf" });
    await mother
      .getByRole("button", { name: "Encrypt and send document" })
      .click();
    await expect(
      mother
        .getByRole("status")
        .filter({ hasText: "Encrypted document stored" }),
    ).toBeVisible();
    await fetchRecords(doctor);
    await expect(
      view.getByRole("button", { name: "Download matched original" }),
    ).toBeVisible();
    const downloaded = doctor.waitForEvent("download");
    await view
      .getByRole("button", { name: "Download matched original" })
      .click();
    expect(await readFile((await (await downloaded).path())!)).toEqual(bytes);
    await mother.goto("/mother/more/profile");
    await mother.getByLabel("Recorded pregnancy week (optional)").fill("21");
    await mother.getByRole("button", { name: "Save mother profile" }).click();
    await expect(mother.getByRole("status")).toContainText("saved encrypted");
    await mother.goto("/mother/more/sharing");
    await connection(mother, id, d.fingerprint);
    await sendProfile(mother);
    await sendProfile(mother); // A repeated unchanged snapshot must not duplicate a version.
    await fetchRecords(doctor);
    await expect(patientSelect.locator("option")).toHaveCount(2);
    await expect(versionSelect.locator("option")).toHaveCount(3);
    await versionSelect.selectOption({ index: 1 });
    await expect(view).toContainText("20 · Recorded 2026-10-20");
    await versionSelect.selectOption({ index: 2 });
    await expect(view).toContainText("21 · Recorded 2026-10-20");
    await expect(view.getByText(/^Shared profile ID:/)).toHaveText(profileId);
    await outsider
      .getByRole("button", { name: "Open saved profiles", exact: true })
      .click();
    await expect(
      outsider.getByText("No profile snapshots saved on this device."),
    ).toBeVisible();
    await expect(outsider.locator("main")).not.toContainText(
      "Asha Profile Test",
    );
    const sharedPath = `/professional/patients/shared-${profileId.replace("Shared profile ID: ", "")}/overview`;
    await doctor.goto("/professional/patients");
    const directory = doctor.getByRole("region", {
      name: "Shared patients",
      exact: true,
    });
    await expect(directory.getByRole("link")).toHaveCount(1);
    await expect(directory).not.toContainText("Unshared Child Test");
    await doctor
      .getByLabel("Search shared patients", { exact: true })
      .fill("unshared");
    await expect(
      directory.getByText("No matching shared patients."),
    ).toBeVisible();
    await doctor
      .getByLabel("Search shared patients", { exact: true })
      .fill("Asha");
    await directory.getByRole("link").click();
    await expect(doctor).toHaveURL(new RegExp(`${sharedPath}$`));
    await doctor.setViewportSize({ width: 551, height: 850 });
    await expect(doctor.locator(".mobile-nav")).toHaveCount(0);
    await expect(
      doctor.getByText("Saved shared profile · Read-only"),
    ).toBeVisible();
    await versionSelect.selectOption({ index: 1 });
    await expect(view).toContainText("20 · Recorded 2026-10-20");
    const firstVersion = new URL(doctor.url()).searchParams.get("version");
    await doctor
      .getByRole("navigation", { name: "Patient sections" })
      .getByRole("link", { name: "Reports" })
      .click();
    expect(new URL(doctor.url()).searchParams.get("version")).toBe(
      firstVersion,
    );
    const directoryDownload = doctor.waitForEvent("download");
    await view
      .getByRole("button", { name: "Download matched original" })
      .click();
    expect(await readFile((await (await directoryDownload).path())!)).toEqual(
      bytes,
    );
    await doctor
      .getByRole("navigation", { name: "Patient sections" })
      .getByRole("link", { name: "Prescriptions" })
      .click();
    await expect(
      view.getByText("No document references in this version."),
    ).toBeVisible();
    await expect(view.getByRole("button")).toHaveCount(0);
    await doctor
      .getByRole("navigation", { name: "Patient sections" })
      .getByRole("link", { name: "Referrals", exact: true })
      .click();
    await doctor
      .getByRole("button", { name: "New referral draft", exact: true })
      .click();
    await doctor
      .getByRole("textbox", { name: "Reason for referral", exact: true })
      .fill("Recorded referral reason for shared Mother");
    await doctor
      .getByRole("checkbox", { name: /profile-original.pdf/ })
      .check();
    await doctor
      .getByRole("button", { name: "Save draft version", exact: true })
      .click();
    const referralView = doctor.getByRole("article", {
      name: "Referral draft preview",
      exact: true,
    });
    await expect(referralView).toContainText("Asha Profile Test");
    await expect(referralView).toContainText(
      "Approval is recorded separately below · Not sent",
    );
    const referralOriginal = doctor.waitForEvent("download");
    await referralView
      .getByRole("button", {
        name: "Download original profile-original.pdf",
        exact: true,
      })
      .click();
    expect(await readFile((await (await referralOriginal).path())!)).toEqual(
      bytes,
    );
    const referralExport = doctor.waitForEvent("download");
    await doctor
      .getByRole("button", { name: "Download draft copy", exact: true })
      .click();
    const exported = await readFile(
      (await (await referralExport).path())!,
      "utf8",
    );
    expect(exported).toContain(firstVersion!);
    expect(exported).toContain(m.uid);
    expect(exported).toContain("Shared profile ID");
    const printPage = await contexts[1].newPage();
    await printPage.route("**/shared-referral-print-check", (route) =>
      route.fulfill({ contentType: "text/html", body: exported }),
    );
    await printPage.goto("/shared-referral-print-check");
    await expect(printPage.locator("body")).toContainText(firstVersion!);
    await printPage.pdf({
      path: testInfo.outputPath("shared-referral-draft.pdf"),
      preferCSSPageSize: true,
    });
    await printPage.close();
    await versionSelect.selectOption({ index: 2 });
    await expect(
      doctor.getByRole("combobox", {
        name: "Saved referral draft",
        exact: true,
      }),
    ).toHaveCount(0);
    await versionSelect.selectOption({ index: 1 });
    await doctor.reload();
    await doctor
      .getByRole("combobox", { name: "Saved referral draft", exact: true })
      .selectOption({ index: 1 });
    await expect(referralView).toContainText(
      "Recorded referral reason for shared Mother",
    );
    const referralUrl = doctor.url();
    const review = doctor.getByRole("region", {
      name: "Doctor review",
      exact: true,
    });
    await review.getByRole("checkbox").check();
    await review
      .getByRole("button", { name: "Approve this version", exact: true })
      .click();
    await expect(review.getByRole("alert")).toContainText(
      "facility-approved doctor credential is required",
    );
    await approveTestFacility(o.uid, o.fingerprint);
    await approveCredentialScope(d.uid, o.uid, "doctor");
    await doctor.goto("/professional/more/sharing");
    const doctorCredentials = doctor.getByRole("region", {
      name: "Clinical credentials",
      exact: true,
    });
    await doctorCredentials
      .getByRole("button", { name: "Refresh credentials" })
      .click();
    await doctorCredentials
      .getByRole("button", { name: "Submit for facility review" })
      .click();
    await expect(doctorCredentials).toContainText("Recorded status: pending");
    const facilityCredentials = facility.getByRole("region", {
      name: "Clinical credentials",
      exact: true,
    });
    await facilityCredentials
      .getByRole("button", { name: "Refresh credentials" })
      .click();
    await facilityCredentials
      .getByRole("button", { name: "Approve credential", exact: true })
      .click();
    await expect(facilityCredentials).toContainText(
      "Recorded status: approved",
    );
    await doctor.goto(referralUrl);
    await doctor
      .getByRole("combobox", { name: "Saved referral draft", exact: true })
      .selectOption({ index: 1 });
    await review.getByRole("checkbox").check();
    await review
      .getByRole("button", { name: "Approve this version", exact: true })
      .click();
    await expect(review.getByRole("status")).toContainText(
      "Doctor approval recorded for this version",
    );
    const approvedDownload = doctor.waitForEvent("download");
    await review
      .getByRole("button", { name: "Download approved copy", exact: true })
      .click();
    const approvedHtml = await readFile(
      (await (await approvedDownload).path())!,
      "utf8",
    );
    expect(approvedHtml).toContain("APPROVED VERSION");
    expect(approvedHtml).toContain("Not initiated or sent");
    expect(approvedHtml).toContain(firstVersion!);
    const approvedPrint = await contexts[1].newPage();
    await approvedPrint.route("**/approved-referral-print-check", (route) =>
      route.fulfill({ contentType: "text/html", body: approvedHtml }),
    );
    await approvedPrint.goto("/approved-referral-print-check");
    await approvedPrint.pdf({
      path: testInfo.outputPath("approved-shared-referral.pdf"),
      preferCSSPageSize: true,
    });
    await approvedPrint.close();
    await doctor.reload();
    await doctor
      .getByRole("combobox", { name: "Saved referral draft", exact: true })
      .selectOption({ index: 1 });
    await review
      .getByRole("button", { name: "Check saved approval", exact: true })
      .click();
    await expect(review.getByRole("status")).toContainText(
      "approval was confirmed",
    );
    await doctor.screenshot({
      path: testInfo.outputPath("shared-profile-referral.png"),
      fullPage: true,
    });
    await doctor.getByRole("link", { name: "Back to Patients" }).click();
    await expect(doctor).toHaveURL(/\/professional\/patients$/);
    // The same authenticated account selecting another workspace is not a grant.
    await doctor.goto(sharedPath.replace("professional", "organization"));
    await expect(
      doctor.getByRole("heading", { name: "Shared profile unavailable" }),
    ).toBeVisible();
    await outsider.goto(sharedPath);
    await expect(
      outsider.getByRole("heading", { name: "Shared profile unavailable" }),
    ).toBeVisible();
    await expect(outsider.locator("main")).not.toContainText(
      "Asha Profile Test",
    );
    // Independently authorized Organization receives its own encrypted copy.
    const orgChannel = `profile-facility-${Date.now()}`;
    await approveChannel(orgChannel, m.uid, o.uid);
    await connection(mother, orgChannel, o.fingerprint);
    await connection(facility, orgChannel, m.fingerprint);
    await sendProfile(mother);
    await fetchRecords(facility);
    await facility.goto("/organization/patients");
    await facility
      .getByRole("region", { name: "Shared patients", exact: true })
      .getByRole("link")
      .click();
    await facility
      .getByRole("combobox", { name: "Saved profile version", exact: true })
      .selectOption({ index: 1 });
    await expect(facility.getByTestId("shared-profile-view")).toContainText(
      "21 · Recorded 2026-10-20",
    );
    await expect(
      facility
        .getByRole("navigation", { name: "Patient sections" })
        .getByRole("link", { name: "Referrals", exact: true }),
    ).toHaveCount(0);
    await facility.goto(
      sharedPath
        .replace("professional", "organization")
        .replace("/overview", "/referrals"),
    );
    await expect(
      facility.getByRole("heading", { name: "Shared profile unavailable" }),
    ).toBeVisible();
    await doctor.goto("/professional/more/sharing");
    await connection(doctor, id, m.fingerprint);
    await revokeChannel(id);
    await doctor
      .getByRole("button", { name: "Fetch approved records" })
      .click();
    await expect(doctor.getByRole("alert")).toContainText(
      "Future sharing is blocked",
    );
    await doctor.goto("/professional/patients");
    await expect(directory.getByRole("link")).toHaveCount(1);
    await contexts[1].setOffline(true);
    await directory.getByRole("link").click();
    await versionSelect.selectOption({ index: 2 });
    await expect(view).toContainText("21 · Recorded 2026-10-20");
    await doctor
      .getByRole("navigation", { name: "Patient sections" })
      .getByRole("link", { name: "Referrals", exact: true })
      .click();
    await versionSelect.selectOption({ index: 1 });
    await doctor
      .getByRole("combobox", { name: "Saved referral draft", exact: true })
      .selectOption({ index: 1 });
    // Reopened from the encrypted vault with networking disabled; no approval
    // lookup is needed to retrieve the historical approved copy.
    await expect(
      review.getByRole("button", {
        name: "Download approved copy",
        exact: true,
      }),
    ).toBeVisible();
    const offlineApprovedDownload = doctor.waitForEvent("download");
    await review
      .getByRole("button", { name: "Download approved copy", exact: true })
      .click();
    expect(
      await readFile((await (await offlineApprovedDownload).path())!, "utf8"),
    ).toBe(approvedHtml);
    await doctor
      .getByRole("button", { name: "Edit latest draft", exact: true })
      .click();
    await doctor
      .getByRole("textbox", {
        name: "Recorded instructions (optional)",
        exact: true,
      })
      .fill("Local retained-copy draft note");
    await doctor
      .getByRole("button", { name: "Save draft version", exact: true })
      .click();
    await expect(referralView).toContainText("Local retained-copy draft note");
    await expect(
      doctor
        .getByRole("combobox", { name: "Referral version", exact: true })
        .locator("option"),
    ).toHaveCount(2);
    await expect(
      review.getByRole("button", {
        name: "Download approved copy",
        exact: true,
      }),
    ).toHaveCount(0);
    await review.getByRole("checkbox").check();
    await review
      .getByRole("button", { name: "Approve this version", exact: true })
      .click();
    await expect(review.getByRole("alert")).toContainText(
      "Nothing was approved offline",
    );
    await contexts[1].setOffline(false);
    await facility.goto("/organization/more/sharing");
    await facilityCredentials
      .getByRole("button", { name: "Refresh credentials" })
      .click();
    await facilityCredentials
      .getByRole("button", { name: "Suspend credential", exact: true })
      .click();
    await expect(facilityCredentials).toContainText(
      "Recorded status: suspended",
    );
    await review
      .getByRole("button", { name: "Approve this version", exact: true })
      .click();
    await expect(review.getByRole("alert")).toContainText(
      "facility-approved doctor credential is required",
    );
    await doctor
      .getByRole("combobox", { name: "Referral version", exact: true })
      .selectOption({ index: 0 });
    await review
      .getByRole("button", { name: "Check saved approval", exact: true })
      .click();
    await expect(review.getByRole("status")).toContainText(
      "approval was confirmed",
    );
    await expect(referralView).not.toContainText(
      "Local retained-copy draft note",
    );
    await doctor
      .getByRole("navigation", { name: "Patient sections" })
      .getByRole("link", { name: "Overview", exact: true })
      .click();
    await versionSelect.selectOption({ index: 2 });
    await doctor.setViewportSize({ width: 551, height: 850 });
    await doctor.screenshot({
      path: testInfo.outputPath("saved-shared-profile.png"),
      fullPage: true,
    });
    await mother.goto("/mother/health/reports");
    await expect(
      mother.getByText("profile-original.pdf", { exact: true }),
    ).toBeVisible();
    expect(external).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
