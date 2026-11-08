import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("public shell update waits for consent, preserves Guest state and works offline", async ({
  page,
  context,
}) => {
  // Serve two revisions of the built public shell without changing dist or the user's preview.
  let revision = 1;
  const root = path.resolve("dist");
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || "/", "http://localhost").pathname;
      const asset = path.extname(pathname) ? pathname : "/index.html";
      const file = path.resolve(root, `.${asset}`);
      if (!file.startsWith(root + path.sep)) {
        response.writeHead(403).end();
        return;
      }
      let content = await readFile(file);
      if (asset === "/index.html") {
        content = Buffer.from(
          content
            .toString()
            .replace(
              /<title>.*?<\/title>/,
              `<title>MatriSync test revision ${revision}</title>`,
            ),
        );
      }
      if (asset === "/sw.js") {
        content = Buffer.from(
          content
            .toString()
            .replace(
              /matrisync-shell-[a-f0-9]+/,
              `matrisync-shell-test-${revision}`,
            ),
        );
      }
      const type =
        {
          ".js": "application/javascript",
          ".html": "text/html",
          ".css": "text/css",
          ".png": "image/png",
          ".webmanifest": "application/manifest+json",
        }[path.extname(file)] || "application/octet-stream";
      response
        .writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" })
        .end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server address");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await page.goto(`${base}/auth/login?role=mother`);
    await page.getByRole("button", { name: "Continue as Guest" }).click();
    await page.goto(`${base}/mother/more/appearance`);
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await page.goto(`${base}/mother/children/arun/reports`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await expect(page).toHaveTitle("MatriSync test revision 1");
    const guestBefore = await page.evaluate(() =>
      sessionStorage.getItem("matrisync.demo.v1"),
    );
    revision = 2;
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.ready).update();
    });
    await expect(
      page.getByRole("button", { name: "Update now" }),
    ).toBeVisible();
    await expect(page).toHaveTitle("MatriSync test revision 1");
    await page.getByRole("button", { name: "Update now" }).click();
    await expect(page).toHaveTitle("MatriSync test revision 2");
    await expect(
      page.getByRole("heading", { name: "Arun · Growth visit summary" }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(
      await page.evaluate(() => sessionStorage.getItem("matrisync.demo.v1")),
    ).toBe(guestBefore);
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .toEqual(["matrisync-shell-test-2"]);
    await context.setOffline(true);
    await page.reload();
    await expect(page).toHaveTitle("MatriSync test revision 2");
    await expect(
      page.getByRole("heading", { name: "Arun · Growth visit summary" }),
    ).toBeVisible();
  } finally {
    await context.setOffline(false);
    await page.goto("about:blank");
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
