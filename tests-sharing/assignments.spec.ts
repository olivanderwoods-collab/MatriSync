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

test("staff workspaces separate pending permission, received records and independent grants", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120000);
  const contexts = await Promise.all(
    [0, 1, 2, 3].map(() =>
      browser.newContext({
        baseURL: "http://127.0.0.1:4175",
        viewport: { width: 551, height: 850 },
      }),
    ),
  );
  const [mother, staff, facility, outsider] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  const errors: string[] = [];
  for (const page of [mother, staff, facility, outsider])
    page.on("pageerror", (e) => errors.push(e.message));
  try {
    const m = await enroll(mother, "mother"),
      s = await enroll(staff, "professional"),
      f = await enroll(facility, "organization");
    await enroll(outsider, "professional");
    await mother.goto("/mother/more/profile");
    await mother
      .getByLabel("Full name", { exact: true })
      .fill("Workspace Assignment Mother");
    await mother.getByRole("button", { name: "Save mother profile" }).click();
    await expect(mother.getByRole("status")).toContainText("saved encrypted");
    const scope = `workspace-${Date.now()}`,
      channel = `workspace-delivery-${Date.now()}`,
      facilityChannel = `workspace-facility-${Date.now()}`;
    const profileId = await approveAssignmentRoute(
      scope,
      m.uid,
      "self",
      f.uid,
      s.uid,
    );
    await approveChannel(channel, m.uid, s.uid, scope);
    const direct = `independent-direct-${Date.now()}`;
    await approveChannel(direct, m.uid, s.uid);
    const secondScope = `other-scope-${Date.now()}`;
    await approveAssignmentRoute(
      secondScope,
      m.uid,
      "other-patient",
      f.uid,
      s.uid,
    );
    await approveChannel(facilityChannel, m.uid, f.uid);
    await mother.goto("/mother/more/sharing");
    await selectConnection(mother, facilityChannel, f.fingerprint);
    await mother
      .getByRole("combobox", { name: "Local patient profile" })
      .selectOption({ label: "Workspace Assignment Mother" });
    await mother
      .getByRole("button", { name: "Encrypt and share profile" })
      .click();
    await expect(
      mother
        .getByRole("status")
        .filter({ hasText: "Encrypted profile version stored" }),
    ).toBeVisible();
    await selectConnection(facility, facilityChannel, m.fingerprint);
    await facility
      .getByRole("button", { name: "Fetch approved records" })
      .click();
    await expect(
      facility
        .getByRole("status")
        .filter({ hasText: "encrypted transfer(s) checked" }),
    ).toBeVisible();
    await facility.goto(`/organization/patients/shared-${profileId}/overview`);
    const patientAccess = facility.getByRole("region", {
      name: "Staff access for this patient",
      exact: true,
    });
    const offer = patientAccess.getByTestId(`assignment-${scope}`);
    await expect(offer).toContainText("Not offered");
    await expect(
      patientAccess.getByTestId(`assignment-${secondScope}`),
    ).toHaveCount(0);
    await offer.getByRole("button", { name: "Offer assignment" }).click();
    await expect(offer).toContainText("Assignment status: pending");
    await staff.goto("/professional/overview");
    const home = staff.getByRole("region", {
      name: "Pending patient assignments",
      exact: true,
    });
    await expect(home.getByTestId(`assignment-${scope}`)).toBeVisible();
    await expect(home).not.toContainText("Workspace Assignment Mother");
    await expect(
      home.getByRole("button", { name: "Receive assigned records" }),
    ).toHaveCount(0);
    await staff.goto("/professional/patients");
    const assigned = staff.getByRole("region", {
      name: "Assigned patients",
      exact: true,
    });
    await expect(assigned).toContainText("No matching staff assignments");
    await expect(
      staff
        .getByRole("region", { name: "Shared patients", exact: true })
        .getByRole("link"),
    ).toHaveCount(0);
    await mother.goto("/mother/more/permissions");
    const motherAccess = mother.getByRole("region", {
      name: "Organization staff access",
      exact: true,
    });
    await expect(motherAccess.getByTestId(`assignment-${scope}`)).toContainText(
      "pending",
    );
    await expect(
      motherAccess.getByRole("button", {
        name: /Accept assignment|Offer assignment|Revoke assignment/,
      }),
    ).toHaveCount(0);
    await outsider.goto("/professional/overview");
    await expect(
      outsider.getByRole("region", {
        name: "Pending patient assignments",
        exact: true,
      }),
    ).toContainText("No pending patient assignments");
    await staff.goto("/organization/more/staff");
    await expect(staff.getByRole("alert")).toContainText("not approved");
    await expect(staff.getByTestId(`assignment-${scope}`)).toHaveCount(0);
    await staff.goto("/professional/overview");
    await home.getByRole("button", { name: "Accept assignment" }).click();
    await expect(home).toContainText("No pending patient assignments");
    await staff.goto("/professional/patients");
    const card = assigned.getByTestId(`assignment-${scope}`);
    await expect(card).toContainText("Assignment status: accepted");
    await expect(card).toContainText("No profile has been received");
    await card
      .getByLabel("Patient source device fingerprint")
      .fill(m.fingerprint);
    await card
      .getByRole("button", { name: "Receive assigned records" })
      .click();
    await expect(assigned.getByRole("alert")).toContainText(
      "No encrypted records have been sent",
    );
    await contexts[1].setOffline(true);
    await card
      .getByRole("button", { name: "Receive assigned records" })
      .click();
    await expect(assigned.getByRole("alert")).toContainText(
      "No new action was confirmed offline",
    );
    await contexts[1].setOffline(false);
    await expect(
      card.getByRole("link", { name: "Open saved patient profile" }),
    ).toHaveCount(0);
    await mother.goto("/mother/more/sharing");
    await selectConnection(mother, channel, s.fingerprint);
    await mother
      .getByRole("combobox", { name: "Local patient profile" })
      .selectOption({ label: "Workspace Assignment Mother" });
    await mother
      .getByRole("button", { name: "Encrypt and share profile" })
      .click();
    await expect(
      mother
        .getByRole("status")
        .filter({ hasText: "Encrypted profile version stored" }),
    ).toBeVisible();
    await card
      .getByRole("button", { name: "Receive assigned records" })
      .click();
    await expect(assigned.getByRole("status")).toContainText(
      "Assigned records verified and saved",
    );
    await expect(
      card.getByRole("link", { name: "Open saved patient profile" }),
    ).toBeVisible();
    await staff.reload();
    await expect(
      card.getByRole("link", { name: "Open saved patient profile" }),
    ).toBeVisible();
    await staff.setViewportSize({ width: 390, height: 844 });
    await expect(staff.locator("body")).toHaveJSProperty("scrollWidth", 390);
    await card.screenshot({
      path: testInfo.outputPath("assigned-patient-card.png"),
    });
    await card
      .getByRole("link", { name: "Open saved patient profile" })
      .click();
    await staff
      .getByRole("combobox", { name: "Saved profile version", exact: true })
      .selectOption({ index: 1 });
    await expect(staff.getByTestId("shared-profile-view")).toContainText(
      "Workspace Assignment Mother",
    );
    await outsider.goto(`/professional/patients/shared-${profileId}/overview`);
    await expect(
      outsider.getByRole("heading", { name: "Shared profile unavailable" }),
    ).toBeVisible();
    await facility.goto("/organization/more/staff");
    const manager = facility.getByRole("region", {
      name: "Staff assignments",
      exact: true,
    });
    await expect(manager.getByTestId(`assignment-${scope}`)).toContainText(
      "accepted",
    );
    await expect(
      manager.getByTestId(`assignment-${secondScope}`),
    ).toContainText("Not offered");
    await manager
      .getByTestId(`assignment-${scope}`)
      .getByRole("button", { name: "Revoke assignment" })
      .click();
    await expect(manager.getByTestId(`assignment-${scope}`)).toContainText(
      "revoked",
    );
    await staff.goto("/professional/patients");
    await expect(card).toContainText("Assignment status: revoked");
    await expect(
      card.getByRole("button", { name: "Receive assigned records" }),
    ).toHaveCount(0);
    await expect(
      card.getByRole("link", { name: "Open saved patient profile" }),
    ).toBeVisible();
    await contexts[1].setOffline(true);
    await card
      .getByRole("link", { name: "Open saved patient profile" })
      .click();
    await staff
      .getByRole("combobox", { name: "Saved profile version", exact: true })
      .selectOption({ index: 1 });
    await expect(staff.getByTestId("shared-profile-view")).toContainText(
      "Workspace Assignment Mother",
    );
    await contexts[1].setOffline(false);
    // Revoking an assignment does not revoke an independently approved direct channel.
    await selectConnection(mother, direct, s.fingerprint);
    await mother
      .getByRole("button", { name: "Encrypt and share profile" })
      .click();
    await expect(
      mother
        .getByRole("status")
        .filter({ hasText: "Encrypted profile version stored" }),
    ).toBeVisible();
    await staff.goto("/professional/more/sharing");
    await selectConnection(staff, direct, m.fingerprint);
    await staff.getByRole("button", { name: "Fetch approved records" }).click();
    await expect(
      staff
        .getByRole("status")
        .filter({ hasText: "encrypted transfer(s) checked" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
