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

---

# Game engine, phase 2: the rest of the rules

## Context

Phase 1 (tasks 0 to 11, all committed) built the core turn loop in `packages/game-engine`: dice, movement, buying, rent, tax, cards, Jail and the game-end check. Several rules are temporary stubs: a declined purchase stays unowned (`TODO(auction)`), and any payment a player cannot make rejects the action with `insufficient_funds` (`TODO(debt)`), which leaves a game stuck. Repair cards cost nothing (`TODO(buildings)`). Nobody can be eliminated, so a real game never ends.

Phase 2 builds the rest of `plan/game-rules-reference.md`: buildings, mortgages, debt, bankruptcy, auctions, trades and the out-of-turn windows. Result: a full game, played by a bot, reaches `game_over` with a winner.

Same working method as phase 1: the repo copy `plan/game-engine-plan.md` is the live to-do list. One task, then stop and ask. Commit only when the user says so (Conventional Commits, scope `engine`, `pnpm check` and `pnpm test` first). The commands need `unset NODE_USE_SYSTEM_CA` in this shell.

## Decisions

Agreed with the user:

| Topic | Decision |
|---|---|
| Scope | Rules engine only. No persistence, no API, no resign action, no round limit (Q15, Q16 stay open). |
| Mortgage transfer (Q8) | A mortgaged property keeps its mortgage when it changes hands. No interest on transfer. The new owner pays mortgage value + 10% when they lift it. |
| Several creditors (Q13) | Cash is split pro rata by the amounts owed. Deeds and jail cards go to the creditor owed the most (tie: turn order after the debtor). |
| Trades | One open trade at a time. Propose, then the other player accepts or rejects, or the proposer cancels. No counter-offers. |

Defaults I chose (the user can change them):

| Topic | Default |
|---|---|
| Auction with no bids (Q12) | The property stays unowned. The next player who lands on it can buy it or start an auction again. |
| Forced jail fine the player cannot pay (Q11) | Settle the debt first, then leave Jail and move the rolled number. |
| Pending debt whose creditor is eliminated (Q17) | The debt is cancelled. |
| Jail card of an eliminated player (Q14) | To the creditor on a debt to a player. Back to its deck on a debt to the bank. |
| Lifting a mortgage | Cost = mortgage value + 10%, rounded up to whole dollars. |
| Bankruptcy re-check | The rules check once when the debt arises and once when it falls due. I also re-check after a trade is accepted while the debtor is in debt, because a trade can remove assets and cause a deadlock. |
| Auction cash cap | A bidder who cannot afford the next minimum bid is passed automatically. |
| During debt | Allowed: sell buildings, mortgage, propose a trade, pay. Blocked: buy, build, lift a mortgage, roll, end turn. |

## Design

All additions keep the phase 1 style: pure functions, plain-JSON state, seeded RNG, handlers return `Result`, the reducer bumps `version`.

- **Ownership:** `{ ownerId, houses, mortgaged }`. `houses` is 0 to 5, where 5 means a hotel. Today it is `{ ownerId }` in `state.ts`; the `owns` test helper and the buy handler must change.
- **Phases to add:** `awaiting_debt`, `awaiting_bid`, `awaiting_trade_response`.
- **Debt:** `state.debts: Debt[]` in the order they arose. `Debt = { debtorId, creditor: bank | player id, amount, reason, then }`. `then` says what continues after payment: `finish_roll`, `leave_jail_and_move`, or `due_at_turn_start`. One helper `owe(state, debtorId, creditor(s), amount, events, then)` replaces the `insufficient_funds` rejections: pay at once if cash covers it; else compute the liquidation value (cash + mortgage value of unmortgaged properties + half the build price of all buildings); if it is below the **sum of all the debtor's outstanding debts plus the new one** (rules section 12), declare bankruptcy; else add the debt and switch to `awaiting_debt`.
- **One total for a multi-creditor card:** the Harbour master's party card (`pay_each_player`) is evaluated as one total before anyone is paid: first the total against cash, then the total against the liquidation value. If cash covers it, everyone is paid in full. If the debtor is bankrupt, the Q13 rule applies: floor each creditor's pro rata share of the cash, and the rounding remainder goes to the biggest creditor, so cash is conserved (the bot test asserts this).
- **Who is in `awaiting_debt`:** only the turn player. Debts of other players are pending debts (task 18) and become `awaiting_debt` at the start of their own turn. This keeps the "only the current player acts" validation valid until the actor model arrives in task 19. The collect-from-every-player card (Festival) keeps its `insufficient_funds` rejection until task 18. An off-turn bankruptcy (the debtor is not the turn player) does not advance the turn.
- **Eliminated turn player:** bankruptcy of the turn player always ends with `advanceTurn`, and `finishRoll` also checks `active` as a guard. At `game_over`, `checkGameEnd` sets `turn.currentPlayerId` to the winner, so "the current player is active" stays true for the bot invariant.
- **Resume after a debt:** `due_at_turn_start` resumes to `awaiting_jail_choice` for a jailed debtor and to `awaiting_roll` otherwise.
- **Actor model:** the reducer today allows only `turn.currentPlayerId`. Add `actorFor(state)` in `actions.ts`: the auction bidder in `awaiting_bid`, the trade partner for accept/reject, otherwise the turn player. `validate` in `reducer.ts` uses it. The phase table `ALLOWED_PHASES` stays the source for the windows.
- **Windows (rules section 10):** Build, SellBuilding, Mortgage, Unmortgage, ProposeTrade are allowed in `awaiting_roll`, `awaiting_jail_choice` and `awaiting_end_turn`. In `awaiting_debt` only SellBuilding, Mortgage, ProposeTrade, PayDebt.
- **Auction:** `state.auction = { square, bidderOrder, passed, highBid, highBidderId, actorId, then, queue }`. Opening bid at least $10; raises of +10, +50 or +100; bids capped by cash; a pass is final; sold when all but the highest bidder have passed; if nobody bids, the property stays unowned. `then` is `finish_roll` or `next_in_queue`. `queue` holds the bank's assets for bankruptcy to the bank, in board order.
- **Bankruptcy:** sell all buildings at half price, transfer cash, deeds (still mortgaged) and jail cards to the creditor(s); to the bank: remove buildings, jail cards back to decks, auction the deeds one at a time (board order, bidders = active players, starting after the debtor). The player becomes inactive (spectator). If fewer than two active players remain, skip the auctions; `checkGameEnd` already ends the game.
- **Events to add:** `BuildingBuilt`, `BuildingSold`, `PropertyMortgaged`, `PropertyUnmortgaged`, `DebtIncurred`, `DebtPaid`, `BankruptcyDeclared`, `AssetsTransferred`, `PlayerEliminated`, `AuctionStarted`, `BidPlaced`, `BidPassed`, `AuctionEnded`, `TradeProposed`, `TradeAccepted`, `TradeRejected`, `TradeCancelled`.
- **New errors:** for example `not_owner`, `incomplete_group`, `uneven_build`, `has_buildings`, `already_mortgaged`, `not_mortgaged`, `invalid_bid`, `debt_unpaid`, `invalid_trade`.
- **New files (pattern: one concern per file, a test file beside it):** `buildings.ts`, `mortgage.ts`, `debt.ts`, `bankruptcy.ts`, `auction.ts`, `trade.ts`. Existing files to change: `state.ts`, `actions.ts`, `reducer.ts`, `landing.ts` (rent, auction trigger, `owe`), `cardplay.ts` (repairs, pending debts), `jail.ts` (forced fine), `helpers.ts` (`advanceTurn` starts a pending-debt phase), `gameend.ts`, `test-helpers.ts` (`owns`).
- **Reuse:** `charge`, `getPlayer`, `updatePlayer`, `finishRoll`, `advanceTurn`, `movePlayer` in `helpers.ts`; `groupSquares`, `isProperty`, `rentFor` in `board.ts` and `landing.ts`; the `gameWhere`/`landing`/`topCard` test helpers; the bot in `bot.test.ts`.

## Task list (continues the numbering in `plan/game-engine-plan.md`)

- [x] 12. Save this phase to `plan/game-engine-plan.md` as a new section (the live to-do list). Update `plan/game-rules-reference.md`: Q8 and Q13 are the user's decisions; Q11, Q12, Q14 and Q17 are written as defaults, not as answers. Do not touch the checkboxes in `plan/game-screen-2-gameplay.md`: the user keeps that list.
- [x] 13. Ownership shape `{ ownerId, houses, mortgaged }`. Rent with buildings: the rent table by houses; a street with no buildings of its own pays double when the owner holds the full group, even if a sibling has houses (the even-build rule allows it) or is mortgaged, and mortgaged siblings still count for ownership; no rent when the street is mortgaged. Repair cards charge per house and hotel. Remove `TODO(buildings)`. Update tests and the `owns` helper.
- [x] 14. `Build` and `SellBuilding` actions and the windows. Rules: full group, no mortgaged street, even build and even sell, up to a hotel, half refund, unlimited supply. Tests for each rejection.
- [x] 15. `Mortgage` and `Unmortgage` actions. Rules: no buildings in the group, half the price, lift for +10% rounded up.
- [x] 16. Debt model for the turn player: `Debt`, liquidation value against the sum of debts, `owe()`, phase `awaiting_debt`, `PayDebt`, the debt-phase action limits. Use it for tax, rent and the pay cards (one total for the multi-creditor card). The voluntary jail fine, buying, building and lifting a mortgage are choices, so they keep rejecting with `insufficient_funds` (a normal validation error that stays). A debt the assets cannot cover, the Festival card, and the forced jail fine keep `insufficient_funds` until later tasks.
- [x] 17. Bankruptcy to players: liquidation, transfer to one creditor, several creditors by the Q13 rule (floor shares, remainder to the biggest creditor, conservation test), elimination, `advanceTurn` for a bankrupt turn player, a `finishRoll` guard for inactive players, `currentPlayerId` = winner at `game_over`. The game can now end for real. Remove `insufficient_funds` for player creditors.
- [x] 18. Pending off-turn debts: Festival creates them for debtors who cannot pay at once; the check runs at arising (an off-turn bankruptcy does not advance the turn) and again when due; they fall due at the start of the debtor's turn in `advanceTurn` (`awaiting_debt` before the roll; a jailed debtor resumes to `awaiting_jail_choice`, with a test); cancelled when the creditor is eliminated before they fall due.
- [ ] 19. `actorFor` and auctions: `Bid`, `PassBid`, phase `awaiting_bid`, auto-pass, results, and the triggers (declined and unaffordable purchase). Remove `TODO(auction)`.
- [ ] 20. Bankruptcy to the bank: remove buildings, jail cards back to decks, the board-order auction queue, skip when fewer than two active players. Remove the `insufficient_funds` for bank creditors.
- [ ] 21. Forced jail fine as a debt (`leave_jail_and_move` continuation). Remove the last debt-related `insufficient_funds` rejection (the error code stays for voluntary payments).
- [ ] 22. Trades: `ProposeTrade`, `AcceptTrade`, `RejectTrade`, `CancelTrade`, phase `awaiting_trade_response`. Rules: cash, deeds (not when the group has buildings; mortgaged allowed), jail cards; both players active; re-check at accept; bankruptcy re-check for a debtor.
- [ ] 23. Upgrade the bot in `bot.test.ts` to use every action (manage, pay debt, bid, trade). New invariants (houses, even build, mortgage state, debts, auction, trade). Many games must reach `game_over` with one winner. Same seed, same game.
- [ ] 24. Docs: update `packages/game-engine/README.md` ("Not built yet" shrinks), the root README line, and the gameplay doc if needed. Final `pnpm ready`.

## Risks

- The ownership shape change touches many tests (task 13). Do it first, alone.
- The actor change (task 19) touches the reducer validation. Keep `turn.currentPlayerId` as the turn owner; only the permission check changes.
- Debt continuations must resume exactly where the roll stopped (`finishRoll`, or the jail move). Cover each `then` value with a test.
- The bot can stall on rejected actions. The bot must always have a legal move in every phase (including `awaiting_debt`: sell and mortgage until it can pay).

## Verification

After each task: `unset NODE_USE_SYSTEM_CA; pnpm check` and `pnpm test` must pass. The engine tests include the seeded bot invariant test; from task 23 it also asserts that most games end with exactly one active player. Final: `pnpm ready` (check, test, build).
