export const PREFIX = "matrisync.demo.";
export const KEY = `${PREFIX}v1`;
export const roles = ["mother", "professional", "organization"] as const;
export type Role = (typeof roles)[number];
export type Theme = "light" | "dark" | "system";
export const languages = [
  "English",
  "Bengali",
  "Kannada",
  "Hindi",
  "Marathi",
] as const;
export type Language = (typeof languages)[number];
export interface DemoSession {
  version: 1;
  role: Role;
  theme: Theme;
  language: Language;
  profile?: { name: string; photo: string };
}
export interface StorageLike {
  length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export function seed(role: Role): DemoSession {
  return { version: 1, role, theme: "system", language: "English" };
}
export function valid(value: unknown): value is DemoSession {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    roles.includes(v.role as Role) &&
    ["light", "dark", "system"].includes(v.theme as string) &&
    languages.includes(v.language as Language) &&
    (v.profile === undefined || validProfile(v.profile))
  );
}
export function validProfile(value: unknown): value is { name: string; photo: string } {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return typeof p.name === "string" && p.name.trim().length > 0 && p.name.length <= 80 &&
    typeof p.photo === "string" && p.photo.length <= 250000 &&
    (p.photo === "" || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.photo));
}
export function createDemoStore(getStorage: () => StorageLike) {
  let memory: DemoSession | null = null;
  let warning = "";
  const failed = () => {
    warning =
      "Temporary mode: tab storage is unavailable. Your demo choices will not survive a reload.";
  };
  function clear() {
    memory = null;
    try {
      const s = getStorage();
      const keys = Array.from({ length: s.length }, (_, i) => s.key(i));
      keys.forEach((k) => {
        if (k?.startsWith(PREFIX)) s.removeItem(k);
      });
    } catch {
      failed();
    }
  }
  return {
    load() {
      try {
        const raw = getStorage().getItem(KEY);
        if (!raw) return memory;
        const parsed: unknown = JSON.parse(raw);
        if (!valid(parsed)) throw Error("invalid");
        memory = {
          version: 1,
          role: parsed.role,
          theme: parsed.theme,
          language: parsed.language,
          ...(parsed.profile ? { profile: parsed.profile } : {}),
        };
      } catch {
        clear();
        warning =
          "The previous demo could not be restored. Start a fresh demo; if tab storage is blocked, choices last only until reload.";
      }
      return memory;
    },
    save(value: DemoSession) {
      memory = value;
      try {
        getStorage().setItem(KEY, JSON.stringify(value));
      } catch {
        failed();
      }
      return value;
    },
    clear,
    warning: () => warning,
  };
}
export const demoStore = createDemoStore(() => window.sessionStorage);
