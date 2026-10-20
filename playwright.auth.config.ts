import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests-auth",
  timeout: 30000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4174", headless: true, channel: "msedge" },
  reporter: "list",
  webServer: {
    command: "node scripts/start-auth-test-app.mjs",
    port: 4174,
    reuseExistingServer: false,
  },
});
