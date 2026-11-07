import { spawn } from "node:child_process";
const env = { ...process.env, VITE_CARE_ENABLED: "1", VITE_SHARING_PILOT: "0", VITE_FIREBASE_API_KEY: "emulator-only-key", VITE_FIREBASE_AUTH_DOMAIN: "demo-matrisync.firebaseapp.com", VITE_FIREBASE_PROJECT_ID: "demo-matrisync", VITE_FIREBASE_APP_ID: "emulator-only-app", VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099" };
const production = process.env.TEST_CARE_PRODUCTION === "1";
if (production) env.TEST_HOSTING_HEADERS = "1";
if (production) for (const args of [["node_modules/vite/bin/vite.js", "build", "--outDir", ".local-tools/care-test-dist"], ["scripts/build-sw.mjs", ".local-tools/care-test-dist"]]) await new Promise((resolve, reject) => {
  const build = spawn(process.execPath, args, { env, stdio: "inherit", windowsHide: true }); build.on("error", reject); build.on("exit", code => code === 0 ? resolve() : reject(Error("Care test build failed.")));
});
const child = spawn(process.execPath, production ? ["scripts/serve.mjs", "--dir", ".local-tools/care-test-dist", "--port", "4177"] : ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4177", "--strictPort"], {
  stdio: "inherit", windowsHide: true, env,
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { child.kill(); process.exit(); });
child.on("exit", code => { process.exitCode = code ?? 1; });
