import { defineConfig, devices } from "@playwright/test";

const API_PORT = 8787;
const WEB_PORT = 5173;

/** The API test flags are documented in `apps/api/src/index.ts`. */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  // One server and one database for the whole run, so the tests run one after another.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  outputDir: "./.results",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // The tests use the DOM controls only. Without WebGL the app shows its no-WebGL board, and two
    // software-rendered 3D boards would slow the whole run.
    launchOptions: { args: ["--disable-3d-apis"] },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 960 } },
    },
  ],
  webServer: [
    {
      command: "node --experimental-strip-types src/index.ts",
      cwd: "../api",
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: "development",
        PORT: String(API_PORT),
        DB_PATH: "../e2e/.data/e2e.db",
        GAME_SEED: "7",
        PRESENCE_GRACE_MS: "2500",
      },
    },
    {
      command: "pnpm dev",
      cwd: "../web",
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
    },
  ],
});
