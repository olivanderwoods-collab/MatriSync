import { test, expect, type Page } from "@playwright/test";
import {
  approveMember,
  approveAssignmentRoute,
  approveChannel,
  operatorRead,
} from "../scripts/sharing-operator.mjs";

async function enroll(page: Page, role: string) {
  await page.goto(`/auth/signup?role=${role}`);
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`assignment-${role}-${crypto.randomUUID()}@example.test`);
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
  await approveMember(uid, role, fingerprint);
  return { uid, fingerprint };
}
async function selectConnection(page: Page, id: string, fingerprint: string) {
  await page
    .getByRole("button", { name: "Request approval / Refresh connections" })
    .click();
  await page
    .getByRole("combobox", { name: "Approved connection", exact: true })
    .selectOption(id);
  await page.getByLabel("Other device fingerprint").fill(fingerprint);
}
test("facility assignment requires staff acceptance, scopes the patient and preserves saved copies after revocation", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120000);
  const contexts = await Promise.all(
    [1, 2, 3].map(() =>
      browser.newContext({
        baseURL: "http://127.0.0.1:4175",
        viewport: { width: 551, height: 800 },
      }),
    ),
  );
  const [mother, staff, facility] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  const external: string[] = [];
  for (const page of [mother, staff, facility])
    page.on("request", (r) => {
      if (!["localhost", "127.0.0.1"].includes(new URL(r.url()).hostname))
        external.push(r.url());
    });
  try {
    const m = await enroll(mother, "mother"),
      s = await enroll(staff, "professional"),
      f = await enroll(facility, "organization");
    await mother.goto("/mother/more/profile");
    await mother
      .getByLabel("Full name", { exact: true })
      .fill("Fictional Assignment Mother");
    await mother.getByRole("button", { name: "Save mother profile" }).click();
    await expect(mother.getByRole("status")).toContainText("saved encrypted");
    const scope = `assignment-${Date.now()}`,
      connection = `assigned-${Date.now()}`;
    const profileId = await approveAssignmentRoute(
      scope,
      m.uid,
      "self",
      f.uid,
      s.uid,
    );
    await expect(
      approveAssignmentRoute(scope, m.uid, "self", f.uid, s.uid),
    ).rejects.toThrow();
    await approveChannel(connection, m.uid, s.uid, scope);
    await mother.goto("/mother/more/sharing");
    await selectConnection(mother, connection, s.fingerprint);
    await selectConnection(staff, connection, m.fingerprint);
    await mother
      .getByRole("combobox", { name: "Local patient profile" })
      .selectOption({ label: "Fictional Assignment Mother" });
    await mother
      .getByRole("button", { name: "Encrypt and share profile" })
      .click();
    await expect(mother.getByRole("alert")).toContainText("must accept");
    await staff.getByRole("button", { name: "Fetch approved records" }).click();
    await expect(staff.getByRole("alert")).toContainText("must accept");
    await facility
      .getByRole("button", { name: "Refresh assignments", exact: true })
      .click();
    const facilityOffer = facility.getByTestId(`assignment-${scope}`);
    await expect(facilityOffer).toContainText("Not offered");
    await facilityOffer
      .getByRole("button", { name: "Offer assignment" })
      .click();
    await expect(facilityOffer).toContainText("Assignment status: pending");
    await staff
      .getByRole("button", { name: "Refresh assignments", exact: true })
      .click();
    const staffOffer = staff.getByTestId(`assignment-${scope}`);
    await expect(staffOffer).toContainText(profileId);
    await expect(staffOffer).not.toContainText("Fictional Assignment Mother");
    await staff.getByRole("button", { name: "Fetch approved records" }).click();
    await expect(staff.getByRole("alert")).toContainText("must accept");
    await staffOffer.getByRole("button", { name: "Accept assignment" }).click();
    await expect(staffOffer).toContainText("Assignment status: accepted");
    await mother
      .getByRole("button", { name: "Encrypt and share profile" })
      .click();
    await expect(
      mother
        .getByRole("status")
        .filter({ hasText: "Encrypted profile version stored" }),
    ).toBeVisible();
    await staff.getByRole("button", { name: "Fetch approved records" }).click();
    await expect(
      staff
        .getByRole("status")
        .filter({ hasText: "encrypted transfer(s) checked" }),
    ).toBeVisible();
    await staff.getByRole("button", { name: "Open saved profiles" }).click();
    await staff
      .getByRole("combobox", { name: "Shared patient", exact: true })
      .selectOption(profileId);
    await staff
      .getByRole("combobox", { name: "Saved profile version", exact: true })
      .selectOption({ index: 1 });
    await expect(staff.getByTestId("shared-profile-view")).toContainText(
      "Fictional Assignment Mother",
    );
    const before = await operatorRead(`staffAssignments/${scope}`);
    expect(before.status).toBe("accepted");
    expect(before.createdBy).toBe(f.uid);
    expect(before.updatedBy).toBe(s.uid);
    expect(JSON.stringify(before)).not.toContain("Fictional Assignment Mother");
    await facility
      .getByRole("button", { name: "Refresh assignments", exact: true })
      .click();
    await facilityOffer
      .getByRole("button", { name: "Revoke assignment" })
      .click();
    await expect(facilityOffer).toContainText("Assignment status: revoked");
    await staff.getByRole("button", { name: "Fetch approved records" }).click();
    await expect(staff.getByRole("alert")).toContainText("Revoked assignments");
    await mother
      .getByRole("button", { name: "Encrypt and share profile" })
      .click();
    await expect(mother.getByRole("alert")).toContainText(
      "Revoked assignments",
    );
    await staff.reload();
    await expect(
      staff.getByRole("button", { name: "Open saved profiles" }),
    ).toBeVisible();
    await contexts[1].setOffline(true);
    await staff.getByRole("button", { name: "Open saved profiles" }).click();
    await staff
      .getByRole("combobox", { name: "Shared patient", exact: true })
      .selectOption(profileId);
    await staff
      .getByRole("combobox", { name: "Saved profile version", exact: true })
      .selectOption({ index: 1 });
    await expect(staff.getByTestId("shared-profile-view")).toContainText(
      "Fictional Assignment Mother",
    );
    await staff.screenshot({
      path: testInfo.outputPath("assigned-profile-retained.png"),
      fullPage: true,
    });
    expect(external).toEqual([]);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
