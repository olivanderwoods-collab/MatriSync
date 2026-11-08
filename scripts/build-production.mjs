import { spawnSync } from "node:child_process";

// Keep Vite and the release verifier on the same approved production settings.
// No emulator-bound sharing client may enter the public Hosting build.
const env = { ...process.env, VITE_CARE_ENABLED: "1", VITE_SHARING_PILOT: "0" };
for (const args of [
  ["node_modules/vite/bin/vite.js", "build"],
  ["scripts/verify-build-mode.mjs", "production"],
  ["scripts/build-sw.mjs"],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
