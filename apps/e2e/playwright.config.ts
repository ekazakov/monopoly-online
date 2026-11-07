import { defineConfig, devices } from "@playwright/test";
import { E2E_SEED } from "./support/seed.ts";

const API_PORT = 8787;
const WEB_PORT = 5173;

/** The API test flags are documented in `apps/api/src/index.ts`. */
export default defineConfig({
  testDir: "./tests",
  // One server and one database for the whole run, so the tests run one after another.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "./.results",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    // A stuck click fails here with its own error, and it does not use up the whole test.
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Reduced motion skips the waits for the dice and the tokens. `motion.spec.ts` keeps the animated path.
    contextOptions: { reducedMotion: "reduce" },
    // The software-rendered 3D board makes the whole run about 30 s slower, and the tests use only
    // the DOM controls. The app then shows its no-WebGL board. `motion.spec.ts` keeps the real board.
    launchOptions: { args: ["--disable-3d-apis"] },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 960 },
      },
    },
  ],
  webServer: [
    {
      // The database is removed in the command, before the API opens it. Not in a global setup, which
      // runs after the web servers have started.
      command: "rm -rf ../e2e/.data && node --experimental-strip-types src/index.ts",
      cwd: "../api",
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: "development",
        PORT: String(API_PORT),
        DB_PATH: "../e2e/.data/e2e.db",
        GAME_SEED: String(E2E_SEED),
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
