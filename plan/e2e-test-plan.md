# Harborfront: E2E test plan

|                |                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Companion docs | [milestone-3-tasks.md](milestone-3-tasks.md) (section F), [implementation-roadmap.md](implementation-roadmap.md) (section 7), [milestone-2-tasks.md](milestone-2-tasks.md), [game-screen-2-gameplay.md](game-screen-2-gameplay.md) (3.1, 3.2) |
| Status         | Planned. No Playwright code exists yet. Last updated 2026-11-06                                    |

This document is the plan for the browser tests of Milestone 3, section F:

- Playwright setup (F1)
- Core game script (F2)
- Session and disconnect script (F3)

It also covers the M1 and M2 flows on `milestone-3`. Scenario codes are `T01` to `T26`. These codes are for this document only.

## 1. Purpose and scope

**Purpose.** Cover the flows that only a real browser, a real API and a real stream can prove: live updates between devices, handoffs and session recovery.

**Rule.** Do not repeat Vitest. Vitest keeps each refusal, each error code, the empty states and the rule edge cases.

**Not in scope:**

- Visual regression and WebGL pixel checks.
- Firefox and WebKit. Chromium only. A later change adds a browser as one config project.
- Load tests.
- The autopilot (postponed in M3), and claim from another browser (gameplay Q25).

## 2. Architecture

Add a new workspace package, `apps/e2e` (`@monopoly/e2e`). The existing `apps/*` glob includes it.

```
apps/e2e/
  package.json          scripts: test (guard only), e2e, e2e:ui, e2e:report
  playwright.config.ts
  tsconfig.json         so that `pnpm check` covers the package
  scripts/find-seed.ts  finds and prints a seed for a seat layout
  src/seed.ts           pinned seed, dice and expected cash
  src/seed.test.ts      Vitest guard: the pinned dice still come from the engine
  support/players.ts    fixture: one browser context per device, unique names
  support/flows.ts      signIn, createGame, join, addHotSeat, start
  support/game.ts       roll, buy, endTurn, confirmHandoff, expectLog, expectCash
  support/api.ts        debugEdit, readState and playRolls through context.request
  tests/*.spec.ts       the scenarios
```

- **Spec names.** The Vitest includes and the Vitest lint override use `*.test.ts`, so they do not take `*.spec.ts`.
- **Separate script.** `pnpm test` runs before each commit and must stay fast. From this package, `vp run -r test` runs only `src/seed.test.ts`.

## 3. Server stacks

Playwright `webServer` starts dedicated stacks. It never uses a running `pnpm dev`, because `pnpm dev` has no seed and uses your real database.

| Stack    | Web  | API  | `GAME_SEED` | `PRESENCE_GRACE_MS` | Used by                      |
| -------- | ---- | ---- | ----------- | ------------------- | ---------------------------- |
| core     | 5174 | 8788 | 49          | default (60 s)      | all projects except presence |
| presence | 5175 | 8789 | 49          | 3000                | presence project             |

Settings for the two stacks:

- API: `node src/index.ts` (no `--watch`), `NODE_ENV=development`, `DB_PATH=:memory:`. Each run starts with an empty database.
- Web: `vp dev --port <n> --strictPort`.
- `reuseExistingServer: false`. A port that is in use stops the run with a clear error.
- `NODE_OPTIONS=""`, because the README warns about conflicting flags.
- `E2E_PORT_BASE` moves all four ports, for a second worktree.

**Why two stacks.** On the core stack, a 3-second grace time could save a game while a slow test has no open stream. On the presence stack, a 60-second grace time makes the tests too slow.

**Product changes that the setup needs:**

- `apps/web/vite.config.ts`: the proxy target reads `API_PROXY_TARGET`, default `http://localhost:8787`.
- `apps/api/src/index.ts`: read the test-only `PRESENCE_GRACE_MS`. Ignore it when `NODE_ENV` is `production`, the same as `GAME_SEED`.
- Reduced motion fallback (H4): see section 5.
- `.gitignore`: `test-results/`, `playwright-report/`.
- `pnpm-workspace.yaml`: `@playwright/test` in the catalog, at a version that meets the release-age policy.
- Root `package.json`: `test:e2e`, `test:e2e:ui`, `test:e2e:report`.

## 4. Determinism

The engine replay for this plan gave the values in this section. The dice sequence is the same when a player buys and when a player declines.

**Seat order.** The seat order must be host, guest, hot-seat. Thus **the guest joins before the host adds the hot-seat seat**. Another order gives another turn order.

### Seed 49

Turn order with 3 seats: host, hot-seat, guest. Turn order with 2 seats (host, guest): guest, host.

| Roll    | 1   | 2   | 3   | 4   | 5   | 6   |
| ------- | --- | --- | --- | --- | --- | --- |
| 3 seats | 6,2 | 4,2 | 3,5 | 1,5 | 2,5 | 2,1 |
| 2 seats | 2,6 | 2,4 | 2,3 | 5,1 | 5,2 | 5,2 |

First turns with 3 seats, when each player buys:

| Roll | Player   | Result                                    | Cash after the turn |
| ---- | -------- | ----------------------------------------- | ------------------- |
| 1    | Host     | Lands on Cobble Street (8), buys for $100 | $1,400              |
| 2    | Hot-seat | Lands on Lantern Row (6), buys for $100   | $1,400              |
| 3    | Guest    | Lands on Cobble Street, pays $6 rent      | $1,494; host $1,406 |

Later rolls with 3 seats, when each player buys:

- Roll 14 (3,3, hot-seat): the first double. It lands on Go to Jail, so it gives no extra roll.
- Roll 15 (6,6, guest): the first "Roll again". It lands on Income Tax.
- Roll 16 (3,5, guest): the extra roll. It lands on Power Works.

Top cards: Chance "Harbour master's party" (pay $50 to each player). Chest "Get Out of Jail Free".

### Setup with the debug edit

`support/api.ts` sends `DebugEdit` through `POST /api/games/:id/actions`, with the session cookies of the context. It sets cash, deeds and position for the player on turn. A teleport does not use the seed. Thus the next roll stays the same, and the test knows the landing square.

The first roll with 3 seats is 8 for the host:

| State wanted | Setup                                                  | Result of the roll                                              |
| ------------ | ------------------------------------------------------ | --------------------------------------------------------------- |
| Jail         | Teleport to 22                                         | Go to Jail. The turn ends at once                               |
| Chance card  | Teleport to 39                                         | Square 7. Host cash is $1,600: $200 salary, $50 to each player  |
| Chest card   | Teleport to 34                                         | Square 2. Host cash is $1,700 and the host holds the jail card  |
| Debt         | Teleport to 30, cash $10, give Grand Pier to the host  | Luxury Tax (38). `awaiting_debt`, $100 to the bank              |

The first roll with 2 seats is 8 for the guest:

| State wanted | Setup                                   | Result of the roll                      |
| ------------ | --------------------------------------- | --------------------------------------- |
| Bankruptcy   | Teleport to 30, cash $10, no deeds      | Luxury Tax. Bankrupt at once, game over |

**Caution.** A player with no deeds who cannot pay goes bankrupt at once. There is no debt view. A debt test must give the player a deed.

**Doubles.** `playRolls` plays rolls 1 to 14 through the API with the buy policy. The guest then plays roll 15 in the UI.

**If the debug panel gets a gate (gameplay Q24).** The stacks turn it on with a flag. All setup goes through one helper, so only the helper changes.

### Guards

- `src/seed.test.ts` fails in `pnpm test` if an engine change moves the pinned dice.
- The first roll of each game test checks the log line, for example "rolled 6 and 2". A drift then shows a clear failure and not a timeout.
- `scripts/find-seed.ts` finds a new seed when necessary.

## 5. Test design rules

- **Devices.** One browser context is one device (own cookies). Context A holds the host and the hot-seat seat. Context B holds the guest. Context C, when a test uses it, holds a stranger.
- **Names.** Guest names are unique in the database and have 2 to 16 characters. The fixture makes names such as `Ann-3f9a1c`.
- **Isolation.** Each test makes its own game. Parallel tests share the lobby lists, so assert only on rows with the game name of this test. Do not assert an empty list. The suite stays below the list limit of 50.
- **Selectors.** Use roles and accessible names first. Add a `data-testid` only when no role fits, for example the cash of one rail row if its markup has no name.
- **Motion.** All contexts use `reducedMotion: "reduce"` in the Playwright config. With Reduced motion fallback (H4), the dice and the tokens go to their end state at once, so no test waits for an animation.
- **Waits.** No fixed sleeps. Use web-first assertions only. The `expect` timeout is 5 s and the test timeout is 30 s.
- **Truth.** Assert on the log, the rail, the hand and the turn area. Do not read pixels from the WebGL canvas. The board check accepts the canvas or the `board-unavailable` fallback.
- **Run settings.** `fullyParallel: true`, 2 workers, 0 retries locally, 1 retry in CI, trace on first retry, screenshot on failure.

**Reduced motion fallback (H4) is a prerequisite.** It is not built now: the dice faces change every 80 ms, the 700 ms roll wait stays, and the tokens hop. The motion player must skip the steps (zero duration) when `prefers-reduced-motion` is on. The timeouts above are correct only after this change.

## 6. Scenario catalogue

There are 26 scenarios: 21 at P0 or P1, and 5 at P2. P0 runs first and blocks the others. All M3 web tasks (E1 to E8) are done, so each scenario can run after Playwright setup (F1).

### Core (`tests/core.spec.ts`, task F2)

| Scenario | Steps and checks | Priority |
| --- | --- | --- |
| Core game script (T01) | Sign in on A and B. Create, join by link, add the hot-seat seat, start. Host rolls 6,2, buys Cobble Street, Next turn. A shows "Pass to", B shows Waiting. Hot-seat seat rolls, buys, Next turn: no handoff, because the guest is on another device. Guest rolls and pays $6 rent: log and rail agree on A and B. Host proposes a trade, guest accepts on B: deed and cash change on A and B. The board check of section 5 passes | P0 |

### Lobby and room (`tests/lobby.spec.ts`, `tests/room.spec.ts`)

| Scenario | Steps and checks | Priority |
| --- | --- | --- |
| Sign-in and session (T02) | Sign in, reload, still signed in. A name that is taken gets the answer. A game link with no session goes to sign-in, then back to the game | P1 |
| Live open games (T03) | A creates: the row shows on B with no reload. B joins: 2/6 on A and B. Start: the row leaves the list | P1 |
| Invite by name (T04) | A invites B: live in the B inbox. Decline: A sees it. Invite again, accept: B has a seat | P1 |
| Start expires an invite (T05) | A invites B, then starts. The invite leaves the B inbox, live | P1 |
| Tokens (T06) | 6 seats show 6 figures. B takes a token: disabled on A, live. The host is red in the room and on the rail | P1 |
| Hot-seat seats (T07) | Add and remove a seat. Start stays disabled with one seat | P1 |
| Cancel game (T08) | Host cancels: B sees "Game cancelled". B opens no new `/api/stream` connections for the game. The link then gives the 404 view | P1 |
| Stranger (T09) | C opens the link of a started game: "Not your game" | P2 |

### Game flows (`tests/game-*.spec.ts`)

| Scenario | Steps and checks | Priority |
| --- | --- | --- |
| Auction across devices (T10) | Host chooses Auction. Bids alternate on A and B. The winner pays and owns the deed on A and B | P1 |
| Hot-seat trade handoff (T11) | Trade between the host and the hot-seat seat: "Pass to" before the answer, and the hand stays hidden until the confirm | P1 |
| Jail (T12) | Debug setup, land on Go to Jail. On the next host turn, pay the fine | P1 |
| Card (T13) | Debug setup, draw the Chance card. A and B show it. Cash changes for all players | P1 |
| Doubles (T14) | `playRolls` to roll 14. Guest rolls 6,6: "Roll again" shows, and roll 16 continues the turn | P2 |
| Build and mortgage (T15) | Debug setup, a full group. Build from the hand, mortgage from the hand | P1 |
| Debt paid (T16) | Debug setup, debt of $100 with Grand Pier. Mortgage, then pay. The game continues | P1 |
| Bankruptcy and result (T17) | 2 seats, debug setup. Result screen with winner and standings on A and B. Reload: still the result | P0 |
| Resign on a shared device (T18) | Leave game asks which seat. That seat is out, and the game continues | P2 |
| Debug panel (T19) | Change cash in the panel: the rail changes and the log says "(debug)" | P2 |

### Resume and session (`tests/session.spec.ts`, task F3)

| Scenario | Steps and checks | Priority |
| --- | --- | --- |
| Reload during a game (T20) | Reload in mid-turn: same state, and the buttons still work | P1 |
| Missed actions (T21) | B loses the stream. A plays. B comes back and catches up with the log and the state | P1 |
| Save and restore, same dice (T22) | Host rolls 6,2, buys, then Save and exit. A shows "Game saved", B shows "Game saved by <owner>". B opens the link and claims. Host: Continue, Start. Host cash is $1,500 and Cobble Street has no owner. Roll gives 6,2 again | P0 |
| Finish game (T23) | Finish during an auction. Standings with no winner on all devices. In a second game, Finish from the saved list | P0 |

### Presence (`tests/presence.spec.ts`, presence stack, task F3)

| Scenario | Steps and checks | Priority |
| --- | --- | --- |
| Disconnect and return (T24) | Save the storage state of B, then close B on its turn. A sees reconnecting, then away, then "Waiting for <name> to return". The owner sees that Save and Finish are in the Menu. Open B again from the storage state: online, and B plays | P0 |
| Automatic save (T25) | Save the storage states, then close all contexts. Open the lobby of the owner, because the lobby opens no game stream: the game shows as saved. Continue, Start, and the same dice come back | P0 |
| Open lobby during a game (T26) | B goes to the lobby: its stream closes, so B goes away. B returns to the game: online | P2 |

### Not in E2E

| Item | Where it stays |
| --- | --- |
| Dice and token animation, no animation on a snapshot or a resume (H3) | Vitest animation queue tests (H5), and the manual run with motion on |
| The `token_taken` race, because it needs exact timing | Vitest |
| Each API refusal and error code, the list limit, empty states | Vitest |
| Presence after restart (D4), rollback edge cases | API tests |
| Engine rules, full games to a winner | Engine tests and the seeded bot |

## 7. Coverage of the milestone goals

| Goal | Scenario |
| --- | --- |
| M3 done: save, restore, same dice | Save and restore, same dice (T22) |
| M3 done: finish with no winner | Finish game (T23) |
| M3 done: a player goes away, others wait, the player returns | Disconnect and return (T24) |
| M3 done: all browsers closed, automatic save, restore | Automatic save (T25) |
| M1 E2E script (I2): roll, buy, rent, handoff, trade, end turn | Core game script (T01) |
| M2 manual run (I1): live row in open games | Live open games (T03) |
| M2 manual run (I1): live invite, accept seats the player | Invite by name (T04) |
| M2 manual run (I1): two seats take one token | Tokens (T06) for the live disabled state. Vitest for the race |
| M2 manual run (I1): 6 figures, host is red | Tokens (T06). The rail only, because tests do not read the canvas |
| M2 manual run (I1): cancel, no reconnect loop | Cancel game (T08) |
| M2 manual run (I1): start removes the row and expires an invite | Live open games (T03), Start expires an invite (T05) |
| M2 manual run (I1): dice and token animation | Not in E2E. See section 6 |

## 8. How to run

Install the browser one time:

```bash
pnpm exec playwright install chromium
```

Run the suite:

```bash
pnpm test:e2e
```

Run it in the Playwright UI:

```bash
pnpm test:e2e:ui
```

Show the last report:

```bash
pnpm test:e2e:report
```

Run one project:

```bash
pnpm test:e2e --project=presence
```

- It is not necessary to start a server. The ports must be free.
- `pnpm test` and `pnpm check` do not start browsers.
- **CI (M5).** GitHub Actions runs `pnpm check`, `pnpm test`, `pnpm build`, then installs Chromium with a cache and runs `pnpm test:e2e`. On a failure, it uploads the report and the traces.

## 9. Tasks and order

1. **Reduced motion fallback (H4).** Build it first, with its Vitest tests. It also meets spec R-T6.
2. **Playwright setup (F1).** Package, config, stacks, the env flags and the support helpers. Do a short spike first, and record the answers here:
   - `DB_PATH=:memory:` works in the real API process.
   - The origin check passes through the proxy on port 5174.
   - Headless Chromium draws WebGL or uses the fallback.
   - `context.setOffline` really ends an open `EventSource`. If not, Missed actions (T21) closes the page or blocks the route.
   - When a context closes, the Vite proxy closes the stream to the API. The presence tests need this.
3. **Core game script (F2).** Core game script (T01) and the seed guard. Then close M1 Playwright setup (I1) and E2E script (I2) with a link.
4. **Session and disconnect script (F3).** Scenarios T20 to T26. The M3 "done" goal needs them, so they come before the wider flows.
5. **Lobby, room and game flows (F4).** Scenarios T02 to T19. This is a new task in M3 section F.

Each task: own commit, `pnpm check` and `pnpm test` green. A defect that a test finds gets its own `fix` commit.

## 10. Risks

| Risk | Action |
| --- | --- |
| An engine change moves the dice | The seed guard, the first log line check, and `find-seed.ts` |
| The debug panel gets a gate (Q24) | A flag in the stacks, and one setup helper |
| SSE timing gives flaky tests | Web-first assertions only. Investigate a retry that passes. Do not raise the retry count |
| Reduced motion hides a defect that shows only with animation | Vitest animation queue tests (H5), and Manual session run (G1) with motion on |
| A short grace time gives flaky tests | Only presence tests use that stack. It has its own API process |
| The tests fail in a sandbox that blocks local ports | Allow local port binding for the run |
