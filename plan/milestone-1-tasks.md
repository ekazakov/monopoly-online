# Harborfront: Milestone 1 tasks (local playable game)

|                |                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Companion docs | [implementation-roadmap.md](implementation-roadmap.md), [game-screen-2-spec.md](game-screen-2-spec.md), [game-screen-2-gameplay.md](game-screen-2-gameplay.md) |
| Status         | Draft. Last updated 2026-10-31                                                                     |

**Goal.** Two browser profiles and one hot-seat player finish a game on `localhost`. The engine is complete. The API and the web app are a scaffold.

## Scope rules

- Not in M1: public game list, invite by name, tokens (M2); Finish, Save, Restore, disconnect/autopilot, resign flow (M3); WebSocket, OAuth, rematch (M4); Cloudflare, OpenTelemetry, CI (M5).
- Keep SQL portable (roadmap 3.3). JSON as text, ids as UUID text, times as ISO text.
- Each task: small, own commit (Conventional Commits), `pnpm check` and `pnpm test` green. Controller or DTO changes regenerate `apps/api/openapi.json`.
- Design gaps (sign-in screen, game room) need new artboards: ask before adding them to the canvas.

## Tasks

### A. Foundation (shared + database)

- **A1. Shared schemas.** In `packages/shared`: zod schemas for session, game, seat, join, action request `{ seatId, action, expectedVersion, clientActionId }`, redacted game state, SSE envelope `{ topic, type, version, payload }`, error codes.
- **A2. Migrations and DB types.** `users`, `sessions`, extend `games` (owner, status, seat limit, version), `seats`, `invites`, `game_events`, `game_snapshots`. Update `db/schema.ts`. Test migrations on in-memory SQLite.
- **A3. OpenAPI generation.** Script that writes `apps/api/openapi.json` from the zod routes; commit it.

### B. Session (guest)

- **B1. Session API.** `POST /api/session`, `GET /api/me`, `DELETE /api/session`. Name 2–16 chars, unique, case-insensitive. Cookie HttpOnly, SameSite=Lax; DB stores token hash only. Auth middleware for protected routes. Origin check on state-changing routes.
- **B2. Session tests.** Duplicate name, bad name, expired session, missing cookie.

### C. Game room (lobby, minimal)

- **C1. Create and read game.** `POST /api/games` (owner seat, seat limit), `GET /api/games/:id`. Replace the old unauthenticated `/games` routes.
- **C2. Invite link.** Create link token; `POST /api/invites/:token/accept` joins the device user as a seat. Leave game.
- **C3. Hot-seat seats.** Add and remove a hot-seat seat (owned by the device user, no user id). Rules: min 2, max seat limit, only while `waiting`.
- **C4. Start game.** Owner only. Calls `createGame({ seed })` with the seat list, stores version 0 snapshot, sets status `active`. Seed comes from a test-only env flag when set.
- **C5. Room tests.** Join twice, full room, non-owner start, start with one seat.

### D. Game service

- **D1. State loader.** Load from in-memory cache, else latest snapshot plus events after it.
- **D2. Action endpoint.** `POST /api/games/:id/actions`: check device controls the acting seat (`actorFor`, `mayAct`), check `expectedVersion`, dedupe by `clientActionId`, call `applyAction`, write events (and snapshot at turn start and every N versions) in one transaction.
- **D3. Redaction.** Remove `rng` and deck order from state before it leaves the server. `GET /api/games/:id/state` returns the redacted state with version.
- **D4. Game service tests.** Replay a seeded script through the service; stale version; duplicate action; wrong device; redaction check.

### E. Realtime

- **E1. Bus.** In-memory publish/subscribe by topic.
- **E2. SSE endpoint.** `GET /api/stream?topics=game:<id>` with `streamSSE`, event id = version, heartbeat every 15 s, `X-Accel-Buffering: no`. Publish events after commit in D2. Room changes (join, seat, start) publish on the game topic too.
- **E3. Resume.** Honour `Last-Event-ID`: send missed events, or a fresh snapshot when the gap is too large.
- **E4. Realtime tests.** Open stream, apply actions, reconnect with `Last-Event-ID`, check events.

### F. Web client foundation

- **F1. Tooling.** Add TanStack Router, Vitest + Testing Library for the web app. Routes: sign-in, room, game.
- **F2. Design tokens.** Colours, type and spacing from the design system as CSS variables (spec section 2).
- **F3. API client.** Extend `api.ts` for the new routes; session query; redirect to sign-in without a session.
- **F4. Realtime client.** `RealtimeClient` interface and `SseHttpClient` (`EventSource` + POST). Status and reconnect.
- **F5. Game store.** Applies events to the redacted state, exposes selectors (current player, my seats, phase). Tests for the store with recorded events.
- **F6. Sign-in screen.** Guest name form. Needs a design: ask first.

### G. Game room screen

- **G1. Room view.** Seat list, invite link copy, add/remove hot-seat seat, start button for the owner, live updates by SSE. Needs a design: ask first (existing lobby artboards may cover it).
- **G2. Create game flow.** From sign-in to a new room; join page for invite links.

### H. Game screen (port `artifacts/game-screen`)

- **H1. Layout shell.** Regions per spec 3.1: rail, log, board, centre, hand, menu.
- **H2. Board scene.** Port `board3d.js` into `apps/web/src/scene/`: tiles, tokens, houses, ownership colours. Static data from the engine (`board.ts`, `cards.ts`).
- **H3. Player rail.** Players, money, active turn, device/seat labels (spec 4.3, 5.3).
- **H4. Game log.** Render engine events as text (spec 4.1).
- **H5. Turn area.** Roll, buy, end turn, jail options, doubles; driven by `mayAct`.
- **H6. Property hand.** Collapsed and expanded; build, sell, mortgage, unmortgage from the hand.
- **H7. Dialogs.** Auction, trade, card draw, debt/pay, bankruptcy, leave. One task per dialog.
- **H8. Hot-seat handoff.** Pass-device prompt when the acting seat changes to another hot-seat seat on the same device (gameplay 3).
- **H9. Dice and token animation** from events. Keep optional if time is short.
- **H10. Game end / result screen.** Winner and final standings.

### I. Verification

- **I1. Playwright setup** against `pnpm dev`, with the seed flag.
- **I2. E2E script.** Two browser contexts plus one hot-seat seat: create, join by link, add hot-seat, start, play a short seeded script (roll, buy, rent, trade, end turn).
- **I3. Finish a full game.** Manual run: two profiles + one hot-seat finish a game on `localhost` (milestone done condition). Fix defects found.
- **I4. Docs.** Update the roadmap status, the README (how to run), and sync `artifacts/game-screen` or the design system if the port changed them.

## Order and dependencies

A → B → C → D → E (API done, testable without UI) ; F can start after A1 ; G after C+E+F ; H after D+E+F (H1–H4 can start once D3 exists) ; I last.

## Critical files

- `plan/implementation-roadmap.md`, `plan/game-screen-2-spec.md`, `plan/game-screen-2-gameplay.md`
- `apps/api/src/app.ts`, `db/migrations.ts`, `db/schema.ts`, `app.test.ts`
- `packages/shared/src/`, `packages/game-engine/src/actions.ts` (`actorFor`, `mayAct`), `game.ts` (`createGame`), `reducer.ts`
- `apps/web/src/App.tsx`, `api.ts`, `scene/BoardScene.tsx`, `artifacts/game-screen/js/`
