import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    channel: "msedge",
  },
  reporter: "list",
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173",
    port: 4173,
    reuseExistingServer: true,
  },
});
