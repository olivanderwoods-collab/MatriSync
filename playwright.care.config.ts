import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests-care", timeout: 180000, workers: 1, reporter: "list",
  use: { baseURL: "http://127.0.0.1:4177", channel: "msedge", headless: true, actionTimeout: 10000, screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "node scripts/start-care-test-app.mjs", port: 4177, timeout: 120000, reuseExistingServer: false },
});
