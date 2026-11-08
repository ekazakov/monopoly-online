# Harborfront: API schema for milestones 1 to 4

|                |                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Companion docs | [implementation-roadmap.md](implementation-roadmap.md), [milestone-1-tasks.md](milestone-1-tasks.md), [milestone-2-tasks.md](milestone-2-tasks.md), [milestone-3-tasks.md](milestone-3-tasks.md), [milestone-4-tasks.md](milestone-4-tasks.md) |
| Status         | Milestones 1 and 2 done. Milestones 3 and 4 are plans. Last updated 2026-11-08                                                        |

This document fixes the request and response schema of each API method in milestone 1. The section "Milestone 2" adds the lobby methods. The section "Milestone 3" adds Finish, Save, Restore and presence. The section "Milestone 4" adds Remove player and Google sign-in. The zod schemas live in `packages/shared`.

## Decisions (user answers)
- **State and events:** zod mirror of redacted state, events and the action union in `packages/shared`, plus a drift test against the engine.
- **POST /api/games:** `name` only. Seat limit is always 6 (`MAX_PLAYERS`). No `seatLimit` input, field or column.
- **Resign** is in M1. `actionInputSchema` keeps all 18 engine actions.
- **Game end:** `GameEnded` sets status `finished`. The state stays readable.
- **POST /api/session** when a valid session exists: `409 already_signed_in`.

## Conventions
- Ids are UUID text. Times are ISO 8601 text. JSON only. Bodies are strict objects (unknown keys refused).
- All routes except `GET /api/health`, `GET /api/auth/*` and `POST /api/session` need the session cookie (401 `unauthorized`). State-changing routes also check `Origin` (403 `forbidden_origin`).
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
| 14 | `GET /api/stream?topics=game:<id>` | query `topics` (comma list of `game:<uuid>`, and from M2 also `lobby` and `user:<uuid>`, max 5) | `text/event-stream` | 400 bad topic, 403 `not_a_member`, 403 `forbidden_topic` (M2) |
| 15 | `GET /api/games/:id/result` | – | 200 `{ result }` for `finished` games: `{ gameId, rounds, winner: { seatId, name }, standings: [{ rank, seatId, name, controllerUserId, status: "winner" \| "bankrupt" \| "resigned", outRound, cash, properties, netWorth }] }` in rank order. Round = 1 + floor(`TurnEnded` events so far / seats at start). Net worth = cash + property prices (half when mortgaged) + build cost of houses (hotel = 5). Players who are out show 0 | 400, 401, 403 `not_a_member`, 404, 409 `game_not_finished` |

Rules for rows 8–10: the owner's own seat cannot be removed and the owner cannot leave in M1 (no owner transfer; owner rights never move, gameplay 3.1). Seat names are unique within a game, case-insensitive. When a join fails with `seat_name_taken`, the controller of the hot-seat seat removes it and adds it again with another name.

## SSE stream (row 14)
- Envelope: `{ topic, type, version, payload }`. Heartbeat comment every 15 s.
- SSE `id` = engine version. Only `snapshot` after start and `game.actions` set it. `room.updated` has no id, so the browser keeps the last id.
- Types and payloads:
  - `snapshot`: `{ game, state: redactedState \| null }`. Sent on connect, at start (version 0), and on a resume that cannot replay. `state` null while `waiting`; set for `active` and `finished`.
  - `room.updated`: `{ game }`. Join, leave, seat add/remove. No SSE id. Start sends a `snapshot` instead.
  - `game.actions`: `{ events: gameEvent[], state }`. One message per accepted action.
- Resume: when the gap from `Last-Event-ID` to the current version is 1–100 (`RESUME_MAX_GAP`), the missed `game.actions` are replayed from `game_events`. A larger gap, a missing id or an id that is not a valid version gets a `snapshot`. While `waiting`, every connect gets a `snapshot`. When the browser has closed an EventSource, the client creates a new one with an optional `lastEventId` query cursor (1–15 decimal digits, including `0`). The native `Last-Event-ID` header takes precedence over that query on later retries. A malformed query cursor is 400 `validation_error`. The client keeps the cursor only while retrying the same topic set, and only game actions and started-game snapshots advance it.

## Work this adds to the task list
- A1 splits into: A1a error codes and session schemas; A1b game and seat schemas; A1c action, state and event schemas; A1d stream envelope; A1e drift test (`packages/shared`, dev dependency on `@monopoly/game-engine`: parse `createGame` output minus `rng`/`decks`, parse every event and state from a scripted seeded game, and a type-level equality check of `actionInputSchema` against `Omit<Action, "playerId">`).
- A2: no `invites` table in M1 and no seat limit column; `game_events` has a unique `(game_id, version)` and a unique `(game_id, client_action_id)` for idempotency.
- A3: OpenAPI generated from these schemas (`hono-openapi` or `@hono/zod-openapi`; pick at A3).

## Milestone 2

Task list: [milestone-2-tasks.md](milestone-2-tasks.md). The conventions and the error format above stay the same.

### Decisions (user answers)
- **Tokens:** 6 tokens for 6 seats. Each token has one fixed colour. Create, join and add-seat give the first free token. The controller of a seat can change it while `waiting`.
- **Invites:** host only, exact name match (not case-sensitive). An invite does not hold a seat. Start expires the pending invites.
- **Cancel game:** host only, while `waiting`. The game is deleted (cascade to seats and invites).
- **Lobby topics:** `lobby` and `user:<id>` messages have no SSE id.

### New and changed schemas
| Schema | Shape |
| --- | --- |
| `tokenSchema` | `"dog" \| "cat" \| "penguin" \| "car" \| "horse" \| "duck"`. `TOKENS` keeps this order; it is the free-token order |
| `seatSchema` | adds `token: tokenSchema` |
| `inviteStateSchema` | `"pending" \| "accepted" \| "declined" \| "expired"` |
| `roomInviteSchema` | `{ id, userId, name, state }`: one pending invite in the host's seat list |
| `gameSchema` (room) | adds `invites: roomInvite[]` with the pending invites only. Every `Game` that the API returns has it, for anyone who can read the game |
| `lobbyGameSchema` | `{ id, name, ownerName, status, seatCount, tokens: token[], createdAt }` |
| `inviteSchema` | `{ id, gameId, gameName, hostName, state, createdAt }` |
| `streamTopicSchema` | `game:<uuid>`, `lobby` or `user:<uuid>` |

### New error codes
| Status | Codes |
| --- | --- |
| 403 | `forbidden_topic` (a `user:` topic of another user) |
| 404 | `user_not_found` (invite by name) |
| 409 | `token_taken`, `already_invited`, `cannot_invite_self` |

### New methods
| # | Method and path | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| 16 | `GET /api/games?status=waiting` | query `status` (only `waiting`) | 200 `{ games: lobbyGame[] }`, newest first, at most 50. Full games stay in the list | 400, 401 |
| 17 | `GET /api/me/games` | – | 200 `{ games: lobbyGame[] }`: `waiting` and `active` games where the user has a seat or controls a hot-seat seat | 401 |
| 18 | `PUT /api/games/:id/seats/:seatId/token` | body `{ token }` | 200 `{ game }` | 403 `not_a_member` / `not_your_seat`, 404 seat, 409 `token_taken` / `game_not_waiting` |
| 19 | `DELETE /api/games/:id` | – | 204 | 403 `not_game_owner`, 404, 409 `game_not_waiting` |
| 20 | `POST /api/games/:id/invites` | body `{ name: displayName }` | 201 `{ game }` | 403 `not_game_owner`, 404 `user_not_found`, 409 `cannot_invite_self` / `already_joined` / `already_invited` / `game_not_waiting` |
| 21 | `GET /api/me/invites` | – | 200 `{ invites: invite[] }` (pending only) | 401 |
| 22 | `POST /api/invites/:id/accept` | – | 200 `{ game }`; joins the game and sets the invite to `accepted` in one transaction | 404 (no invite, or not the invitee), 409 `game_full` / `game_not_waiting` / `seat_name_taken` / `already_joined` |
| 23 | `POST /api/invites/:id/decline` | – | 204 | 404 (no invite, or not the invitee), 409 `game_not_waiting` |

Changed methods:
- Rows 5, 7 and 9 (create, join, add seat) give the new seat the first free token.
- Row 11 (start) sets the pending invites to `expired`.
- Row 14 (stream) accepts the new topics. Any signed-in user can open `lobby`. `user:<id>` must be the user of the session (403 `forbidden_topic`).

### New stream messages
| Topic | Type | Payload | When |
| --- | --- | --- | --- |
| `lobby` | `lobby.snapshot` | `{ games: lobbyGame[] }` | Each connect |
| `lobby` | `lobby.updated` | `{ game: lobbyGame }` | Create, join, leave, seat add and remove, token change, invite accept |
| `lobby` | `lobby.removed` | `{ gameId }` | Start, cancel |
| `user:<id>` | `invites.updated` | `{ invites: invite[] }` | Each connect, and each change to the user's invites (new, accept, decline, expire, cancel) |
| `game:<id>` | `room.cancelled` | `{ gameId }` | Cancel. The client drops the topic. No SSE id |

None of these messages has an SSE id. The `version` field of the envelope is 0 for `lobby` and `user:` messages.

### As built (added 2026-11-05)
Rules that the first design did not fix, as the code does them:
- **Accept and decline.** The invitee is checked first: another user, or an unknown id, gets 404 `not_found`. Then `game_not_waiting` (start expires the invite, so an expired invite means a started game). An invite that is `declined` or `accepted` gets 404 `not_found`. Accept then runs a normal join, with `game_full`, `seat_name_taken` and `already_joined`.
- **Join and invite.** A join by the link also sets the pending invite of that user in the game to `accepted`. A new invite after a decline or an expiry uses the same row: the state goes back to `pending`, and `invited_by` and `created_at` are set again, so the inbox shows the time of the new invite.
- **`game.invites`.** The pending invites of the game, oldest first, with the display name of the invited user. They are in every `Game` that the API returns and in `room.updated` and `snapshot`, so a guest sees them too.
- **Open games.** `GET /api/games` needs `status=waiting`. A missing or other value, or an extra key, is 400 `validation_error`. A row's `ownerName` is the account name of the host. The order is `createdAt` newest first, then `id`, so equal times keep one order. My games has no limit.
- **Lobby messages.** `lobby.updated` also goes out when a game is created. `lobby.removed` goes out at start and at cancel. Each `invites.updated` has the full list of that user after the change, and goes to every user whose invites changed: invite, accept, decline, a join by the link, start (expired) and cancel (deleted).
- **Resume.** `Last-Event-ID` is one header for the whole stream, and it is an engine version. It is used only when the stream has exactly one `game:` topic. With two or more game topics every game gets a `snapshot`. `lobby` and `user:` ignore it: each connect gets the full list.
- **Connect.** A lobby or user message that was published before the first read of its topic is dropped, because the full list already covers it. `room.cancelled` is never dropped.
- **Status codes.** Decline and cancel answer 204 with no body.

## Milestone 3

The plan for [milestone-3-tasks.md](milestone-3-tasks.md). The code does not have these methods yet.

### Decisions (user answers)
- **Away players.** The game waits for them in all cases. The server sends no action for an away player. The autopilot is postponed.
- **Return.** Automatic when the original browser opens the game stream.
- **Nobody online.** The game saves itself, with the same work as `POST /save`. No route starts it.
- **Claim.** Only the original controller. Claim is the "I am back" signal for the owner. Presence decides who is online.

### New and changed schemas
| Schema | Change |
| --- | --- |
| `seatSchema` | Adds `claimed: boolean`. True when `seats.claimed_at` is set |
| `lobbyGameSchema` | Adds `ownerId`. `GET /api/me/games` also has `saved` games |
| `gameResultSchema` | `winner` can be null. Adds `finishedBy: string \| null`: the owner's name when the owner finished the game |
| `standingStatusSchema` | Adds `in_game`: the player was still in the game when the owner finished it. These players rank first, by net worth. The players who are out follow, as before |
| `seats` table | Migration `0007_seat_claims`: nullable `claimed_at` |

### New error codes
| Status | Codes |
| --- | --- |
| 409 | `game_not_saved` |

### New methods
All need the session cookie and check `Origin`.

| # | Method and path | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| 24 | `POST /api/games/:id/finish` | – | 200 `{ game }`, status `finished`. From `active` the game rolls back to the start of the turn. From `saved` the state does not change | 403 `not_game_owner`, 404, 409 `game_not_active` (`waiting` or `finished`) |
| 25 | `POST /api/games/:id/save` | – | 200 `{ game }`, status `saved`. The game rolls back to the start of the turn. All claims are cleared | 403 `not_game_owner`, 404, 409 `game_not_active` |
| 26 | `POST /api/games/:id/claim` | – | 200 `{ game }`. Claims the seats that the caller controls | 403 `not_a_member`, 404, 409 `game_not_saved` |
| 27 | `POST /api/games/:id/restore` | – | 200 `{ game, state }`, status `active`. Claims the owner's seats. The state and the version do not change | 403 `not_game_owner`, 404, 409 `game_not_saved` |

### Rollback
- Let W be the current version and T the latest snapshot with `turn_start = 1`. In one transaction: delete the event and snapshot rows above T, write T's state as a new snapshot at W+1 with `turn_start = 1`, and set the games row to W+1 and the new status.
- The version goes up, not back. A device can then use version order in all cases.
- The state keeps `rng` and `decks`, so a restored turn gives the same rolls and cards.
- One save slot and no expiry need no extra data: the save is the latest snapshot.

### Stream messages
- **Finish, Save and Restore** send a `snapshot` with the new game and state. No new message type.
- **`presence.updated`** (new): `{ seats: { [seatId]: "online" | "reconnecting" | "away" } }` on `game:<id>`. No SSE id. Sent on each change and in each connect, also when a resume has nothing to send.
- **Equal versions.** Restore keeps the version of the Save before it, so its `snapshot` repeats that version. A stream delivers a `snapshot` at the version it has already sent. Every other message must be newer. The client must also accept a `snapshot` at its own version.
- **Resume.** A `Last-Event-ID` before a rollback finds a hole in the log and gets a `snapshot`. This is a normal path.

## Milestone 4

The plan for [milestone-4-tasks.md](milestone-4-tasks.md). The code has these methods (2026-11-08). See "As built" at the end of this section.

### Decisions (user answers)
- **Remove a player.** Host only, `waiting` games only, never the host's own seat. It removes the seat of the player and the hot-seat seats that the player controls. There is no ban: the player can join again with the game link.
- **Production sign-in.** Google only. `POST /api/session` is registered only when `GUEST_SIGN_IN_ENABLED=true`. When it is off, the route answers 404.
- **Start rules.** The API does not start when `GUEST_SIGN_IN_ENABLED=true` and `NODE_ENV=production`. Google client values are required in production. In other environments at least one sign-in method must be on.
- **Google data.** Only the Google subject is kept (`auth_identities`). A new Google user types a display name; the Google name is not used.
- **Users.** A guest user and a Google user are always separate. `GET /api/auth/google/start` refuses a signed-in user with 409 `already_signed_in`.

### New and changed schemas
| Schema | Shape |
| --- | --- |
| `removePlayerResponseSchema` | `{ game }`: the game after the removal |
| `authMethodsSchema` | `{ google: boolean, guest: boolean }` |
| `googleNameRequestSchema` | `{ name: displayName }` |
| `roomRemovedPayloadSchema` | `{ gameId }` |
| `auth_identities` table | Migration `0008_auth_identities`: `provider`, `subject`, `user_id`, `created_at`. Unique index on `provider` and `subject` |

### New error codes
| Status | Codes |
| --- | --- |
| 409 | `cannot_remove_self` |
| 502 | `oauth_failed` (the Google exchange failed; the callback sends the browser to the sign-in screen with this code) |

### New and changed methods
| # | Method and path | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| 28 | `DELETE /api/games/:id/players/:userId` (session, Origin check) | – | 200 `{ game }` | 403 `not_game_owner`, 404 `not_found` (no game, a bad id, or the user has no seat), 409 `game_not_waiting`, 409 `cannot_remove_self` |
| 29 | `GET /api/auth/methods` (no session) | – | 200 `{ google, guest }` | – |
| 30 | `GET /api/auth/google/start` (no session) | – | 302 to Google. Sets the `state` and PKCE cookies (HttpOnly, SameSite=Lax, short life) | 404 `not_found` (Google is off), 409 `already_signed_in` |
| 31 | `GET /api/auth/google/callback` (no session) | `code` and `state` in the query | 302 to the web app. A known subject gets a session cookie. A new subject gets a short pending sign-in cookie and goes to the name step. The `state` and PKCE cookies are cleared | A bad `state` or a failed exchange: 302 to the sign-in screen with `oauth_failed` |
| 32 | `POST /api/auth/google/name` (pending sign-in, Origin check) | `{ name }` | 200 `{ user }`. Makes the user, the identity row and the session in one transaction | 400 `validation_error`, 401 `unauthorized` (no pending sign-in), 409 `name_taken` |
| 5 | `POST /api/session` | `{ name }` | As before | 404 when `GUEST_SIGN_IN_ENABLED` is not `true` |

### Stream messages
- **`room.removed`** (new): `{ gameId }` on `user:<removedUserId>`. The removed player gets a notice and goes to the lobby.
- After a removal the other members get `room.updated` on `game:<id>`, and the open list gets `lobby.updated`.
- The server ends the game subscription of the removed user on that stream, when the stream has both `user:<id>` and `game:<id>`. The client drops the topic too. `room.removed` is never dropped on connect, like `room.cancelled`.

### As built (added 2026-11-08)
Rules that the first design did not fix, as the code does them:
- **Remove a player.** The checks run in this order: not the host (403), game not `waiting` (409), the host's own user (409 `cannot_remove_self`), no seat of that user (404). A bad id in the path is 404, not 400. All seats that the user controls go, and the seats are renumbered.
- **`room.removed`.** Published on `user:<id>` with version 0. The web app ignores a `room.updated` that takes away the viewer's own seat, so the removed player does not see a Join button before the notice. After a removal the host's status line says "<name> left": the room announcer uses one text for every seat that goes.
- **Start rules.** `readAuthConfig` (`auth/config.ts`) stops the start for: guest sign-in in production, no method on, production without Google, a part of the three Google values, and a `GUEST_SIGN_IN_ENABLED` value other than `true` or `false`. Empty values count as not set.
- **Guest switch.** `createApp` has guest sign-in off unless `auth.guest` is set; `createTestApp` turns it on. `POST /api/session` stays in the route chain and the OpenAPI document, and answers 404 `not_found` when guest sign-in is off. `pnpm dev` and the Playwright API server set `GUEST_SIGN_IN_ENABLED=true`.
- **Google cookies.** `harborfront_google_state`, `harborfront_google_verifier` and `harborfront_google_pending`: HttpOnly, SameSite=Lax, path `/api/auth/google`, 10 minutes. The state and PKCE cookies are cleared at every callback. The PKCE verifier and the state are 32 random bytes (base64url). The scope is `openid` only.
- **Callback.** It sends the browser to `/` (known user, session cookie set), to `/sign-in?step=name` (new subject) or to `/sign-in?error=oauth_failed` (a Google error, a missing code, a bad or missing state, or a failed exchange). It does not keep the `redirect` search value of the sign-in screen, so a new sign-in ends on `/`.
- **Pending sign-in.** It is in memory (`auth/pending.ts`), holds only the subject, and lives 10 minutes. A restart loses it, and the user starts again. It stays after `name_taken`, so the user can try another name, and it works once.
- **New session at each sign-in.** A known Google user gets a new session row each time. The name step checks the name before the transaction, and again after a failed insert (two requests with one name).
- **Sign-in screen.** It reads `GET /api/auth/methods` once per page load. It shows Google, guest, or both, and a retry button when the methods fail. A 401 from the name step goes to `/sign-in?error=oauth_failed`. The screen does not reload the page after sign-in: a signed-out browser has no stream to close.
- **Not done.** A manual run with a real Google client (G1). Claim from another browser (Q25) is still an open question.

## Debug edit (added 2026-11-03, not in a milestone)

A debug panel on the game screen lets the player on turn edit the game state, to test the game logic. See [game-screen-2-spec.md](game-screen-2-spec.md) §4.7.

### Decisions (user answers)
- **Access:** always on for now, in every game and every environment. Gating it before release is an open question ([game-screen-2-gameplay.md](game-screen-2-gameplay.md) §6).
- **Token move:** a teleport. No landing, no rent, no card, no Start salary, no phase change.
- **Free edits:** only the shape of a change is checked. Uneven building and buildings without the full group are allowed.

### New and changed schemas
| Schema | Shape |
| --- | --- |
| `debugChangeSchema` | `{ kind: "cash", targetId, cash: money }` \| `{ kind: "deed", square, ownerId: playerId \| null, houses: 0–5, mortgaged }` \| `{ kind: "position", targetId, square }`. `ownerId: null` gives the deed back to the bank |
| `actionInputSchema` | adds `{ type: "DebugEdit", changes: debugChange[] }`. A batch of 1 to 100 changes (`MAX_DEBUG_CHANGES`). The server applies them in order, and the batch is all or nothing |
| `gameEventSchema` | adds `{ type: "StateEdited", playerId, change: debugChange }`. A `DebugEdit` gives one `StateEdited` event for each change, in the order of the batch. There is no `PlayerMoved`, so the client does not animate the token |

### Method
Row 13 (`POST /api/games/:id/actions`) accepts `DebugEdit`. The action goes into `game_events` like every other action, so the loader and the stream resume replay it.

| Status | Codes |
| --- | --- |
| 422 | `not_your_turn` (not the player on turn), `wrong_phase` (allowed only in `awaiting_roll`, `awaiting_jail_choice`, `awaiting_end_turn` and `awaiting_debt`), `unknown_player`, `player_inactive` (target or new owner), `not_a_property`, `not_a_street` (buildings on a station or utility), `max_buildings`, `has_buildings` (buildings on a mortgaged deed), `invalid_edit` (new: negative cash, a square off the board, or an empty batch). The first bad change in a batch gives the error, and the state does not change |
