import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests-sharing",
  timeout: 45000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4175",
    headless: true,
    channel: "msedge",
    actionTimeout: 10000,
  },
  webServer: {
    command: "node scripts/start-sharing-pilot.mjs",
    // Submission mode compiles the production bundle before serving it.
    timeout: 120000,
    port: 4175,
    reuseExistingServer: false,
  },
});
