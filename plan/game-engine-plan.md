# Game engine plan

This file is the live to-do list. Mark each task `[x]` when it is done. Do one task, then stop and ask the user.

## Context

The repo has no game logic. `apps/api` (Hono, SQLite, Kysely) and `apps/web` (React, three.js) exist. `packages/shared` holds only API schemas. The rules are in `plan/game-rules-reference.md`. The goal: an isolated, testable engine that the server uses as the authority and the web app can reuse.

## Decisions (agreed with the user)

| Topic | Decision |
|---|---|
| Location | New package `packages/game-engine` (`@monopoly/game-engine`). Pure TypeScript. No I/O, no DB, no HTTP, no `Date`, no `Math.random`. |
| Design | Pure reducer: `applyAction(state, action) -> { state, events } or { error }`. The server is the authority. Events let the client replay and animate. |
| Randomness | Seeded RNG stored in the state. Same seed + same actions = same game. |
| Turn order | No opening roll-off (changed after task 4). `createGame` shuffles the players with the seeded RNG, so the order is random and repeatable. The first player in the list plays first. |
| Rules source | `plan/game-rules-reference.md` as written. |
| Scope v1 | Core turn loop only (see below). |
| Persistence (later phase) | Event log table + snapshot, written in one DB transaction. The engine only gives serializable state and events. No DB code in v1. |
| Open questions | Skipped for now (Q2, Q6, Q19 later). |
| Package style | Like `packages/shared`: no build step, export `.ts` source, `.ts` import extensions, ESM, versions from the pnpm catalog. Tests use Vitest (`vp test`). |

## Scope v1: core turn loop

In: setup (the engine shuffles the seat order at game creation), dice, movement, GO salary, buy, rent (streets with group double, stations, utilities), taxes, Chance and Chest (all 32 cards), Jail (go, stay, leave), doubles and three-doubles rule, end turn, state validation of actions, game end when one active player is left.

Out (later phases): auctions, trades, buildings, mortgages, debt and bankruptcy, persistence, websocket, web UI integration.

Temporary behavior for out-of-scope parts (must be clear in code and tests):
- Declined or unaffordable purchase: property stays unowned. Marked with a `TODO(auction)` comment.
- Payment with not enough cash: the action is rejected with error `insufficient_funds`. Marked `TODO(debt)`. No bankruptcy yet.

## Design sketch

- `GameState`: `players[]` in turn order (id, cash, position, inJail, jailTurns, heldJailCards, active), `ownership` by square, `turn` (current player, phase, doubles count, last dice), `decks` (order of Chance and Chest, with the Get Out of Jail cards held), `rng` (seed state), `version`.
- Phases: `awaiting_roll`, `awaiting_buy_decision`, `awaiting_jail_choice`, `awaiting_end_turn`, `game_over`.
- Actions: `RollDice`, `BuyProperty`, `DeclineProperty`, `PayJailFine`, `UseJailCard`, `EndTurn`.
- Events: `DiceRolled`, `PlayerMoved`, `PassedGo`, `PropertyBought`, `RentPaid`, `TaxPaid`, `CardDrawn`, `SentToJail`, `LeftJail`, `TurnEnded`, `GameEnded`.
- Static data (board, groups, rent tables, card decks) in plain typed modules, taken from Appendix A, B and C of the rules.
- Public API in `src/index.ts`: `createGame`, `applyAction`, types, data. Whole state is JSON-serializable (no Map, Set, class).
- Reuse: the data shape can follow `artifacts/game-screen/js/data.js` (squares, groups, kinds) so the UI can adopt it later.

## Task list

- [x] 0. Save this plan to `plan/game-engine-plan.md` (the live to-do list).
- [x] 1. Scaffold `packages/game-engine`: `package.json`, `tsconfig`, `src/index.ts`, one smoke test. Wire it into the workspace and the catalog. `pnpm check` and `pnpm test` pass.
- [x] 2. Static data: board (40 squares), groups, property/station/utility rent data, Chance and Chest decks. Tests check counts and totals (22 streets, 4 stations, 2 utilities, 16 + 16 cards).
- [x] 3. Seeded RNG in state: `nextInt`, dice roll, shuffle. Tests for determinism and serializable state.
- [x] 4. State types, `createGame`, and setup/turn order (roll-off with tie re-roll). Done and committed, but the roll-off is now removed by task 4a.
- [x] 4a. Remove the roll-off: delete `setup.ts`, `SetupState`, the `setup_roll` phase, the roll-off events and error codes, and the roll-off tests. `createGame` shuffles the player order with the seeded RNG and starts in `awaiting_roll` with the first player. Add tests for a random but repeatable order.
- [x] 5. Reducer skeleton: action validation by phase and player, error type, event type, `version` counter. Tests for rejected actions.
- [x] 6. Roll, movement, GO salary, doubles, three doubles to Jail, end turn.
- [x] 7. Square effects: buy or decline, rent (street incl. group double, station, utility), taxes, Free Parking, Go to Jail, `insufficient_funds` stub.
- [x] 8. Chance and Chest: draw, move cards (incl. nearest Station/Utility), money cards, pay-each-player cards, repair cards, jail cards, Get Out of Jail Free.
- [x] 9. Jail: stay, pay fine, use card, doubles to leave, forced fine on third failed roll.
- [x] 10. Game end (one active player left) and a full-game test: seeded random bot plays many games, checks invariants (cash is never negative, one owner per property, deck has 16 cards, same seed gives same result).
- [x] 11. Docs: package README, and a short section in the root README. Final `pnpm ready`.

## Verification

For each task: `pnpm check` and `pnpm test` must pass before a commit (CLAUDE.md). Commits use Conventional Commits with scope `engine`, one logical change per commit, and no commit without the user's request. No artifact changes are needed, because the engine does not touch GameScreen or DesignSystem.
