import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const demo = process.argv[2] === "demo";
const assets = await readdir("dist/assets");
for (const name of ["catalogue", "interactions"]) {
  const matches = assets.filter(file => file.startsWith(`${name}-`) && file.endsWith(".json"));
  if (matches.length !== (demo ? 1 : 0)) throw Error(`Unexpected ${name} assets in ${demo ? "demo" : "production"} build`);
  if (demo) {
    const hash = bytes => createHash("sha256").update(bytes).digest("hex");
    if (hash(await readFile(`dist/assets/${matches[0]}`)) !== hash(await readFile(`fixtures/medicine-demo/${name}.json`))) throw Error(`Draft ${name} changed during build`);
  }
}
console.log(demo ? "Test fixtures included unchanged; clinical use remains disabled." : "Test fixtures excluded from production assets.");
if (!demo) {
  for (const file of assets.filter(name => name.endsWith(".js"))) {
    const text = await readFile(`dist/assets/${file}`, "utf8");
    if (text.includes("TEST-M-001") || text.includes("Synthetic workflow test"))
      throw Error("Synthetic assignment workflow leaked into production assets");
  }
  console.log("Synthetic assignment workflow excluded from production assets.");
}
