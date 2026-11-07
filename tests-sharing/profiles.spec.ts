import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { installPeripheral, simulatedPeripheral } from "./ble-device";
import {
  approveMember,
  approveChannel,
  revokeChannel,
  approveTestFacility,
  approveCredentialScope,
  operatorRead,
} from "../scripts/sharing-operator.mjs";

async function account(page: Page, role: string) {
  const email = `profile-sharing-${role}-${Date.now()}@example.test`;
  const response = await page.goto(`/auth/signup?role=${role}`);
  expect(response?.headers()["content-security-policy"]).toContain(
    "img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*",
  );
  await page
    .getByLabel("Email address", { exact: true })
    .fill(email);
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
  return { uid, fingerprint, role, email };
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
async function failReferralAcknowledgement(page: Page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      if (this.transaction.db.name === "matrisync-referral-outbox-v1" && value.acknowledgedAt) {
        IDBObjectStore.prototype.put = put;
        this.transaction.abort();
        return undefined as unknown as IDBRequest;
      }
      return put.call(this, value, key);
    };
  });
}
async function stopQueuedReferral(page: Page) {
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(value, key) {
      if (this.transaction.db.name === "matrisync-referral-outbox-v1") {
        IDBObjectStore.prototype.add = add;
        this.transaction.addEventListener("complete", () => {
          Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
        });
      }
      return add.call(this, value, key);
    };
  });
}
async function referralOutboxData(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("matrisync-referral-outbox-v1"); r.onsuccess = () => resolve(r.result); r.onerror = reject;
    });
    const result = await new Promise<{ id: string; sealed: string; acknowledgedAt: string | null }[]>((resolve, reject) => {
      const tx = db.transaction("outbox", "readonly"), r = tx.objectStore("outbox").getAll();
      tx.oncomplete = () => resolve(r.result); tx.onerror = reject;
    });
    db.close(); return result;
  });
}
async function relayEnvelope(path: string) {
  const response = await fetch(`http://127.0.0.1:8087/v1/projects/demo-matrisync/databases/(default)/documents/${path}`, { headers: { Authorization: "Bearer owner" } });
  if (response.status === 404) return undefined;
  expect(response.ok).toBe(true);
  return response.json();
}
test("profile versions retain identity, match original bytes, exclude unshared children and survive revocation", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180000);
  const contexts = await Promise.all(
    [1, 2, 3, 4, 5].map(() =>
      browser.newContext({ baseURL: "http://127.0.0.1:4175" }),
    ),
  );
  const [mother, doctor, outsider, facility, destination] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const external: string[] = [];
  const blockedExternal: string[] = [];
  const externalResponses: string[] = [];
  for (const page of [mother, doctor, outsider, facility, destination]) {
    const network = await page.context().newCDPSession(page);
    const requests = new Map<string, string>();
    await network.send("Network.enable");
    network.on("Network.requestWillBeSent", (e) => {
      requests.set(e.requestId, e.request.url);
    });
    network.on("Network.loadingFailed", (e) => {
      const url = requests.get(e.requestId);
      if (url && e.blockedReason === "csp") blockedExternal.push(url);
    });
    page.on("response", (response) => {
      if (
        !["127.0.0.1", "localhost"].includes(new URL(response.url()).hostname)
      )
        externalResponses.push(response.url());
    });
    page.on("request", (r) => {
      if (!["127.0.0.1", "localhost"].includes(new URL(r.url()).hostname))
        external.push(r.url());
    });
  }
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
    const motherPairingCode = await mother.getByLabel("Your pairing code", { exact: true }).inputValue();
    await doctor.getByLabel("Other account's pairing code", { exact: true }).fill(motherPairingCode.replace(m.fingerprint, "0".repeat(64)));
    await doctor.getByRole("button", { name: "Pair approved account", exact: true }).click();
    await expect(doctor.getByRole("alert")).toContainText("No currently approved connection");
    await doctor.getByLabel("Other account's pairing code", { exact: true }).fill(motherPairingCode);
    await doctor.getByRole("button", { name: "Pair approved account", exact: true }).click();
    await expect(doctor.getByRole("status").filter({ hasText: "Paired with approved account" })).toBeVisible();
    await expect(doctor.getByLabel("Other device fingerprint")).toHaveValue(m.fingerprint);
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
    const assistance = doctor.getByRole("region", { name: "Clinician documentation assistance", exact: true });
    await assistance.getByText("Organize supplied notes", { exact: true }).click();
    await assistance.getByLabel("Source label", { exact: true }).fill("Clinician review of received version");
    await assistance.getByLabel("Clinician-supplied notes").fill("Instructions: Exact clinician wording; unknowns remain unknown.");
    await assistance.getByRole("button", { name: "Organize text for review" }).click();
    await assistance.getByRole("checkbox").check();
    await assistance.getByRole("button", { name: "Add reviewed text to draft" }).click();
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
      "Approval and delivery are recorded separately below",
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
    expect(exported).toContain("Clinician-supplied source: Clinician review of received version");
    expect(exported).toContain("Exact clinician wording; unknowns remain unknown.");
    const printPage = await contexts[1].newPage();
    await printPage.setContent(exported);
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
    expect(approvedHtml).toContain("Delivery status recorded separately");
    expect(approvedHtml).toContain(firstVersion!);
    const approvedPrint = await contexts[1].newPage();
    await approvedPrint.setContent(approvedHtml);
    await approvedPrint.pdf({
      path: testInfo.outputPath("approved-shared-referral.pdf"),
      preferCSSPageSize: true,
    });
    await approvedPrint.close();
    // Real approved-version delivery and a separate Organization initiation.
    const destinationAccount = await account(destination, "organization");
    await approveMember(
      destinationAccount.uid,
      "organization",
      destinationAccount.fingerprint,
    );
    const referralChannel = `referral-${Date.now()}`,
      destinationChannel = `destination-${Date.now()}`;
    await approveChannel(referralChannel, d.uid, o.uid);
    await approveChannel(destinationChannel, o.uid, destinationAccount.uid);
    const sendPanel = doctor.getByRole("region", {
      name: "Send approved referral",
      exact: true,
    });
    await sendPanel
      .getByRole("button", { name: "Find approved facility connection" })
      .click();
    await sendPanel
      .getByLabel("Referral facility connection")
      .selectOption(referralChannel);
    await sendPanel
      .getByLabel("Facility device fingerprint")
      .fill(o.fingerprint);
    await failReferralAcknowledgement(doctor);
    await sendPanel
      .getByRole("button", { name: "Send approved version", exact: true })
      .click();
    await expect(sendPanel.getByRole("alert")).toContainText("acknowledgement could not be saved");
    const doctorQueue = await referralOutboxData(doctor);
    expect(doctorQueue).toHaveLength(1);
    expect(doctorQueue[0].acknowledgedAt).toBeNull();
    expect(JSON.stringify(doctorQueue)).not.toContain("Asha Profile Test");
    expect(JSON.stringify(doctorQueue)).not.toContain("Recorded referral reason");
    const firstDelivery = await relayEnvelope(`channels/${referralChannel}/referrals/${doctorQueue[0].id}`);
    await doctor.goto("/professional/more/sharing");
    await doctor.reload();
    const doctorOutbox = doctor.getByRole("region", { name: "Encrypted referral outbox", exact: true });
    await expect(doctorOutbox).toContainText("Awaiting referral relay confirmation");
    await contexts[1].setOffline(true);
    await doctorOutbox.getByRole("button", { name: "Resume / Check referral", exact: true }).click();
    await expect(doctorOutbox.getByRole("alert")).toContainText("still queued");
    await contexts[1].setOffline(false);
    const retryTab = await contexts[1].newPage();
    await retryTab.goto("/professional/more/sharing");
    await retryTab.getByLabel("Email address", { exact: true }).fill(d.email);
    await retryTab.getByLabel("Password", { exact: true }).fill("Synthetic-test-42!");
    await retryTab.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(retryTab.locator(".demo-banner")).toContainText("Signed-in account");
    await retryTab.goto("/professional/more/sharing");
    const retryOutbox = retryTab.getByRole("region", { name: "Encrypted referral outbox", exact: true });
    await expect(retryOutbox.getByRole("button", { name: "Resume / Check referral", exact: true })).toBeVisible();
    await Promise.all([
      doctorOutbox.getByRole("button", { name: "Resume / Check referral", exact: true }).click(),
      retryOutbox.getByRole("button", { name: "Resume / Check referral", exact: true }).click(),
    ]);
    await expect(doctorOutbox).toContainText("Relay storage confirmed");
    await expect(retryOutbox).toContainText("Relay storage confirmed");
    await retryTab.close();
    expect(await relayEnvelope(`channels/${referralChannel}/referrals/${doctorQueue[0].id}`)).toEqual(firstDelivery);
    expect((await referralOutboxData(doctor))[0].sealed).toBe(doctorQueue[0].sealed);
    await doctor.goto(referralUrl);
    await doctor.getByRole("combobox", { name: "Saved referral draft", exact: true }).selectOption({ index: 1 });
    await sendPanel.getByRole("button", { name: "Find approved facility connection" }).click();
    await sendPanel.getByLabel("Referral facility connection").selectOption(referralChannel);
    await sendPanel.getByRole("button", { name: "Send approved version", exact: true }).click();
    await expect(sendPanel.getByRole("status")).toContainText(
      "stored encrypted",
    );
    // Retry does not overwrite or create another delivery.
    await sendPanel
      .getByRole("button", { name: "Send approved version", exact: true })
      .click();
    await expect(sendPanel.getByRole("status")).toContainText(
      "stored encrypted",
    );
    // Simulate an older release with a published referral but no local outbox
    // entry. Remove only this isolated test-account entry, never user records.
    await doctor.evaluate(async channelId => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open("matrisync-referral-outbox-v1"); r.onsuccess = () => resolve(r.result); r.onerror = reject;
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("outbox", "readwrite"), store = tx.objectStore("outbox"), r = store.getAllKeys();
        r.onsuccess = () => { for (const key of r.result) if (Array.isArray(key) && key[2] === channelId) store.delete(key); };
        tx.oncomplete = () => resolve(); tx.onerror = reject;
      });
      db.close();
    }, referralChannel);
    await sendPanel.getByRole("button", { name: "Send approved version", exact: true }).click();
    await expect(sendPanel.getByRole("status")).toContainText("stored encrypted");
    expect(await relayEnvelope(`channels/${referralChannel}/referrals/${doctorQueue[0].id}`)).toEqual(firstDelivery);
    // A distinct prepared connection is revoked before publication. Retain the
    // encrypted queue while refusing future publication, even after reload.
    const revokedReferralChannel = `revoked-referral-${Date.now()}`;
    await approveChannel(revokedReferralChannel, d.uid, o.uid);
    await sendPanel.getByRole("button", { name: "Find approved facility connection" }).click();
    await sendPanel.getByLabel("Referral facility connection").selectOption(revokedReferralChannel);
    await stopQueuedReferral(doctor);
    await sendPanel.getByRole("button", { name: "Send approved version", exact: true }).click();
    await expect(sendPanel.getByRole("alert")).toContainText("still queued");
    await revokeChannel(revokedReferralChannel);
    await doctor.goto("/professional/more/sharing");
    await doctor.reload();
    const pendingReferral = doctorOutbox.getByRole("article").filter({ hasText: revokedReferralChannel });
    await pendingReferral.getByRole("button", { name: "Resume / Check referral", exact: true }).click();
    await expect(doctorOutbox.getByRole("alert")).toContainText("Future sharing is blocked");
    await expect(pendingReferral).toContainText("Awaiting referral relay confirmation");
    expect(await relayEnvelope(`channels/${revokedReferralChannel}/referrals/${doctorQueue[0].id}`)).toBeUndefined();
    await doctor.goto(referralUrl);
    await doctor.getByRole("combobox", { name: "Saved referral draft", exact: true }).selectOption({ index: 1 });
    await facility.goto("/organization/referrals");
    await facility
      .getByRole("button", { name: "Refresh referral connections" })
      .click();
    await facility
      .getByLabel("Incoming referral connection")
      .selectOption(referralChannel);
    await facility.getByLabel("Sender device fingerprint").fill(d.fingerprint);
    await facility
      .getByRole("button", { name: "Receive approved referrals", exact: true })
      .click();
    await expect(facility.getByRole("status")).toContainText(
      "1 approved referral(s)",
    );
    await facility
      .getByRole("button", { name: /Open approved referral ·/ })
      .click();
    const received = facility.getByRole("region", {
      name: "Received approved referral",
      exact: true,
    });
    await expect(received).toContainText(
      "Recorded referral reason for shared Mother",
    );
    const receivedDownload = facility.waitForEvent("download");
    await received
      .getByRole("button", { name: "Download received approved copy" })
      .click();
    expect(
      await readFile((await (await receivedDownload).path())!, "utf8"),
    ).toBe(approvedHtml);
    const fullId = await facility.evaluate(
      async () =>
        new Promise<string>((resolve, reject) => {
          const r = indexedDB.open("matrisync-referral-deliveries-v1");
          r.onsuccess = () => {
            const db = r.result,
              t = db.transaction("deliveries", "readonly"),
              g = t.objectStore("deliveries").getAll();
            t.oncomplete = () => {
              db.close();
              resolve(g.result[0].id);
            };
          };
          r.onerror = () => reject(r.error);
        }),
    );
    const stored = await operatorRead(
      `channels/${referralChannel}/referrals/${fullId}`,
    );
    expect(JSON.stringify(stored)).not.toContain("Asha Profile Test");
    expect(JSON.stringify(stored)).not.toContain("Recorded referral reason");
    expect(JSON.stringify(stored)).not.toContain("profile-original.pdf");
    expect(
      await operatorRead(
        `channels/${referralChannel}/referralInitiations/${fullId}`,
      ),
    ).toBeUndefined();
    await received
      .getByRole("button", { name: "Check initiation status" })
      .click();
    await expect(received).toContainText("No initiation recorded");
    await received
      .getByLabel("Referral destination connection")
      .selectOption(destinationChannel);
    await received
      .getByLabel("Destination device fingerprint")
      .fill(destinationAccount.fingerprint);
    await received.getByRole("checkbox").check();
    await received
      .getByLabel("Referral destination connection")
      .selectOption("");
    await expect(received.getByRole("checkbox")).not.toBeChecked();
    await received
      .getByLabel("Referral destination connection")
      .selectOption(destinationChannel);
    await expect(
      received.getByLabel("Destination device fingerprint"),
    ).toHaveValue("");
    await expect(
      received.getByRole("button", { name: "Initiate approved referral" }),
    ).toBeDisabled();
    await received
      .getByLabel("Destination device fingerprint")
      .fill(destinationAccount.fingerprint);
    await received.getByRole("checkbox").check();
    await contexts[3].setOffline(true);
    await received
      .getByRole("button", { name: "Initiate approved referral" })
      .click();
    await expect(facility.getByRole("alert")).toContainText(
      "Nothing was sent or initiated offline",
    );
    await contexts[3].setOffline(false);
    await received
      .getByRole("button", { name: "Initiate approved referral" })
      .click();
    await expect(facility.getByRole("status")).toContainText(
      "Organization initiation recorded",
    );
    await expect(received).toContainText(
      "Destination delivery and receiving events are recorded separately below",
    );
    const initiation = await operatorRead(
      `channels/${referralChannel}/referralInitiations/${fullId}`,
    );
    expect(initiation?.destinationUid).toBe(destinationAccount.uid);
    await facility.reload();
    await facility
      .getByRole("button", { name: "Open saved referrals", exact: true })
      .click();
    await facility
      .getByRole("button", { name: /Open approved referral ·/ })
      .click();
    await received
      .getByRole("button", { name: "Check initiation status" })
      .click();
    await expect(received).toContainText(
      `for account ${destinationAccount.uid}`,
    );
    await facility.setViewportSize({ width: 551, height: 850 });
    await expect(facility.locator("body")).toHaveJSProperty("scrollWidth", 551);
    await facility
      .getByRole("heading", { name: "Referrals", exact: true })
      .click();
    await facility.screenshot({
      path: testInfo.outputPath("organization-referral-initiated.png"),
      fullPage: true,
    });
    // Destination stays empty until explicitly sent and received.
    await destination.goto("/organization/referrals");
    await destination
      .getByRole("button", { name: "Open saved referrals", exact: true })
      .click();
    await expect(
      destination.getByRole("button", { name: /Open approved referral ·/ }),
    ).toHaveCount(0);
    const outgoing = facility.getByRole("region", {
      name: "Destination delivery and receiving events",
      exact: true,
    });
    await outgoing
      .getByRole("button", { name: "Check receiving events" })
      .click();
    await expect(outgoing).toContainText("No receiving events recorded");
    await outgoing
      .getByLabel("Selected destination device fingerprint")
      .fill(destinationAccount.fingerprint);
    await contexts[3].setOffline(true);
    await outgoing
      .getByRole("button", {
        name: "Send to selected destination",
        exact: true,
      })
      .click();
    await expect(outgoing.getByRole("alert")).toContainText(
      "No delivery or receiving event was confirmed offline",
    );
    await contexts[3].setOffline(false);
    await stopQueuedReferral(facility);
    await outgoing.getByRole("button", { name: "Send to selected destination", exact: true }).click();
    await expect(outgoing.getByRole("alert")).toContainText("still queued");
    const facilityQueue = await referralOutboxData(facility);
    expect(facilityQueue).toHaveLength(1);
    expect(await relayEnvelope(`channels/${destinationChannel}/forwardedReferrals/${fullId}`)).toBeUndefined();
    await facility.reload();
    const facilityOutbox = facility.getByRole("region", { name: "Encrypted referral outbox", exact: true });
    await expect(facilityOutbox).toContainText("Awaiting referral relay confirmation");
    await failReferralAcknowledgement(facility);
    await facilityOutbox.getByRole("button", { name: "Resume / Check referral", exact: true }).click();
    await expect(facilityOutbox.getByRole("alert")).toContainText("acknowledgement could not be saved");
    const firstForward = await relayEnvelope(`channels/${destinationChannel}/forwardedReferrals/${fullId}`);
    const firstIndex = await relayEnvelope(`channels/${destinationChannel}/forwardedReferralIndex/${fullId}`);
    await facility.reload();
    await facilityOutbox.getByRole("button", { name: "Resume / Check referral", exact: true }).click();
    await expect(facilityOutbox).toContainText("Relay storage confirmed");
    expect(await relayEnvelope(`channels/${destinationChannel}/forwardedReferrals/${fullId}`)).toEqual(firstForward);
    expect(await relayEnvelope(`channels/${destinationChannel}/forwardedReferralIndex/${fullId}`)).toEqual(firstIndex);
    expect((await referralOutboxData(facility))[0].sealed).toBe(facilityQueue[0].sealed);
    await facility.setViewportSize({ width: 390, height: 844 });
    await expect(facility.locator("body")).toHaveJSProperty("scrollWidth", 390);
    await facilityOutbox.screenshot({ path: testInfo.outputPath("referral-outbox-mobile.png") });
    await facility.reload();
    await facility.getByRole("button", { name: "Open saved referrals", exact: true }).click();
    await facility.getByRole("button", { name: /Open approved referral ·/ }).click();
    await facility.getByRole("button", { name: "Check initiation status", exact: true }).click();
    await outgoing.getByLabel("Selected destination device fingerprint").fill(destinationAccount.fingerprint);
    for (let retry = 0; retry < 2; retry++) {
      await outgoing
        .getByRole("button", {
          name: "Send to selected destination",
          exact: true,
        })
        .click();
      await expect(outgoing.getByRole("status")).toContainText(
        "Stored encrypted for the selected destination",
      );
    }
    const forwarded = await operatorRead(
      `channels/${destinationChannel}/forwardedReferrals/${fullId}`,
    );
    for (const privateValue of [
      "Asha Profile Test",
      "Recorded referral reason",
      "profile-original.pdf",
      profileId.replace("Shared profile ID: ", ""),
    ])
      expect(JSON.stringify(forwarded)).not.toContain(privateValue);
    expect(
      await operatorRead(
        `channels/${destinationChannel}/forwardedReferrals/${fullId}/events/received`,
      ),
    ).toBeUndefined();
    await destination
      .getByRole("button", { name: "Refresh referral connections" })
      .click();
    await destination
      .getByLabel("Incoming referral connection")
      .selectOption(destinationChannel);
    await destination
      .getByLabel("Sender device fingerprint")
      .fill("0".repeat(64));
    await destination
      .getByRole("button", {
        name: "Receive from initiating Organization",
        exact: true,
      })
      .click();
    await expect(destination.getByRole("alert")).toBeVisible();
    await expect(
      destination.getByRole("button", { name: /Open approved referral ·/ }),
    ).toHaveCount(0);
    await destination
      .getByLabel("Sender device fingerprint")
      .fill(o.fingerprint);
    // The same protocol crosses separate clients through an explicit test
    // peripheral. This verifies application/GATT behavior, not physical radio.
    const peripheral = simulatedPeripheral();
    await installPeripheral(facility, peripheral);
    await installPeripheral(destination, peripheral);
    await outgoing.getByRole("button", { name: "Create encrypted handoff", exact: true }).click();
    const bleSend = facility.getByRole("region", { name: "Send handoff over BLE", exact: true });
    await bleSend.getByRole("button", { name: "Connect ESP32-S3", exact: true }).click();
    await bleSend.getByRole("button", { name: "Send and verify handoff", exact: true }).click();
    await expect(bleSend.getByRole("status")).toContainText("exact read-back verified", { timeout: 30000 });
    expect(new TextDecoder().decode(peripheral.packet())).not.toContain("Asha Profile Test");
    const bleRead = destination.getByRole("region", { name: "Read handoff over BLE", exact: true });
    await bleRead.getByRole("button", { name: "Connect ESP32-S3", exact: true }).click();
    peripheral.corrupt();
    await bleRead.getByRole("button", { name: "Read and verify handoff", exact: true }).click();
    await expect(bleRead.getByRole("alert")).toContainText(/differs|malformed/, { timeout: 30000 });
    await expect(destination.getByRole("button", { name: /Open approved referral ·/ })).toHaveCount(0);
    peripheral.corrupt();
    await bleRead.getByRole("button", { name: "Read and verify handoff", exact: true }).click();
    await expect(bleRead.getByRole("status")).toContainText("verified and opened", { timeout: 30000 });
    await expect(destination.getByRole("region", { name: "Received approved referral", exact: true })).toContainText("Recorded referral reason for shared Mother");
    // Capture the send status before leaving the device view.
    await bleSend.screenshot({ path: testInfo.outputPath("ble-handoff-mobile.png") });
    // Repeated conventional receipt remains idempotent after BLE retrieval.
    await destination.reload();
    await destination.getByRole("button", { name: "Refresh referral connections" }).click();
    await destination.getByLabel("Incoming referral connection").selectOption(destinationChannel);
    await destination.getByLabel("Sender device fingerprint").fill(o.fingerprint);
    for (let retry = 0; retry < 2; retry++) {
      await destination
        .getByRole("button", {
          name: "Receive from initiating Organization",
          exact: true,
        })
        .click();
      await expect(destination.getByRole("status")).toContainText(
        "1 destination referral(s)",
      );
      await expect(
        destination.getByRole("button", { name: /Open approved referral ·/ }),
      ).toHaveCount(1);
    }
    await destination.reload();
    await destination
      .getByRole("button", { name: "Open saved referrals", exact: true })
      .click();
    await destination
      .getByRole("button", { name: /Open approved referral ·/ })
      .click();
    const destinationReceived = destination.getByRole("region", {
      name: "Received approved referral",
      exact: true,
    });
    await expect(destinationReceived).toContainText(
      "Recorded referral reason for shared Mother",
    );
    await expect(
      destinationReceived.getByRole("button", {
        name: "Initiate approved referral",
        exact: true,
      }),
    ).toHaveCount(0);
    const destinationDownload = destination.waitForEvent("download");
    await destinationReceived
      .getByRole("button", { name: "Download received approved copy" })
      .click();
    expect(
      await readFile((await (await destinationDownload).path())!, "utf8"),
    ).toBe(approvedHtml);
    // A referral reference never grants full profile access.
    await destinationReceived
      .getByRole("link", { name: "Find separately shared patient profile" })
      .click();
    await expect(
      destination.getByRole("heading", { name: "Shared profile unavailable" }),
    ).toBeVisible();
    // Source-controlled independent sharing resolves the same patient, without forwarding another source's profile.
    const destinationProfileChannel = `destination-profile-${Date.now()}`;
    await approveChannel(
      destinationProfileChannel,
      m.uid,
      destinationAccount.uid,
    );
    await mother.goto("/mother/more/sharing");
    await connection(
      mother,
      destinationProfileChannel,
      destinationAccount.fingerprint,
    );
    await sendProfile(mother);
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
    await destination.goto("/organization/more/sharing");
    await connection(destination, destinationProfileChannel, m.fingerprint);
    await fetchRecords(destination);
    await destination.goto("/organization/referrals");
    await destination
      .getByRole("button", { name: "Open saved referrals", exact: true })
      .click();
    await destination
      .getByRole("button", { name: /Open approved referral ·/ })
      .click();
    await destinationReceived
      .getByRole("link", { name: "Find separately shared patient profile" })
      .click();
    await expect(destination.locator("main")).toContainText(
      "The referenced profile version is not saved",
    );
    await expect(destination.getByTestId("shared-profile-view")).toHaveCount(0);
    await destination
      .getByRole("combobox", { name: "Saved profile version", exact: true })
      .selectOption({ index: 1 });
    await expect(destination.getByTestId("shared-profile-view")).toContainText(
      "21 · Recorded 2026-10-20",
    );
    const destinationOriginal = destination.waitForEvent("download");
    await destination
      .getByRole("button", { name: "Download matched original" })
      .click();
    expect(await readFile((await (await destinationOriginal).path())!)).toEqual(
      bytes,
    );
    await expect(destination.locator("main")).not.toContainText(
      "Unshared Child Test",
    );
    await destination.goto("/organization/referrals");
    await destination
      .getByRole("button", { name: "Open saved referrals", exact: true })
      .click();
    await destination
      .getByRole("button", { name: /Open approved referral ·/ })
      .click();
    const receiving = destination.getByRole("region", {
      name: "Destination delivery and receiving events",
      exact: true,
    });
    await receiving
      .getByRole("button", { name: "Check receiving events" })
      .click();
    await expect(receiving.getByRole("listitem")).toHaveCount(1);
    await expect(receiving.getByRole("listitem")).toContainText(
      "Received and verified",
    );
    for (const [index, label] of [
      "Accepted",
      "Arrival verified",
      "Handoff acknowledged",
      "Closed",
    ].entries()) {
      const action = receiving.getByRole("button", {
        name: `Record: ${label}`,
        exact: true,
      });
      await expect(action).toBeDisabled();
      await receiving.getByRole("checkbox").check();
      if (index === 0) {
        await contexts[4].setOffline(true);
        await action.click();
        await expect(receiving.getByRole("alert")).toContainText(
          "No delivery or receiving event was confirmed offline",
        );
        await expect(receiving.getByRole("listitem")).toHaveCount(1);
        await contexts[4].setOffline(false);
      }
      await action.click();
      await expect(receiving.getByRole("listitem")).toHaveCount(index + 2);
      await expect(receiving.getByRole("status")).toContainText(
        `${label} recorded`,
      );
    }
    await outgoing
      .getByRole("button", { name: "Check receiving events" })
      .click();
    await expect(outgoing.getByRole("listitem")).toHaveCount(5);
    await destination.setViewportSize({ width: 551, height: 850 });
    await expect(destination.locator("body")).toHaveJSProperty(
      "scrollWidth",
      551,
    );
    await destination
      .getByRole("heading", { name: "Referrals", exact: true })
      .click();
    await destination.screenshot({
      path: testInfo.outputPath("destination-receiving-mobile.png"),
      fullPage: true,
    });
    // Full-profile grant is independent; revocation does not delete received originals.
    await revokeChannel(destinationProfileChannel);
    await mother.goto("/mother/more/sharing");
    await revokeChannel(referralChannel);
    await facility
      .getByRole("button", { name: "Refresh referral connections" })
      .click();
    await contexts[3].setOffline(true);
    await facility
      .getByRole("button", { name: "Open saved referrals", exact: true })
      .click();
    await facility
      .getByRole("button", { name: /Open approved referral ·/ })
      .click();
    const retainedDownload = facility.waitForEvent("download");
    await received
      .getByRole("button", { name: "Download received approved copy" })
      .click();
    expect(
      await readFile((await (await retainedDownload).path())!, "utf8"),
    ).toBe(approvedHtml);
    await contexts[3].setOffline(false);
    await facility.goto("/organization/more/sharing");
    await destination
      .getByRole("button", { name: "Refresh referral connections" })
      .click();
    await destination
      .getByLabel("Incoming referral connection")
      .selectOption(destinationChannel);
    await destination
      .getByLabel("Sender device fingerprint")
      .fill(o.fingerprint);
    await destination
      .getByRole("button", {
        name: "Receive from initiating Organization",
        exact: true,
      })
      .click();
    await expect(destination.getByRole("alert")).toBeVisible();
    await contexts[4].setOffline(true);
    await destination
      .getByRole("button", { name: "Open saved referrals", exact: true })
      .click();
    await destination
      .getByRole("button", { name: /Open approved referral ·/ })
      .click();
    const offlineDestinationDownload = destination.waitForEvent("download");
    await destinationReceived
      .getByRole("button", { name: "Download received approved copy" })
      .click();
    expect(
      await readFile(
        (await (await offlineDestinationDownload).path())!,
        "utf8",
      ),
    ).toBe(approvedHtml);
    await contexts[4].setOffline(false);
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
    // Firestore may attempt its Google connectivity image probe after a forced
    // disconnection. Every attempted external request must be blocked by the
    // application's CSP in Chromium, and no external response may arrive.
    expect(externalResponses).toEqual([]);
    for (const url of external) {
      expect(new URL(url).origin + new URL(url).pathname).toBe(
        "https://www.google.com/images/cleardot.gif",
      );
      expect(blockedExternal).toContain(url);
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
