import { defineConfig } from "@playwright/test";
import { BASE, CHROME } from "./env.mjs";
export default defineConfig({
  testDir: "./specs",
  // 05-08 need BOTH apps on one DB; only run-integration.sh (which sets E2E_PUBLIC) runs them.
  testIgnore: process.env.E2E_PUBLIC ? [] : [/0[5678]-.*\.spec\.mjs$/],
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./global-setup.mjs",
  use: {
    baseURL: BASE,
    storageState: ".auth/state.json",
    launchOptions: { executablePath: CHROME },
  },
});
