# Harborfront: Milestone 1 tasks (local playable game)

|                |                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Companion docs | [implementation-roadmap.md](implementation-roadmap.md), [api-schema.md](api-schema.md), [game-screen-2-spec.md](game-screen-2-spec.md), [game-screen-2-gameplay.md](game-screen-2-gameplay.md) |
| Status         | Draft. Last updated 2026-10-31                                                                     |

**Goal.** Two browser profiles and one hot-seat player finish a game on `localhost`. The engine is complete. The API and the web app are a scaffold.

## Scope rules

- Not in M1: public game list, invite by name, player tokens (M2); Finish, Save, Restore, disconnect/autopilot (M3); WebSocket, OAuth, rematch (M4); Cloudflare, OpenTelemetry, CI (M5).
- Resign is in M1. The engine has it, and it is the only way to end a game early before Finish (M3).
- Keep SQL portable (roadmap 3.3). JSON as text, ids as UUID text, times as ISO text.
- Each task: small, own commit (Conventional Commits), `pnpm check` and `pnpm test` green. Controller or DTO changes regenerate `apps/api/openapi.json`.
- Design gaps (game room, game result) need new artboards: ask before adding them to the canvas.

## Tasks

Mark a task `[x]` in the commit that completes it. Design for F6 is done (board `SignIn.dc.html`); the screen itself is not.

### A. Foundation (shared + database)

- [ ] **A1. Shared schemas.** Schemas per [api-schema.md](api-schema.md), in `packages/shared`. Sub-tasks:
  - [ ] **A1a.** Error codes and session schemas.
  - [ ] **A1b.** Game and seat schemas.
  - [ ] **A1c.** Action, redacted state and event schemas (zod mirror of the engine).
  - [ ] **A1d.** Stream envelope schemas.
  - [ ] **A1e.** Drift test against the engine.
- [x] **A2. Migrations and DB types.** `users`, `sessions`, extend `games` (owner, status, version), `seats`, `game_events` (unique `(game_id, version)` and `(game_id, client_action_id)`), `game_snapshots`. No seat limit column: the limit is always 6 (`MAX_PLAYERS`). Update `db/schema.ts`. Test migrations on in-memory SQLite.
- [ ] **A3. OpenAPI generation.** Script that writes `apps/api/openapi.json` from the zod routes; commit it.

### B. Session (guest)

- [ ] **B1. Session API.** `POST /api/session`, `GET /api/me`, `DELETE /api/session`. Name 2–16 chars, unique, case-insensitive. Cookie HttpOnly, SameSite=Lax, and Secure unless `NODE_ENV` is `development` or `test`; DB stores token hash only. Auth middleware for protected routes. Origin check on state-changing routes.
- [ ] **B2. Session tests.** Duplicate name, bad name, expired session, missing cookie.

### C. Game room (lobby, minimal)

- [ ] **C1. Create and read game.** `POST /api/games` (name only; owner seat), `GET /api/games/:id`. Replace the old unauthenticated `/games` routes.
- [ ] **C2. Join by game id.** The game id is the invite (link `/games/<uuid>`). `POST /api/games/:id/join` seats the device user while the game is `waiting` and a seat is free. Join fails with `seat_name_taken` when a hot-seat seat already has the user's name; the controller of that seat removes it and adds it again with another name. `POST /api/games/:id/leave`. No invite token.
- [ ] **C3. Hot-seat seats.** Add and remove a hot-seat seat (owned by the device user, no user id). Rules: name 2–16 chars, unique in the game (case-insensitive), max 6 seats (`MAX_PLAYERS`), only while `waiting`.
- [ ] **C4. Start game.** Owner only, min 2 seats. Calls `createGame({ seed })` with the seat list, stores version 0 snapshot, sets status `active`. Seed comes from a test-only env flag when set.
- [ ] **C5. Room tests.** Join twice, full room, non-owner start, start with one seat, join with a name a hot-seat seat already has.

### D. Game service

- [ ] **D1. State loader.** Load from in-memory cache, else latest snapshot plus events after it.
- [ ] **D2. Action endpoint.** `POST /api/games/:id/actions`: check that the device controls `seatId` (else 403 `not_your_seat`), check `expectedVersion`, dedupe by `clientActionId`, call `applyAction` (the engine checks the actor and the phase: 422 `not_your_turn`, `wrong_phase`), write events (and snapshot at turn start and every N versions) in one transaction. When the events contain `GameEnded`, set status `finished` in the same transaction. A repeat of a `clientActionId` returns the stored version and events with the current state.
- [ ] **D3. Redaction.** Remove `rng` and deck order from state before it leaves the server. `GET /api/games/:id/state` returns the redacted state with version, for `active` and `finished` games. Only a seated user may read state or open the stream.
- [ ] **D4. Game service tests.** Replay a seeded script through the service; stale version; duplicate action; wrong device; seat that is not the actor; resign; a game that ends is `finished`, its state stays readable and actions are refused; redaction check.

### E. Realtime

- [x] **E1. Bus.** In-memory publish/subscribe by topic.
- [ ] **E2. SSE endpoint.** `GET /api/stream?topics=game:<id>` with `streamSSE`, heartbeat every 15 s, `X-Accel-Buffering: no`. Message types and payloads per [api-schema.md](api-schema.md) (SSE stream): `snapshot`, `room.updated`, `game.actions`. SSE `id` = engine version, set only on `snapshot` after start and on `game.actions`. Publish after commit in D2. Room changes (join, leave, seat add/remove) publish `room.updated` on the game topic; start publishes a `snapshot`.
- [ ] **E3. Resume.** Honour `Last-Event-ID`: replay the missed `game.actions` from `game_events` when the gap is 1–100 versions (`RESUME_MAX_GAP`). Send a `snapshot` when the gap is larger, or the id is missing or not a valid version. While `waiting`, every connect gets a `snapshot`.
- [ ] **E4. Realtime tests.** Open stream, apply actions, reconnect with `Last-Event-ID`, check events. Check a gap above the limit and a reconnect while `waiting`.

### F. Web client foundation

- [x] **F1. Tooling.** Add TanStack Router, Vitest + Testing Library for the web app. Routes: sign-in, room, game.
- [x] **F2. Design tokens.** Colours, type and spacing from the design system as CSS variables (spec section 2).
- [ ] **F3. API client.** Extend `api.ts` for the new routes; session query; redirect to sign-in without a session.
- [ ] **F4. Realtime client.** `RealtimeClient` interface and `SseHttpClient` (`EventSource` + POST). Status and reconnect.
- [ ] **F5. Game store.** Keeps the latest redacted state from the stream and the action responses (no client reducer). Events drive the log and the animations. Exposes selectors (current player, my seats, phase). Tests for the store with recorded messages.
- [ ] **F6. Sign-in screen.** Guest name form. Design: board `SignIn.dc.html` in the design system canvas (eight states and a11y notes). On 409 `already_signed_in`, read `/api/me` and go on.

### G. Game room screen

- [ ] **G1. Room view.** Seat list, invite link copy, add/remove hot-seat seat, start button for the owner, live updates by SSE. On `seat_name_taken` at join, tell the user to ask the seat's controller to change it. Needs a design: ask first (existing lobby artboards may cover it).
- [ ] **G2. Create game flow.** From sign-in to a new room; join page for the game link.

### H. Game screen (port `artifacts/game-screen`)

- [ ] **H1. Layout shell.** Regions per spec 3.1: rail, log, board, centre, hand, menu.
- [ ] **H2. Board scene.** Port `board3d.js` into `apps/web/src/scene/`: tiles, tokens, houses, ownership colours. Static data from the engine (`board.ts`, `cards.ts`).
- [ ] **H3. Player rail.** Players, money, active turn, device/seat labels (spec 4.3, 5.3).
- [ ] **H4. Game log.** Render engine events as text (spec 4.1).
- [ ] **H5. Turn area.** Roll, buy, end turn, jail options, doubles. Buttons that send engine actions are driven by `mayAct`. Rent and tax are paid automatically and have no button; the card OK only closes the card on this device (gameplay 2).
- [ ] **H6. Property hand.** Collapsed and expanded; build, sell, mortgage, unmortgage from the hand.
- [ ] **H7. Board-centre flows.** Auction, trade, card draw, debt/pay, bankruptcy, Leave game (resign; on a shared device it asks which seat resigns). No modals (spec 5.2). One task per flow.
- [ ] **H8. Hot-seat handoff.** Pass-device prompt when the acting seat changes to another hot-seat seat on the same device (gameplay 3).
- [ ] **H9. Dice and token animation** from events. Keep optional if time is short.
- [ ] **H10a. Result artboard.** A "Game result" board in the design system: winner, final standings, Back to home. Ask before adding it to the canvas.
- [ ] **H10. Game end / result screen.** Winner and final standings, per the H10a board. The game route shows it when the status is `finished`, also after a reload.

### I. Verification

- [ ] **I1. Playwright setup** against `pnpm dev`, with the seed flag.
- [ ] **I2. E2E script.** Two browser contexts plus one hot-seat seat: create, join by link, add hot-seat, start, play a short seeded script (roll, buy, rent, a hot-seat handoff, trade, end turn).
- [ ] **I3. Finish a full game.** Manual run: two profiles + one hot-seat finish a game on `localhost` (milestone done condition). Fix defects found.
- [ ] **I4. Docs.** Update the roadmap status, the README (how to run), and sync `artifacts/game-screen` or the design system if the port changed them.

## API decisions

| Topic            | Decision                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| Realtime message | Typed messages (`snapshot`, `room.updated`, `game.actions`). `game.actions` holds the events and the new redacted state. The client keeps the state; the log and animations use the events |
| Persistence      | `game_events` and `game_snapshots`: a snapshot at start, at each turn start and every N versions                  |
| Invite           | The game id is the invite. Anyone signed in can join while the game is `waiting` and a seat is free; no revoke     |
| Seat limit       | Always 6 (`MAX_PLAYERS`). Not an input and not a column                                                            |
| Game end         | `GameEnded` sets status `finished`. The state stays readable                                                       |
| API tests        | `app.request` with in-memory SQLite, as in `apps/api/src/app.test.ts`; SSE read from the response stream           |

Endpoints: `POST /api/session`, `GET /api/me`, `DELETE /api/session`; `POST /api/games`, `GET /api/games/:id`, `POST /api/games/:id/join`, `/leave`, `/seats` (add hot-seat), `DELETE /api/games/:id/seats/:seatId`, `/start`; `POST /api/games/:id/actions`, `GET /api/games/:id/state`; `GET /api/stream?topics=game:<id>`.

## Order and dependencies

A → B → C → D → E (API done, testable without UI) ; F can start after A1 ; G after C+E+F ; H after D+E+F (H1–H4 can start once D3 exists) ; I last.

## Critical files

- `plan/implementation-roadmap.md`, `plan/api-schema.md`, `plan/game-screen-2-spec.md`, `plan/game-screen-2-gameplay.md`
- `apps/api/src/app.ts`, `db/migrations.ts`, `db/schema.ts`, `app.test.ts`
- `packages/shared/src/`, `packages/game-engine/src/actions.ts` (`actorFor`, `mayAct`), `game.ts` (`createGame`), `reducer.ts`
- `apps/web/src/App.tsx`, `api.ts`, `scene/BoardScene.tsx`, `artifacts/game-screen/js/`
