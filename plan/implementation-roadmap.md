# Harborfront: implementation roadmap

|                |                                                                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Companion docs | [game-rules-reference.md](game-rules-reference.md) (rules), [game-screen-2-gameplay.md](game-screen-2-gameplay.md) (turn flow, devices, session owner), [game-screen-2-spec.md](game-screen-2-spec.md) (UI) |
| Engine         | [packages/game-engine](../packages/game-engine/README.md): complete                                                                                                                                              |
| Status         | Draft. Last updated 2026-10-31                                                                                                                                                                                    |

This document is the plan from the current scaffold to a fully working online game. It covers the API, the realtime layer, auth, the UI, testing, telemetry, and hosting.

**Where we are.** The game engine is complete and all gameplay questions are decided. The API (`apps/api`: Hono, Kysely, SQLite, one `games` table) and the web app (`apps/web`: React, TanStack Query, a React Three Fiber board) are only a scaffold. The UI exists as a prototype (`artifacts/game-screen`) and in the design system canvas.

**Decisions (2026-10-31)**

| Topic     | Decision                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------- |
| Auth      | Guest name only for now. Google OAuth later                                                               |
| Realtime  | SSE + HTTP POST now, behind a transport layer. WebSocket later, with a fallback from WebSocket to SSE + POST |
| Database  | SQLite and Postgres through Kysely. SQLite for development and tests, Postgres in production            |
| Hosting   | Minimal cost, free tiers where possible                                                                   |
| Access    | Only selected persons can open the game. Cloudflare Access (Zero Trust) stands in front of the web app and the API (section 10) |
| Telemetry | Full OpenTelemetry: traces, metrics and logs                                                              |

---

## 1. Architecture

- **One authority.** One API process runs the engine, keeps the game state and pushes events. Devices send actions only (gameplay Q19).
- **Data.** Kysely with two dialects. `DATABASE_URL` selects SQLite or Postgres.
- **Realtime.** A transport layer on the server and in the client. SSE + POST now, WebSocket later.
- **Web app.** A static build, served by the API container on the same origin. It calls `/api` with the Hono RPC client (`apps/web/src/api.ts`, `AppType` from `apps/api/src/app.ts`).

---

## 2. Milestones

Each milestone ends deployed and tested.

| Milestone                     | Scope                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| **M1 Foundations**            | CI, the two database dialects, guest auth, the deploy pipeline behind Cloudflare Access, the telemetry base |
| **M2 Lobby**                  | Public game list, game room, seats, hot-seat players, invite by name and by link, tokens                  |
| **M3 Playable game**          | Engine on the server, the SSE game channel, the game screen in React, all turn actions                     |
| **M4 Session and resilience** | Owner Finish, Save and Restore (gameplay 3.1), disconnect and away rules with the autopilot (3.2), resign |
| **M5 Polish and later**       | Google OAuth, WebSocket transport, accessibility pass, rematch                                            |

---

## 3. API

### 3.1 Tables

Migrations go in `apps/api/src/db/migrations.ts`, types in `apps/api/src/db/schema.ts`.

| Table            | Content                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `users`          | Id, display name (unique, case-insensitive), created time                                      |
| `sessions`       | Hash of the session token, user, expiry                                                       |
| `games`          | Extend the current table: owner, status (waiting, active, saved, finished), seat limit, version |
| `seats`          | Game, order, name, token, the device user who controls it, the user (empty for hot-seat)      |
| `invites`        | Game, invited user or link token, state                                                       |
| `game_events`    | Game, version, action JSON, events JSON, time                                                 |
| `game_snapshots` | Game, version, state JSON, a flag for a turn-start snapshot (Save and Restore)               |

### 3.2 Endpoints

The request and response schemas are zod schemas in `packages/shared`.

| Area     | Endpoints                                                                                                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session  | `POST /api/session` (guest name), `GET /api/me`, `PATCH /api/me`, `DELETE /api/session`                                                                                                                                        |
| Lobby    | `GET /api/games?status=waiting`, `POST /api/games`, `GET /api/games/:id`, join, leave, add and remove a hot-seat seat, pick a token, invite by name, invite link (`POST /api/invites/:token/accept`), start                        |
| Game     | `POST /api/games/:id/actions` with `{ seatId, action, expectedVersion, clientActionId }`, `GET /api/games/:id/state`, owner `POST /api/games/:id/finish`, `/save`, `/restore`, `GET /api/me/saved-games`                     |
| Realtime | `GET /api/stream?topics=lobby,game:<id>` (SSE)                                                                                                                                                                                  |

### 3.3 Game service

1. Load the state: from the in-memory cache, or else from the latest snapshot plus the events after it.
2. Check that the session's device controls the acting seat. Use `actorFor` and `mayAct` from the engine.
3. Call `applyAction`.
4. Write the events and, when due, a snapshot in one transaction. Write a snapshot every N versions and at the start of each turn (Save needs it, gameplay 3.1).
5. Publish the events.

- **Redaction (Q19).** Remove `rng` and the deck order before state leaves the server. Devices learn about card draws only from events.
- **Idempotency.** `clientActionId` removes duplicate retries. `expectedVersion` refuses an action made on old state, with a clear error. The client then gets the state again.
- **OpenAPI.** Generate `apps/api/openapi.json` from the zod routes. Commit it with each controller or schema change (CLAUDE.md).
- **Portability.** Use only portable SQL through Kysely. Store JSON as text, ids as UUID text and times as ISO text. Do not use functions that only SQLite has. Keep dialect-specific code in `db/client.ts`, and in migrations where it is necessary.

---

## 4. Realtime layer

### 4.1 Server

- **`Bus`**: publish and subscribe by topic.
  - `InMemoryBus` (now) sends a message only to the streams in the same API process.
  - `PgNotifyBus` (later) uses Postgres `LISTEN` and `NOTIFY`. Each API instance listens on a Postgres channel, so an event that one instance publishes reaches devices that are connected to another instance. It needs no extra service, for example no Redis.
- **`Transport`**: connects one device. SSE now, WebSocket later.
- **Envelope**: `{ topic, type, version, payload }`.
- **SSE.** Hono `streamSSE`. The event id is the game version. A heartbeat every 15 seconds. On reconnect the browser sends `Last-Event-ID`: the server sends the events after that version, or a new snapshot when the gap is too large.
- **Presence.** A device is online while it has an open stream (or WebSocket). When the stream closes, its players are "reconnecting". After 60 seconds they are "away" (gameplay 3.2). The timers run in the API process. At start, the API makes them again from the database.

### 4.2 Client (`apps/web`)

- **`RealtimeClient`**: `subscribe(topic, handler)`, `send(action)`, `status`.
- **`SseHttpClient`** (now): `EventSource` for events, POST for actions.
- **`WsClient`** (later): the factory tries WebSocket first. If the connection fails or is blocked, it uses SSE + POST. The POST route for actions stays in all cases, so the fallback is always possible.

---

## 5. Auth

- **Now: guest name.** The player types a display name (2 to 16 characters, unique, case-insensitive). The server creates a user and a session.
  - The cookie is HttpOnly, Secure and SameSite=Lax. It holds a random token. The database keeps only the hash of the token.
  - The session expires after 30 days without use.
- **Hot-seat players** are seats, not users. They belong to the device user who added them.
- **Later: Google OAuth.** A table `auth_identities` (provider, subject, user). A guest who signs in with Google keeps the same user and their games. The OAuth client is Arctic. The sessions stay ours.
- **Protection.** SameSite cookies and JSON-only POST requests protect against CSRF. Routes that change state also check the request origin.

---

## 6. UI (`apps/web`)

- **Routing.** TanStack Router: sign-in, lobby, game room, game, result.
- **Screens.** Sign-in (guest name), lobby list, game room (host and guest: seats, invites, tokens), game screen, saved games (owner), result.
- **Game screen.** Port `artifacts/game-screen` to React components, following [game-screen-2-spec.md](game-screen-2-spec.md): player rail, log, board, board-centre turn area, hand, and the dialogs (auction, trade, manage, card, bankruptcy, leave and resign, owner finish and save). Move the board logic of `board3d.js` into React Three Fiber in `apps/web/src/scene/`.
- **State.** TanStack Query for REST data. A game store applies realtime events to the redacted state and starts the animations from the events. The static board and card data come from `packages/game-engine` (`board.ts`, `cards.ts`).
- **Design tokens.** Colours, type and spacing from the design system, as CSS variables.
- **Designs that are still missing.** Sign-in screen, saved-games list, away and reconnecting seat states in the rail, connection banner. Ask before new artboards are added to the canvas.

---

## 7. Testing

| Level      | Plan                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine     | The current Vitest suite and the seeded random bot stay                                                                                              |
| API        | Vitest with `app.request` (as in `apps/api/src/app.test.ts`). The suite runs two times: SQLite in memory and Postgres (a CI service container)    |
| Realtime   | Tests open an SSE stream, apply actions, reconnect with `Last-Event-ID`, and check the events that the server sends again                           |
| Web        | Vitest and Testing Library for components and for the game store                                                                                      |
| End to end | Playwright. Two browser contexts and one hot-seat seat play a short seeded game: a handoff, a trade, a disconnect and a reconnect                    |
| CI         | GitHub Actions: `pnpm check`, `pnpm test` (both dialects), `pnpm build`. Playwright on `main`                                                        |

- **Seeded.** The engine takes its dice and decks from a seed (`createGame({ seed })`). A test-only environment flag, never on in production, lets the test set the seed. Then the dice give the same numbers on each run, and the test knows where each token lands.
- **Short.** The test plays a fixed script of a few turns, for example roll, buy, pay rent, trade, end turn. It does not play a full game to a winner. The full games stay in the engine's bot test.

---

## 8. Logging and telemetry (OpenTelemetry)

- **API.** The OpenTelemetry Node SDK.
  - Traces: HTTP requests (Hono), database queries, `applyAction` with the game id and version.
  - Metrics: active games, connected devices, open SSE streams, action latency, refused actions by error code, reconnects.
  - Logs: pino JSON with the trace and span ids, sent through OpenTelemetry.
- **Web.** The OpenTelemetry browser SDK for page loads, fetch spans and errors. It exports through an API route (`/api/telemetry`), so no key is in the browser.
- **Backend.** OTLP to the Grafana Cloud free tier (logs, traces, metrics). Use sampling to stay in the free limits.
- **Privacy.** No personal data except the display name. No cookies or IP addresses in spans.

---

## 9. Hosting and deployment

| Part      | Choice                                                                                                       | Cost             |
| --------- | ------------------------------------------------------------------------------------------------------------ | ---------------- |
| API + web | One small DigitalOcean droplet with Docker. The API container also serves the static web build. One instance in v1 | About $4–6/month |
| Edge      | Cloudflare: DNS, TLS, Cloudflare Tunnel to the droplet, Cloudflare Access (section 10)                       | Free             |
| Database  | Neon Postgres, free tier                                                                                     | Free             |
| Telemetry | Grafana Cloud, free tier                                                                                     | Free             |

- **One origin.** The web app and the API share one hostname, for example `play.<domain>`, with the API under `/api`. Then one Access application covers both, and the session cookie needs no cross-site settings.
- **Why a droplet and not App Platform.** On a droplet, `cloudflared` runs next to the API and opens an outbound tunnel. The droplet then needs no public HTTP port, so nobody can go around Cloudflare Access. App Platform is still possible, but then only the JWT check in the API (section 10) protects the origin.
- **Why the API is not on Vercel.** Serverless functions run for a short time only. They cannot keep SSE streams open or run the grace and autopilot timers.
- **Pipeline.** GitHub Actions builds a Docker image and deploys on each push to `main`. The API applies the migrations at start. Secrets are platform environment variables. The health check is `/api/health`.
- **Scaling later.** `PgNotifyBus` and one timer owner (a Postgres advisory lock) let more than one API instance run.

---

## 10. Access control (Cloudflare Access)

Only persons on an allow list can open the game. Cloudflare Access (Zero Trust, free for up to 50 users) checks each request before it reaches the droplet.

- **Access application.** One self-hosted application for `play.<domain>`, covering all paths (the web app, `/api`, `/api/stream`, `/api/telemetry`).
- **Policy.** Allow: a list of email addresses, kept in the Cloudflare dashboard. All other persons get the Cloudflare sign-in page and cannot continue.
- **Sign-in method.** One-time PIN by email (no extra setup). Google can be added as an identity provider later, together with the Google OAuth step of section 5.
- **Session.** Access session of 7 to 30 days, so friends do not sign in each evening.
- **Origin protection.**
  - Cloudflare Tunnel: the droplet has no open HTTP port (firewall allows only SSH).
  - Defence in depth: an API middleware checks the `Cf-Access-Jwt-Assertion` header (signature from the team's public keys, audience tag, expiry). A request without a valid token gets 403. The check is off in local development and in tests (environment flag).
- **Relation to the guest name (section 5).** Access decides who may enter. The guest name stays the in-game identity. Later, the API can read the verified email from the Access token and fill in the name, or link it to the user.
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
| Free Postgres tiers stop when idle, so the first request is slow | Keep the game cache in memory                                        |
| Timers in the API process are lost on a restart          | Make them again from the database at start                                 |

---

## 12. Change log

| Date       | Change                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| 2026-10-31 | First version: architecture, milestones, API, realtime, auth, UI, testing, telemetry, hosting and risks |
| 2026-10-31 | Access control with Cloudflare Access (section 10). Hosting: one droplet behind Cloudflare Tunnel, web and API on one origin |
