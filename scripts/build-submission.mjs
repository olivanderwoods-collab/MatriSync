import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
export const submissionEnv = {
  ...process.env,
  VITE_SHARING_PILOT: "1",
  VITE_FIREBASE_API_KEY: "emulator-only-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-matrisync.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "demo-matrisync",
  VITE_FIREBASE_APP_ID: "emulator-only-app",
  VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
};
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--mode", "submission", "--outDir", ".local-tools/submission-dist"], { stdio: "inherit", windowsHide: true, env: submissionEnv });
  child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(Error(`Submission build failed (${code}).`)));
});
const assets = await readdir(".local-tools/submission-dist/assets");
const js = (await Promise.all(assets.filter(f => f.endsWith(".js")).map(f => readFile(`.local-tools/submission-dist/assets/${f}`, "utf8")))).join("\n");
for (const marker of ["Create encrypted handoff", "Send and verify handoff", "Encrypted referral outbox", "demo-matrisync", "127.0.0.1:9099"])
  if (!js.includes(marker)) throw Error(`Submission build missing ${marker}`);
if (js.includes("matrisync-identity-command-v1")) throw Error("Unreviewed identity client entered submission build.");
console.log("Controlled submission build verified. Local emulator accounts only; no public deployment.");
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["scripts/build-sw.mjs", ".local-tools/submission-dist"], { stdio: "inherit", windowsHide: true });
  child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(Error("Submission offline shell failed.")));
});
