# Harborfront: implementation roadmap

|                |                                                                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Companion docs | [game-rules-reference.md](game-rules-reference.md) (rules), [game-screen-2-gameplay.md](game-screen-2-gameplay.md) (turn flow, devices, session owner), [game-screen-2-spec.md](game-screen-2-spec.md) (UI), [GLOSSARY.md](../GLOSSARY.md) (terms) |
| Engine         | [packages/game-engine](../packages/game-engine/README.md): complete                                                                                                                                              |
| Status         | M1 to M4 done. M5 planned ([tasks](milestone-5-tasks.md)). Last updated 2026-11-08 |

This document is the plan from the first scaffold to a fully working online game. It covers the API, the realtime layer, auth, the UI, testing, telemetry, and hosting.

**Where we are.** M1 to M4 are done: the game is playable on the local machine, with the lobby, Save and Restore, presence, and Google sign-in. The API has no structured logs, no telemetry and no Docker image yet (M5). Nothing is deployed (M6, M7).

**Decisions (2026-10-31)**

| Topic     | Decision                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------- |
| Auth      | Google sign-in in production. Guest name sign-in for test and development only (M4)                       |
| Realtime  | SSE + HTTP POST now, behind a transport layer. WebSocket after the first release (M7), only if SSE has a problem, with a fallback from WebSocket to SSE + POST |
| Database  | SQLite. All queries go through Kysely and stay portable, so a later change to Postgres needs only a new dialect in `db/client.ts` |
| First goal | A playable game on the local machine: hot-seat on one device, and several browsers or browser profiles as separate devices |
| Hosting   | Minimal cost, free tiers where possible                                                                   |
| Access    | Only selected persons can open the game. Cloudflare Access (Zero Trust) stands in front of the web app and the API (section 10, M7) |
| Telemetry | Full OpenTelemetry: traces, metrics and logs. Local Grafana stack (`grafana/otel-lgtm`) in M5, Grafana Cloud free tier in M6 |
| CI        | Later, no milestone. Run `pnpm ready` and the browser suites on the local machine before a deploy (decided 2026-11-08) |

---

## 1. Architecture

- **One authority.** One API process runs the engine, keeps the game state and pushes events. Devices send actions only (gameplay Q19).
- **Data.** SQLite through Kysely. Portable queries keep Postgres possible (section 3.3).
- **Scale.** One API instance. The game is not built for scale.
- **Realtime.** A transport layer on the server and in the client. SSE + POST now, WebSocket later.
- **Web app.** A static build, served by the API container on the same origin. It calls `/api` with the Hono RPC client (`apps/web/src/api.ts`, `AppType` from `apps/api/src/app.ts`).

---

## 2. Milestones

Milestones M1 to M5 run on the local machine. Deployment (M6) and Cloudflare (M7) come last.

| Milestone                     | Scope |
| ----------------------------- | ----- |
| **M1 Local playable game** ([tasks](milestone-1-tasks.md)) | Guest sessions (one per browser or browser profile), create a game, join by invite link, hot-seat seats, start. The engine on the server, the SSE game channel, the game screen in React with all turn actions, resign, and the result screen. Done when two browser profiles and one hot-seat player finish a game on `localhost` |
| **M2 Lobby** ([tasks](milestone-2-tasks.md)) | Public game list, My games, the full game room (host and guest views), invite by name, player tokens (game pieces), Cancel game, and the dice and token animation (moved from M1). **Done** on 2026-11-05, with the manual run on two browser profiles (I1) |
| **M3 Session and resilience** ([tasks](milestone-3-tasks.md)) | Owner Finish, Save and Restore (gameplay 3.1), disconnect and away rules (3.2): the game waits for an away player, and it saves itself when nobody is online. The Playwright setup and script from M1, with a disconnect script |
| **M4 Sign-in and room control** ([tasks](milestone-4-tasks.md)) | Host removes a player, Google sign-in. Guest sign-in stays for test and development only. The accessibility pass and WebSocket move to after the first release. **Done** on 2026-11-08, with the manual run on real Google sign-in (G1) |
| **M5 Observability and Docker** ([tasks](milestone-5-tasks.md)) | pino logs, OpenTelemetry metrics, logs and traces, a local Grafana stack (`grafana/otel-lgtm`) with a dashboard, readiness and graceful shutdown, the API serves the web build, one Docker image (dev and prod targets), docker compose, and the browser suite on the image (`pnpm e2e:docker`). All on the local machine |
| **M6 Deployment**             | A domain (Cloudflare Registrar, DNS only), one DigitalOcean droplet with Docker, Caddy with Let's Encrypt, a local build and deploy script (no registry), the Google redirect address for production, the OpenTelemetry export to Grafana Cloud with alerts, and the daily SQLite backup |
| **M7 Cloudflare**             | The Cloudflare proxy and edge TLS, Cloudflare Tunnel (Caddy removed, no open HTTP port), Cloudflare Access, the Access JWT check in the API, and the SSE check through Cloudflare. This is the first release |
| **After the first release**   | Accessibility pass ([future work](milestone-4-tasks.md#future-work-after-the-first-release)), WebSocket transport (only if SSE has a problem through Cloudflare) |
| **Later (no milestone)**      | The autopilot for away players (postponed 2026-11-06). Claim from another browser (gameplay Q25). CI with GitHub Actions. Browser telemetry |

Tests are written with each milestone (section 7). There is no CI: run them on the local machine before each commit and each deploy.

---

## 3. API

### 3.1 Tables

Migrations go in `apps/api/src/db/migrations.ts`, types in `apps/api/src/db/schema.ts`.

| Table            | Content                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `users`          | Id, display name (unique, case-insensitive), created time                                      |
| `sessions`       | Hash of the session token, user, expiry                                                       |
| `auth_identities` | Provider, subject, user, created time. M4, Google only. Unique on provider and subject        |
| `games`          | Extend the current table: owner, status (waiting, active, saved, finished), version. The seat limit is always 6 (`MAX_PLAYERS`) |
| `seats`          | Game, order, name, player token (game piece, M2), the device user who controls it, the user (empty for hot-seat) |
| `invites`        | Game, invited user, state. M2, for invite by name only. The game id link is the invite (no link token) |
| `game_events`    | Game, version, action JSON, events JSON, time                                                 |
| `game_snapshots` | Game, version, state JSON, a flag for a turn-start snapshot (Save and Restore)               |

### 3.2 Endpoints

The request and response schemas are zod schemas in `packages/shared`.

| Area     | Endpoints                                                                                                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session  | `GET /api/auth/methods`, `GET /api/auth/google/start`, `GET /api/auth/google/callback`, `POST /api/auth/google/name` (M4), `POST /api/session` (guest name, only when `GUEST_SIGN_IN_ENABLED=true`), `GET /api/me`, `PATCH /api/me`, `DELETE /api/session` |
| Lobby    | `GET /api/games?status=waiting`, `GET /api/me/games`, `POST /api/games`, `GET /api/games/:id`, `DELETE /api/games/:id` (cancel), join, leave, add and remove a hot-seat seat, `PUT /api/games/:id/seats/:seatId/token`, invite by name (`POST /api/games/:id/invites`, `GET /api/me/invites`, accept, decline), start, and `DELETE /api/games/:id/players/:userId` (the host removes a player, M4). The game link (`/games/<id>`) is the invite |
| Game     | `POST /api/games/:id/actions` with `{ seatId, action, expectedVersion, clientActionId }`, `GET /api/games/:id/state`, owner `POST /api/games/:id/finish`, `/save`, `/restore`, and `POST /api/games/:id/claim`. Saved games are in `GET /api/me/games` |
| Realtime | `GET /api/stream?topics=lobby,user:<id>,game:<id>` (SSE)                                                                                                                                                                                  |

### 3.3 Game service

1. Load the state: from the in-memory cache, or else from the latest snapshot plus the events after it.
2. Check that the session's device controls the acting seat (403 otherwise). The engine checks who may act and when (`actorFor` in the reducer); the web app uses `mayAct` to enable buttons.
3. Call `applyAction`.
4. Write the events and, when due, a snapshot in one transaction. When the events contain `GameEnded`, set the game status to `finished` in the same transaction. Write a snapshot every N versions and at the start of each turn (Save needs it, gameplay 3.1).
5. Publish the events.

- **Redaction (Q19).** Remove `rng` and the deck order before state leaves the server. Devices learn about card draws only from events.
- **Idempotency.** `clientActionId` removes duplicate retries. A repeat returns the stored events with the current state. `expectedVersion` refuses an action made on old state, with a clear error. The client then gets the state again.
- **OpenAPI.** Generate `apps/api/openapi.json` from the zod routes. Commit it with each controller or schema change (CLAUDE.md).
- **Portability.** Use only portable SQL through Kysely. Store JSON as text, ids as UUID text and times as ISO text. Do not use functions that only SQLite has. Keep dialect-specific code in `db/client.ts`, and in migrations where it is necessary.

---

## 4. Realtime layer

### 4.1 Server

- **`Bus`**: publish and subscribe by topic, in memory in the API process.
- **`Transport`**: connects one device. SSE now, WebSocket after the first release (M7) if needed.
- **Envelope**: `{ topic, type, version, payload }`.
- **SSE.** Hono `streamSSE`. The event id is the engine version; room, lobby and user messages have no id. A heartbeat every 15 seconds. On reconnect the browser sends `Last-Event-ID`: the server sends the events after that version, or a new snapshot when the gap is more than 100 versions (see [api-schema.md](api-schema.md)).
- **Presence.** A device is online while it has an open stream (or WebSocket). When the stream closes, its players are "reconnecting". After 60 seconds they are "away" (gameplay 3.2). When all seated users are away, the game saves itself. The timers run in the API process. At start, each controller in an active game gets a new grace timer. Presence is not stored in the database.

### 4.2 Client (`apps/web`)

- **`RealtimeClient`**: `subscribe(topic, handler)`, `send(action)`, `status`.
- **`SseHttpClient`** (now): `EventSource` for events, POST for actions.
- **`WsClient`** (after the first release, only if needed): the factory tries WebSocket first. If the connection fails or is blocked, it uses SSE + POST. The POST route for actions stays in all cases, so the fallback is always possible.

---

## 5. Auth

- **Production: Google sign-in (M4).** The player signs in with Google. The OAuth client is Arctic, with `state` and PKCE in short HttpOnly, SameSite=Lax cookies. The sessions stay ours.
  - The table `auth_identities` (provider, subject, user id, created time) has a unique index on provider and subject. It keeps only the Google subject. It does not keep the email, the Google name or the Google tokens.
  - A known subject signs in as its user. A new subject gives a short pending sign-in, and the player types a display name (2 to 16 characters, unique, case-insensitive). The server then makes the user, the identity row and the session in one transaction. The Google name is not used.
  - A Google user and a guest user are always separate users. There is no link and no merge. `GET /api/auth/google/start` refuses a signed-in user with `already_signed_in`.
  - The server needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` in production. In other environments it needs at least one sign-in method, or it does not start.
- **Test and development: guest name (M4).** The player types a display name. The server creates a user and a session. The route `POST /api/session` exists only when `GUEST_SIGN_IN_ENABLED=true`; without it the route is 404. The API does not start when `GUEST_SIGN_IN_ENABLED=true` and `NODE_ENV=production`.
- **Sign-in methods.** `GET /api/auth/methods` returns `{ google, guest }`. The web app reads it at run time, so one build works in all environments.
- **Sessions.**
  - The cookie is HttpOnly, Secure and SameSite=Lax. Secure is off when `NODE_ENV` is `development` or `test`, because local development uses plain HTTP. It holds a random token. The database keeps only the hash of the token.
  - Each sign-in makes a new session token. The session expires after 30 days without use.
- **Hot-seat players** are seats, not users. They belong to the device user who added them.
- **Protection.** SameSite cookies and JSON-only POST requests protect against CSRF. Routes that change state also check the request origin.

---

## 6. UI (`apps/web`)

- **Routing.** TanStack Router: sign-in, lobby, game room, game, result.
- **Screens.** Sign-in (Google, and the guest name when it is on), lobby list, game room (host and guest: seats, invites, tokens), game screen, saved games (owner), result.
- **Game screen.** Port `artifacts/game-screen` to React components, following [game-screen-2-spec.md](game-screen-2-spec.md): player rail, log, board, board-centre turn area, hand, and the dialogs (auction, trade, manage, card, bankruptcy, leave and resign, owner finish and save). Move the board logic of `board3d.js` into React Three Fiber in `apps/web/src/scene/`.
- **State.** TanStack Query for REST data. A game store keeps the latest redacted state from the stream (no client reducer). The events in each message fill the log and start the animations. The static board and card data come from `packages/game-engine` (`board.ts`, `cards.ts`).
- **Design tokens.** Colours, type and spacing from the design system, as CSS variables.
- **Designs for M3.** The boards "Owner controls", "Saved games and restore" and "Away and connection". Ask before new artboards are added to the canvas.

---

## 7. Testing

| Level      | Plan                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine     | The current Vitest suite and the seeded random bot stay                                                                                              |
| API        | Vitest with `app.request` (as in `apps/api/src/app.test.ts`), SQLite in memory |
| Realtime   | Tests open an SSE stream, apply actions, reconnect with `Last-Event-ID`, and check the events that the server sends again                           |
| Web        | Vitest and Testing Library for components and for the game store                                                                                      |
| End to end | Playwright, in M3. Plan: [e2e-test-plan.md](e2e-test-plan.md). Two browser contexts and one hot-seat seat play a short seeded game, and other scripts cover the lobby, the session and disconnects. Runs on its own seeded servers, with `pnpm e2e` |
| Image      | M5: `pnpm e2e:docker` runs the Playwright suite against the prod Docker image, with the test settings |
| CI         | Later, no milestone. Before that, run `pnpm ready`, `pnpm e2e` and `pnpm e2e:docker` on the local machine |

- **Seeded.** The engine takes its dice and decks from a seed (`createGame({ seed })`). A test-only environment flag, never on in production, lets the test set the seed. Then the dice give the same numbers on each run, and the test knows where each token lands.
- **Short.** The test plays a fixed script of a few turns, for example roll, buy, pay rent, trade, end turn. It does not play a full game to a winner. The full games stay in the engine's bot test.

---

## 8. Logging and telemetry (OpenTelemetry)

M5 builds this section on the local machine. M6 sends the same data to Grafana Cloud. Tasks: [milestone-5-tasks.md](milestone-5-tasks.md).

- **Logs (API).** pino writes JSON lines to stdout (pretty output in development). The level comes from `LOG_LEVEL`. Each line has the request id, and the trace and span ids when a span is open. The OpenTelemetry log bridge also sends the lines through OTLP.
  - Events: HTTP requests, game actions (applied, refused, `expectedVersion` conflicts, `clientActionId` repeats), lifecycle (start, migrations, Save, Finish, Restore, automatic save), presence changes, auth (sign-in, sign-out, Google failures), SSE streams (open, close, resume with events or a snapshot, bus handler failures), the start-up settings without secrets, the shutdown steps, and process faults.
- **Traces (API).** HTTP spans with the route template, query spans from a Kysely plugin, and an `applyAction` span with the game id and version.
- **Metrics (API).**
  - Realtime: open SSE streams, connected devices, reconnects, resume with events or a snapshot, presence states, automatic saves.
  - HTTP: request count and duration by route and status.
  - Runtime and database: event loop delay, memory, garbage collection, query duration, database file size.
  - No game metrics in M5 (decided 2026-11-08).
- **Health.** `/api/health` is the liveness check. `/api/ready` checks the database and the migrations.
- **Local stack (M5).** One `grafana/otel-lgtm` container in docker compose: an OpenTelemetry Collector, Prometheus, Loki, Tempo and Grafana. A dashboard file in the repository is loaded at start.
- **Backend (M6).** OTLP to the Grafana Cloud free tier. Only the endpoint, the headers and the sampling ratio change. Alerts in M6.
- **Settings.** Telemetry is off when no OTLP endpoint is set, and in the unit tests.
- **Privacy.** No personal data except the display name. No cookies, tokens, IP addresses or user agents in logs or spans. pino removes cookies, `Authorization`, session tokens, and the OAuth `code` and `state`.
- **Web.** No browser telemetry for now (Later).

---

## 9. Hosting and deployment

| Part      | Choice                                                                                                       | Cost             | Milestone |
| --------- | ------------------------------------------------------------------------------------------------------------ | ---------------- | --------- |
| Image     | One Docker image, `node:26-slim`. The API process also serves the static web build. One instance            | Free             | M5        |
| Domain    | Bought at Cloudflare Registrar. DNS only (no proxy) in M6                                                   | About $10/year   | M6        |
| API + web | One small DigitalOcean droplet with Docker and docker compose                                                | About $4–6/month | M6        |
| TLS       | Caddy with Let's Encrypt in M6. Cloudflare edge TLS in M7, and Caddy is removed                             | Free             | M6, M7    |
| Edge      | Cloudflare proxy, Cloudflare Tunnel to the droplet, Cloudflare Access (section 10)                          | Free             | M7        |
| Database  | SQLite file on the droplet volume. A daily backup of the file (`sqlite3 .backup`), copied to the local machine | Free             | M6        |
| Telemetry | Grafana Cloud, free tier                                                                                     | Free             | M6        |

- **One origin.** The web app and the API share one hostname, for example `play.<domain>`, with the API under `/api`. Then one Access application covers both, and the session cookie needs no cross-site settings.
- **One image.** The same prod image runs on the local machine, in `pnpm e2e:docker` and on the droplet. Only the environment variables are different.
- **Why a droplet and not App Platform.** On a droplet, `cloudflared` runs next to the API and opens an outbound tunnel (M7). The droplet then needs no public HTTP port, so nobody can go around Cloudflare Access. App Platform is still possible, but then only the JWT check in the API (section 10) protects the origin.
- **Why the API is not on Vercel.** Serverless functions run for a short time only. They cannot keep SSE streams open or run the grace timers.
- **Deploy (M6).** A local script builds the image for `linux/amd64` with `docker buildx` (the local machine is arm64, so this build is slow), sends it with `docker save | ssh … docker load`, runs `docker compose up -d`, and checks `/api/ready` inside the droplet. No registry and no CI. The API applies the migrations at start. Secrets are in an env file on the droplet.
- **One instance.** The game is not built for scale. One API process holds the bus, the game cache and the timers.

---

## 10. Access control (Cloudflare Access, M7)

Only persons on an allow list can open the game. Cloudflare Access (Zero Trust, free for up to 50 users) checks each request before it reaches the droplet.

- **Access application.** One self-hosted application for `play.<domain>`, covering all paths (the web app, `/api`, `/api/stream`, `/api/telemetry`).
- **Policy.** Allow: a list of email addresses, kept in the Cloudflare dashboard. All other persons get the Cloudflare sign-in page and cannot continue.
- **Sign-in method.** One-time PIN by email (no extra setup). Google can be added as an identity provider later, together with the Google OAuth step of section 5.
- **Session.** Access session of 7 to 30 days, so friends do not sign in each evening.
- **Origin protection.**
  - Cloudflare Tunnel: the droplet has no open HTTP port (firewall allows only SSH).
  - Defence in depth: an API middleware checks the `Cf-Access-Jwt-Assertion` header (signature from the team's public keys, audience tag, expiry). A request without a valid token gets 403. The check is off in local development and in tests (environment flag).
- **Relation to the guest name (section 5).** Access decides who may enter. The Google sign-in (section 5) gives the in-game identity. The API does not read the Access email and does not link it to a user.
- **SSE through Cloudflare.** Cloudflare closes an idle connection after about 100 seconds. The 15-second heartbeat (section 4.1) keeps the stream open. When the Access session ends, the stream and POST requests fail with a redirect or 403: the client shows "Session ended" and reloads the page, so the person signs in again.
- **Health check.** `/api/health` stays behind Access. The deploy checks it inside the droplet, not through Cloudflare.
- **Managing access.** Add or remove a person in the Access policy in the dashboard. No deploy is necessary. Optional later: keep the policy in Terraform.

---

## 11. Risks

| Risk                                                     | Action                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| Some proxies buffer or close SSE streams                 | Heartbeats, and the header `X-Accel-Buffering: no`                         |
| The Access session ends during a game                    | Long Access sessions; the client detects the redirect or 403 and reloads   |
| The origin is reached without Cloudflare                 | Cloudflare Tunnel with no open HTTP port, and the JWT check in the API     |
| The SQLite file is lost with the droplet                 | Daily backup of the file                                                   |
| Timers in the API process are lost on a restart          | Make them again from the database at start                                 |
| A silent network drop (a laptop sleeps) closes no stream, so the server can see the device as online for minutes | Check this through Cloudflare in M7. If it is a problem, add a client ping |
| Open SSE streams stop a clean shutdown, because the server waits for them | On SIGTERM the API closes the streams itself (M5) |
| The OpenTelemetry HTTP spans record the client IP and the user agent by default | Remove these attributes (M5) |
| Before M7 the droplet has an open HTTPS port, and Access does not protect it | Short M6 period. Google sign-in still controls who plays |
| One absent player stops the game, because the game waits for them (gameplay 3.2) | The owner can use Save or Finish. When all players leave, the game saves itself |

---

## 12. Change log

| Date       | Change                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| 2026-10-31 | First version: architecture, milestones, API, realtime, auth, UI, testing, telemetry, hosting and risks |
| 2026-10-31 | Access control with Cloudflare Access (section 10). Hosting: one droplet behind Cloudflare Tunnel, web and API on one origin |
| 2026-10-31 | The local playable game is the first milestone; deployment moved to the end. SQLite only, with portable queries; no Neon, no PgNotifyBus |
| 2026-10-31 | Task list for milestone 1 in [milestone-1-tasks.md](milestone-1-tasks.md) |
| 2026-10-31 | API schema for milestone 1 in [api-schema.md](api-schema.md) |
| 2026-10-31 | Review fixes: seat limit always 6, resign moved to M1, `finished` status, SSE ids and resume limit, Secure cookie outside development, invites by name only (M2 tokens are game pieces), E2E scope per milestone |
| 2026-11-03 | Task list for milestone 2 in [milestone-2-tasks.md](milestone-2-tasks.md), and the M2 section in [api-schema.md](api-schema.md). Dice and token animation moved from M1 to M2 |
| 2026-11-03 | Project glossary in [GLOSSARY.md](../GLOSSARY.md): terms, preferred words, and known inconsistencies |
| 2026-11-05 | Milestone 2 done: token and cancel API, lobby lists, invites, the `lobby` and `user:<id>` topics, and the lobby, token picker, invite panel and cancel flow in the web app. "As built" rules in [api-schema.md](api-schema.md). The manual run (I1) passed on two browser profiles |
| 2026-11-06 | Task list for milestone 3 in [milestone-3-tasks.md](milestone-3-tasks.md), and the M3 section in [api-schema.md](api-schema.md). The autopilot is postponed. The game waits for an away player, and it saves itself when nobody is online. No `GET /api/me/saved-games`. Playwright moved from M1 to M3 |
| 2026-11-06 | E2E test plan in [e2e-test-plan.md](e2e-test-plan.md). The tests use dedicated seeded servers and reduced motion, so Reduced motion fallback (H4) moved from M2 to M3 |
| 2026-11-07 | Rematch removed from the project: the M4 scope, the game-over dialog in the prototype and the Dialogs board. The game-over dialog has one action, Leave game |
| 2026-11-08 | Task list for milestone 4 in [milestone-4-tasks.md](milestone-4-tasks.md). Google is the only production sign-in; guest sign-in is for test and development only. The accessibility pass and WebSocket move to after the first release (M5) |
| 2026-11-08 | Milestone 4 code done: the host removes a player (API, `room.removed`, room screen), Google sign-in with Arctic behind an injected provider, guest sign-in behind `GUEST_SIGN_IN_ENABLED`, the sign-in screen, and the remove player Playwright script (32 scripts pass). "As built" rules in [api-schema.md](api-schema.md). The manual run with real Google sign-in (G1) passed. Claim from another browser (Q25) stays an open question |
| 2026-11-08 | Milestone 5 split: M5 Observability and Docker ([tasks](milestone-5-tasks.md)), M6 Deployment (droplet, Caddy, local deploy script, Grafana Cloud, backup), M7 Cloudflare (proxy, Tunnel, Access, JWT check). CI moves to Later. No game metrics in M5 |
