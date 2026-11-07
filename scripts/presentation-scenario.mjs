// Runs the real application UI against isolated localhost emulators. No mocks,
// direct vault writes, hardware access or production authority are installed.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { approveMember, approveChannel, approveTestFacility, approveCredentialScope } from "./sharing-operator.mjs";
const baseURL = "http://127.0.0.1:4174";
const button = (page, name) => page.getByRole("button", { name, exact: true });
const region = (page, name) => page.getByRole("region", { name, exact: true });
const password = "Synthetic-demo-42!";

export async function preparePresentation({ headless = false } = {}) {
  const stamp = Date.now(), contexts = [], accounts = [];
  const output = `.local-tools/presentation/${stamp}`;
  await mkdir(output, { recursive: true });
  const printing = await chromium.launch({ channel: "msedge", headless: true });
  try {
    for (const [name, role, profile] of [
      ["Mother", "mother", ".local-tools/ai-browser-test"],
      ["Doctor", "professional", ".local-tools/presentation-doctor"],
      ["Sending facility", "organization", ".local-tools/presentation-sender"],
      ["Receiving facility", "organization", ".local-tools/presentation-receiver"],
    ]) {
      const context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless, baseURL, viewport: { width: 1200, height: 850 } });
      contexts.push(context);
      const page = await context.newPage(); page.setDefaultTimeout(20000);
      // Only this dedicated synthetic browser's shell is refreshed. Preserve all
      // encrypted vaults, device keys and the installed public RUHI model cache.
      await page.goto("/");
      await page.evaluate(async () => {
        for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
      });
      await page.goto("about:blank");
      await page.goto(`/auth/signup?role=${role}`);
      const email = `presentation-${accounts.length}-${stamp}@example.test`;
      await page.getByLabel("Email address", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByLabel("Confirm password", { exact: true }).fill(password);
      await button(page, "Create account").click();
      await expect(page.locator(".demo-banner")).toContainText("Signed-in account");
      await page.goto(`/${role}/more/sharing`);
      await expect(page.getByTestId("sharing-fingerprint")).toHaveText(/^[a-f0-9]{64}$/);
      const uid = (await page.getByTestId("sharing-uid").innerText()).trim();
      const fingerprint = (await page.getByTestId("sharing-fingerprint").innerText()).trim();
      await button(page, "Request approval / Refresh connections").click();
      await expect(page.getByRole("alert")).toContainText("awaiting explicit pilot approval");
      await approveMember(uid, role, fingerprint);
      accounts.push({ name, role, email, uid, fingerprint, page });
      console.log(`Prepared fictional ${name} account.`);
    }
    const [m, d, o, r] = accounts;
    const profileChannel = `presentation-profile-${stamp}`, referralChannel = `presentation-referral-${stamp}`, destinationChannel = `presentation-destination-${stamp}`;
    await approveChannel(profileChannel, m.uid, d.uid);
    await approveChannel(referralChannel, d.uid, o.uid);
    await approveChannel(destinationChannel, o.uid, r.uid);
    await approveTestFacility(o.uid, o.fingerprint);
    await approveCredentialScope(d.uid, o.uid, "doctor");
    const credentials = region(d.page, "Clinical credentials");
    await button(credentials, "Refresh credentials").click();
    await button(credentials, "Submit for facility review").click();
    await expect(credentials).toContainText("Recorded status: pending");
    const approvals = region(o.page, "Clinical credentials");
    await button(approvals, "Refresh credentials").click();
    await button(approvals, "Approve credential").click();
    await expect(approvals).toContainText("Recorded status: approved");

    await m.page.goto("/mother/more/profile");
    await m.page.getByLabel("Full name", { exact: true }).fill("Mira — Fictional demonstration");
    await m.page.getByLabel("Recorded pregnancy week (optional)").fill("22");
    await m.page.getByLabel("Pregnancy week recorded on").fill("2026-11-07");
    await button(m.page, "Save mother profile").click();
    await expect(m.page.getByRole("status")).toContainText("saved encrypted");
    // This is an actual PDF original, visibly fictional; no clinical values.
    const fixture = await printing.newPage();
    await fixture.setContent("<h1>FICTIONAL DEMONSTRATION — NOT A MEDICAL RECORD</h1><h2>Visit note for Mira</h2><p>Recorded source: Synthetic Clinic.</p><p>Follow-up date recorded: 2026-11-08.</p><p>Purpose: demonstrate preservation of an uploaded original and its exact text.</p><p>No diagnosis, prescription or clinical measurement is included.</p>");
    const bytes = await fixture.pdf({ format: "A4", path: `${output}/fictional-visit.pdf` }); await fixture.close();
    await m.page.goto("/mother/health/reports");
    await button(m.page, "Upload From Device").click();
    await m.page.getByLabel("Document", { exact: true }).setInputFiles({ name: "fictional-visit.pdf", mimeType: "application/pdf", buffer: bytes });
    await m.page.getByLabel("Issuing facility / source (optional)").fill("Synthetic Clinic");
    await m.page.getByLabel("Document date (optional)").fill("2026-11-07");
    await button(m.page, "Save document").click();
    await expect(m.page.getByRole("status")).toContainText("Saved encrypted");
    for (const [self, peer] of [[m, d], [d, m]]) {
      await self.page.goto(`/${self.role}/more/sharing`);
      await self.page.getByLabel("Other account's pairing code", { exact: true }).fill(`matrisync-pair-v1:${peer.uid}:${peer.fingerprint}`);
      await button(self.page, "Pair approved account").click();
      await expect(self.page.getByRole("status").filter({ hasText: "Paired with approved account" })).toBeVisible();
    }
    await m.page.getByLabel("Local patient profile", { exact: true }).selectOption({ label: "Mira — Fictional demonstration" });
    await button(m.page, "Encrypt and share profile").click();
    await expect(m.page.getByRole("status").filter({ hasText: "Encrypted profile version stored" })).toBeVisible();
    await m.page.getByRole("combobox", { name: "Saved local document", exact: true }).selectOption({ label: "fictional-visit.pdf" });
    await button(m.page, "Encrypt and send document").click();
    await expect(m.page.getByRole("status").filter({ hasText: "Encrypted document stored" })).toBeVisible();
    await button(d.page, "Fetch approved records").click();
    await expect(d.page.getByRole("status").filter({ hasText: "encrypted transfer(s) checked" })).toBeVisible();
    await button(d.page, "Open saved profiles").click();
    await d.page.goto("/professional/patients");
    await region(d.page, "Shared patients").getByRole("link").click();
    await d.page.getByRole("combobox", { name: "Saved profile version", exact: true }).selectOption({ index: 1 });
    await d.page.getByRole("navigation", { name: "Patient sections" }).getByRole("link", { name: "Referrals", exact: true }).click();
    await button(d.page, "New referral draft").click();
    await d.page.getByLabel("Reason for referral", { exact: true }).fill("Fictional demonstration of continuity-of-care handoff. No clinical advice or diagnosis.");
    await d.page.getByRole("checkbox", { name: /fictional-visit.pdf/ }).check();
    await button(d.page, "Save draft version").click();
    const review = region(d.page, "Doctor review");
    await review.getByRole("checkbox").check();
    await button(review, "Approve this version").click();
    await expect(review.getByRole("status")).toContainText("Doctor approval recorded for this version");
    const downloaded = d.page.waitForEvent("download");
    await button(review, "Download approved copy").click();
    const download = await downloaded; await download.saveAs(`${output}/approved-referral.html`);
    const { readFile } = await import("node:fs/promises");
    const print = await printing.newPage();
    await print.setContent(await readFile(`${output}/approved-referral.html`, "utf8"));
    await print.pdf({ path: `${output}/approved-referral.pdf`, preferCSSPageSize: true }); await print.close();
    const send = region(d.page, "Send approved referral");
    await button(send, "Find approved facility connection").click();
    await send.getByLabel("Referral facility connection").selectOption(referralChannel);
    await send.getByLabel("Facility device fingerprint").fill(o.fingerprint);
    await button(send, "Send approved version").click();
    await expect(send.getByRole("status").filter({ hasText: "Approved version stored encrypted" })).toBeVisible();
    await o.page.goto("/organization/referrals");
    await button(o.page, "Refresh referral connections").click();
    await o.page.getByLabel("Incoming referral connection").selectOption(referralChannel);
    await o.page.getByLabel("Sender device fingerprint").fill(d.fingerprint);
    await button(o.page, "Receive approved referrals").click();
    await expect(o.page.getByRole("status")).toContainText("1 approved referral(s)");
    await o.page.getByRole("button", { name: /Open approved referral ·/ }).click();
    const received = region(o.page, "Received approved referral");
    await received.getByLabel("Referral destination connection").selectOption(destinationChannel);
    await received.getByLabel("Destination device fingerprint").fill(r.fingerprint);
    await received.getByRole("checkbox").check();
    await button(received, "Initiate approved referral").click();
    await expect(o.page.getByRole("status")).toContainText("Organization initiation recorded");
    const outgoing = region(o.page, "Destination delivery and receiving events");
    await outgoing.getByLabel("Selected destination device fingerprint").fill(r.fingerprint);
    await button(outgoing, "Send to selected destination").click();
    await expect(outgoing.getByRole("status")).toContainText("Stored encrypted for the selected destination");
    await button(outgoing, "Create encrypted handoff").click();
    await expect(region(o.page, "Send handoff over BLE")).toBeVisible();
    // Prepare the real destination. Hardware transport is intentionally untouched.
    await r.page.goto("/organization/referrals");
    await button(r.page, "Refresh referral connections").click();
    await r.page.getByLabel("Incoming referral connection").selectOption(destinationChannel);
    await r.page.getByLabel("Sender device fingerprint").fill(o.fingerprint);
    await button(r.page, "Receive from initiating Organization").click();
    await expect(r.page.getByRole("status")).toContainText("1 destination referral(s)");
    await r.page.getByRole("button", { name: /Open approved referral ·/ }).click();
    console.log("Real encrypted profile, original and approved referral delivered between the fictional accounts. Hardware not contacted.");

    await m.page.goto("/mother/overview");
    await button(m.page, "Create care summary").click();
    const html = await m.page.locator('iframe[title="Personal care summary preview"]').getAttribute("srcdoc");
    const summary = await printing.newPage(); await summary.setContent(html);
    await summary.pdf({ path: `${output}/personal-care-summary.pdf`, preferCSSPageSize: true }); await summary.close();
    await m.page.goto("/mother/matrisathi/companion/settings");
    await button(m.page, "Choose from my uploaded documents").click();
    await m.page.getByLabel("Document for this chat").selectOption({ label: "fictional-visit.pdf" });
    await button(m.page, "Extract PDF text on this device").click();
    await expect(m.page.getByLabel("Text reviewed against the original")).toHaveValue(/2026-11-08/);
    await m.page.getByRole("checkbox", { name: /I checked this text/ }).check();
    await button(m.page, "Use reviewed text in this chat").click();
    // Load only an already installed model. Never download weights silently.
    let modelReady = false;
    if (await button(m.page, "Load RUHI").count()) {
      await expect(button(m.page, "Load RUHI")).toBeEnabled({ timeout: 30000 });
      await button(m.page, "Load RUHI").click();
      try { await expect(m.page.locator(".ai-workspace")).toHaveAttribute("data-model-status", "ready", { timeout: 120000 }); modelReady = true; }
      catch { console.log("RUHI model not ready. Exact profile/document read-back remains available; see AI settings for the device error."); }
    }
    await m.page.getByRole("link", { name: "Back to Chat", exact: true }).click();
    await button(m.page, "Read my document").click(); await button(m.page, "Send").click();
    await expect(m.page.getByRole("log")).toContainText("2026-11-08");
    const report = { createdAt: new Date().toISOString(), syntheticOnly: true, hardwareContacted: false, modelReady, output,
      accounts: accounts.map(({ page, ...a }) => ({ ...a, url: page.url() })), password };
    await writeFile(`${output}/session.json`, JSON.stringify(report, null, 2));
    await writeFile(".local-tools/presentation/latest.json", JSON.stringify(report, null, 2));
    for (const { name, page } of accounts) {
      await page.evaluate(name => { document.title = `MatriSync · ${name} · Fictional demonstration`; }, name);
      await page.screenshot({ path: `${output}/${name.replaceAll(" ", "-")}.png`, fullPage: true });
    }
    await m.page.bringToFront();
    console.log(`PRESENTATION READY. Fictional accounts only. RUHI model loaded: ${modelReady}. PDFs: ${output}`);
    await printing.close();
    return { contexts, report };
  } catch (error) {
    for (const { name, page } of accounts) {
      await writeFile(`${output}/failed-${name.replaceAll(" ", "-")}.txt`, await page.locator("main").innerText().catch(() => "Page unavailable")).catch(() => {});
    }
    await printing.close();
    for (const context of contexts) await context.close().catch(() => {});
    throw error;
  }
}
