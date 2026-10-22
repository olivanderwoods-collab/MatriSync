import { spawn } from "node:child_process";
const env = {
  ...process.env,
  VITE_FIREBASE_API_KEY: "emulator-only-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-matrisync.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "demo-matrisync",
  VITE_FIREBASE_APP_ID: "emulator-only-app",
  VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
};
const port = process.env.TEST_AUTH_PORT || "4174";
let child;
function run(args) {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, args, {
      stdio: "inherit",
      windowsHide: true,
      env,
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(Error(`Test app process exited ${code}`)),
    );
    child.on("error", reject);
  });
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    child?.kill();
    process.exit();
  });
if (process.env.TEST_AI_PRODUCTION === "1") {
  const out = ".local-tools/ai-test-dist";
  await run([
    "node_modules/vite/bin/vite.js",
    "build",
    "--mode",
    "demo",
    "--outDir",
    out,
  ]);
  await run(["scripts/build-sw.mjs", out]);
  await run(["scripts/serve.mjs", "--dir", out, "--port", port]);
} else {
  await run([
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    port,
    "--strictPort",
  ]);
}
