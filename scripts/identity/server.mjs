import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { processIdentityCommand } from "./service.mjs";

// Review-stage metadata endpoint only. Never started by dev:sharing or packaged
// in either app build. No clinical relay channels/keys are created here.
export function identityServer() {
  return createServer({ requestTimeout: 10000, headersTimeout: 10000, maxHeaderSize: 12000 }, async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff" });
      res.end(JSON.stringify(body));
    };
    // No browser access until protocol review and client integration. Host check
    // also prevents DNS-rebinding requests to this explicitly loopback service.
    if (req.headers.host !== "127.0.0.1:4180" || req.headers.origin || req.headers["sec-fetch-site"] ||
        req.socket.remoteAddress !== "127.0.0.1") return send(403, { ok: false, error: "Local developer identity endpoint only." });
    if (req.method !== "POST" || req.url !== "/v1/command" || req.headers["content-type"] !== "application/json")
      return send(404, { ok: false, error: "Unknown identity operation." });
    if (!req.headers.authorization?.startsWith("Bearer ")) return send(401, { ok: false, error: "Authentication required." });
    let size = 0;
    try {
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 12288) return send(413, { ok: false, error: "Identity request is too large." });
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!body || Object.keys(body).join() !== "signedCommand") throw Error("Invalid body.");
      const result = await processIdentityCommand(req.headers.authorization.slice(7), body.signedCommand);
      send(result.ok ? 200 : 403, result);
    } catch {
      // Never reflect signed requests, bearer credentials, verifiers or storage errors.
      send(403, { ok: false, error: "Identity operation was not confirmed. Check authority and retry safely." });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = identityServer();
  server.listen(4180, "127.0.0.1", () => console.log("Review-stage identity metadata service on 127.0.0.1:4180. Clinical delivery disabled."));
}
