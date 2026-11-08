import { afterEach, expect, it, vi } from "vitest";
import {
  profileContextEnabled,
  saveProfileContextPreference,
} from "./preferences";
afterEach(() => vi.unstubAllGlobals());
it("retains an account's profile opt-out across reload without leaking it to another account or Guest", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  expect(profileContextEnabled("mother-a")).toBe(true);
  expect(saveProfileContextPreference("mother-a", false)).toBe(true);
  expect(profileContextEnabled("mother-a")).toBe(false);
  expect(profileContextEnabled("mother-b")).toBe(true);
  expect(profileContextEnabled()).toBe(false);
  expect(saveProfileContextPreference(undefined, true)).toBe(false);
  expect([...values.values()]).toEqual(["disabled"]);
  expect(saveProfileContextPreference("mother-a", true)).toBe(true);
  expect(profileContextEnabled("mother-a")).toBe(true);
});
it("fails closed when preferences are unavailable or malformed", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => "unexpected",
    setItem: () => {
      throw Error("blocked");
    },
  });
  expect(profileContextEnabled("mother-a")).toBe(false);
  expect(saveProfileContextPreference("mother-a", true)).toBe(false);
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw Error("blocked");
    },
  });
  expect(profileContextEnabled("mother-a")).toBe(false);
});
