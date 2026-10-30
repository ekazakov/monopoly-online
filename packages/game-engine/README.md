# @monopoly/game-engine

The game rules as a pure TypeScript module. It has no I/O: no database, no HTTP, no clock, and no `Math.random`. The server uses it as the authority for a game. The web app can use it to replay events.

The rules come from [plan/game-rules-reference.md](../../plan/game-rules-reference.md). The plan and the task list are in [plan/game-engine-plan.md](../../plan/game-engine-plan.md).

The package has no build step. It exports its `.ts` source, like `@monopoly/shared`.

## Use

```ts
import { applyAction, createGame } from "@monopoly/game-engine";

let state = createGame({
  seed: 12345,
  players: [
    { id: "a", name: "Ann" },
    { id: "b", name: "Bo" },
  ],
});

const result = applyAction(state, { type: "RollDice", playerId: state.turn.currentPlayerId });
if (result.ok) {
  state = result.state; // the new state
  console.log(result.events); // what happened, in order
} else {
  console.log(result.error.code, result.error.message); // the state did not change
}
```

## Design

- **Pure reducer.** `applyAction(state, action)` returns `{ ok: true, state, events }` or `{ ok: false, error }`. It never changes the state you give it.
- **Server is the authority.** The server checks each action. A client sends actions and shows the events.
- **Seeded random numbers.** The random state is in `state.rng`. The same seed and the same actions give the same game. `createGame` shuffles the turn order and both decks with this seed.
- **Plain JSON state.** There are no `Map`, `Set` or class instances. Save and restore the state with `JSON.stringify` and `JSON.parse`.
- **Version.** `state.version` goes up by one for each accepted action. A rejected action does not change it.

## Turn flow

| Phase                     | Who acts           | Allowed actions                                                        |
| ------------------------- | ------------------ | ---------------------------------------------------------------------- |
| `awaiting_roll`           | The player on turn | `RollDice`, and the management actions below                           |
| `awaiting_buy_decision`   | The player on turn | `BuyProperty`, `DeclineProperty` (a declined property goes to auction) |
| `awaiting_jail_choice`    | The player on turn | `RollDice`, `PayJailFine`, `UseJailCard`, and the management actions   |
| `awaiting_end_turn`       | The player on turn | `EndTurn`, and the management actions                                  |
| `awaiting_debt`           | The player on turn | `PayDebt`, `SellBuilding`, `Mortgage`, `ProposeTrade`                  |
| `awaiting_bid`            | The bidder         | `Bid`, `PassBid`                                                       |
| `awaiting_trade_response` | The trade partner  | `AcceptTrade`, `RejectTrade`. The proposer can `CancelTrade`.          |
| `game_over`               | Nobody             | none                                                                   |

The management actions are `Build`, `SellBuilding`, `Mortgage`, `Unmortgage` and `ProposeTrade`. A player can use them only before the roll and after the landing (rules section 10), and while settling a debt.

Any active player can `Resign` in any phase except `game_over`, also off turn. It is refused with `auction_running` while an auction runs.

Every action has a `playerId`. Use `actorFor(state)` to get the player who must act now, and `mayAct(state, type, playerId)` to check one action.

## Rules that are built

- Dice, movement, Start salary, doubles, three doubles to Jail, Jail (pay, card, roll for doubles, forced fine).
- Tax, rent (houses and hotels, the full-group double, stations, utilities, mortgaged deeds), Chance and Chest.
- Buildings (even, on a full group) and mortgages (lifting costs the mortgage value plus 10%, rounded up).
- Auctions (+$10, +$50 or +$100 raises, bids capped by cash, a pass is final) when a property is declined or cannot be afforded.
- Debt: a payment that cash cannot cover becomes a debt if the player's assets can cover it. Debts of other players (the Festival card) fall due when their turn starts.
- Bankruptcy: to players (cash split pro rata, deeds to the biggest creditor) and to the bank (deeds auctioned one at a time). Jail cards always go back to their decks. The game ends when one active player is left.
- Resign: a bankruptcy to the players the player owes debts to, or else to the bank. An open trade is cancelled. Off turn, the turn continues after the bank auctions.
- Trades: one open proposal at a time; cash, deeds and jail cards; no deed from a colour group with buildings.

## Files

| File                                      | Content                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| `board.ts`, `cards.ts`                    | Static data: 40 squares, rents, the Chance and Chest decks.                  |
| `rng.ts`                                  | Seeded random numbers: `nextInt`, `rollDice`, `shuffle`.                     |
| `state.ts`, `actions.ts`                  | Types: state, events, errors, actions. Game constants. `actorFor`, `mayAct`. |
| `game.ts`                                 | `createGame`.                                                                |
| `reducer.ts`                              | `applyAction`: checks who can act and when, then calls a handler.            |
| `turn.ts`, `turnflow.ts`                  | Roll and move. `advanceTurn` and `finishRoll`, with debts that fall due.     |
| `landing.ts`, `cardplay.ts`, `jail.ts`    | The squares, the cards, Jail.                                                |
| `ownership.ts`                            | Queries and updates for deeds.                                               |
| `buildings.ts`, `mortgage.ts`             | `Build`, `SellBuilding`, `Mortgage`, `Unmortgage`.                           |
| `liquidation.ts`, `debt.ts`, `paydebt.ts` | Liquidation value, `owe`, pending debts, `PayDebt`.                          |
| `bankruptcy.ts`                           | Bankruptcy to players and to the bank.                                       |
| `auction.ts`, `trade.ts`                  | Auctions and trades.                                                         |
| `resign.ts`                               | `Resign`.                                                                    |
| `gameend.ts`                              | The game ends when one active player is left.                                |
| `helpers.ts`                              | Small state helpers that the handlers share.                                 |

## Not built

- **Saving to the database.** The plan is an event log with a snapshot, written in one transaction. The engine only gives plain JSON state and events.
- **The autopilot for away players** (Q2 and Q22 in `plan/game-screen-2-gameplay.md`). It belongs to the server: it sends normal actions for an away player. The engine waits for the player who must act.
- **Hiding the random state.** The server must not send `rng` or the deck order to devices (Q19).

The engine accepts 2 to 6 players (`MIN_PLAYERS`, `MAX_PLAYERS`, Q1). All rule questions are decided in [plan/game-rules-reference.md](../../plan/game-rules-reference.md).

## Test

```bash
pnpm --filter @monopoly/game-engine test
```

The tests include a random bot that plays 16 seeded games with four players, using every action. It checks the invariants after each action, and most games must end with one winner. In tests, the helpers in `src/test-helpers.ts` search for a seed that gives the dice a case needs. This stays repeatable because the random numbers are seeded.
