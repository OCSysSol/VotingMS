import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173";
const isDeployed = !!process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Use 3 parallel workers when testing against a deployed URL in CI.
  // The Lambda is warm after global-setup so concurrent workers are safe.
  // Fall back to 1 worker for local CI runs without a deployed URL (rare),
  // and use the Playwright default (# CPUs) for local dev.
  workers: process.env.CI ? (isDeployed ? 3 : 1) : undefined,
  reporter: "html",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    ignoreHTTPSErrors: true,
  },
  projects: [
    // Admin tests — reuse authenticated session created by globalSetup
    {
      name: "admin",
      testMatch: /e2e\/admin\/.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
    },
    // Public / voting tests — use bypass cookie only (no admin session)
    {
      name: "public",
      testMatch: /e2e\/(smoke|voting-flow)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/public.json",
      },
    },
  ],
  // Only spin up the local dev server when not testing against a deployed URL
  webServer: isDeployed
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
      },
});
