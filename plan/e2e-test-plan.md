# Harborfront: E2E test plan

|                |                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Companion docs | [milestone-3-tasks.md](milestone-3-tasks.md) (section F), [implementation-roadmap.md](implementation-roadmap.md) (section 7), [milestone-2-tasks.md](milestone-2-tasks.md), [game-screen-2-gameplay.md](game-screen-2-gameplay.md) (3.1, 3.2) |
| Status         | All 26 scenarios are built, with the session gaps (F4) closed and the seed guard (F16) in place. The browser suite has 31 tests, including Chance and Chest variants, three Finish cases and 2 motion scripts. Manual session run (G1) and milestone close (G2) remain separate tasks. Last updated 2026-11-07 |

This document is the plan for the browser tests of Milestone 3, section F:

- Playwright setup (F1)
- Core game script (F2)
- Session and disconnect script (F3)
- Session script gaps (F4) and the tasks F5 to F16, which complete the scenario catalogue

It also covers the M1 and M2 flows. Scenario codes are `T01` to `T26`. These codes are for this document only.

The plan was first written before the Playwright code existed. This version describes the code on `milestone-3`. Where the code differs from the first plan, the text says so.

## 1. Purpose and scope

**Purpose.** Cover the flows that only a real browser, a real API and a real stream can prove: live updates between devices, handoffs and session recovery.

**Rule.** Do not repeat Vitest. Vitest keeps each refusal, each error code, the empty states and the rule edge cases.

**Not in scope:**

- Visual regression and WebGL pixel checks.
- Firefox and WebKit. Chromium only. A later change adds a browser as one config project.
- Load tests.
- The autopilot (postponed in M3), and claim from another browser (gameplay Q25).

## 2. Architecture

The package is `apps/e2e` (`@monopoly/e2e`). The existing `apps/*` glob includes it. It has its own `.gitignore` for `.data/`, `.results/` and `playwright-report/`.

**Built:**

```
apps/e2e/
  package.json                 scripts: test (seed guard), find-seed, e2e, e2e:ui, e2e:report
  playwright.config.ts         one API and one web server, one worker
  tsconfig.json                so that `pnpm check` covers the package
  support/game.ts              UI helpers and device cleanup; sign-in waits for the live lobby stream
  support/api.ts               real API setup, actions, debug edits, state reads and seeded rolls
  tests/core-game.spec.ts      T01
  tests/lobby.spec.ts          T02 to T05
  tests/room.spec.ts           T06 to T09
  tests/game-auction-trade.spec.ts T10, T11
  tests/game-jail-cards.spec.ts T12, T13 (Chance and Chest), T14
  tests/game-property-debt.spec.ts T15, T16
  tests/game-bankruptcy.spec.ts T17
  tests/game-leave-debug.spec.ts T18, T19
  tests/session.spec.ts        T20 to T26; three Finish cases
  tests/reduced-motion.spec.ts the default setup: reduced motion, no WebGL
  tests/motion.spec.ts         the animated path and the real 3D board
```

`support/game.ts` holds these helpers:

- `test`: a fixture that closes every device at the end of a test.
- `createDevice`: a browser context registered for cleanup and optional video recording, without signing in.
- `openDevice`: a browser context, signed in with a unique name.
- `startTable`: Alice hosts, Bob joins by link, Alice adds Cara, the game starts.
- `createGame`, `joinByLink`, `addHotSeat`, `startGame`, `reopenPage`.
- `step` and `playUntil`: take the next turn action until a goal is true.
- `playBobsFirstTurn`, `saveFromMenu`, `finishFromMenu`, `bodyText`.

`support/api.ts` holds `startGame`, `sendAction`, `debugEdit`, `readGame`, `readState` and `playRolls`. It uses real sessions and normal API routes through `context.request`, with shared response schema checks. It preserves the join order and opens both game streams before setup actions. `sendAction` uses the seat controller's cookies, the current version and a new action id. `playRolls` buys properties and completes each turn until the next roll. Both API and UI setup use the same device cleanup and video recording.

**Seed tools (F16), built:**

```
  src/seed.test.ts             Vitest guard: the dice that the tests need still come from the engine
  scripts/find-seed.ts         finds and prints a seed for a seat layout
  support/seed.ts              seed shared by Playwright and the guard
  support/seed-replay.ts       pure buy-policy engine replay for the guard and finder
  vite.config.ts              includes only src/**/*.test.ts
```

- **Spec names.** The Vitest includes and the Vitest lint override use `*.test.ts`, so they do not take `*.spec.ts`.
- **Separate scripts.** `pnpm test` (`vp run -r test`) runs the seed guard through this package's `test` script. It does not start Playwright. The package's Vite+ config selects only `src/**/*.test.ts`. Browser tests still run through `pnpm e2e`.

## 3. Server stack

Playwright `webServer` starts one stack for the whole run. It never uses a running `pnpm dev`, because `pnpm dev` has no seed and uses your real database.

| Part | Command and settings |
| --- | --- |
| API | `node --experimental-strip-types src/index.ts` in `apps/api`, no `--watch`. Port 8787. `NODE_ENV=development`. `GAME_SEED=7`. `PRESENCE_GRACE_MS=2500`. `DB_PATH=../e2e/.data/e2e.db` |
| Web | `pnpm dev` in `apps/web`. Port 5173. The Vite proxy sends `/api` to port 8787 |
| Database | The API command runs `rm -rf ../e2e/.data` before the API opens the file, so each run starts with an empty database. A global setup is too late, because it runs after the web servers have started |
| Reuse | `reuseExistingServer: false`. A port that is in use stops the run with an error |

- **Default ports.** The stack uses the ports of `pnpm dev`. Stop `pnpm dev` before a run.
- **One worker.** One server and one database serve all tests, so the tests run one after another (`workers: 1`, `fullyParallel: false`).
- **Grace time.** 2.5 s is short enough for the away and automatic save scripts, and it is the same for all scripts. A test that keeps no stream open on a device in its game for 2.5 s can save the game by mistake. Each script keeps a game page open, or closes the pages on purpose.
- **Dev origins.** `NODE_ENV=development` makes the origin check accept `localhost:5173` and makes the session cookie work on plain HTTP.

**What the setup needed in the product, and the state of each item:**

| Item | State |
| --- | --- |
| Test-only `PRESENCE_GRACE_MS` in `apps/api/src/index.ts`, ignored in production like `GAME_SEED` | Done |
| Reduced motion fallback (H4): all animation is off under reduced motion, and a switch in the Menu overrides the device setting. The root element has `data-motion` set to `reduce` or `full` | Done (commit `ccf7543`) |
| `@playwright/test` in the catalog | Done, version 1.65.0. Version 1.49.1 hung while it packed a large trace |
| Root scripts `e2e`, `e2e:ui`, `e2e:video`, `e2e:report` | Done |
| A proxy target setting for the web app | Not needed: the stack uses the default ports |

## 4. Determinism

The engine replay for this plan gave the values in this section, for `GAME_SEED=7`. The dice are the same when a player buys and when a player declines.

**Seat order.** Alice hosts, Bob joins by link, then Alice adds Cara, a hot-seat seat on her device. The seat order is the order of joining, so **the guest joins before the host adds the hot-seat seat**. Another order gives another turn order.

### Seed 7

The turn order with 3 seats is Bob, Cara, Alice. With 2 seats (Alice and Bob) it is Bob, Alice.

Rolls with 3 seats, when each player buys what they land on:

| Roll | Player | Dice | Square |
| --- | --- | --- | --- |
| 1 | Bob | 5,6 | Anchor Street (11) |
| 2 | Cara | 4,6 | Jail (10), a visit only |
| 3 | Alice | 5,1 | Lantern Row (6) |
| 4 | Bob | 2,3 | Net Loft Road (16) |
| 5 | Cara | 3,1 | Chandlers Quay (14) |
| 6 | Alice | 1,5 | Power Works (12) |
| 7 | Bob | 3,3 | Chance (22). The first double |

- **First rent.** Roll 11: Alice rolls 1,1 and lands on Chandlers Quay, which Cara owns.
- **Roll 7.** Bob rolls a double, so he rolls again (`awaiting_roll`, doubles 1).
- **Top cards.** Chance "Loan matures" (collect $150). Chest "Tax refund" (collect $20).
- **Used by the built scripts.** The three-seat setup is used by T11 to T16, T18 and T19. T14 checks all first six rolls before the UI rolls the double. T10 uses two seats: after three API rolls, Alice rolls 1,2 from square 10 to Rope Walk (13) and chooses Auction.

### Setup with the debug edit

For API setup helper (F5) and the scripts that use it. `support/api.ts` sends `DebugEdit` through `POST /api/games/:id/actions`, with the session cookies of the context. It sets cash, deeds and position for the player on turn. A teleport does not use the seed. Thus the next roll stays the same, and the test knows the landing square.

The first roll with 3 seats is 11 for Bob:

| State wanted | Setup | Result of the roll |
| --- | --- | --- |
| Jail | Teleport to 19 | Go to Jail. The turn ends at once |
| Chance card | Teleport to 11 | Square 22. "Loan matures": Bob has $1,650 |
| Chest card | Teleport to 6 | Square 17. "Tax refund": Bob has $1,520 |
| Debt | Teleport to 27, cash $10, give Grand Pier to Bob | Luxury Tax (38). `awaiting_debt`, one debt |

The first roll with 2 seats is 9 for Bob:

| State wanted | Setup | Result of the roll |
| --- | --- | --- |
| Bankruptcy | Teleport to 29, cash $10, no deeds | Luxury Tax. Bankrupt at once, and the game is over |

**Caution.** A player with no deeds who cannot pay goes bankrupt at once. There is no debt view. A debt test must give the player a deed.

**Build and mortgage (T15), verified with an engine replay.** Give Bob Driftwood Lane (1) and Kelp Court (3), the full brown group, plus Grand Pier (39), all without buildings or mortgages. Both brown deeds cost $60, building costs $50, and their mortgage value is $30 each. Grand Pier costs $400 and mortgages for $200. From $1,500, building one house on Driftwood Lane leaves $1,450. Mortgaging Grand Pier then leaves $1,650. Its different colour group keeps the mortgage legal while the brown group has a house.

**Doubles.** `playRolls` plays rolls 1 to 6 through the API with the buy policy. Bob then plays roll 7 in the UI.

**If the debug panel gets a gate (gameplay Q24).** The stack turns it on with a flag. All setup goes through one helper, so only the helper changes.

### Guards

- **Built.** The scripts read the dice from the log, for example "rolled 5 and 6" and "Cara rolled 4 and 6". A change in the engine then fails with a clear message and not with a timeout.
- **Built.** `src/seed.test.ts` checks the two-seat and three-seat turn order, dice and landings, plus the first Chance and Chest titles and cash effects. Playwright and the guard both import `E2E_SEED` from `support/seed.ts`. Changing that seed from 7 to 8 was verified to fail all four guards in `pnpm test`; it was then restored to 7. `scripts/find-seed.ts` searches an inclusive seed range for a requested pair of dice on a chosen roll, using the buy policy.

## 5. Test setup

**Rule.** Each test makes its own game at version 0 with a real `start`. No test writes to the database, and no test loads a state. All setup uses real API actions, so the server applies its normal rules and writes its normal events.

**Three steps:**

1. Once per run: the stack starts with an empty database and seed 7.
2. Once per test: the test makes the devices, the players and the game.
3. When necessary: `DebugEdit` or `playRolls` moves the game to the state that the test checks.

| Scenarios | Room setup | Reaching the state |
| --- | --- | --- |
| T01 | UI (`startTable`) | Plays from the first roll in the UI |
| T22–T25 | API (`startGame`) | Real actions in the UI (`playBobsFirstTurn`) |
| T02–T09 | UI | Not needed |
| T12, T13, T15, T16, T17 | API | `DebugEdit`, before the first roll |
| T19 | API | Not needed. The test uses the debug panel in the UI |
| T14 | API | `playRolls` for rolls 1 to 6 |
| T10, T11, T18 | API | Real actions, in the UI or the API |
| T20, T21, T26 | API | A few real actions |

- **Built scripts.** T10 to T26 use `support/api.ts`. The core game and T02–T09 keep UI setup so they prove sign-in, join and start independently of later flows.
- **Why the UI scripts stay.** T01 and T02–T09 prove sign-in, join and start in the UI.

**Helpers.** `startTable` in `support/game.ts` does the room setup in the UI. `startGame` in `support/api.ts` signs in, creates, joins, adds seats and starts through `context.request`. The context keeps the session cookie, so its page is signed in. It accepts `hotSeat: false` for T10 and T17, which need only two seats.

**Limits:**

- `DebugEdit` works only for the player on turn, in `awaiting_roll`, `awaiting_jail_choice`, `awaiting_end_turn` and `awaiting_debt`. It cannot make an open auction or trade offer.
- Each debug change adds a log line. Tests look for a specific line and do not count lines.

**Rejected options:**

- UI from the very beginning for all tests: slower, and needs long scripts for states such as debt.
- A test-only state endpoint: adds a route that production must block, and can load a state that real play cannot reach.

## 6. Test design rules

- **Devices.** One browser context is one device (own cookies). `startTable` opens Alice's device (Alice and Cara) and Bob's device. A test that needs a stranger opens a third device.
- **Names.** User names are unique in the database and have 2 to 16 characters. `startTable` makes names from the test tag and 4 random characters, for example `Alice` + `save` + `k3f9`. UI mode runs a test again on the same database, so a fixed name would fail.
- **Isolation.** Each test makes its own game. The tests share one database and its lobby lists, so assert only on rows with the game name of this test. Do not assert an empty list. The suite stays below the list limit of 50.
- **Selectors.** Use roles and accessible names first. The page also has `data-presence` marks on the rail, and `data-motion` on the root element. Add a `data-testid` only when no role or mark fits.
- **Motion.** The default setup of all scripts is `reducedMotion: "reduce"` and Chromium with `--disable-3d-apis`. Reduced motion skips the waits for the dice and the tokens. With no WebGL, the app shows its fallback board, and the run is about 30 s faster than with a software-rendered 3D board. `motion.spec.ts` sets `reducedMotion: "no-preference"` and the real 3D board for its own file.
- **Waits.** Use web-first assertions. The `expect` timeout is 10 s, the action timeout is 15 s, and the test timeout is 60 s. `playUntil` waits 150 ms between steps. T25 polls game metadata for `saved` through the authenticated API context while both pages are closed, rather than sleeping for the grace time.
- **No reconnect check.** T08 counts requests for the cancelled game's topic and expects no new request during a 3.5 s observation window. This also covers the browser's native EventSource retry. It checks the count again after the link gives the 404 view.
- **Truth.** Assert on the log, the rail, the hand and the turn area. Do not read pixels from the WebGL canvas. In the default setup the page has no `canvas`. `motion.spec.ts` checks that one is visible.
- **Run settings.** `workers: 1`, `fullyParallel: false`, 0 retries, trace and screenshot kept on failure, the reporters `list` and `html` (never opens), results in `.results`. Add a retry when CI exists (Later, no milestone).

## 7. Scenario catalogue

There are 26 scenarios: 21 at P0 or P1, and 5 at P2. P0 runs first and blocks the others. The status says what the code on `milestone-3` does.

### Core (`tests/core-game.spec.ts`, task F2)

| Scenario | Steps and checks | Priority | Status |
| --- | --- | --- | --- |
| Core game script (T01) | Alice hosts and Bob joins by link. Alice adds Cara. Start. Bob is first: Bob sees Roll, and Alice sees "Waiting for Bob". All players buy what they land on until a player pays rent. Alice's device passes between Alice and Cara. The log has a roll line, a purchase line and a rent line. Bob proposes a trade: a street for $25 from Cara. Cara accepts on Alice's device. Bob's hand has one property less, and Bob has $25 more. The game goes on until 8 turns have ended | P0 | Built |

### Lobby and room (`tests/lobby.spec.ts`, `tests/room.spec.ts`)

| Scenario | Steps and checks | Priority | Status |
| --- | --- | --- | --- |
| Sign-in and session (T02) | Sign in, reload, still signed in. A name that is taken gets the answer. A game link with no session goes to sign-in, then back to that room. Join gives a seat on both devices | P1 | Built (F7) |
| Live open games (T03) | A creates: the row shows on both devices' lobby tabs with no reload. B joins: 2/6 in both rooms and both lobby tabs. Start: the row leaves both lists | P1 | Built (F8) |
| Invite by name (T04) | A invites B: live in the B inbox. Decline: the pending row leaves A's room. Invite again, accept: B has a joined seat and both rooms show 2/6 | P1 | Built (F8) |
| Start expires an invite (T05) | A adds a hot-seat seat, invites B, then starts. The invite leaves the B inbox, live | P1 | Built (F8) |
| Tokens (T06) | B takes Horse: disabled on A, live, and Cat becomes free. Fill 6 seats and check 6 distinct figures on both devices. The host's avatar ring is red in both rooms and on both rails | P1 | Built (F9) |
| Hot-seat seats (T07) | Add and remove a seat. Start is enabled with two seats and disabled again with one seat | P1 | Built (F9) |
| Cancel game (T08) | Host cancels: B sees "Game cancelled". B opens no new `/api/stream` connections for the game during a 3.5 s observation window. Back to lobby, then the same link gives the 404 view | P1 | Built (F9) |
| Stranger (T09) | C opens both the room link and the play link of a started game: "Not your game", with no Join or Roll controls | P2 | Built (F9) |

T09 found that the API's public room metadata was shown to a stranger as a started room. The web now checks seat control before it shows a started room or play screen. It does not request game state or open a game stream for a stranger. Waiting rooms still allow visitors to join, and the API contract is unchanged.

### Game flows (`tests/game-*.spec.ts`)

| Scenario | Steps and checks | Priority | Status |
| --- | --- | --- | --- |
| Auction across devices (T10) | Two seats. Alice chooses Auction for Rope Walk. Alice bids $10, Bob $20, Alice $30, Bob passes. Both logs show the win; both rails show Alice with $1,470 and 1 property. Her hand shows Rope Walk | P1 | Built (F10) |
| Hot-seat trade handoff (T11) | After five API rolls, Alice offers Lantern Row to Cara for $25 in the UI. "Pass to Cara" hides the hand and answer controls and makes the regions inert. Confirm, accept, then pass back to Alice. Both devices show the cash and property changes. Planned change (BUG-15): the overlay is replaced by a toast, so T11 checks the toast and the answer with no confirm step | P1 | Built (F10) |
| Jail (T12) | Teleport Bob to 19. Roll into Go to Jail. Cara and Alice play real API turns. On Bob's next turn, pay $50 in the UI. Both rails show $1,450 and no jail mark; Bob can roll | P1 | Built (F11) |
| Card (T13) | Separate Chance and Chest scripts. Teleport, then roll in the UI. Both devices show the card, log and cash change. Dismissing on Alice's device leaves Bob's card open | P1 | Built (F11) |
| Doubles (T14) | `playRolls` checks rolls 1 to 6. Bob rolls 3,3 on roll 7 in the UI. Dismiss the card: Bob has an enabled "Roll again", Alice waits, and the server state keeps Bob on turn with doubles 1 | P2 | Built (F11) |
| Build and mortgage (T15) | Give Bob the brown group and Grand Pier. Build one house on Driftwood Lane through the hand, then mortgage Grand Pier through the hand. Check the deed labels, both logs, and cash $1,650 | P1 | Built (F12) |
| Debt paid (T16) | Bob has $10, Grand Pier, and position 27. Roll into Luxury Tax: $100 debt, short $90. Mortgage Grand Pier for $200, pay $100, and end the turn. Both devices show cash $110 and the payment log | P1 | Built (F12) |
| Bankruptcy and result (T17) | Two seats. Bob has $10, no deeds and position 29. Roll into Luxury Tax. Both devices show Alice as winner, the ranked standings and Bob bankrupt. Reload each device: the result stays | P0 | Built (F6) |
| Resign on a shared device (T18) | Alice's menu asks which seat resigns. Select Cara. Both devices show Cara out and Alice still in. Bob rolls, buys and ends his turn, then Alice can roll | P2 | Built (F13) |
| Debug panel (T19) | Set Bob's cash to $1,234 through the UI panel. Both rails change and both logs show the marked debug edit. Bob can still roll | P2 | Built (F13) |

### Resume and session (`tests/session.spec.ts`)

| Scenario | Steps and checks | Priority | Status |
| --- | --- | --- | --- |
| Reload during a game (T20) | Bob rolls and buys Anchor Street, then reloads before ending his turn. The server state is unchanged; his rail and hand retain $1,360 and the deed. Next turn works and reaches Cara on Alice's device | P1 | Built (F14) |
| Missed actions (T21) | Stop B's active browser request and block stream retries. A sees B away, then plays Cara's and Alice's turns. B stays stale. Unblock: a new stream carries the saved `lastEventId`, and each missed roll and purchase arrives once in B's log. B's rail catches up and Roll works without a page reload | P1 | Built (F14) |
| Save and restore, same dice (T22) | Bob rolls 5,6 and buys, then Alice saves before End turn. Both see the save notice. Continue, open and claim, then restore. The version advances, the purchase is gone, and Bob has $1,500 and no property on both rails. Bob rolls 5,6 again, buys and ends his turn; Cara then rolls 4,6 | P0 | Built (F4) |
| Finish game (T23) | Three scripts: Finish at game start; Finish during the Anchor Street auction, with rollback and persistent results after reload; Finish from the owner's saved-game lobby row, preserving Bob's bought property. Both devices show No winner and standings | P0 | Built (F4) |

### Presence (`tests/session.spec.ts`)

| Scenario | Steps and checks | Priority | Status |
| --- | --- | --- | --- |
| Disconnect and return (T24) | Bob's tab closes. Alice sees reconnecting, the waiting line and away. Her Menu offers Save and Finish. Reopen Bob's tab in the same profile: online, the away waiting line goes, and Bob and Cara play | P0 | Built (F4) |
| Automatic save (T25) | Bob buys and ends his turn. Close both pages and poll until saved. Alice opens the lobby, continues and starts. Bob still owns Anchor Street, and Cara rolls the next seeded 4,6 | P0 | Built (F4) |
| Open lobby during a game (T26) | B opens the lobby: A sees reconnecting, away and the waiting line, while the game remains active. Resume from B's My games row restores online and Roll, with unchanged game state | P2 | Built (F15) |

**Built differently from the first plan.** T24 opens a new tab in the same browser profile, not a saved storage state. Both ways keep the session cookie.

**T21 transport check and fix.** A Chromium probe showed that `context.setOffline(true)` did not close the existing EventSource. T21 uses `window.stop()` to cancel that real request and a route abort to block retries, while the page and its store stay mounted. This exposed a product defect: a closed EventSource was replaced without a cursor, so a snapshot updated the board but lost the missed log. The client now preserves the cursor only for retries of the same topics and supplies `lastEventId` in the new URL. The API validates that fallback and gives the native header precedence. The test checks the retry cursor, stale state before reconnect, and exactly one copy of each missed event after reconnect. It does not inject stream messages.

### Also built, not in T01–T26

| Script | What it checks |
| --- | --- |
| `reduced-motion.spec.ts`: a roll on the no-WebGL board goes straight to the next action | `data-motion` is `reduce`, the page has no `canvas`, "Moving…" does not show, and Buy shows at once |
| `motion.spec.ts`: a roll on the 3D board shows the moving token, then the next action | `data-motion` is `full`, a `canvas` is visible, "Moving…" shows on Alice's device, then Buy shows on Bob's device |

### Not in E2E

| Item | Where it stays |
| --- | --- |
| The look of the dice and token animation, and no animation on a snapshot or a resume (H3) | Vitest animation queue tests (H5), and the manual run with motion on. `motion.spec.ts` only proves that a move shows and the next action follows |
| The `token_taken` race, because it needs exact timing | Vitest |
| Each API refusal and error code, the list limit, empty states | Vitest |
| Presence after restart (D4), rollback edge cases | API tests |
| Engine rules, full games to a winner | Engine tests and the seeded bot |

## 8. Coverage of the milestone goals

| Goal | Scenario |
| --- | --- |
| M3 done: save, restore, same dice | Save and restore, same dice (T22), including a discarded mid-turn roll and purchase |
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
| M2 manual run (I1): dice and token animation | In part: `motion.spec.ts`. The look stays manual. See section 7 |

## 9. How to run

Install the browser one time. The command runs the `playwright` binary of the package (version 1.65.0):

```bash
pnpm --filter @monopoly/e2e exec playwright install chromium
```

Stop `pnpm dev` first. The stack needs ports 5173 and 8787.

Run the suite:

```bash
pnpm e2e
```

Run it in the Playwright UI:

```bash
pnpm e2e:ui
```

Run it and record a video of each script:

```bash
pnpm e2e:video
```

Show the last report:

```bash
pnpm e2e:report
```

Run the seed guard without browsers:

```bash
pnpm --filter @monopoly/e2e test
```

Find a seed for a seat layout and roll (the defaults are 3 seats, roll 7, dice 3,3, seeds 1–10000):

```bash
pnpm --filter @monopoly/e2e find-seed --players 3 --roll 7 --dice 3,3 --from 1 --to 10000
```

- The results are in `apps/e2e/.results`, and the report is in `apps/e2e/playwright-report`. Git ignores both.
- `pnpm test` and `pnpm check` do not start browsers.
- The README has no E2E section yet. Add one in Milestone 3 close (G2).
- **CI (Later, no milestone).** GitHub Actions runs `pnpm check`, `pnpm test`, `pnpm build`, then installs Chromium with a cache and runs `pnpm e2e`. On a failure, it uploads the report and the traces. Until then, run the suites on the local machine. M5 adds `pnpm e2e:docker`, which runs the suite against the prod Docker image ([milestone-5-tasks.md](milestone-5-tasks.md), D5).

## 10. Tasks and order

1. **Reduced motion fallback (H4).** Done.
2. **Playwright setup (F1).** Done. The questions of the first spike have these answers:
   - `DB_PATH=:memory:` was not used. The database is a file that the API command removes before each run.
   - The origin check passes through the proxy, because the API runs with `NODE_ENV=development` on the default ports.
   - Headless Chromium does not need WebGL for the scripts. They run with `--disable-3d-apis`, and `motion.spec.ts` runs with the real 3D board.
   - Closing a tab ends the stream through the proxy. T24 and T25 rely on this, and they pass.
   - `context.setOffline(true)` did not close an existing EventSource in Chromium. T21 cancels the real request and blocks stream retries instead; see section 7.
3. **Core game script (F2).** Done: Core game script (T01). Closed M1 Playwright setup (I1) and E2E script (I2) with a link.
4. **Session and disconnect scripts (F3, F4).** Done for T22 to T25, including the mid-turn rollback, all Finish cases, the away owner's Menu and the next seeded roll after automatic save.
5. **Sign-in, lobby and room (F7 to F9).** Done: T02 to T09. The two spec files use UI setup and separate browser contexts. The shared sign-in helper waits for the live lobby stream before the next device acts.
6. **API setup and game flows (F5, F6, F10 to F13).** Done: T10 to T19. T17 uses the API helper for the two-seat P0 case. T13 has one script for Chance and one for Chest.
7. **Reload, missed actions, lobby presence and seed guard (F14 to F16).** Done: T20, T21, T26, four Vitest guards and the seed finder. All tasks in section F of [milestone-3-tasks.md](milestone-3-tasks.md#f-browser-tests) are complete. Manual session run (G1) and milestone close (G2) remain outside this automated test work.

| Task | Scenarios | Spec file | Priority | Needs F5 |
| --- | --- | --- | --- | --- |
| Session script gaps (F4) | Gaps of T22, T23, T24, T25 | `session.spec.ts` | P0 | No |
| API setup helper (F5) | None. It adds `support/api.ts` | `support/api.ts` | None | None |
| Bankruptcy and result script (F6) | T17 | `game-bankruptcy.spec.ts` | P0 | Yes |
| Sign-in script (F7) | T02 | `lobby.spec.ts` | P1 | No |
| Lobby live script (F8) | T03, T04, T05 | `lobby.spec.ts` | P1 | No |
| Room script (F9) | T06, T07, T08, T09 | `room.spec.ts` | P1 | No |
| Auction and trade script (F10) | T10, T11 | `game-auction-trade.spec.ts` | P1 | Yes |
| Jail, card and doubles script (F11) | T12, T13, T14 | `game-jail-cards.spec.ts` | P1 | Yes |
| Property and debt script (F12) | T15, T16 | `game-property-debt.spec.ts` | P1 | Yes |
| Leave and debug panel script (F13) | T18, T19 | `game-leave-debug.spec.ts` | P2 | Yes |
| Reload and missed actions script (F14) | T20, T21 | `session.spec.ts` | P1 | Yes |
| Lobby while playing script (F15) | T26 | `session.spec.ts` | P2 | Yes |
| Seed guard (F16) | None. It guards the dice | `src/seed.test.ts` | None | No |

Each task: own commit, `pnpm check` and `pnpm test` green. A defect that a test finds gets its own `fix` commit.

## 11. Risks

| Risk | Action |
| --- | --- |
| An engine change moves the dice | The seed guard fails in `pnpm test`, and browser scripts also check the log. Use `find-seed` to inspect a replacement seed before updating the fixtures |
| The debug panel gets a gate (Q24) | A flag in the stack, and one setup helper |
| SSE timing gives flaky tests | Web-first assertions only. Investigate a test that passes only on a retry. Do not raise the retry count |
| The stack uses the ports of `pnpm dev` | The run stops with an error when a port is in use. Stop `pnpm dev` first |
| Reduced motion and no WebGL hide a defect that shows only with animation or the 3D board | `motion.spec.ts`, Vitest animation queue tests (H5), and the Manual session run (G1) with motion on |
| A grace time of 2.5 s saves a game while a test has no open stream | Each script keeps a game page open, or closes the pages on purpose |
| Fixed sleeps in `playUntil` give slow or flaky runs | Its short wait is bounded. T25 already polls the actual saved status without a fixed grace-time sleep |
| The tests fail in a sandbox that blocks local ports | Allow local port binding for the run |
