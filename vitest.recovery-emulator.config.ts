import {defineConfig} from "vitest/config";
export default defineConfig({test:{include:["tests-care/recovery-authorization.integration.ts","tests-care/recovery-transport.integration.ts"],fileParallelism:false,testTimeout:60000,hookTimeout:30000}});
