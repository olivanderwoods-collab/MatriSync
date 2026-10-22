import type { DemoDatabase } from "./medicine";
export async function load(): Promise<DemoDatabase> {
  throw new Error("The draft database is excluded from this build.");
}
