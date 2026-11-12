# Sound design

This document describes the sound effects and the ambient music of the game screen. The code is in `apps/web/src/audio`.

## Parts

| File                 | Responsibility                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `engine.ts`          | One Web Audio context with a master bus, an effects bus, and a music bus. Loads and plays the cue files.   |
| `soundPreference.ts` | The sound settings of the device in localStorage: `hf.sound`, `hf.sound.effects`, and `hf.sound.music`.    |
| `cues.ts`            | The cue names, their file paths, `cuesFor` (game events to result cues), and `moneyCues` (the coin ring for a cash gain). |
| `useGameSounds.ts`   | The motion listener that plays the cues in time with the dice and the tokens. It also starts the music.  |
| `music.ts`           | The generative ambient music. It uses oscillators and filtered noise, with no file.                       |

A browser lets a page make sound only after a user gesture. The context starts on the first `pointerdown` or `keydown`. Before that, and without Web Audio, no sound plays and no error occurs. The first click often starts the audio and rolls the dice. A cue whose file is still loading plays if it is at most 250 ms late, else it does not play.

## Settings

The game Menu has a Sound switch, an Effects slider, and a Music slider. Sound is on by default. The effects volume is 70%. The music volume is 0, so the music is off until the user moves the slider.

## Timing

The sounds follow the motion player in `apps/web/src/screens/game/motion/useMotionPlayer.ts`. The player calls the `MotionListener` of `MotionProvider`:

- `onAction` comes for a live action, with the state after it. The result cues of the action wait in a list. The money cues come last.
- `onStep` comes at the start of each step. The dice and token cues play with the step.
- `onIdle` comes at the end of the motion. The result cues then play, 120 ms apart.
- `onSettle` comes for news that is not a live action: a snapshot, a reconnect replay, or an action while the tab is hidden. The waiting cues are dropped, and the cash baseline moves to the new state.

Thus a reload or a reconnect plays no old sounds. The rent sound comes at the end of the token walk. Under reduced motion the steps do not play, so only the result cues play.

## Cue map

| Cue                         | When it plays                                                                  |
| --------------------------- | ------------------------------------------------------------------------------ |
| `dice-shake`, `dice-land`   | Roll step. Doubles land two times.                                             |
| `hop`, `land`               | Walk step: a tick for each square and a thud on the last square.               |
| `whoosh`, `land`            | Jump step, for example "go back 3 squares".                                    |
| `card`                      | `CardDrawn`. A card that moves the token plays it with the hold step.          |
| `coin-in`                   | The cash of a player goes up in the action, for any reason.                    |
| `coin-out`                  | `TaxPaid`, and `CashChanged` with a loss (a card that takes money).            |
| `stamp`                     | `PropertyBought`.                                                              |
| `build`, `unbuild`          | `BuildingBuilt`, `BuildingSold`.                                               |
| `paper`                     | `PropertyMortgaged`, and `PropertyUnmortgaged` at a higher pitch.              |
| `jail`                      | `SentToJail`.                                                                  |
| `gavel`, `bid`              | `AuctionStarted` (soft), `BidPlaced`, `AuctionEnded`.                           |
| `trade-offer`, `trade-yes`, `trade-no` | `TradeProposed`, `TradeAccepted`, `TradeRejected` or `TradeCancelled`. |
| `bankrupt`                  | `BankruptcyDeclared` or `PlayerEliminated`, one time for each action.          |
| `bell`                      | `TurnEnded` for a next player on this device.                                  |
| `win`, `end`                | `GameEnded`: `win` for a winner on this device, else `end`.                    |

The `coin-in` cue compares the cash of each player before and after the action, as the player rail does. Thus any gain rings the coins, for example rent, Go, a card, or an auction sale. The `coin-out` cue comes only from a tax or from a card that takes money. Rent, a jail fine, a purchase, and a debt payment have no sad cue. One action plays one `coin-in` and one `coin-out` at most. The seats of this device come from `mySeats`. On a shared device every local seat counts, so each local turn rings the bell. The cues of other players play at 55% gain.

## Files

Each cue is one file, `apps/web/public/sounds/<cue>.mp3`. A missing file is a silent cue. To change a sound, replace its file and keep the name. The source and the license of each file are in `apps/web/public/sounds/CREDITS.md`.
