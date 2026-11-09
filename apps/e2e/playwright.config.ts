import { defineConfig, devices } from "@playwright/test";
import { E2E_SEED } from "./support/seed.ts";

const API_PORT = 8787;
const WEB_PORT = 5173;

/**
 * What the browser tests run against, from `E2E_TARGET`:
 * - `source` (default): the API from the source on 8787 and the Vite dev server on 5173. The browser
 *   uses 5173, which proxies `/api`.
 * - `docker`: the production image (`docker compose --profile e2e`) on 8787 only. The API serves the
 *   web build, so there is one origin and no web server on 5173. `pnpm e2e:docker` sets it.
 */
const target = process.env.E2E_TARGET ?? "source";
if (target !== "source" && target !== "docker") {
  throw new Error(`E2E_TARGET must be "source" or "docker", got "${target}"`);
}
const docker = target === "docker";

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
    baseURL: `http://localhost:${docker ? API_PORT : WEB_PORT}`,
    // A stuck click fails here with its own error, and it does not use up the whole test.
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Reduced motion skips the waits for the dice and the tokens. `motion.spec.ts` keeps the animated path.
    contextOptions: { reducedMotion: "reduce" },
    // The software-rendered 3D board makes the whole run about 30 s slower, and the tests use only
    // the DOM controls. The app then shows its no-WebGL board. `motion.spec.ts` keeps the real board.
    launchOptions: {
      args: ["--disable-3d-apis"],
    },
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
  webServer: docker
    ? [
        {
          // `compose.yaml` makes the image and runs it with the test settings and a new in-memory
          // database. Playwright stops it with SIGTERM: Compose then stops the container, which
          // shuts the API down, and `scripts/e2e-docker.ts` removes it. The first run builds the image.
          command:
            "docker compose --profile e2e up --build --force-recreate --abort-on-container-exit e2e",
          cwd: "../..",
          url: `http://localhost:${API_PORT}/api/ready`,
          reuseExistingServer: false,
          timeout: 300_000,
          gracefulShutdown: { signal: "SIGTERM", timeout: 20_000 },
          // The seed of the container is the seed of the scenarios (`compose.yaml` reads it).
          env: { E2E_SEED: String(E2E_SEED) },
        },
      ]
    : [
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
            GUEST_SIGN_IN_ENABLED: "true",
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
