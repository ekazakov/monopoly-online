// `pnpm e2e:docker [playwright args]`: the browser suite against the production image.
// Playwright starts the container through `E2E_TARGET=docker` (see `playwright.config.ts`). This
// script runs it, then removes the container whatever the result, and exits with the code of the
// tests. Run it from the repository root or from `apps/e2e`; port 8787 must be free.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");

const tests = spawnSync("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)], {
  cwd: resolve(here, ".."),
  stdio: "inherit",
  env: { ...process.env, E2E_TARGET: "docker" },
});

// Remove the stopped container and its network. It is safe when nothing is there.
const cleanup = spawnSync("docker", ["compose", "--profile", "e2e", "down"], {
  cwd: root,
  stdio: "inherit",
});
if (cleanup.status !== 0) console.error("docker compose down failed: remove the container by hand");

process.exit(tests.status ?? 1);
