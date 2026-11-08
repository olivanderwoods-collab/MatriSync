import { afterEach, describe, expect, it, vi } from "vitest";
import { identityTransaction } from "../scripts/identity/local-store.mjs";
afterEach(() => vi.unstubAllGlobals());
describe("identity transaction error handling", () => {
  it("retries an abort embedded in batchGet and carries the previous transaction context", async () => {
    const replies = [
      { transaction: "first" }, [{ error: { code: 10, status: "ABORTED" } }], {},
      { transaction: "second" }, [{ missing: "projects/demo-matrisync/databases/(default)/documents/identityOwners/test" }], {},
    ];
    const calls = [];
    vi.stubGlobal("fetch", async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return new Response(JSON.stringify(replies.shift()), { status: 200 });
    });
    await identityTransaction(async tx => {
      expect(await tx.get("identityOwners/test")).toBeUndefined();
      tx.put("identityOwners/test", { identityId: "example" }, true);
    });
    expect(calls[3].body.options.readWrite.retryTransaction).toBe("first");
    expect(calls.filter(c => c.url.endsWith(":commit"))).toHaveLength(1);
    expect(calls[5].body.writes[0].currentDocument).toEqual({ exists: false });
    expect(replies).toHaveLength(0);
  });
  it("does not automatically replay an ambiguous commit response", async () => {
    let commits = 0;
    vi.stubGlobal("fetch", async url => {
      if (url.endsWith(":beginTransaction")) return new Response(JSON.stringify({ transaction: "first" }));
      if (url.endsWith(":commit")) { commits++; throw Error("Connection lost after commit."); }
      return new Response("{}");
    });
    await expect(identityTransaction(tx => tx.put("identityOwners/test", { identityId: "example" }, true))).rejects.toThrow("Connection lost");
    expect(commits).toBe(1);
  });
  it("rejects path escape and reads after writes before contacting the relay", async () => {
    const calls = [];
    vi.stubGlobal("fetch", async url => {
      calls.push(url);
      return new Response(JSON.stringify(url.endsWith(":beginTransaction") ? { transaction: "first" } : {}));
    });
    await expect(identityTransaction(tx => tx.get("identityOwners/../other"))).rejects.toThrow("Invalid identity storage path");
    await expect(identityTransaction(async tx => { tx.put("identityOwners/test", {}); await tx.get("identityOwners/test"); })).rejects.toThrow("Read identity authority");
    expect(calls.some(url => url.endsWith(":batchGet") || url.endsWith(":commit"))).toBe(false);
  });
});
