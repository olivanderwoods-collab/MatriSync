import { spawn } from "node:child_process";
const child = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "4174",
    "--strictPort",
  ],
  {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      VITE_FIREBASE_API_KEY: "emulator-only-key",
      VITE_FIREBASE_AUTH_DOMAIN: "demo-matrisync.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "demo-matrisync",
      VITE_FIREBASE_APP_ID: "emulator-only-app",
      VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
    },
  },
);
child.on("exit", (code) => process.exit(code || 0));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill());
