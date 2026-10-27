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

| Phase                   | Allowed actions                          |
| ----------------------- | ---------------------------------------- |
| `awaiting_roll`         | `RollDice`                               |
| `awaiting_buy_decision` | `BuyProperty`, `DeclineProperty`         |
| `awaiting_jail_choice`  | `RollDice`, `PayJailFine`, `UseJailCard` |
| `awaiting_end_turn`     | `EndTurn`                                |
| `game_over`             | none                                     |

Only the current player can act. Every action has a `playerId`.

## Files

| File                     | Content                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `board.ts`, `cards.ts`   | Static data: 40 squares, rents, the Chance and Chest decks.       |
| `rng.ts`                 | Seeded random numbers: `nextInt`, `rollDice`, `shuffle`.          |
| `state.ts`, `actions.ts` | Types: state, events, errors, actions. Game constants.            |
| `game.ts`                | `createGame`.                                                     |
| `reducer.ts`             | `applyAction`: checks who can act and when, then calls a handler. |
| `turn.ts`, `landing.ts`  | Roll, move, GO salary, doubles, squares, rent, buying.            |
| `cardplay.ts`, `jail.ts` | Chance and Chest cards, Jail.                                     |
| `gameend.ts`             | The game ends when one active player is left.                     |
| `helpers.ts`             | Small state helpers that the handlers share.                      |

## Not built yet

These parts are temporary. Each one has a `TODO` comment in the code.

- **Auctions.** If a player declines to buy a property, or cannot afford it, the property stays unowned.
- **Debt and bankruptcy.** A payment that a player cannot make (tax, rent, a card, the jail fine) rejects the action with `insufficient_funds`. The state does not change, so the same roll comes again. The game cannot continue until debt is built. Nobody is eliminated, so the game end is only tested on built states.
- **Buildings, mortgages and trades.** Streets pay base rent (double for a full colour group). Repair cards cost nothing.
- **Saving to the database.** The plan is an event log with a snapshot, written in one transaction.

## Test

```bash
pnpm --filter @monopoly/game-engine test
```

The tests include a random bot that plays 60 seeded games and checks the invariants after each action. In tests, the helpers in `src/test-helpers.ts` search for a seed that gives the dice a case needs. This stays repeatable because the random numbers are seeded.
