# Harborfront: API schema for milestone 1

|                |                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Companion docs | [implementation-roadmap.md](implementation-roadmap.md), [milestone-1-tasks.md](milestone-1-tasks.md) |
| Status         | Draft. Last updated 2026-10-31                                                                    |

This document fixes the request and response schema of each API method in milestone 1. The zod schemas live in `packages/shared`.

## Decisions (user answers)
- **State and events:** zod mirror of redacted state, events and the action union in `packages/shared`, plus a drift test against the engine.
- **POST /api/games:** `name` only. Seat limit is always 6 (`MAX_PLAYERS`). No `seatLimit` input, field or column.
- **Resign** is in M1. `actionInputSchema` keeps all 18 engine actions.
- **Game end:** `GameEnded` sets status `finished`. The state stays readable.
- **POST /api/session** when a valid session exists: `409 already_signed_in`.

## Conventions
- Ids are UUID text. Times are ISO 8601 text. JSON only. Bodies are strict objects (unknown keys refused).
- All routes except `GET /api/health` and `POST /api/session` need the session cookie (401 `unauthorized`). State-changing routes also check `Origin` (403 `forbidden_origin`).
- **Engine player id = seat id.** The server sets `playerId` from `seatId`; clients never send `playerId`.
- **Seat check and turn check.** The API checks only that the device controls `seatId` (403 `not_your_seat`). The engine checks the actor and the phase (422 `not_your_turn`, `wrong_phase`).
- Error body stays `{ error: { code, message, issues? } }` (`apiErrorSchema`). Version conflicts add `currentVersion`.
- Files in `packages/shared/src`: `errors.ts` (extend), `session.ts`, `games.ts` (extend), `actions.ts`, `state.ts`, `events.ts`, `stream.ts`, `index.ts` (re-export).

## Shared building blocks
| Schema | Shape |
| --- | --- |
| `userSchema` | `{ id, name, createdAt }` |
| `displayNameSchema` | string, trim, 2–16 chars |
| `seatNameSchema` | string, trim, 2–16 chars (same as `displayNameSchema`) |
| `seatSchema` | `{ id, order, name, kind: "user" \| "hotseat", userId: string \| null, controllerUserId }` (hot-seat: `userId` null) |
| `gameStatusSchema` | `"waiting" \| "active" \| "saved" \| "finished"` (M1 uses `waiting`, `active`, `finished`) |
| `gameSchema` (room) | `{ id, name, status, ownerId, version, createdAt, seats: seat[] }`. `version` is the engine version: 0 while `waiting`; room changes do not change it |
| `actionInputSchema` | discriminated union on `type`, the 18 engine actions without `playerId`. Fields as engine: `square` (int 0–39) for Build, SellBuilding, Mortgage, Unmortgage; `amount` (int ≥ 0) for Bid; `toPlayerId`, `give`, `get` for ProposeTrade (`tradeOfferSchema`: `{ cash, squares[], jailCards[] }`) |
| `playerSchema`, `ownershipSchema`, `debtSchema`, `auctionSchema`, `tradeSchema`, `turnSchema` | Mirror engine `state.ts` |
| `redactedGameStateSchema` | Engine `GameState` without `rng` and `decks`: `{ version, players, ownership, turn, debts, auction, trade }` |
| `gameEventSchema` | Union of the 31 engine events, discriminated on `type` |
| `engineErrorCodes` | The engine `GameErrorCode` list, used as API error codes |
| `streamEnvelopeSchema` | `{ topic, type, version, payload }` (see stream) |

## Error codes and HTTP status
| Status | Codes |
| --- | --- |
| 400 | `bad_request`, `validation_error` |
| 401 | `unauthorized` |
| 403 | `forbidden_origin`, `not_game_owner`, `not_a_member`, `not_your_seat` |
| 404 | `not_found` (game, seat, route) |
| 409 | `already_signed_in`, `name_taken`, `already_joined`, `game_full`, `game_not_waiting`, `game_not_active`, `game_not_finished`, `not_enough_players`, `seat_name_taken`, `owner_cannot_leave`, `cannot_remove_user_seat`, `version_conflict` (adds `currentVersion`) |
| 422 | Engine rejection: `not_your_turn`, `wrong_phase`, `insufficient_funds`, … (all engine codes) |
| 500 | `internal_error` |

The engine code `not_owner` means "does not own the property". Owner-only API routes use `not_game_owner` to avoid the clash.

## Methods
| # | Method and path | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| 1 | `GET /api/health` | – | 200 `{ status: "ok" }` | – |
| 2 | `POST /api/session` | body `{ name: displayName }` | 201 `{ user }` + `Set-Cookie` (HttpOnly, SameSite=Lax; Secure unless `NODE_ENV` is `development` or `test`) | 400 validation, 409 `already_signed_in`, 409 `name_taken` |
| 3 | `GET /api/me` | – | 200 `{ user }` | 401 |
| 4 | `DELETE /api/session` | – | 204, cookie cleared | 401 |
| 5 | `POST /api/games` | body `{ name }` (1–60) | 201 `{ game }`; owner gets seat 1 named after their display name | 401, 400 |
| 6 | `GET /api/games/:id` | – | 200 `{ game }` (any signed-in user; this is the invite page) | 401, 404 |
| 7 | `POST /api/games/:id/join` | – | 200 `{ game }`; new seat named after the user | 404, 409 `already_joined` / `game_full` / `game_not_waiting` / `seat_name_taken` (a hot-seat seat has the user's name) |
| 8 | `POST /api/games/:id/leave` | – | 200 `{ game }`; removes the user's seats, hot-seats included | 404, 403 `not_a_member`, 409 `owner_cannot_leave` / `game_not_waiting` |
| 9 | `POST /api/games/:id/seats` | body `{ name: seatName }` (2–16) | 201 `{ game }`; hot-seat seat controlled by the caller | 403 `not_a_member`, 409 `game_full` / `seat_name_taken` / `game_not_waiting` |
| 10 | `DELETE /api/games/:id/seats/:seatId` | – | 200 `{ game }` | 403 `not_a_member` / `not_your_seat`, 404 seat, 409 `cannot_remove_user_seat` / `game_not_waiting` |
| 11 | `POST /api/games/:id/start` | – | 200 `{ game, state }` (status `active`, version 0) | 403 `not_game_owner`, 409 `not_enough_players` / `game_not_waiting` |
| 12 | `POST /api/games/:id/actions` | body `{ seatId, action: actionInput, expectedVersion: int ≥ 0, clientActionId: uuid }` | 200 `{ version, events, state }`. A repeat of the same `clientActionId` returns the stored `version` and `events` with the current `state`, so `state.version` can be greater than `version` | 403 `not_a_member` / `not_your_seat`, 404 seat, 409 `game_not_active` (`waiting` or `finished`) / `version_conflict`, 422 engine code |
| 13 | `GET /api/games/:id/state` | – | 200 `{ version, state }` for `active` and `finished` games | 403 `not_a_member`, 409 `game_not_active` (only while `waiting`) |
| 14 | `GET /api/stream?topics=game:<id>` | query `topics` (comma list, only `game:<uuid>`, max 5) | `text/event-stream` | 400 bad topic, 403 `not_a_member` |
| 15 | `GET /api/games/:id/result` | – | 200 `{ result }` for `finished` games: `{ gameId, rounds, winner: { seatId, name }, standings: [{ rank, seatId, name, controllerUserId, status: "winner" \| "bankrupt" \| "resigned", outRound, cash, properties, netWorth }] }` in rank order. Round = 1 + floor(`TurnEnded` events so far / seats at start). Net worth = cash + property prices (half when mortgaged) + build cost of houses (hotel = 5). Players who are out show 0 | 400, 401, 403 `not_a_member`, 404, 409 `game_not_finished` |

Rules for rows 8–10: the owner's own seat cannot be removed and the owner cannot leave in M1 (no owner transfer; owner rights never move, gameplay 3.1). Seat names are unique within a game, case-insensitive. When a join fails with `seat_name_taken`, the controller of the hot-seat seat removes it and adds it again with another name.

## SSE stream (row 14)
- Envelope: `{ topic, type, version, payload }`. Heartbeat comment every 15 s.
- SSE `id` = engine version. Only `snapshot` after start and `game.actions` set it. `room.updated` has no id, so the browser keeps the last id.
- Types and payloads:
  - `snapshot`: `{ game, state: redactedState \| null }`. Sent on connect, at start (version 0), and on a resume that cannot replay. `state` null while `waiting`; set for `active` and `finished`.
  - `room.updated`: `{ game }`. Join, leave, seat add/remove. No SSE id. Start sends a `snapshot` instead.
  - `game.actions`: `{ events: gameEvent[], state }`. One message per accepted action.
- Resume: when the gap from `Last-Event-ID` to the current version is 1–100 (`RESUME_MAX_GAP`), the missed `game.actions` are replayed from `game_events`. A larger gap, a missing id or an id that is not a valid version gets a `snapshot`. While `waiting`, every connect gets a `snapshot`.

## Work this adds to the task list
- A1 splits into: A1a error codes and session schemas; A1b game and seat schemas; A1c action, state and event schemas; A1d stream envelope; A1e drift test (`packages/shared`, dev dependency on `@monopoly/game-engine`: parse `createGame` output minus `rng`/`decks`, parse every event and state from a scripted seeded game, and a type-level equality check of `actionInputSchema` against `Omit<Action, "playerId">`).
- A2: no `invites` table in M1 and no seat limit column; `game_events` has a unique `(game_id, version)` and a unique `(game_id, client_action_id)` for idempotency.
- A3: OpenAPI generated from these schemas (`hono-openapi` or `@hono/zod-openapi`; pick at A3).
