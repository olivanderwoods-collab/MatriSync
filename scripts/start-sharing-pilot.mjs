import { spawn } from "node:child_process";
const child = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    process.env.TEST_SHARING_PORT || "4175",
    "--strictPort",
  ],
  {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      VITE_SHARING_PILOT: "1",
      VITE_FIREBASE_API_KEY: "emulator-only-key",
      VITE_FIREBASE_AUTH_DOMAIN: "demo-matrisync.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "demo-matrisync",
      VITE_FIREBASE_APP_ID: "emulator-only-app",
      VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    child.kill();
    process.exit();
  });
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
