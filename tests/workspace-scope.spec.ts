import { test, expect, type Page } from "@playwright/test";
import {
  childSections,
  maternalSections,
  professionalSections,
  professionalReferrals,
  organizationReferrals,
  inventorySections,
  followUpSections,
  moreMenus,
  distributorSections,
} from "../src/workspace-spec";

async function guest(page: Page, role: string) {
  await page.goto(`/auth/login?role=${role}`);
  await page.getByRole("button", { name: "Continue as Guest" }).click();
  await expect(page.getByText("Guest Demo · Synthetic data")).toBeVisible();
}
test("revised role navigation and distributor move into inventory", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".role-card")).toHaveCount(3);
  const layouts = {
    mother: ["Home", "My Health", "MatriSathi", "Children", "More"],
    professional: ["Home", "Patients", "Follow-ups", "More"],
    organization: ["Home", "Referrals", "Patients", "Inventory", "More"],
  };
  for (const [role, labels] of Object.entries(layouts)) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await guest(page, role);
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation", exact: true })
        .getByRole("link"),
    ).toHaveText(labels);
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = page.getByRole("navigation", {
      name: "Mobile navigation",
      exact: true,
    });
    await expect(mobile.getByRole("link")).toHaveText(labels);
    await mobile.getByRole("link", { name: "More", exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "More menu" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Exit Guest", exact: true })
      .first()
      .click();
  await page.getByRole("dialog").getByRole("button", { name: "Exit Guest", exact: true }).click();
  }
  await guest(page, "organization");
  await page.goto("/organization/more/distributor");
  await expect(
    page
      .getByRole("navigation", { name: "Mobile navigation", exact: true })
      .getByRole("link"),
  ).toHaveText(["Home", "Referrals", "Patients", "Inventory", "More"]);
  await expect(page.locator("main")).not.toContainText("Mira Sen");
  await expect(page.locator("main")).not.toContainText("DEMO-P-");
});

test("every specified destination, legacy bookmarks and no external traffic", async ({
  page,
}) => {
  test.setTimeout(120000);
  const external: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:4173")) external.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  const groups = {
    mother: [
      ...maternalSections.map((s) => `health/${s.id}`),
      ...childSections.flatMap((s) => [
        `children/tara/${s.id}`,
        `children/arun/${s.id}`,
      ]),
      "matrisathi/information",
      "matrisathi/companion",
      ...moreMenus.mother
        .filter(([id]) => id !== "logout")
        .map(([id]) => `more/${id}`),
    ],
    professional: [
      ...professionalSections.map((s) => `patients/mira/${s.id}`),
      ...professionalReferrals.map((s) => `referrals/${s.id}`),
      ...followUpSections.map((s) => `follow-up/${s.id}`),
      ...moreMenus.professional
        .filter(([id]) => id !== "logout")
        .map(([id]) => `more/${id}`),
      "patients/register",
      "patients/consultation",
    ],
    organization: [
      "patients",
      "patients/mira/overview",
      ...organizationReferrals.map((s) => `referrals/${s.id}`),
      ...inventorySections.map((s) => `inventory/${s.id}`),
      ...moreMenus.organization
        .filter(([id]) => id !== "logout")
        .map(([id]) => `more/${id}`),
      ...distributorSections.map((s) => `more/distributor/${s.id}`),
    ],
  };
  for (const [role, paths] of Object.entries(groups)) {
    await guest(page, role);
    for (const path of paths) {
      await page.goto(`/${role}/${path}`);
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await expect(
        page.getByText("PAGE NOT FOUND", { exact: true }),
      ).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText(
        /MatriFlow|MatriWatch|MatriBridge|MatriVitals|MatriBand|MatriSync Bridge|Drug Safety Assistant/,
      );
      const buttons = page.locator("main .soon-button");
      if (await buttons.count()) {
        await buttons.first().click();
        await expect(page.getByRole("dialog")).toContainText(
          "not active in this demo",
        );
        await page.keyboard.press("Escape");
      }
    }
    await page
      .getByRole("button", { name: "Exit Guest", exact: true })
      .first()
      .click();
  await page.getByRole("dialog").getByRole("button", { name: "Exit Guest", exact: true }).click();
  }
  await guest(page, "professional");
  await page.goto("/professional/matribridge");
  await expect(page).toHaveURL(/\/professional\/more\/documentation$/);
  await page.goto("/professional/drug-safety");
  await expect(page).toHaveURL(/\/professional\/patients$/);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("v2 role boundaries and Home action inventories", async ({ page }) => {
  await guest(page, "mother");
  const main = page.locator("main#main").first();
  await expect(main.getByRole("link")).toHaveCount(1);
  await expect(main.getByRole("link", { name: "Open MatriSathi" })).toHaveAttribute("href", "/mother/matrisathi");
  await expect(main).toContainText("34");
  await expect(main).toContainText("Welcome Mira");
  await page.goto("/mother/matrisathi/companion");
  await expect(
    page.getByRole("navigation", { name: "Section tabs" }).getByRole("link"),
  ).toHaveText(["Information & Education", "RUHI · AI Companion"]);
  await expect(
    page
      .getByRole("navigation", { name: "Companion options" })
      .getByRole("link"),
  ).toHaveText(["Chat", "Drug information"]);
  await page.goto("/mother/health/follow-up");
  await expect(main.locator(".soon-button")).toHaveText([
    "View DetailsComing Soon",
  ]);
  await page.goto("/mother/health/medicines");
  await expect(main).not.toContainText("Add Medication");
  await page.goto("/mother/children/tara/vaccinations");
  await expect(main).toContainText("not an immunization scheduler");
  await page
    .getByRole("button", { name: "Exit Guest", exact: true })
    .first()
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Exit Guest", exact: true }).click();
  await guest(page, "professional");
  await expect(main.getByRole("link")).toHaveCount(0);
  await page.goto("/professional/referrals/approved");
  await expect(page).toHaveURL(/\/professional\/patients$/);
  await expect(
    main.getByRole("button", { name: /Initiate Referral/ }),
  ).toHaveCount(0);
  await page.goto("/professional/patients/mira/prescriptions");
  await expect(
    main.getByRole("button", { name: /Review & Authorize Prescription/ }),
  ).toBeVisible();
  await expect(main).toContainText("Planned reviewed database");
  await page
    .getByRole("button", { name: "Exit Guest", exact: true })
    .first()
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Exit Guest", exact: true }).click();
  await guest(page, "organization");
  await expect(main.getByRole("link")).toHaveCount(0);
  await page.goto("/organization/referrals/ready");
  await expect(
    main.getByRole("button", { name: /^Initiate Referral/ }),
  ).toBeVisible();
  await page.goto("/organization/referrals/external");
  await expect(main).toContainText("No automatic external acceptance");
  await expect(main).toContainText("stays outside the clinical NFC payload");
  await page.goto("/organization/patients/mira/overview");
  await expect(main.locator(".soon-button")).toHaveText([
    "View RecordComing Soon",
    "View VisitsComing Soon",
    "Referral HistoryComing Soon",
    "Assigned ProfessionalComing Soon",
  ]);
  await expect(main).not.toContainText("Create Prescription");
});

test("every inventory subsection uses only its specified future controls", async ({
  page,
}) => {
  await guest(page, "organization");
  for (const section of inventorySections) {
    await page.goto(`/organization/inventory/${section.id}`);
    await expect(
      page.locator("main .soon-button > span:first-child"),
    ).toHaveText(section.actions);
  }
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const url of [
      "/organization/inventory/return",
      "/organization/more",
      "/organization/more/distributor/settlements",
      "/organization/referrals/external",
    ]) {
      await page.goto(url);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
    }
  }
});

test("patient fixtures stay in their own profiles and recovery has one main landmark", async ({
  page,
}) => {
  await guest(page, "professional");
  for (const patient of ["anika", "leela"]) {
    await page.goto(`/professional/patients/${patient}/follow-up`);
    await expect(page.locator("main")).not.toContainText("28 October");
    await expect(page.locator("main")).toContainText(
      "No clinician-entered follow-up",
    );
    await page.goto(`/professional/patients/${patient}/referrals`);
    await expect(page.locator("main")).not.toContainText("DEMO-REF-001");
    await expect(page.locator("main")).toContainText("No referral is recorded");
  }
  await page.goto("/professional/patients/mira/follow-up");
  await expect(page.locator("main")).toContainText("28 October");
  await page.goto("/professional/unknown");
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.locator("#main")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Let’s find your way back." }),
  ).toBeVisible();
});
