// Mechanical resizing only: preserves the supplied artwork, proportions, and alpha.
// Usage: node scripts/derive-icons.mjs <absolute sharp module path> <source PNG>
import { mkdir, copyFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const sharp = (await import(pathToFileURL(process.argv[2]).href)).default;
await mkdir("public/icons", { recursive: true });
await mkdir("docs/branding", { recursive: true });
await copyFile(
  process.argv[3],
  "docs/branding/MatriSync-approved-original.png",
);
for (const size of [192, 512])
  await sharp(process.argv[3])
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(`public/icons/icon-${size}.png`);
const mark = await sharp(process.argv[3])
  .resize(358, 358, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#F0FDF4" },
})
  .composite([{ input: mark, gravity: "center" }])
  .png()
  .toFile("public/icons/maskable-512.png");
