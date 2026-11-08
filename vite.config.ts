import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const runtimeFiles = [
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
];
function offlineRuntime() {
  const bytes = (name: string) =>
    readFileSync(
      fileURLToPath(
        new URL(
          `./node_modules/@huggingface/transformers/dist/${name}`,
          import.meta.url,
        ),
      ),
    );
  return {
    name: "optional-offline-ai-runtime",
    generateBundle(this: {
      emitFile: (asset: {
        type: "asset";
        fileName: string;
        source: Buffer;
      }) => void;
    }) {
      for (const name of runtimeFiles)
        this.emitFile({
          type: "asset",
          fileName: `ai-runtime/${name}`,
          source: bytes(name),
        });
    },
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.replace(/^\/ai-runtime\//, "");
        if (
          !req.url?.startsWith("/ai-runtime/") ||
          !name ||
          !runtimeFiles.includes(name)
        )
          return next();
        res.setHeader(
          "Content-Type",
          name.endsWith(".wasm") ? "application/wasm" : "text/javascript",
        );
        res.end(bytes(name));
      });
    },
  };
}
export default defineConfig(({ mode }) => ({
  plugins: [react(), offlineRuntime()],
  worker: {
    format: "es",
    rollupOptions: {
      output: {
        entryFileNames: "assets/ai-[name]-[hash].js",
        chunkFileNames: "assets/ai-[name]-[hash].js",
      },
    },
  },
  resolve: {
    alias: [
      {
        find: /^\.\/workflow-tests$/,
        replacement: fileURLToPath(
          new URL(
            mode === "production" || mode === "submission"
              ? "./src/workflow-tests-disabled.tsx"
              : "./src/workflow-tests.tsx",
            import.meta.url,
          ),
        ),
      },
      {
        find: /^\.\/medicine-demo-loader$/,
        replacement: fileURLToPath(
          new URL(
            mode === "demo"
              ? "./src/medicine-demo-loader.ts"
              : "./src/medicine-demo-disabled.ts",
            import.meta.url,
          ),
        ),
      },
    ],
  },
  server: {
    port: 5173,
    strictPort: true,
    // The isolated relay pilot must not make the SDK's external connectivity
    // image probe when its loopback connection is interrupted.
    headers:
      process.env.VITE_SHARING_PILOT === "1"
        ? {
            "Content-Security-Policy":
              "img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*",
          }
        : undefined,
    watch: { ignored: ["**/.local-tools/**"] },
  },
  preview: { port: 4173, strictPort: true, headers: process.env.VITE_SHARING_PILOT === "1" ? {
    "Content-Security-Policy": "img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*",
  } : undefined },
}));
