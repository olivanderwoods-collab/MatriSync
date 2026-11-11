import {defineConfig} from "vitest/config";
export default defineConfig({test:{include:["tests-care/nfc-commit*.test.ts"],testTimeout:30000}});
