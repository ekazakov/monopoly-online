# Harborfront: Milestone 5 tasks (observability and Docker)

|                |                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Companion docs | [implementation-roadmap.md](implementation-roadmap.md) (sections 8 and 9), [api-schema.md](api-schema.md), [e2e-test-plan.md](e2e-test-plan.md), [milestone-4-tasks.md](milestone-4-tasks.md) |
| Status         | Done. Last updated 2026-11-12 |

**Goal.** On the local machine, the API writes structured logs and sends metrics, logs and traces to a local Grafana stack. The app runs from one Docker image, and the browser suite passes against that image. M6 can then deploy the same image.

**Done when** these steps pass on `localhost`:

1. `docker compose up` starts the app and the Grafana stack. The web app opens on `http://localhost:8787`, served by the API.
2. Play a short game. Grafana (`http://localhost:3000`) shows the HTTP, realtime and runtime metrics on the Harborfront dashboard, the log lines with their trace ids, and the traces of the game actions.
3. `docker compose stop` stops the API cleanly before the stop timeout. The log shows each shutdown step.
4. `pnpm e2e:docker` passes against the prod image.
5. `pnpm check`, `pnpm test` and `pnpm e2e` stay green.

## Scope rules

- In M5: logs, metrics, traces, the local Grafana stack and dashboard, readiness and graceful shutdown, the static web build served by the API, the Docker image, docker compose, and the browser suite on the image. Added 2026-11-12: browser preferences, the light theme, the owner marker, and the Russian translation (section E).
- Not in M5:
  - Deployment, the VPS, nginx, the domain, Grafana Cloud, alerts and backups (M6).
  - Cloudflare proxy, Tunnel, Access and the Access JWT check (M7).
  - CI. It is in "Later" in the roadmap.
  - Game metrics (active games, action count and duration, refused actions). Decided 2026-11-08. Traces can still have an `applyAction` span.
  - Browser logs and browser telemetry.
- No engine change. `packages/game-engine` stays pure: all logs and spans are in `apps/api`.
- Do not start telemetry in `createApp`. The API tests must not start an exporter.
- Keep the shared error format and the typed route chain in `app.ts` (`AppType`).
- Each task: small, own commit (Conventional Commits), `pnpm check` and `pnpm test` green. Controller or DTO changes regenerate `apps/api/openapi.json` (`pnpm openapi`).
- New dependencies go in the `pnpm-workspace.yaml` catalog. Check the current docs (context7) before you use the OpenTelemetry, pino and Hono packages.
- Never commit `.env` files, SQLite databases, Grafana data or test reports.
- Task names: the name comes first, the task code follows in parentheses.

## Decisions

| Topic | Decision |
| --- | --- |
| Logger | pino. JSON lines to stdout. `pino-pretty` in development. No log file. API only |
| Log level | `LOG_LEVEL`. Default `info`, and `debug` in development |
| Log events | See "Log events" below |
| Telemetry | OpenTelemetry Node SDK with OTLP export: metrics, logs and traces |
| Telemetry switch | On only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Off in unit tests. The standard `OTEL_*` variables set the service name and the sampling (ratio 1.0 on the local machine) |
| Local stack | One `grafana/otel-lgtm` container: OpenTelemetry Collector, Prometheus, Loki, Tempo and Grafana. M6 changes only the endpoint, the headers and the sampling |
| Metrics | See "Metrics" below. No game metrics |
| Dashboard | One dashboard file in `ops/grafana/`, loaded into the local Grafana at start. M6 imports the same file. Alerts in M6 |
| Request id | `X-Request-Id` on each response and in each log line. The API uses the incoming value when it is a short safe string, or else makes a new one |
| Privacy | pino removes cookies, `Authorization`, session tokens, and the OAuth `code` and `state`. No IP address or user agent in spans or logs. No email. The display name is permitted |
| Health | `/api/health` stays the liveness check. New `/api/ready` checks the database and the migrations. The compose health check uses `/api/ready` |
| Shutdown | On SIGTERM and SIGINT: stop new requests, close the SSE streams and the presence timers, wait for open actions, flush telemetry, close the database, exit. A time limit stops a slow shutdown |
| Web serving | The API serves `apps/web/dist` with `serveStatic` and a fallback to `index.html` for app routes. Not for `/api/*`. One origin, one process |
| Image | One `Dockerfile` on `node:26-slim` (glibc, so the `better-sqlite3` binaries work). Stages: deps, build, `dev`, `prod` |
| Prod target | The `pnpm deploy --prod` output for `@monopoly/api`, `dist/index.mjs`, and the web `dist`. Non-root user. `CMD ["node", …]` in exec form, so SIGTERM gets to Node. SQLite at `/data` (a volume) |
| One prod image | The same image runs locally, in `pnpm e2e:docker` and on the VPS (M6). Only environment variables are different |
| Dev target | All dependencies and the source mounted from the host, `pnpm dev` with hot reload. Never deployed |
| Compose | `compose.yaml` in the repository root. Default profile: app (prod target) and otel-lgtm. `dev` profile: dev target and otel-lgtm. `e2e` profile: the prod image with the test settings |
| Browser suite on the image | New `pnpm e2e:docker`. `pnpm e2e` on the source stays the default |
| Preferences | Motion, theme and language are device settings. The browser keeps them in `localStorage` (keys `hf.motion`, `hf.theme`, `hf.lang`). No server storage and no account link. Each has the value `system`, which follows the device. The sound setting already uses the same pattern |
| Theme | Values `system`, `light` and `dark`. The root element has `data-theme`. All colours come from the tokens in `apps/web/src/styles/tokens.css`. A small script in `index.html` sets `data-theme` before the first paint |
| Language | Values `system`, `en` and `ru`. `system` reads `navigator.languages`, and any Russian tag gives `ru`, or else `en`. The root element has `lang`. Only the web app is translated. The API keeps its error codes, and the web app maps each code to a text |

### Log events

| Area | Events |
| --- | --- |
| HTTP | One line for each request: method, route template, status, duration, request id. SSE requests log open and close |
| Game actions | Applied and refused actions: game id, seat id, action type, version, error code, duration. `expectedVersion` conflicts, and repeats of a `clientActionId` |
| Lifecycle | Start, migrations applied, Save, Finish, Restore, automatic save |
| Presence | Changes to online, reconnecting and away |
| Auth | Sign-in, sign-out, Google failures. No tokens, no email |
| SSE | Stream open and close, resume with events or with a snapshot, bus handler failures |
| Start and shutdown | The settings summary at start (sign-in methods, telemetry on or off, database path, no secrets), each shutdown step |
| Process faults | `unhandledRejection` and `uncaughtException` at `fatal`, then exit |

### Metrics

| Area | Metrics |
| --- | --- |
| Realtime | Open SSE streams, connected devices, reconnects, resume with events or with a snapshot, devices in each presence state, automatic saves |
| HTTP | Request count and duration by route template, method and status |
| Runtime | Event loop delay, memory, garbage collection |
| Database | Query duration, database file size |

## Tasks

Mark a task `[x]` in the commit that completes it.

### A. Docs

- [x] **Milestone 5 docs (A1).** This list. The roadmap: the M5, M6 and M7 rows, sections 7 to 11, and the change log. The `e2e-test-plan.md` CI notes moved to Later. The README, the AGENTS.md command table and project map, and the glossary.

### B. Logging

- [x] **Logger module (B1).** `apps/api/src/log.ts`: a pino logger with the level from `LOG_LEVEL`, pretty output in development, and the redaction rules. Add the logger to the app dependencies (`AppDeps`), so the tests give a silent logger. `index.ts` makes the real logger.
- [x] **Request id and request log (B2).** A middleware sets `X-Request-Id` and a child logger for each request. One log line for each request, with the route template and not the raw path. SSE open and close lines. Tests: the header is on each response; an incoming safe id is kept.
- [x] **Replace console calls (B3).** Change each `console.*` call in `apps/api/src` to the logger, with structured fields (game id, topic, error). Files: `errors.ts`, `app.ts`, `index.ts`, `game/service.ts`, `game/lifecycle.ts`, `realtime/bus.ts`, `realtime/resume.ts`, `rooms/service.ts`, `routes/auth.ts`, `db/migrations.ts`.
- [x] **Domain log events (B4).** The game action, lifecycle, presence, auth and SSE events in "Log events". Tests with a memory logger for one event in each area.
- [x] **Start and shutdown (B5).** The settings summary at start. The process fault handlers. Graceful shutdown in `index.ts`: `server.close()` waits for open streams, so close the SSE streams and the presence timers first. Then wait for open actions, flush telemetry and close the database, with a time limit. Test the shutdown function without a real signal.

### C. Telemetry

- [x] **OpenTelemetry bootstrap (C1).** `apps/api/src/telemetry.ts` starts the Node SDK with OTLP exporters for traces, metrics and logs. Load it with `node --import` before `index.ts`, in the `dev` and `start` scripts and in the image. Off when `OTEL_EXPORTER_OTLP_ENDPOINT` is not set. Keep pino and the OpenTelemetry packages external in `vp pack`, because the instrumentation patches modules when they load, and it cannot patch bundled code.
- [x] **Traces (C2).** HTTP spans from a Hono OpenTelemetry middleware, with the route template. Remove the client IP and the user agent from the span attributes. A Kysely plugin makes query spans (Kysely and `better-sqlite3` have no official instrumentation). An `applyAction` span with the game id and version.
- [x] **Logs bridge (C3).** pino lines go through OpenTelemetry with the trace and span ids. The stdout lines also have these ids.
- [x] **Metrics (C4).** The metrics in "Metrics". The database file size is an observable gauge. Presence and SSE counts come from the existing tracker and stream code. Tests read the values with an in-memory metric reader.
- [x] **Readiness route (C5).** `GET /api/ready`: 200 when a database query works and the migrations are applied, or else 503. A shared schema in `packages/shared`, the route in the chain in `app.ts`, and `pnpm openapi`.

### D. Docker

- [x] **Static web serving (D1).** `serveStatic` for the web build, and a fallback to `index.html` for app routes. Mount it after the typed route chain, so `AppType` does not change and an unknown `/api/*` path still gets the JSON 404 error. The path comes from `WEB_DIST_DIR`; when it is not set, the API serves no web files (as now). Tests: an app route gets `index.html`; `/api/unknown` gets the JSON error.
- [x] **Dockerfile (D2).** The stages in "Decisions". pnpm through Corepack with the version from `package.json`. A `.dockerignore`: no `.env`, no databases, no `node_modules`, no `dist`, no test results and reports, no `.git`.
- [x] **Compose (D3).** `compose.yaml` with the three profiles. App: port 8787, the `/data` volume, an env file, the health check on `/api/ready`, `OTEL_EXPORTER_OTLP_ENDPOINT` to otel-lgtm. otel-lgtm: Grafana on port 3000 and the dashboard mount. `dev` profile: a `node_modules` volume in the container, because the macOS `better-sqlite3` build does not load on Linux, and Vite listens on `0.0.0.0`.
- [x] **Dashboard (D4).** `ops/grafana/dashboards/harborfront.json` and its provisioning file. Panels: realtime, HTTP, runtime and database, and a log panel with links to traces.
- [x] **Browser suite on the image (D5).** `pnpm e2e:docker`. The Playwright config reads the server mode from an environment variable: one origin on port 8787 and no web server on 5173. The `e2e` profile runs the prod image with `NODE_ENV=development`, `GUEST_SIGN_IN_ENABLED=true`, `GAME_SEED`, `PRESENCE_GRACE_MS`, and a new database on each run (tmpfs). This tests the build and the static web serving, not the production settings: the production guards refuse these test flags. The image has no `pino-pretty` (a dev dependency), and `NODE_ENV=development` turns on pretty logs: D5 needs a way to keep JSON logs there, for example a `LOG_PRETTY=false` setting.

### E. Interface preferences

These tasks change `apps/web`. They do not depend on sections B to D. Do them in the order shown.

- [x] **Browser preferences (E1).** One module for the device settings: motion, sound, theme and language. Today `styles/motionPreference.ts` and `audio/soundPreference.ts` each read and write `localStorage` on their own. Move the shared parts into one helper: a safe read when storage is blocked, a write, a `storage` event listener so other tabs stay in step, and a `useSyncExternalStore` hook. Keep the keys `hf.motion` and `hf.sound` and their stored values, so no user loses a choice. The Menu keeps the "no motion" switch. Tests: a blocked storage, a bad stored value, and a change in another tab.
- [x] **Light theme (E2).** Depends on Browser preferences (E1). Add a light value for each token in `tokens.css`, under `[data-theme="light"]`, and remove any colour that is fixed in a component or in `styles.css`. Check the board: the three.js scene (background, light, board material, fog), the property-group colours and the player colours on both themes, and the no-WebGL path. A theme switch in the Menu with three values: system, light and dark. A script in `index.html` sets `data-theme` before the first paint, so there is no flash. Update `<meta name="color-scheme">` and `theme-color`. Contrast: text at least 4.5:1, and the board squares readable on both themes. Sync the design system and game screen copies in `artifacts/` (ask before you change a design board). Tests: the stored value wins over the device, `system` follows `prefers-color-scheme`, and the Menu switch changes `data-theme`.
- [x] **Colour collisions (E3).** Player colours are close to property-group colours, so the owner marker on a square cannot rely on colour. Decided 2026-11-12 (game screen spec, question 5 and R-B4): the group bar stays on the inner edge. The owner marker at the outer edge becomes a neutral band with the owner's avatar glyph in a chip and the price beside it. The owner colour is only a thin ring around the glyph. A mortgaged deed dims the ring and the glyph. The avatar icons in `screens/game/rail/avatars.tsx` become shape data, so the SVG icons and the board canvas draw the same glyphs. Done when an owner can be told from the glyph alone, with a colour-blindness simulator, and the chip does not cover the price. The light theme check of the chip is part of Light theme (E2). Rejected: a chip without the neutral band, patterns for each player, a new palette alone (the game has at most six players), and an owner-colour outline.
- [x] **Language support (E4).** Depends on Browser preferences (E1). Decided 2026-11-12: an own small module in `apps/web/src/i18n/`, not `react-i18next`. Typed catalogues give the type check for free, and `Intl.PluralRules` gives the plural forms. No new dependency. Language is `system`, `en` or `ru`. `system` reads `navigator.languages`. Any Russian tag gives `ru`, and everything else gives `en`. A language switch in the Menu. Set the `lang` attribute on the root element. Build the translation catalogue in `apps/web/src/i18n/` with a typed key list, so a missing key fails `pnpm check`. Format numbers, money and dates with `Intl` and the active language. Plural forms must follow the Russian rules (one, few, many, other). Tests: detection, the stored choice, a switch at run time, and a plural case.
- [x] **Extract English text (E5).** Depends on Language support (E4). Move each fixed text in the web app to the catalogue: screens, the Menu, modals, toasts, the action bar, the log of game events, the card and square names, and `aria-label` and `title` texts. Map each API error code (`packages/shared`) to a text in the web app, and keep a fallback to the code. Names that players type (display names, room names) stay as typed. Keep `Harborfront` as the product name in both languages. Check that the board labels still fit on the squares. Tests: the existing web tests still pass with the `en` catalogue.
  - Done. `ru.ts` holds English copies of the new keys until Russian translation (E6), and a text that equals the English one is not translated yet.
  - These texts stay English: the debug panel, the debug lines of the log, and the server messages of `invalid_bid` and `invalid_trade`, because they name amounts.
- [x] **Russian translation (E6).** Done 2026-11-12. The Menu panel is 400 px wide, decided with the owner, so the Russian Theme and Language rows fit. Depends on Extract English text (E5). The `ru` catalogue: all keys, with the glossary terms chosen once (for example property, rent, mortgage, auction, jail). Check that long Russian words fit in buttons, modals, the player panel and the board squares, at the narrow and wide layouts. Make sure that every translated text fits, with no overflow and no clipped text. Known case (2026-11-12): in Russian, the Theme and Language rows of the Menu overflow the panel ("ТЁМНАЯ" and "РУССКИЙ" are cut at the right edge, and the hints wrap to one word a line). The layout fix is to be discussed separately before this task. Make sure that no key is missing and that the plural forms are right. Add a test that fails when `ru` and `en` have different keys. The browser suite runs with `en`. Add one browser test that opens the game with a Russian device language and shows Russian text. Add one browser test that overrides the language from the Menu.
- [x] **Preferences in the browser suite (E7).** Depends on Light theme (E2), Language support (E4) and Browser preferences (E1). Browser tests: a theme choice, a language choice and the `no motion` choice each survive a page reload. Blocked storage does not break the app. Add the new keys to the e2e notes in `e2e-test-plan.md`.

### F. Close

- [x] **Manual run (F1).** `docker compose up`, play a short game with two browser profiles and one hot-seat seat, and look at the dashboard, the logs and the traces. Do `docker compose stop` and read the shutdown lines. Also try the `dev` profile. Play once in the light theme and once in Russian. Fix the defects that you find.
- [x] **Milestone 5 close (F2).** Roadmap status and change log. "As built" notes in the roadmap section 8. Write the M6 task list.

## Setup

Docker Desktop (or another Docker engine) with compose v2. No accounts or keys: the Grafana stack is local. Grafana uses the default local sign-in of the `grafana/otel-lgtm` image.

## Order and dependencies

- Docs (A) → Logger module (B1) and Request id and request log (B2) → Replace console calls (B3), Domain log events (B4), Start and shutdown (B5).
- OpenTelemetry bootstrap (C1) → Traces (C2), Logs bridge (C3), Metrics (C4). Readiness route (C5) can go at any time after B1.
- Static web serving (D1) → Dockerfile (D2) → Compose (D3) and Dashboard (D4) → Browser suite on the image (D5).
- The Dashboard (D4) needs the metrics (C4).
- Interface preferences (E) do not depend on B to D. Browser preferences (E1) → Light theme (E2) and Language support (E4). Language support (E4) → Extract English text (E5) → Russian translation (E6). Preferences in the browser suite (E7) is last in E. Colour collisions (E3) can go at any time. Light theme (E2) then checks the chip on both themes.
- Close (F) is last.
- C5 and D1 both change `app.ts`. Do them one after the other.

## Open questions

- **Log retention on the local machine.** Decided in Compose (D3): `json-file` with 3 files of 10 MB for each container.
- **Grafana data.** Decided in Compose (D3): no volume. `docker compose down` clears the data and `stop` keeps it, so a history never grows or goes stale.

## Risks

| Risk | Action |
| --- | --- |
| ESM instrumentation needs the `--import` hook, and it patches only modules that are not bundled | Load `telemetry.ts` with `--import`. Keep pino and the OpenTelemetry packages external. Use a Hono middleware and a Kysely plugin, not patches, for these parts |
| Kysely and `better-sqlite3` have no official instrumentation | Own Kysely plugin for query spans and the query duration metric |
| The default HTTP span attributes have the client IP and the user agent | Remove them in the middleware or with a span processor. Test it |
| Open SSE streams stop `server.close()` | The shutdown closes the streams first, with a time limit |
| The macOS `node_modules` does not work in a Linux container | The `dev` profile keeps `node_modules` in a container volume |
| `grafana/otel-lgtm` uses much memory on a laptop | Accepted for development. Stop it with the app |
| The browser suite on the image runs with development settings, so it does not test the production guards | The API tests cover the guards. M6 checks the production settings on the VPS |
| Logs and spans add time to each action | Measure with the Manual run (F1). Sampling can go down in M6 |
| Russian text is longer than English and can break the board labels and the buttons | Check each layout in Russian Translation (E6). Allow text wrap or a shorter key text |
| A colour that is fixed in a component stays dark on the light theme | Move all colours to tokens in Light theme (E2). Check each screen on both themes |
| The glyph chip and the price do not fit side by side on a narrow square | Measure the price width. Use a smaller font only on the owned band |

## Critical files

- `apps/api/src/index.ts`, `app.ts`, `errors.ts`, `routes/health.ts`, `routes/common.ts`, new `log.ts`, new `telemetry.ts`, `realtime/presence.ts`, `realtime/resume.ts`, `realtime/bus.ts`, `game/service.ts`, `game/lifecycle.ts`, `db/client.ts`, `openapi.json`
- `apps/api/package.json`, `apps/api/vite.config.ts`, `pnpm-workspace.yaml`
- `packages/shared/src/` (readiness schema), `packages/shared/src/index.ts`
- `apps/e2e/playwright.config.ts`, `apps/e2e/package.json`, root `package.json`
- `apps/web/index.html`, `apps/web/src/styles/tokens.css`, `apps/web/src/styles/motionPreference.ts`, `apps/web/src/audio/soundPreference.ts`, `apps/web/src/screens/game/flows/leave/LeaveGameMenu.tsx`, new `apps/web/src/i18n/`
- New: `Dockerfile`, `.dockerignore`, `compose.yaml`, `ops/grafana/`
