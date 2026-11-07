import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const demo = process.argv[2] === "demo";
const assets = await readdir("dist/assets");
for (const file of assets.filter((name) => name.endsWith(".js"))) {
  const text = await readFile(`dist/assets/${file}`, "utf8");
  if (
    text.includes("matrisync-identity-command-v1") ||
    text.includes("code-verifier-only") ||
    text.includes("matrisync-sharing-outbox-v1") ||
    text.includes("Invalid encrypted attachment manifest") ||
    text.includes("Encrypted send outbox") ||
    text.includes("Encrypted sharing pilot") ||
    text.includes("deviceRequests") ||
    text.includes("assignmentRoutes") ||
    text.includes("staffAssignments") ||
    text.includes("Opening patient assignments") ||
    text.includes("Receive assigned records") ||
    text.includes("clinicalCredentials") ||
    text.includes("referralInitiations") ||
    text.includes("forwardedReferrals") ||
    text.includes("forwardedReferralIndex") ||
    text.includes("matrisync-referral-forward+jws") ||
    text.includes("Receive doctor-approved referrals") ||
    // The local vault retains referralApprovals for lossless record parsing.
    // These markers identify the pilot approval client and UI, not that schema.
    text.includes("Go online to confirm doctor authority") ||
    text.includes("Doctor review of this version") ||
    // Connected care reuses the existing non-exportable device-key store to
    // preserve enrolled keys; none of the old relay clients may ship.
    (text.includes("matrisync-sharing-pilot-v1") && process.env.VITE_CARE_ENABLED !== "1")
  )
    throw Error("Local sharing pilot leaked into a distributable build");
}
console.log("Local sharing pilot excluded from distributable assets.");
for (const name of ["catalogue", "interactions"]) {
  const matches = assets.filter(
    (file) => file.startsWith(`${name}-`) && file.endsWith(".json"),
  );
  if (matches.length !== (demo ? 1 : 0))
    throw Error(
      `Unexpected ${name} assets in ${demo ? "demo" : "production"} build`,
    );
  if (demo) {
    const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
    if (
      hash(await readFile(`dist/assets/${matches[0]}`)) !==
      hash(await readFile(`fixtures/medicine-demo/${name}.json`))
    )
      throw Error(`Draft ${name} changed during build`);
  }
}
console.log(
  demo
    ? "Test fixtures included unchanged; clinical use remains disabled."
    : "Test fixtures excluded from production assets.",
);
if (!demo) {
  for (const file of assets.filter((name) => name.endsWith(".js"))) {
    const text = await readFile(`dist/assets/${file}`, "utf8");
    if (text.includes("TEST-M-001") || text.includes("Synthetic workflow test"))
      throw Error(
        "Synthetic assignment workflow leaked into production assets",
      );
  }
  console.log("Synthetic assignment workflow excluded from production assets.");
}
