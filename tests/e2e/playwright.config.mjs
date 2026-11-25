import { defineConfig } from '@playwright/test';
import { BASE, CHROME } from './env.mjs';
export default defineConfig({
  testDir: './specs',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalSetup: './global-setup.mjs',
  use: { baseURL: BASE, storageState: '.auth/state.json', launchOptions: { executablePath: CHROME } },
});
