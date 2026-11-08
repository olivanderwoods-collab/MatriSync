import { defineConfig } from "@playwright/test";
const port = Number(process.env.TEST_AUTH_PORT || 4174);
export default defineConfig({
  testDir: "./tests-auth",
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    channel: "msedge",
  },
  reporter: "list",
  webServer: {
    command: "node scripts/start-auth-test-app.mjs",
    port,
    reuseExistingServer: false,
  },
});
