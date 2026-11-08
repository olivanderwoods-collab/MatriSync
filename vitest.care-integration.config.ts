import { defineConfig } from "vitest/config";
// These settings override .env.local. This suite must never use the live site.
export default defineConfig({
  test: {
    include: ["tests-care/*.integration.test.ts"], fileParallelism: false,
    testTimeout: 120000, hookTimeout: 30000,
    env: {
      VITE_CARE_ENABLED: "1", VITE_SHARING_PILOT: "0",
      VITE_FIREBASE_API_KEY: "emulator-only-key",
      VITE_FIREBASE_AUTH_DOMAIN: "demo-matrisync.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "demo-matrisync",
      VITE_FIREBASE_APP_ID: "emulator-only-app",
      VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
    },
  },
});
