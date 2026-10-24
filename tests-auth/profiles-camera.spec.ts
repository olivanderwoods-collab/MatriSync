import { test, expect, type Page } from "@playwright/test";
async function signup(page: Page, role = "mother") {
  await page.goto(`/auth/signup?role=${role}`);
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`profiles-${role}-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-test-42!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Synthetic-test-42!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator(".demo-banner")).toContainText(
    "Signed-in account",
    { timeout: 15000 },
  );
}
test("Mother corrections, synthetic camera frames, reopen, cancellation and denied permission", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Deterministic real video frames, without relying on Edge's fake-device flags
    // or requesting a physical camera. Production getUserMedia is not replaced.
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext("2d")!;
      const stream = canvas.captureStream(10);
      const paint = () => {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, 640, 480);
        context.fillStyle = "#000000";
        context.fillText("Synthetic prescription photo", 30, 30);
        if (stream.getTracks().some((t) => t.readyState === "live"))
          requestAnimationFrame(paint);
      };
      paint();
      Object.assign(window, {
        cameraTestStream: stream,
        cameraTestConstraints: constraints,
      });
      return stream;
    };
  });
  await page.setViewportSize({ width: 551, height: 651 });
  await page.emulateMedia({ colorScheme: "dark" });
  await signup(page);
  await page.goto("/mother/more/profile");
  await page.getByLabel("Full name", { exact: true }).fill("Asha Test");
  await page.getByLabel("Recorded pregnancy week (optional)").fill("22");
  await page.getByLabel("Pregnancy week recorded on").fill("2026-10-23");
  await page.getByLabel("Blood group (as recorded)").selectOption("B+");
  await page
    .getByLabel("Emergency contact person", { exact: true })
    .fill("Fictional Contact");
  await page.getByRole("button", { name: "Save mother profile" }).click();
  await expect(page.getByRole("status")).toContainText("saved encrypted");
  await page.reload();
  await expect(page.getByLabel("Blood group (as recorded)")).toHaveValue("B+");
  await page.goto("/mother/overview");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Welcome Asha",
  );
  await expect(
    page.getByRole("heading", { name: "Pregnancy week 22" }),
  ).toBeVisible();
  await expect(
    page.getByText("Recorded 2026-10-23", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workspace-footer")).toHaveCount(0);
  await page.screenshot({
    path: "docs/screenshots/mother-home-revised.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Open MatriSathi" }).click();
  await expect(page).toHaveURL(/\/mother\/matrisathi\/information$/);
  await page.goto("/mother/health/prescriptions");
  await expect(page.getByRole("button", { name: /Back/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Take Photo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Capture photo" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Capture photo" }).click();
  await expect(page.locator(".document-form")).toContainText("document-photo-");
  expect(
    await page.evaluate(() =>
      (window as unknown as { cameraTestStream: MediaStream }).cameraTestStream
        .getTracks()
        .every((t) => t.readyState === "ended"),
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Saved encrypted");
  await expect(page.locator(".document-list")).toContainText("document-photo-");
  await page.getByRole("button", { name: "Take Photo", exact: true }).click();
  await page.locator("video").scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Capture photo" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    await page.evaluate(() =>
      (window as unknown as { cameraTestStream: MediaStream }).cameraTestStream
        .getTracks()
        .every((t) => t.readyState === "ended"),
    ),
  ).toBe(true);
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Synthetic denial", "NotAllowedError");
    };
  });
  await page.getByRole("button", { name: "Take Photo", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "permission was not granted",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Upload From Device" }),
  ).toBeVisible();
});
test("child profiles persist with separate documents and preserve Mother ownership context", async ({
  page,
}) => {
  await signup(page);
  await page.goto("/mother/children");
  await page.getByRole("link", { name: "Add child profile" }).click();
  await page.getByLabel("Child's full name").fill("First Test Child");
  await page.getByLabel("Date of birth", { exact: true }).fill("2024-02-01");
  await page.getByRole("button", { name: "Save child profile" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "First Test Child",
  );
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await page.getByRole("button", { name: "Upload From Device" }).click();
  await page.getByLabel("Document", { exact: true }).setInputFiles({
    name: "first-child.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nSynthetic child report"),
  });
  await page
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "first-child.pdf" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to Children" }).click();
  await page.getByRole("link", { name: "Add child profile" }).click();
  await page.getByLabel("Child's full name").fill("Second Test Child");
  await page.getByLabel("Date of birth", { exact: true }).fill("2025-03-01");
  await page.getByRole("button", { name: "Save child profile" }).click();
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page.locator("main")).not.toContainText("first-child.pdf");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Second Test Child",
  );
  await page.getByRole("link", { name: "Back to Children" }).click();
  await expect(page.locator("main")).toContainText("First Test Child");
  await expect(page.locator("main")).toContainText("Second Test Child");
  await page.getByRole("link", { name: /First Test Child/ }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Child record tabs" })
      .getByRole("link"),
  ).toHaveText([
    "Overview",
    "Vaccinations",
    "Prescriptions",
    "Reports",
    "Follow-ups",
  ]);
  await page.getByRole("link", { name: "Vaccinations", exact: true }).click();
  await expect(page.locator("main")).toContainText("Coming Soon");
  await page.getByRole("link", { name: "Follow-ups", exact: true }).click();
  await expect(page.locator("main")).toContainText(
    "authorized sharing is connected",
  );
});
test("professional and facility profiles persist without fake verification; patient creation offers three choices", async ({
  page,
}) => {
  await page.setViewportSize({ width: 551, height: 651 });
  await signup(page, "professional");
  await page.goto("/professional/more/profile");
  await page.getByLabel("Full name", { exact: true }).fill("Dr Test Rao");
  await page
    .getByRole("combobox", { name: "Profession", exact: true })
    .selectOption("Doctor");
  await page
    .getByLabel("Professional registration number")
    .fill("TEST-REG-001");
  await page
    .getByLabel("Government ID / credential document (optional)")
    .setInputFiles({
      name: "test-id.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nSynthetic ID"),
    });
  await page.getByRole("button", { name: "Save professional profile" }).click();
  await expect(
    page.locator("form.record-form").getByRole("status"),
  ).toContainText("saved encrypted");
  await page.reload();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Dr Test Rao",
  );
  await expect(page.locator("main")).toContainText("Not verified");
  await expect(page.locator("main")).toContainText("test-id.pdf");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/professional/patients/add");
  await expect(
    page
      .getByRole("group", { name: "Add patient options" })
      .getByRole("button"),
  ).toHaveText(["Create patient profile", "Load profile", "Sync NFC Band"]);
  await page
    .getByRole("button", { name: "Create patient profile", exact: true })
    .click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
  await page
    .getByLabel("Full name", { exact: true })
    .fill("Clinician Created Test Mother");
  await page
    .getByRole("button", { name: "Create patient profile", exact: true })
    .last()
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Clinician Created Test Mother",
  );
  await expect(page.locator("main")).toContainText("mother.");
  await expect(page.locator("main")).toContainText("LOCAL-");
  await page.goto("/professional/patients");
  const inputBox = await page.getByLabel("Search Patient").boundingBox();
  const addBox = await page
    .getByRole("link", { name: "Add patient", exact: true })
    .boundingBox();
  expect(Math.abs(inputBox!.y - addBox!.y)).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: "docs/screenshots/patient-search-revised.png",
    fullPage: true,
  });
  await page.goto("/organization/more/profile");
  await page
    .getByLabel("Facility name", { exact: true })
    .fill("Fictional Lotus Facility");
  await page
    .getByRole("combobox", { name: "Facility type", exact: true })
    .selectOption("Private");
  await page.getByLabel("Facility address").fill("Synthetic address");
  await page.getByRole("button", { name: "Save facility profile" }).click();
  await expect(page.getByRole("status")).toContainText("saved encrypted");
  await page.reload();
  await expect(page.getByLabel("Facility name", { exact: true })).toHaveValue(
    "Fictional Lotus Facility",
  );
});
