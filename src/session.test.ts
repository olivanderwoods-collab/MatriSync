import { describe, it, expect } from "vitest";
import { createDemoStore, seed, KEY, type StorageLike } from "./session";
function storage(): StorageLike {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] || null,
    getItem: (k) => map.get(k) || null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}
describe("Guest session boundary", () => {
  it("restores same-tab preferences and role", () => {
    const s = storage();
    createDemoStore(() => s).save({
      ...seed("mother"),
      theme: "dark",
      language: "Bengali",
    });
    expect(createDemoStore(() => s).load()).toEqual({
      ...seed("mother"),
      theme: "dark",
      language: "Bengali",
    });
  });
  it("clears every demo namespace key while preserving unrelated app state", () => {
    const s = storage();
    s.setItem("other.app", "keep");
    s.setItem("matrisync.demo.old", "old");
    const store = createDemoStore(() => s);
    store.save(seed("professional"));
    store.clear();
    expect(store.load()).toBeNull();
    expect(s.length).toBe(1);
    expect(s.getItem("other.app")).toBe("keep");
  });
  it("rejects invalid roles and corrupt storage without crashing", () => {
    for (const raw of [
      "bad json",
      JSON.stringify({
        version: 1,
        role: "admin",
        theme: "light",
        language: "English",
      }),
    ]) {
      const s = storage();
      s.setItem(KEY, raw);
      const store = createDemoStore(() => s);
      expect(store.load()).toBeNull();
      expect(store.warning()).toContain("could not be restored");
      expect(s.getItem(KEY)).toBeNull();
    }
  });
  it("keeps a disclosed memory fallback when storage is blocked", () => {
    const store = createDemoStore(() => {
      throw Error("blocked");
    });
    expect(store.load()).toBeNull();
    store.save(seed("organization"));
    expect(store.warning()).toContain("will not survive a reload");
  });
  it("separate tab stores do not share demo state", () => {
    const a = storage(),
      b = storage();
    createDemoStore(() => a).save(seed("mother"));
    expect(createDemoStore(() => b).load()).toBeNull();
  });
  it("reset returns defaults and discards old preferences", () => {
    const s = storage(),
      store = createDemoStore(() => s);
    store.save({ ...seed("mother"), theme: "dark" });
    store.clear();
    store.save(seed("mother"));
    expect(store.load()?.theme).toBe("system");
  });
});
