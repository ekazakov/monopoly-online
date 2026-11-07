# Agent instructions

These instructions apply to the whole repository. Keep shared project guidance in this file. `CLAUDE.MD` imports it for Claude Code.

## Communication

Write responses in ASD-STE100 Simplified Technical English. Use the terms in [GLOSSARY.md](GLOSSARY.md). The product name is Harborfront; the repository and package names use Monopoly.

## Project map

This is a pnpm workspace for a browser property-trading game. It supports remote players and hot-seat players on a shared device.

| Path                   | Responsibility                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `apps/web`             | React, TanStack Router and Query, and the three.js board through React Three Fiber and drei.                     |
| `apps/api`             | Hono on Node, cookie sessions, rooms, game actions, SSE, presence, and SQLite through Kysely and better-sqlite3. |
| `packages/game-engine` | Pure TypeScript game rules, a reducer, and seeded random numbers. No I/O.                                        |
| `packages/shared`      | Zod schemas and types for requests, responses, errors, redacted state, and stream messages.                      |
| `apps/e2e`             | Playwright browser tests with a dedicated database and seeded API server.                                        |
| `artifacts`            | Standalone copies of the design system and game screen prototype.                                                |
| `plan`                 | Game rules, API contracts, design specifications, and milestone task lists.                                      |

Read the relevant documents before a change:

- [README.md](README.md): setup and common commands.
- [Game engine README](packages/game-engine/README.md) and [game rules](plan/game-rules-reference.md): engine design and rules.
- [Implementation roadmap](plan/implementation-roadmap.md) and [API schema](plan/api-schema.md): planned scope and API contracts.
- [Milestone 3 tasks](plan/milestone-3-tasks.md) and [E2E test plan](plan/e2e-test-plan.md): session, presence, save and restore, and browser test work.

Some documents describe work before it was built. Check the source and tests before treating a plan or a README statement as current behavior. The engine is connected to the API and web app. Milestone 3 has session and presence support, but its task list still has open browser tests and close tasks. The autopilot for away players is postponed.

## Tools

Use Serena MCP tools for code work when they are available.

- At the start of a session with Serena, activate `monopoly-online` and read `initial_instructions` before code work.
- Use `get_symbols_overview`, `find_symbol`, and `find_referencing_symbols` to find and read code. Avoid whole-file reads when a symbolic tool can answer.
- Use symbolic edit tools such as `replace_symbol_body`, `insert_before_symbol`, `insert_after_symbol`, `rename_symbol`, and `safe_delete_symbol` when they fit.
- Use normal file tools for Markdown, JSON, and configuration. If Serena is unavailable or cannot do the job, state the reason and use the available file and shell tools. Prefer `rg` for text and file searches.

<!-- groma:start -->

## Groma

This project uses Groma. Before you scan, inspect, or curate architecture, or change files for a Backlog task, run `groma agent-instructions` and read the guide it names for that job. When it reports a first scan, ask the user whether they want you to curate the architecture. Do not edit Groma-owned architecture files directly.
<!-- groma:end -->

## Setup and commands

Use Node 26 from `.nvmrc` (the declared minimum is Node 24) and pnpm 12.15.0 from `package.json`. Shared dependency versions are in the `pnpm-workspace.yaml` catalog. Use pnpm and the local Vite+ CLI; do not add a second lockfile or require a global `vp` install.

Do not set `--use-openssl-ca` and `--use-system-ca` together in `NODE_OPTIONS`.

Run these commands from the repository root:

| Command                                                     | Purpose                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm install`                                              | Install workspace dependencies.                                                            |
| `pnpm dev`                                                  | Start web on port 5173 and API on port 8787. The web server proxies `/api`.                |
| `pnpm check`                                                | Check formatting, lint, and types through Vite+.                                           |
| `pnpm test`                                                 | Run workspace unit and integration tests. Does not run Playwright.                         |
| `pnpm --filter @monopoly/game-engine test`                  | Run one package's tests; use the corresponding package name for API, web, or shared tests. |
| `pnpm build`                                                | Build the apps.                                                                            |
| `pnpm ready`                                                | Run checks, unit and integration tests, and builds.                                        |
| `pnpm openapi`                                              | Regenerate `apps/api/openapi.json` from the API routes.                                    |
| `pnpm e2e`                                                  | Run the Playwright browser suite.                                                          |
| `pnpm e2e:ui` / `pnpm e2e:video` / `pnpm e2e:report`        | Open the test UI, record videos, or open the last HTML report.                             |
| `pnpm artifact:game-screen` / `pnpm artifact:design-system` | Serve the local artifacts on ports 8791 and 8792.                                          |

For a format fix, use `pnpm exec vp fmt <changed-files>`. Avoid formatting unrelated files. Import test helpers from `vite-plus/test`, as the existing tests do.

Before browser tests, install Chromium with `pnpm --filter @monopoly/e2e exec playwright install chromium` if needed. Stop the normal dev servers first: Playwright requires ports 5173 and 8787 and does not reuse running servers. Its setup deletes `apps/e2e/.data` and creates a test database. Keep that database separate from development data. The test seed and short presence grace time must stay disabled in production.

The development database defaults to `apps/api/data/monopoly.db`. `DB_PATH` overrides it. Migrations run at API start. `pnpm db:purge` deletes the configured database and its sidecar files; use it only when a data reset is requested.

## Architecture rules

- Keep `packages/game-engine` pure and deterministic. Do not add a database, HTTP, a clock, or `Math.random`. Keep its state plain JSON and do not mutate the input state. Use its seeded random state for dice and decks.
- The server is the authority for actions. The web game store consumes server state and events; it does not run an optimistic game reducer. Use engine exports for static board data and rule queries where the existing web code does so.
- Keep random state and deck order on the server. Use `apps/api/src/game/redact.ts` and the shared redacted-state schema for state sent to devices.
- Preserve per-game action serialization, `expectedVersion` checks, and `clientActionId` retry behavior. Commit game metadata, events, and snapshots in one transaction. Update the loader and publish messages after the commit.
- Save and Finish from an active game roll back to the turn-start snapshot and advance the version. Restore keeps that saved version. Preserve this behavior in the loader, SSE resume, and web store.
- Keep REST access in the web API helpers, using the typed Hono `client` and `unwrap` from `apps/web/src/api.ts`. Use TanStack Query for REST data and the realtime client and game store for SSE state.
- Add API schemas to `packages/shared/src` and export them from `index.ts`. Keep engine actions, events, errors, and redacted state in step with the shared schemas and `drift.test.ts`.
- Add routes to the chain in `apps/api/src/app.ts` to preserve the exported `AppType`. Use the existing validation and error handlers and the shared error format.
- Add database migrations with a new key that sorts after the last key in `apps/api/src/db/migrations.ts`. Do not edit migrations that have already run. Update `apps/api/src/db/schema.ts` and keep SQL portable.
- Use strict TypeScript, ESM, explicit type imports, and `.ts` extensions for TypeScript imports, as the existing code does. Shared and engine packages export source without a separate build step. Use syntax that Node can strip.

## Design and artifacts

Use the existing tokens in `apps/web/src/styles/tokens.css`, game screen specifications, and artifact references for UI work. Preserve the reduced-motion and no-WebGL paths when changing the board or animations.

When the game screen prototype or design system changes, sync the corresponding local copies in `artifacts/`. Ask before saving a new artifact or adding or changing a design board. The toolchain excludes `artifacts/` from formatting and linting; check these copies with their local servers.

## Validation and commits

- Keep changes focused. Update the relevant documentation and mark a milestone task complete when the work satisfies it.
- Run checks and tests that cover the change. Run `pnpm check` and `pnpm test` before committing. Run `pnpm build` for changes that affect bundling or package exports, and the relevant Playwright tests for browser flows. Report any check that could not run.
- For controller, DTO, or API schema changes, run `pnpm openapi` and include the regenerated `apps/api/openapi.json` in the same commit.
- Use Conventional Commits: `<type>(<optional scope>): <description>`. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Use an imperative, lowercase description, no trailing period, and a header of at most 72 characters. Scopes name the area, for example `api`, `web`, `auth`, `db`, or `deps`.
- Mark a breaking change with `!` after the type or scope and a `BREAKING CHANGE:` footer. An optional body explains why. Keep one logical change per commit.
- Never commit `.env` files, SQLite databases or sidecars (`*.db-journal`, `*.db-shm`, `*.db-wal`), browser test results, or generated reports.
