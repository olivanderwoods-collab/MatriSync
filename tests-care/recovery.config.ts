import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
// Local UI fixture only. No Firebase, live accounts or production bundling.
const mock = fileURLToPath(new URL("./recovery-mocks.ts", import.meta.url));
export default defineConfig({
  esbuild: { jsx: "automatic" },
  optimizeDeps: { entries: ["tests-care/recovery-fixture.html"] },
  plugins: [{ name: "isolated-care-fixture", enforce: "pre", resolveId(source, importer) {
    if ((importer?.endsWith("/src/care-page.tsx") && ["./care-client", "./records"].includes(source)) || (importer?.endsWith("/src/care-storage.ts") && source === "./auth")) return mock;
  } }],
  server: { host: "127.0.0.1", port: 4181, strictPort: true },
});
