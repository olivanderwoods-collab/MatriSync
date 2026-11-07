import { test, expect, type Browser, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { simulatedPeripheral, installPeripheral } from "../tests-sharing/ble-device";
const run = randomUUID();
async function account(browser: Browser, label: string, role = "professional") {
  const context = await browser.newContext(), page = await context.newPage();
  await page.goto(`http://127.0.0.1:4177/auth/signup?role=${role}`);
  await page.getByLabel("Email address", { exact: true }).fill(`${label.replaceAll(" ", "-")}-${run}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-care-test-42!");
  await page.getByLabel("Confirm password", { exact: true }).fill("Synthetic-care-test-42!");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.locator(".demo-banner")).toContainText("Signed-in account");
  await page.goto(`http://127.0.0.1:4177/${role}/care`);
  const uid = await page.getByTestId("care-account-id").innerText();
  await refresh(page);
  return { context, page, uid };
}
async function refresh(page: Page) {
  await page.getByRole("button", { name: "Enroll this browser / Refresh care access" }).click();
  await expect(page.getByRole("status", { name: "Working…" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enroll this browser / Refresh care access" })).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
}
async function facility(browser: Browser, name: string) {
  const value = await account(browser, name, "organization"), code = randomUUID();
  const hash = createHash("sha256").update(code).digest("hex");
  const response = await fetch(`http://127.0.0.1:8086/v1/projects/demo-matrisync/databases/(default)/documents/careFacilityInvites/${hash}`, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: { redeemedBy: { stringValue: "" }, redeemedAt: { nullValue: null }, expiresAt: { timestampValue: new Date(Date.now() + 3600000).toISOString() } } }) });
  expect(response.ok).toBeTruthy();
  await value.page.getByLabel("Facility name", { exact: true }).fill(name);
  await value.page.getByLabel("One-use facility invitation").fill(code);
  await value.page.getByRole("button", { name: "Activate invited facility" }).click();
  await expect(value.page.getByRole("heading", { name: "Register staff permissions" })).toBeVisible();
  return value;
}
async function staff(admin: Page, person: Awaited<ReturnType<typeof account>>, name: string, role: string) {
  await admin.getByLabel("Staff account ID", { exact: true }).fill(person.uid);
  await admin.getByLabel("Staff display name").fill(name);
  await admin.getByRole("combobox", { name: "Staff role", exact: true }).selectOption(role);
  await admin.getByRole("button", { name: "Save staff permissions" }).click();
  await expect(admin.getByRole("status").filter({ hasText: "Staff assignment saved" })).toBeVisible();
  await refresh(person.page);
}
async function load(page: Page, id: string) {
  await refresh(page);
  await page.getByLabel("Connected patient", { exact: true }).selectOption(id);
  await page.getByRole("button", { name: "Load / Refresh full profile" }).click();
  await expect(page.getByRole("region", { name: "Connected care profile" })).toContainText("Authorized saved full profile");
}
async function assign(admin: Page, uid: string) {
  await admin.getByLabel("Assign this patient to staff account ID").fill(uid);
  await admin.getByRole("button", { name: "Assign patient to staff", exact: true }).click();
  await expect(admin.getByRole("status").filter({ hasText: "Case assigned" })).toBeVisible();
}
test("two facilities, six staff, incomplete referral, PDF, offline BLE receipt and Mother access", async ({ browser }) => {
  const source = await facility(browser, "Demo Source"), destination = await facility(browser, "Demo Destination");
  const doctor = await account(browser, "doctor"), nurse = await account(browser, "nurse"), lab = await account(browser, "lab");
  await staff(source.page, doctor, "Dr Source", "doctor"); await staff(source.page, nurse, "Nurse Source", "nurse"); await staff(source.page, lab, "Lab Source", "lab");
  await doctor.page.getByRole("link", { name: "Create Mother profile locally" }).click();
  await doctor.page.getByRole("button", { name: "Create patient profile", exact: true }).click();
  await doctor.page.getByLabel("Full name", { exact: true }).fill("Fictional Mother Anika");
  await doctor.page.locator("form").getByRole("button", { name: "Create patient profile", exact: true }).click();
  await expect(doctor.page.getByRole("heading", { name: "Fictional Mother Anika", exact: true })).toBeVisible();
  const localId = new URL(doctor.page.url()).pathname.split("/")[3];
  for (const kind of ["reports", "prescriptions"]) {
    await doctor.page.goto(`http://127.0.0.1:4177/professional/patients/${localId}/${kind}`);
    await doctor.page.getByRole("button", { name: "Upload From Device", exact: true }).click();
    await doctor.page.getByLabel("Document", { exact: true }).setInputFiles({ name: `${kind}.pdf`, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nLOCAL ORIGINAL NEVER TRANSFERRED") });
    await doctor.page.getByRole("button", { name: "Save document", exact: true }).click();
    await expect(doctor.page.getByText(`${kind}.pdf`, { exact: true })).toBeVisible();
  }
  await doctor.page.goto("http://127.0.0.1:4177/professional/care"); await refresh(doctor.page);
  await doctor.page.getByLabel("Saved local Mother profile").selectOption(localId);
  await doctor.page.getByRole("button", { name: "Register linked profile and Mother access" }).click();
  const patientId = await doctor.page.getByTestId("mother-patient-id").innerText(), accessCode = await doctor.page.getByTestId("mother-access-code").innerText();
  await load(source.page, patientId); await assign(source.page, nurse.uid); await assign(source.page, lab.uid);
  for (const [person, text, allowed] of [[nurse, "BP manually measured at source", ["observation", "administration"]], [lab, "Lab result recorded at source", ["laboratory"]]] as const) {
    await load(person.page, patientId);
    await expect(person.page.getByLabel("Contribution type").locator("option")).toHaveText([...allowed]);
    await person.page.getByLabel("Recorded contribution").fill(text);
    await person.page.getByRole("button", { name: "Save contribution", exact: true }).click();
    await expect(person.page.getByRole("status")).toContainText("Contribution saved");
  }
  const form = doctor.page.getByRole("region", { name: "Manual care handoff" });
  await form.getByLabel("Blood group", { exact: true }).fill("O positive (demo)");
  await form.getByLabel("Contact details").fill("Fictional contact 0000000000");
  await form.getByLabel("Current situation / urgency as recorded").fill("Demonstration referral only");
  await form.getByLabel("Receiving facility").selectOption(destination.uid);
  await expect(form.getByLabel("Missing handoff details")).toContainText("Allergy details");
  await expect(form.getByLabel("Missing handoff details")).toContainText("Reason for referral");
  await form.getByRole("button", { name: "Create and approve handoff with entered details" }).click();
  await expect(doctor.page.getByRole("status")).toContainText("Doctor-recorded handoff created");
  const preview = doctor.page.frameLocator('iframe[title="Handoff summary preview"]');
  await expect(preview.locator("body")).toContainText("Fictional Mother Anika");
  await expect(preview.locator("body")).toContainText("Not recorded");
  await expect(preview.locator("body")).not.toContainText(accessCode);
  const html = await doctor.page.locator('iframe[title="Handoff summary preview"]').getAttribute("srcdoc");
  const printPage = await doctor.context.newPage(); await printPage.setContent(html!);
  await printPage.pdf({ path: ".local-tools/care-summary.pdf", format: "A4", printBackground: true }); await printPage.close();
  const peripheral = simulatedPeripheral(); await installPeripheral(doctor.page, peripheral); await installPeripheral(destination.page, peripheral);
  await doctor.page.getByRole("button", { name: "Connect compatible ESP32", exact: true }).click();
  await doctor.page.getByRole("button", { name: "Send and verify handoff", exact: true }).click();
  await expect(doctor.page.getByText(/BLE transfer and exact read-back verified/)).toBeVisible();
  expect(new TextDecoder().decode(peripheral.packet())).not.toContain("Fictional Mother");
  expect(new TextDecoder().decode(peripheral.packet())).not.toContain(accessCode);
  await refresh(destination.page);
  await expect(destination.page.getByLabel("Connected patient", { exact: true }).locator("option")).toHaveCount(1);
  await destination.context.setOffline(true);
  await destination.page.getByRole("button", { name: "Connect compatible ESP32", exact: true }).click();
  await destination.page.getByRole("button", { name: "Read and verify handoff", exact: true }).click();
  const popup = destination.page.getByRole("dialog", { name: "Received NFC handoff" });
  await expect(popup).toContainText("Offline basic details"); await expect(popup).toContainText("O positive (demo)");
  await popup.getByRole("button", { name: "Close and keep saved handoff" }).click();
  await expect(destination.page.getByRole("region", { name: "Connected care profile" })).toContainText("Basic handoff snapshot");
  if (process.env.TEST_CARE_PRODUCTION === "1") {
    await destination.page.reload();
    await destination.page.getByLabel("Connected patient", { exact: true }).selectOption(patientId);
    await destination.page.getByRole("button", { name: "Load / Refresh full profile" }).click();
    await expect(destination.page.getByRole("region", { name: "Connected care profile" })).toContainText("Basic handoff snapshot");
    await expect(destination.page.getByText("Saved handoff receipts (1)")).toBeVisible();
  }
  await destination.context.setOffline(false);
  await expect(destination.page.getByRole("region", { name: "Connected care profile" })).toContainText("Authorized saved full profile", { timeout: 20000 });
  await expect(destination.page.getByRole("region", { name: "Connected care profile" })).toContainText("Nurse Source");
  await expect(destination.page.getByRole("region", { name: "Connected care profile" })).toContainText("Lab Source");
  await expect(destination.page.getByText("reports.pdf", { exact: true })).toHaveCount(0);
  await refresh(destination.page);
  for (const role of ["doctor", "nurse", "lab"]) {
    const person = await account(browser, `receiving-${role}`);
    await staff(destination.page, person, `Receiving ${role}`, role); await assign(destination.page, person.uid); await load(person.page, patientId);
    await person.page.getByLabel("Recorded contribution").fill(`Receiving ${role} contribution`);
    await person.page.getByRole("button", { name: "Save contribution", exact: true }).click();
    await expect(person.page.getByRole("status")).toContainText("Contribution saved"); await person.context.close();
  }
  const mother = await browser.newContext(), page = await mother.newPage();
  await page.goto("http://127.0.0.1:4177/auth/login?role=mother");
  await page.getByRole("button", { name: "Use patient ID and access code", exact: true }).click();
  await page.getByLabel("Patient ID", { exact: true }).fill(patientId); await page.getByLabel("Patient access code", { exact: true }).fill(accessCode);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("region", { name: "Connected care profile" })).toContainText("Fictional Mother Anika");
  await expect(page.getByRole("region", { name: "Connected care profile" })).toContainText("Receiving lab contribution");
  await expect(page.getByLabel("Recorded contribution", { exact: true })).toHaveCount(0);
  await page.goto("http://127.0.0.1:4177/mother/matrisathi/companion/chat");
  await page.getByLabel("Your message").fill("What is my blood group?"); await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(/Blood group: O positive/)).toBeVisible();
  await page.getByLabel("Your message").fill("What are my allergies?"); await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(/Allergy details: Not recorded/)).toBeVisible();
  for (const value of [source, destination, doctor, nurse, lab]) await value.context.close(); await mother.close();
});
