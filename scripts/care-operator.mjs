// Operator-only bootstrap. No credential material is printed or put in Git.
// Uses the existing Firebase CLI login; never enables billing or uploads files.
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const cli = "../.local-tools/node_modules/firebase-tools/lib/";
const account = require(cli + "auth.js").getProjectDefaultAccount(process.cwd());
if (!account) throw Error("Firebase CLI login is required.");
const project = "matrisync-c9de7";
await require(cli + "requireAuth.js").requireAuth({ project, ...account });
const { Client } = require(cli + "apiv2.js");
const firestore = new Client({ urlPrefix: "https://firestore.googleapis.com", apiVersion: "v1" });
const base = `projects/${project}/databases/(default)`;
await mkdir(".local-tools/care-release", { recursive: true });
if (process.argv[2] === "inspect") {
  const db = (await firestore.get(base)).body;
  console.log(JSON.stringify({ project, database: db.name, edition: db.databaseEdition, freeTier: db.freeTier, location: db.locationId }));
  const rules = new Client({ urlPrefix: "https://firebaserules.googleapis.com", apiVersion: "v1" });
  const release = (await rules.get(`projects/${project}/releases/cloud.firestore`)).body;
  const source = (await rules.get(release.rulesetName)).body;
  await writeFile(`.local-tools/care-release/live-rules-${Date.now()}.json`, JSON.stringify(source, null, 2), { flag: "wx" });
  console.log("Prior live rules saved privately for comparison.");
} else if (process.argv[2] === "invite") {
  const count = Number(process.argv[3] || 2);
  if (!Number.isInteger(count) || count < 1 || count > 4) throw Error("Use 1–4 prototype facility invitations.");
  const issued = [];
  for (let i=0;i<count;i++) {
    const code = randomBytes(24).toString("base64url"), id = createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 7*24*3600000).toISOString();
    await firestore.patch(`${base}/documents/careFacilityInvites/${id}`, { fields: { redeemedBy: { stringValue: "" }, redeemedAt: { nullValue: null }, expiresAt: { timestampValue: expiresAt } } }, { queryParams: { "currentDocument.exists": "false" } });
    issued.push({ code, expiresAt });
  }
  const file = `.local-tools/care-release/facility-invitations-${Date.now()}.json`;
  await writeFile(file, JSON.stringify({ project, invitations: issued }, null, 2), { flag: "wx" });
  console.log(`${count} one-use invitations saved locally in ${file}. No invitation codes printed.`);
} else throw Error("Use inspect or invite.");
