# Harborfront: Milestone 2 tasks (lobby)

|                |                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Companion docs | [implementation-roadmap.md](implementation-roadmap.md), [api-schema.md](api-schema.md) (section "Milestone 2"), [milestone-1-tasks.md](milestone-1-tasks.md), [game-screen-2-spec.md](game-screen-2-spec.md) |
| Status         | Draft. Last updated 2026-11-03                                                                     |

**Goal.** A player finds a game in a public list, or gets an invite by name, and joins it. Each seat has its own player token (game piece). The host can cancel a game before it starts. The dice and the tokens move with an animation.

## Scope rules

- In M2: public game list, My games, invites by name with a live inbox, player tokens with a picker, Cancel game for the host, and Dice and token animation (moved from M1 H9).
- Not in M2:
  - The host removes a joined player, and the host cancels an invite. The boards `LobbyHostReady` and `LobbyStates` show both, but they are not built.
  - Presence states (reconnecting, away), Finish, Save and Restore (M3).
  - Rematch, WebSocket, OAuth (M4).
  - Playwright and E2E. They stay in M1: Playwright setup (I1) and E2E script (I2).
  - More than 6 figures, and the parked colour-clash question (spec question 5).
- Keep SQL portable (roadmap 3.3). JSON as text, ids as UUID text, times as ISO text.
- Each task: small, own commit (Conventional Commits), `pnpm check` and `pnpm test` green. Controller or DTO changes regenerate `apps/api/openapi.json`.
- Design: ask before you add or change a board on the canvas. Sync `artifacts/` when the design system or the game screen prototype changes (CLAUDE.md).
- Task names: the name comes first, the task code follows in parentheses.

## Decisions

| Topic | Decision |
| --- | --- |
| Token set | 6 tokens for 6 seats: the 4 figures that exist plus a **horse** and a **duck**. Each token has one fixed colour |
| Token keys and colours | `dog` (Scottish terrier) red, `cat` blue, `penguin` green, `car` (racing car) gold, `horse` purple, `duck` teal. The colours are the `--hf-pawn-*` tokens. The free-token order is the same |
| Token pick | Create, join and add-seat give the first free token. The controller of a seat can change its token while the game is `waiting`, in the host view and in the guest view. Start never waits for tokens |
| Invite | Only the host invites. Exact name match, not case-sensitive (`nameKey()`). The invite shows live in the invitee's lobby inbox (Accept, Decline) through the `user:<id>` topic. An invite does not hold a seat. Start sets the pending invites to `expired`. After a decline or an expiry, the host can invite the same user again |
| Cancel game | Host only, while `waiting`. The game row is deleted; seats and invites go by cascade. `room.cancelled` goes out first. A later visit to the link gets 404 |
| Lobby page | Invites inbox, open games (live), My games, create a game, join by link |
| Open games | Only `waiting` games, newest first, at most 50. Full games stay in the list with "Full". Counts show N/6 |
| My games | `waiting` and `active` games where the user has a seat or controls a hot-seat seat. Finished games are not in the list |

## Tasks

Mark a task `[x]` in the commit that completes it.

### A. Design

Ask before you add or change a board. Sync the artifacts.

- [x] **Horse and duck figures (A1).**
  - Outline icons on the 48×48 grid, stroke 2.4. Add them to the avatar set in `GameParts.dc.html`.
  - 3D SDF models in the same style as the 4 figures that exist.
  - Sync `artifacts/game-screen/js/icons.js` (`avatarPaths`), `sculpt.js` (`MAKERS`), `board3d.js` (`METAL` for purple and teal) and `data.js`.
  - Update the avatar set and R-P7 in [game-screen-2-spec.md](game-screen-2-spec.md).
- [x] **Lobby board with inbox and My games (A2).** Add the invites inbox and My games to `Lobby.dc.html`. Change the seat counts to N/6.
- [x] **Token picker boards (A3).** A picker with 6 tokens on `LobbyGuest.dc.html`. Add the same picker to `LobbyHost.dc.html` and `LobbyHostReady.dc.html`.
- [x] **Cancel game confirm (A4).** A confirm step for Cancel game in the host footer of the host boards. The "Game cancelled" notice exists in `LobbyStates.dc.html`.

### B. Shared schemas and database

- [x] **Lobby shared schemas (B1).** In `packages/shared/src`:
  - `tokenSchema`: an enum of the 6 keys. `TOKENS`: the keys in the free-token order.
  - `seatSchema` gets `token`.
  - `gameSchema` gets `invites`: the pending invites, `{ id, userId, name, state }[]`, for the host's seat list.
  - `lobbyGameSchema` and `inviteSchema` (see [api-schema.md](api-schema.md), section "Milestone 2").
  - New error codes in the code list **and** in the status map: `token_taken`, `user_not_found`, `already_invited`, `cannot_invite_self`, `forbidden_topic`.
  - Update the drift test if it is necessary.
- [x] **Seat token migration (B2).** Migration `0005_seat_tokens`, with the steps in this order (if the index comes first, it can fail on rows that exist):
  1. Add `seats.token` as a nullable column.
  2. Backfill it from `seat_order` with a portable `CASE` (1 → `dog`, 2 → `cat`, … 6 → `duck`).
  3. Create the unique index `(game_id, token)`.

  Update `db/schema.ts`. Test the migration on in-memory SQLite with seat rows from before the migration.
- [x] **Invites table migration (B3).** Migration `0006_invites`:
  - Columns: `id`, `game_id` (foreign key, cascade on delete), `invited_user_id`, `invited_by_user_id`, `state` (check: `pending`, `accepted`, `declined`, `expired`), `created_at`, `updated_at`.
  - Unique `(game_id, invited_user_id)`. Index on `(invited_user_id, state)`.

### C. Room API: tokens and cancel

Files: `apps/api/src/rooms/service.ts`, `routes/games.ts`.

- [x] **Token on create, join and add-seat (C1).** Give the first free token in `TOKENS` order. Use `withConflictRetry` for races. 6 tokens = `MAX_SEATS`, so a free token always exists. `toApiGame` maps `token`.
- [x] **Change seat token endpoint (C2).** `PUT /api/games/:id/seats/:seatId/token`, body `{ token }`.
  - Only the controller of the seat: 403 `not_your_seat`.
  - Only while `waiting`: 409 `game_not_waiting`.
  - A token that another seat has: 409 `token_taken`. The unique index is the last guard.
  - Publish `room.updated`.
- [x] **Cancel game endpoint (C3).** `DELETE /api/games/:id`, response 204.
  - Owner only: 403 `not_game_owner`. Only while `waiting`: 409 `game_not_waiting`.
  - In one transaction: read the users with pending invites, then delete the game.
  - After the commit: publish `room.cancelled` on `game:<id>`, `lobby.removed` on `lobby`, and `invites.updated` to each invitee.
- [x] **Token and cancel tests (C4).** 6 seats get 6 different tokens; a token change by a user who does not control the seat; `token_taken`; a token change after start; cancel by a guest; cancel after start; the cascade removes seats and invites. Regenerate `apps/api/openapi.json` in each route task.

### D. Lobby lists API

- [x] **Open games list endpoint (D1).** `GET /api/games?status=waiting` returns `{ games: lobbyGame[] }`.
- [x] **My games endpoint (D2).** `GET /api/me/games` returns `{ games: lobbyGame[] }`.
- [x] **Lobby list tests (D3).** Order and limit; full games stay in the list; started games leave the list; My games has the games where the user only controls a hot-seat seat.

### E. Invites API

- [x] **Invite by name endpoint (E1).** `POST /api/games/:id/invites`, body `{ name }`, response 201 `{ game }`.
  - Host only: 403 `not_game_owner`. Only while `waiting`: 409 `game_not_waiting`.
  - Find the user with `nameKey()`. No match: 404 `user_not_found`.
  - The host invites themself: 409 `cannot_invite_self`. The user has a seat: 409 `already_joined`. A pending invite exists: 409 `already_invited`.
  - A declined or expired invite goes back to `pending`.
  - Publish `room.updated` and `invites.updated` to the invitee.
- [x] **My invites endpoint (E2).** `GET /api/me/invites` returns `{ invites }`, the pending invites of the user.
- [x] **Accept invite endpoint (E3).** `POST /api/invites/:id/accept` returns `{ game }`.
  - Only the invitee, else 404 `not_found`.
  - The join and the change to `accepted` are in one transaction.
  - The join errors stay the same: `game_full`, `game_not_waiting`, `seat_name_taken`.
- [x] **Decline invite endpoint (E4).** `POST /api/invites/:id/decline`, response 204. Only the invitee. Set the state to `declined`, then publish `room.updated` and `invites.updated`.
- [x] **Expire invites at start (E5).** In the start transaction, set the pending invites to `expired`. After the commit, publish `invites.updated` to each invitee.
- [x] **Invite tests (E6).** All refusals of Invite by name endpoint (E1); accept on a full game; accept after start; accept and decline by a user who is not the invitee; a new invite after a decline; start expires the invites.

### F. Realtime

- [x] **Lobby and user stream topics (F1).**
  - `streamTopicSchema` accepts `game:<uuid>`, `lobby` and `user:<uuid>`.
  - Stream route: any signed-in user can open `lobby`. `user:<id>` must be the user of the session, else 403 `forbidden_topic`. `game:` keeps the seated check.
  - Make `gameIdOf`, the topic reader (`realtime/connection.ts`, `resume.ts`) and `sseEventId` work with the 3 kinds of topic.
- [x] **Lobby and invite stream messages (F2).**
  - `lobby.snapshot`, `lobby.updated`, `lobby.removed` on `lobby`; `invites.updated` on `user:<id>`; `room.cancelled` on `game:<id>`. Payloads in [api-schema.md](api-schema.md).
  - Lobby and user messages have **no SSE id**. Thus `Last-Event-ID` stays the engine version of the game topics on the shared EventSource.
  - Each connect to `lobby` or `user:<id>` gets the full list.
  - Publish lobby changes from create, join, leave, seat add and remove, token change, start and cancel, through the room events in `realtime/messages.ts`.
- [x] **Realtime lobby tests (F3).** A lobby connect gets a snapshot; room changes reach the lobby; a `user:` topic of another user gets 403; a game resume with `lobby` in the same stream; cancel sends `room.cancelled`.

### G. Web

- [x] **One token look table (G1).** Can start at once: it fixes a defect that exists now (the server numbers seats from 1, the look tables start at 0, so the host is blue).
  - Merge `screens/game/rail/looks.ts` and `scene/colors.ts` (`PLAYER_LOOKS`) into one map from token to look: `{ label, cssColor, hex, metal, avatar }`.
  - Replace `colorIndex = seat.order` with a lookup by `seat.token` in `GameScreen.tsx`, `PlayerRail.tsx`, `GameLog.tsx`, `AuctionView.tsx`, `HandoffPrompt.tsx`, `LeaveGameMenu.tsx`, `GameResultScreen.tsx` and `buildSceneModel` (`scene/model.ts`).
  - Fixtures (`testing/fakeApi.ts`): `order` starts at 1, and seats have `token`.
  - Regression test: the host at order 1 with the `dog` token shows red.
- [x] **Horse and duck in the web app (G2).** `AvatarIcon` paths in `avatars.tsx`, SDF makers in `scene/sculpt.ts`, and `AvatarKind` with 6 kinds. Depends on Horse and duck figures (A1).
- [x] **Lobby screen (G3).** Replaces `HomeScreen`. Depends on Lobby board with inbox and My games (A2).
  - Invites inbox with Accept and Decline. Accept goes to the room. On `game_full` or `game_not_waiting`, show the "This game is full" notice.
  - Open games: live list with Join, or Full.
  - My games: Open goes to the room (`waiting`) or to `/play` (`active`).
  - Create form and join-by-link field. Keep `gameIdFromInvite`.
  - Subscribe to `lobby` and `user:<me>` with `useTopic`.
  - Empty state "No open games".
- [x] **Token picker in the room (G4).** Depends on Token picker boards (A3) and Horse and duck in the web app (G2).
  - One picker for each seat that the device controls, in the host view and in the guest view.
  - Taken tokens are disabled, with the label "<figure>, taken by <name>". Use `aria-pressed`.
  - Seat rows show the avatar with its colour ring.
  - On `token_taken`, show the error and keep the old token.
- [x] **Invite by name panel (G5).** Host view.
  - Name field and Invite button, with the `LobbyStates` states: no player, already seated, invite sent.
  - Pending invites show as seat rows: "Invited · waiting to accept".
  - The start hint names the invitees who are not seated yet.
- [x] **Cancel game flow (G6).**
  - The host has a Cancel game button with a confirm step (Cancel game confirm (A4)).
  - On `room.cancelled`, each client drops its `game:<id>` subscription and shows "Game cancelled" with Back to lobby. Without the drop, the EventSource connects to the deleted game again and again.
  - A later visit to the link shows the 404 view that exists.
- [x] **Lobby web tests (G7).** The lobby list changes from fake realtime messages; Accept and Decline; the picker shows taken tokens as disabled; the invite states; the cancel notice and the dropped subscription.

### H. Dice and token animation (moved from M1 H9)

- [x] **Dice roll animation (H1).** From `DiceRolled` (`dice`).
- [x] **Token movement animation (H2).** Square by square from `PlayerMoved.from` to `PlayerMoved.to`. `SentToJail` jumps with no steps. Start each move from the position in the event, not from the current state. Queue `game.actions` messages that come one after the other.
- [x] **No animation on snapshot or resume (H3).** A `snapshot` or a resume replay puts the tokens on their squares at once.
- [ ] **Reduced motion fallback (H4). Optional, deferred.** Not built in M2. With `prefers-reduced-motion`, the token would go to its square at once and the dice would show at once (spec R-T6). What exists now: the CSS dice shake stops, and `BoardScene` takes a `reducedMotion` prop for camera damping. Still open: the dice faces change every 80 ms, the 700 ms roll wait stays, and the tokens hop. A later task can make the motion player skip the steps (zero duration) when the preference is on.
- [x] **Animation queue tests (H5).** The queue is a pure model in `scene/`. Test it without a renderer.

### I. Verification

- [ ] **Manual lobby run (I1).** Two browser profiles and one hot-seat seat on `localhost`. Fix the defects that you find.
  - Profile A creates a game. The game shows live in the open games list of profile B.
  - A invites B by name. The invite shows live in the inbox of B. Accept seats B.
  - Two seats try to take the same token. One of them gets `token_taken`.
  - 6 seats show 6 different figures, on the rail and on the board. The host is red.
  - Cancel shows "Game cancelled" to B. The network panel shows no reconnect loop.
  - Start removes the game from the open games list and expires a pending invite.
  - The dice and the token movement have an animation. (The check with reduced motion on is out of M2: see Reduced motion fallback (H4).)
- [ ] **Milestone 2 docs (I2).** Roadmap status, README (if commands changed), [api-schema.md](api-schema.md), and sync `artifacts/` if the port changed them.

### J. Debug panel (unplanned, added 2026-11-03)

A tool to test the game logic. The player on turn edits the game state. Always on for now (gameplay Q23, open question Q24). Design: [game-screen-2-spec.md](game-screen-2-spec.md) 4.7. API: [api-schema.md](api-schema.md), section "Debug edit".

- [x] **Debug edit action (J1).** Engine `DebugEdit` with a batch of `DebugChange` (cash, deed, position; all or nothing) and the `StateEdited` event, in `debug.ts`. Only the player on turn, in `awaiting_roll`, `awaiting_jail_choice`, `awaiting_end_turn` and `awaiting_debt`. Only shape checks; new error code `invalid_edit`. A token move is a teleport; a jailed player who is moved leaves Jail.
- [x] **Debug edit schemas (J2).** `debugChangeSchema`, the action input (1 to 100 changes) and the event in `packages/shared`. The drift test names them as debug only. Regenerate `apps/api/openapi.json`. A service test replays the edits from the log.
- [x] **Debug panel (J3).** `apps/web/src/screens/game/debug/`: a "Debug" disclosure next to Menu with Cash, Deeds and Player tokens. Disabled with a reason when the user may not edit.
- [x] **Debug log lines (J4).** `describe.ts` reads `StateEdited`, for example "Ann (debug): Bo's cash set to $500."
- [x] **Debug panel docs (J5).** This section, the API schema, the engine plan and README, the UI spec (4.7, R-D1 to R-D5), the gameplay doc (Q23, Q24).
- [x] **Debug deed multi-select (J7).** The Deeds list is a multi-select in three groups (Streets, Stations, Utilities). One Apply sends one batch for all chosen deeds.
- [x] **Debug panel in the prototype (J6).** Sync `artifacts/game-screen` with a mock of the panel (CLAUDE.md).

## API decisions

| Topic | Decision |
| --- | --- |
| Token storage | `seats.token`, unique per game. Not in the engine: the engine player id is the seat id, and the web app finds the token through the seat |
| Lobby and user topics | No SSE id. A full list on each connect, so a resume is not necessary |
| Invite and seat | An invite does not hold a seat. Accept is a normal join, with the same errors |
| Cancel | Delete, with cascade. The clients learn it from `room.cancelled` |
| API tests | `app.request` with in-memory SQLite, as in M1. SSE read from the response stream |

New endpoints: `GET /api/games?status=waiting`, `GET /api/me/games`, `PUT /api/games/:id/seats/:seatId/token`, `DELETE /api/games/:id`, `POST /api/games/:id/invites`, `GET /api/me/invites`, `POST /api/invites/:id/accept`, `POST /api/invites/:id/decline`. New topics: `lobby`, `user:<id>`.

## Order and dependencies

- Horse and duck figures (A1) → Horse and duck in the web app (G2) → Token picker in the room (G4).
- Lobby board with inbox and My games (A2) → Lobby screen (G3).
- Token picker boards (A3) → Token picker in the room (G4).
- Shared schemas and database (B) → Room API (C), Lobby lists API (D), Invites API (E) → Realtime (F) → the lobby and room screens (G3–G6).
- One token look table (G1) can start at once.
- Dice and token animation (H) does not depend on the other tasks.
- Verification (I) is last.

## Critical files

- `plan/implementation-roadmap.md`, `plan/api-schema.md`, `plan/game-screen-2-spec.md`
- `apps/api/src/db/migrations.ts`, `db/schema.ts`, `rooms/service.ts` (`changeRoom`, `withConflictRetry`, `toApiGame`, `start`), `routes/games.ts`, `routes/stream.ts`, `realtime/messages.ts`, `realtime/connection.ts`, `realtime/resume.ts`, `auth/sessions.ts` (`nameKey`), `auth/test-helpers.ts`
- `packages/shared/src/games.ts`, `stream.ts`, `errors.ts`
- `apps/web/src/screens/HomeScreen.tsx`, `screens/room/*`, `screens/game/rail/looks.ts`, `avatars.tsx`, `scene/colors.ts`, `scene/sculpt.ts`, `scene/model.ts`, `scene/Tokens.tsx`, `realtime/types.ts`, `realtime/hooks.ts`, `testing/fakeApi.ts`
- `artifacts/design-system/project/Lobby*.dc.html`, `GameParts.dc.html`, `artifacts/game-screen/js/icons.js`, `sculpt.js`, `board3d.js`, `data.js`
