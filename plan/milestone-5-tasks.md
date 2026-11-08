# Harborfront: Milestone 5 tasks (observability and Docker)

|                |                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Companion docs | [implementation-roadmap.md](implementation-roadmap.md) (sections 8 and 9), [api-schema.md](api-schema.md), [e2e-test-plan.md](e2e-test-plan.md), [milestone-4-tasks.md](milestone-4-tasks.md) |
| Status         | Planned. Last updated 2026-11-08 |

**Goal.** On the local machine, the API writes structured logs and sends metrics, logs and traces to a local Grafana stack. The app runs from one Docker image, and the browser suite passes against that image. M6 can then deploy the same image.

**Done when** these steps pass on `localhost`:

1. `docker compose up` starts the app and the Grafana stack. The web app opens on `http://localhost:8787`, served by the API.
2. Play a short game. Grafana (`http://localhost:3000`) shows the HTTP, realtime and runtime metrics on the Harborfront dashboard, the log lines with their trace ids, and the traces of the game actions.
3. `docker compose stop` stops the API cleanly before the stop timeout. The log shows each shutdown step.
4. `pnpm e2e:docker` passes against the prod image.
5. `pnpm check`, `pnpm test` and `pnpm e2e` stay green.

## Scope rules

- In M5: logs, metrics, traces, the local Grafana stack and dashboard, readiness and graceful shutdown, the static web build served by the API, the Docker image, docker compose, and the browser suite on the image.
- Not in M5:
  - Deployment, the droplet, Caddy, the domain, Grafana Cloud, alerts and backups (M6).
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
| One prod image | The same image runs locally, in `pnpm e2e:docker` and on the droplet (M6). Only environment variables are different |
| Dev target | All dependencies and the source mounted from the host, `pnpm dev` with hot reload. Never deployed |
| Compose | `compose.yaml` in the repository root. Default profile: app (prod target) and otel-lgtm. `dev` profile: dev target and otel-lgtm. `e2e` profile: the prod image with the test settings |
| Browser suite on the image | New `pnpm e2e:docker`. `pnpm e2e` on the source stays the default |

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
- [ ] **Replace console calls (B3).** Change each `console.*` call in `apps/api/src` to the logger, with structured fields (game id, topic, error). Files: `errors.ts`, `app.ts`, `index.ts`, `game/service.ts`, `game/lifecycle.ts`, `realtime/bus.ts`, `realtime/resume.ts`, `rooms/service.ts`, `routes/auth.ts`, `db/migrations.ts`.
- [ ] **Domain log events (B4).** The game action, lifecycle, presence, auth and SSE events in "Log events". Tests with a memory logger for one event in each area.
- [ ] **Start and shutdown (B5).** The settings summary at start. The process fault handlers. Graceful shutdown in `index.ts`: `server.close()` waits for open streams, so close the SSE streams and the presence timers first. Then wait for open actions, flush telemetry and close the database, with a time limit. Test the shutdown function without a real signal.

### C. Telemetry

- [ ] **OpenTelemetry bootstrap (C1).** `apps/api/src/telemetry.ts` starts the Node SDK with OTLP exporters for traces, metrics and logs. Load it with `node --import` before `index.ts`, in the `dev` and `start` scripts and in the image. Off when `OTEL_EXPORTER_OTLP_ENDPOINT` is not set. Keep pino and the OpenTelemetry packages external in `vp pack`, because the instrumentation patches modules when they load, and it cannot patch bundled code.
- [ ] **Traces (C2).** HTTP spans from a Hono OpenTelemetry middleware, with the route template. Remove the client IP and the user agent from the span attributes. A Kysely plugin makes query spans (Kysely and `better-sqlite3` have no official instrumentation). An `applyAction` span with the game id and version.
- [ ] **Logs bridge (C3).** pino lines go through OpenTelemetry with the trace and span ids. The stdout lines also have these ids.
- [ ] **Metrics (C4).** The metrics in "Metrics". The database file size is an observable gauge. Presence and SSE counts come from the existing tracker and stream code. Tests read the values with an in-memory metric reader.
- [ ] **Readiness route (C5).** `GET /api/ready`: 200 when a database query works and the migrations are applied, or else 503. A shared schema in `packages/shared`, the route in the chain in `app.ts`, and `pnpm openapi`.

### D. Docker

- [ ] **Static web serving (D1).** `serveStatic` for the web build, and a fallback to `index.html` for app routes. Mount it after the typed route chain, so `AppType` does not change and an unknown `/api/*` path still gets the JSON 404 error. The path comes from `WEB_DIST_DIR`; when it is not set, the API serves no web files (as now). Tests: an app route gets `index.html`; `/api/unknown` gets the JSON error.
- [ ] **Dockerfile (D2).** The stages in "Decisions". pnpm through Corepack with the version from `package.json`. A `.dockerignore`: no `.env`, no databases, no `node_modules`, no `dist`, no test results and reports, no `.git`.
- [ ] **Compose (D3).** `compose.yaml` with the three profiles. App: port 8787, the `/data` volume, an env file, the health check on `/api/ready`, `OTEL_EXPORTER_OTLP_ENDPOINT` to otel-lgtm. otel-lgtm: Grafana on port 3000 and the dashboard mount. `dev` profile: a `node_modules` volume in the container, because the macOS `better-sqlite3` build does not load on Linux, and Vite listens on `0.0.0.0`.
- [ ] **Dashboard (D4).** `ops/grafana/dashboards/harborfront.json` and its provisioning file. Panels: realtime, HTTP, runtime and database, and a log panel with links to traces.
- [ ] **Browser suite on the image (D5).** `pnpm e2e:docker`. The Playwright config reads the server mode from an environment variable: one origin on port 8787 and no web server on 5173. The `e2e` profile runs the prod image with `NODE_ENV=development`, `GUEST_SIGN_IN_ENABLED=true`, `GAME_SEED`, `PRESENCE_GRACE_MS`, and a new database on each run (tmpfs). This tests the build and the static web serving, not the production settings: the production guards refuse these test flags.

### E. Close

- [ ] **Manual run (E1).** `docker compose up`, play a short game with two browser profiles and one hot-seat seat, and look at the dashboard, the logs and the traces. Do `docker compose stop` and read the shutdown lines. Also try the `dev` profile. Fix the defects that you find.
- [ ] **Milestone 5 close (E2).** Roadmap status and change log. "As built" notes in the roadmap section 8. Write the M6 task list.

## Setup

Docker Desktop (or another Docker engine) with compose v2. No accounts or keys: the Grafana stack is local. Grafana uses the default local sign-in of the `grafana/otel-lgtm` image.

## Order and dependencies

- Docs (A) → Logger module (B1) and Request id and request log (B2) → Replace console calls (B3), Domain log events (B4), Start and shutdown (B5).
- OpenTelemetry bootstrap (C1) → Traces (C2), Logs bridge (C3), Metrics (C4). Readiness route (C5) can go at any time after B1.
- Static web serving (D1) → Dockerfile (D2) → Compose (D3) and Dashboard (D4) → Browser suite on the image (D5).
- The Dashboard (D4) needs the metrics (C4). Close (E) is last.
- C5 and D1 both change `app.ts`. Do them one after the other.

## Open questions

- **Log retention on the local machine.** Docker keeps container logs with no limit by default. Decide in Compose (D3) if a log size limit is necessary.
- **Grafana data.** Keep the local Grafana data in a volume, or start empty each time. Decide in Compose (D3).

## Risks

| Risk | Action |
| --- | --- |
| ESM instrumentation needs the `--import` hook, and it patches only modules that are not bundled | Load `telemetry.ts` with `--import`. Keep pino and the OpenTelemetry packages external. Use a Hono middleware and a Kysely plugin, not patches, for these parts |
| Kysely and `better-sqlite3` have no official instrumentation | Own Kysely plugin for query spans and the query duration metric |
| The default HTTP span attributes have the client IP and the user agent | Remove them in the middleware or with a span processor. Test it |
| Open SSE streams stop `server.close()` | The shutdown closes the streams first, with a time limit |
| The macOS `node_modules` does not work in a Linux container | The `dev` profile keeps `node_modules` in a container volume |
| `grafana/otel-lgtm` uses much memory on a laptop | Accepted for development. Stop it with the app |
| The browser suite on the image runs with development settings, so it does not test the production guards | The API tests cover the guards. M6 checks the production settings on the droplet |
| Logs and spans add time to each action | Measure with the Manual run (E1). Sampling can go down in M6 |

## Critical files

- `apps/api/src/index.ts`, `app.ts`, `errors.ts`, `routes/health.ts`, `routes/common.ts`, new `log.ts`, new `telemetry.ts`, `realtime/presence.ts`, `realtime/resume.ts`, `realtime/bus.ts`, `game/service.ts`, `game/lifecycle.ts`, `db/client.ts`, `openapi.json`
- `apps/api/package.json`, `apps/api/vite.config.ts`, `pnpm-workspace.yaml`
- `packages/shared/src/` (readiness schema), `packages/shared/src/index.ts`
- `apps/e2e/playwright.config.ts`, `apps/e2e/package.json`, root `package.json`
- New: `Dockerfile`, `.dockerignore`, `compose.yaml`, `ops/grafana/`
