# Harborfront: Milestone 3 tasks (session and resilience)

|                |                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Companion docs | [implementation-roadmap.md](implementation-roadmap.md), [api-schema.md](api-schema.md) (section "Milestone 3"), [game-screen-2-gameplay.md](game-screen-2-gameplay.md) (3.1, 3.2), [milestone-2-tasks.md](milestone-2-tasks.md) |
| Status         | In progress. Docs and boards (A) are done. Last updated 2026-11-06                                 |

**Goal.** The owner can finish a game, or save it and continue it later. The game waits for an away player. When nobody is online, the game saves itself.

**Done when** two browser profiles and one hot-seat seat do these steps on `localhost`, and the Playwright scripts pass:

1. Save a game, restore it, and get the same dice as before the save.
2. Finish a game with no winner.
3. Close one browser: the player goes away, the other players wait, and the player comes back and plays.
4. Close all browsers: the game is saved after the grace time, and the owner can restore it.

## Scope rules

- In M3: Finish, Save and Restore, online, reconnecting and away states, the automatic save, and the Playwright setup and script that are still open from M1.
- Not in M3:
  - The autopilot. It is postponed.
  - Claim from another browser (gameplay Q25), and a change of hot-seat groups on restore.
  - The host removes a joined player.
  - Rematch, WebSocket, OAuth (M4).
  - Reduced motion fallback (M2 H4).
- No engine change. The engine already waits for the player who must act (`actorFor`).
- Keep SQL portable (roadmap 3.3).
- Each task: small, own commit (Conventional Commits), `pnpm check` and `pnpm test` green. Controller or DTO changes regenerate `apps/api/openapi.json`.
- Design: ask before you add or change a board on the canvas. Sync `artifacts/` when the design system or the game screen prototype changes (CLAUDE.md).
- Task names: the name comes first, the task code follows in parentheses.

## Decisions

| Topic | Decision |
| --- | --- |
| Autopilot | Postponed. No server action plays for an away player |
| Away, all cases | The game waits for the player: own turn, debt, auction bid and trade answer. All players wait until the player returns, or the owner uses Save or Finish |
| Nobody online | The game saves itself. The owner can restore and continue it. This is a normal Save, with the rollback to the start of the turn |
| "Nobody" | No seated user has an open game stream, spectators included, and all grace times ended. A spectator who is online keeps the game active. Thus no online device needs a notice for this save |
| Grace time | 60 seconds. It sets the away state and starts the save when nobody is online |
| Return | Automatic. When the original browser opens the game stream, its seats are online again and play from the next decision |
| Claim | Only the original controller. Hot-seat groups do not change on restore. Open question Q25 in the gameplay doc, for review after all milestones |
| Restore | The `saved` status is also the room. Players open the game link and press Claim. The owner presses Start, which is never blocked |
| Discarded actions | A rollback deletes the `game_events` and `game_snapshots` rows after the turn-start snapshot. The result, the log and the resume then need no filter. Cost: no audit record of a discarded turn |
| Rollback version | The version goes up to W+1 and not back: the loader, `connection.ts` and the web store all depend on version order |

## Tasks

Mark a task `[x]` in the commit that completes it.

### A. Docs and design

Ask before you add or change a board. Sync the artifacts.

- [x] **Milestone 3 docs (A1).** This list, the M3 section of [api-schema.md](api-schema.md), the gameplay doc (3.1, 3.2, section 4, Q2, Q6, Q20, Q22, new Q25), the roadmap, the engine README and the glossary.
- [x] **Owner menu and notice boards (A2).** Menu with Save and exit and Finish game, with a confirm step (R-G9). Finished and saved notices. Sync `artifacts/game-screen`.
- [x] **Saved games and restore room boards (A3).** Saved group in `Lobby.dc.html`. Restore room with Claim, "Waiting for <name>" and Start.
- [x] **Away and connection boards (A4).** The rail states exist in the prototype (`artifacts/game-screen/js/app.js`, `conn-dot`): reuse them. Add a connection banner, and a board-centre line "Waiting for <name> to return".

### B. Shared and database

- [ ] **Milestone 3 shared schemas (B1).** `presence.updated`. `claimed` on `seatSchema`. `ownerId` on `lobbyGameSchema`. Result: `winner` nullable, new `finishedBy`, new standing status `in_game`. New error code `game_not_saved`, in the code list **and** in the status map.
- [x] **Seat claim migration (B2).** Migration `0007_seat_claims`: nullable `seats.claimed_at`. Test it on rows from before the migration.

### C. Finish, Save and Restore API

- [ ] **Rollback operation (C1).** `rollbackToTurnStart` in `game/service.ts`, inside the `serialise` queue. Let W be the current version and T the latest `turn_start = 1` snapshot. In one transaction:
  1. Read T.
  2. Delete the event and snapshot rows above T.
  3. Insert T's state as a new snapshot at W+1, with `state.version = W+1` and `turn_start = 1`.
  4. Update `games` with the guard `version = W AND status = 'active'`. Set the version to W+1 and the new status.

  After the commit: `loader.put`, and publish a `snapshot` with the new game and state. In `replayActions`, a hole in the log is now an expected path to a snapshot, with no error log.

  Tests: discards an auction, a trade and a debt; a pending debt from an earlier turn stays; the deleted rows do not come back through the loader after `loader.clear()`; a late retry of a discarded `clientActionId` gets `version_conflict`; a rollback at a turn-start snapshot in `awaiting_bid` (a bankruptcy auction queue) stays valid.
- [ ] **Finish game endpoint (C2).** `POST /api/games/:id/finish`. Owner only: 403 `not_game_owner`. From `active`: rollback. From `saved`: status change and a `snapshot`, with no rollback. Any other status: 409 `game_not_active`.
- [ ] **Save game endpoint (C3).** `POST /api/games/:id/save`. Owner only, `active` only. Clears `claimed_at` on all seats, in the same transaction.
- [ ] **Claim seats endpoint (C4).** `POST /api/games/:id/claim`. Sets `claimed_at` on the seats that the caller controls. Only while `saved`: 409 `game_not_saved`. Publishes `room.updated`.
- [ ] **Restore game endpoint (C5).** `POST /api/games/:id/restore`. Owner only, `saved` only. Sets `active`, claims the owner's seats, and publishes a `snapshot`. The state does not change, so the version stays.
- [ ] **No-winner result (C6).** `buildGameResult` accepts a game with no `GameEnded`: players still in the game rank by net worth, then the players who are out, as today. `finishedBy` is the owner's name.
- [ ] **Saved games in lists (C7).** `listMine` adds `saved`. The lobby groups My games by status and `ownerId`, so no `GET /api/me/saved-games` is necessary.
- [ ] **Session API tests (C8).** Same rolls after restore: save, restore, roll, and compare with the roll of a copy of the state before the save. Save, restore and save again. The refusals. SSE: a `snapshot` reaches a live stream; a reconnect with an old `Last-Event-ID` gets a snapshot.

### D. Presence API

- [ ] **Presence tracker (D1).** `realtime/presence.ts`. In memory: per game, per controller user, a count of open `game:<id>` streams and a grace timer. Open stream = `online`, no stream = `reconnecting`, 60 seconds later = `away`. Inject `graceMs` and the timers (same pattern as `heartbeatMs`). Tests with fake timers: two tabs; a return within the grace time; a return after away; a topic change.
- [ ] **Presence on the stream (D2).** Connect on open and disconnect on abort, for game topics of `active` games. A failed heartbeat write also closes the stream: today `enqueue` hides this failure. Send `presence.updated` on each change and in each connect, also when a resume has nothing to send. Tests extend `routes/stream.test.ts`.
- [ ] **Automatic save (D3).** When all controllers of an `active` game are away, the tracker calls an internal `GameService.saveUnattended`. It goes in the queue and checks the status and the presence again, then does the same work as Save. No route can reach it. Tests: all devices gone gives status `saved` after the grace time; one device online, also a spectator, stops it; a return at the last moment stops it; the owner can restore the game with the same dice.
- [ ] **Presence after restart (D4).** At API start, in `index.ts`, each controller in an `active` game starts a new grace timer. Test: a game with nobody back saves itself. Clear a game's timers when it leaves `active`. At restore, a controller with no open stream is away at once (gameplay 3.1).

### E. Web

- [ ] **Stream and store changes (E1).** The store keeps `presence`. It handles a `snapshot` with status `saved` or `finished`.
- [ ] **Owner menu (E2).** Add Save and exit and Finish game with a confirm step, in `flows/leave/LeaveGameMenu.tsx`. Only for the owner. Depends on Owner menu and notice boards (A2).
- [ ] **Finished and saved notices (E3).** Live change to `saved`: "Game saved by <owner>", OK, then home. `finished` with no winner: "Game finished by <owner>" on a `GameResultScreen` variant with OK. `GameRoute` already goes there for status `finished`. A later visit to a saved game goes to the room.
- [ ] **Saved games in the lobby (E4).** Saved group for the owner: Continue claims the owner's seats and goes to the room, Finish has a confirm step. My games for the others: "Saved", Open goes to the room. Depends on Saved games and restore room boards (A3).
- [ ] **Restore room (E5).** `Room.tsx` for status `saved`: seats with claimed or waiting, Claim for the user's seats, Start for the owner. `saved` must stay in the room: it is not in the `started` check. Depends on Saved games and restore room boards (A3).
- [ ] **Rail presence (E6).** `PlayerRow`: dot and text for remote seats. No dot for the local device.
- [ ] **Connection banner and waiting line (E7).** Banner from the existing `connection` store value. When the player who must act is away, the board centre says "Waiting for <name> to return". The owner also sees that Save and Finish are in the Menu. Depends on Away and connection boards (A4).
- [ ] **Web tests (E8).** Store and components for each task above. Update `testing/fakeApi.ts`.

### F. Browser tests

- [ ] **Playwright setup (F1).** Moved from M1 I1. Use the `GAME_SEED` flag. Add a test-only `PRESENCE_GRACE_MS`, ignored when `NODE_ENV` is `production`, the same as `GAME_SEED`. Close M1 I1 and I2 with a link to here.
- [ ] **Core game script (F2).** Moved from M1 I2. Two contexts, one hot-seat seat: roll, buy, rent, handoff, trade, end turn.
- [ ] **Session and disconnect script (F3).** Close a context: reconnecting, away, and the other player waits. Open it again: back online, and play continues. Save, claim, restore, same dice. Finish: standings with no winner. Close all contexts: the game saves itself, and the owner restores it.

### G. Close

- [ ] **Manual session run (G1).** Two browser profiles and one hot-seat seat. Fix the defects that you find.
- [ ] **Milestone 3 close (G2).** Roadmap status and change log. "As built" notes. Sync `artifacts/`.

## Order and dependencies

- Milestone 3 docs (A1) is first.
- Shared and database (B) → Finish, Save and Restore API (C) and Presence API (D) → Web (E) → Browser tests (F) → Close (G).
- C and D do not depend on each other after B, but both change `game/service.ts`. The Automatic save (D3) uses the Rollback operation (C1), so do C1 before D3.
- The boards (A2 to A4) come before their web tasks.

## Risks

| Risk | Action |
| --- | --- |
| A silent network drop (a laptop sleeps) closes no stream. The server can see the device as online for minutes | Local tests close the stream, so they do not show this. If it is a problem through Cloudflare (M5), add a client ping |
| One absent player stops the game, and only the owner can act | The waiting line tells the players why. If the owner is also absent, the others can only wait or leave. When all leave, the game saves itself |
| The automatic save rolls back the current turn | Accepted: it is the normal Save rule. The same dice and cards come back |
| A player opens the lobby during a game: the game stream closes, so they go away after 60 seconds, and the game waits | Accepted. They return when they open the game again. If this was the last device, the game saves itself |
| Claim has no effect on play: presence decides who is online | Claim is the "I am back" signal for the owner. Review it with Q25 |

## Critical files

- `packages/shared/src/games.ts`, `stream.ts`, `result.ts`, `errors.ts`
- `apps/api/src/game/service.ts`, `loader.ts`, `result.ts`, `realtime/messages.ts`, `connection.ts`, `resume.ts`, new `realtime/presence.ts`, `routes/gameplay.ts`, `stream.ts`, `result.ts`, `rooms/service.ts` (`listMine`, `toApiGame`), `db/migrations.ts`, `db/schema.ts`, `app.ts`, `index.ts`
- `apps/web/src/game/store.ts`, `game/selectors.ts`, `screens/GameScreen.tsx`, `screens/room/Room.tsx`, `screens/lobby/LobbyScreen.tsx`, `screens/result/GameResultScreen.tsx`, `screens/game/rail/PlayerRow.tsx`, `screens/game/flows/leave/LeaveGameMenu.tsx`, `testing/fakeApi.ts`
- `artifacts/design-system/project/Lobby*.dc.html`, `TurnArea.dc.html`, `artifacts/game-screen/js/app.js`
