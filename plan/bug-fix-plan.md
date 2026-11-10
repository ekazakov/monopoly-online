# Bug fix plan

This plan gives the fix approach, the size, and the order for each open entry in [open-bugs.md](open-bugs.md). It records the review of 2026-11-09. No bug is fixed yet. When a fix is done, set its status in `open-bugs.md` and mark the task here.

File paths in the web app are relative to `apps/web/src/` unless the path starts with `apps/`, `packages/`, `plan/` or `artifacts/`. Paths that start with `turn/`, `hand/`, `flows/`, `handoff/`, `motion/`, `debug/` or `log/` are in `apps/web/src/screens/game/`. Line numbers are from the review and can move. Check the source before an edit.

## Summary

| Task                                         | Size            | Phase | Depends on              |
| -------------------------------------------- | --------------- | ----- | ----------------------- |
| Same pips on all dice faces (BUG-6)          | Small           | 1     | none                    |
| Focus ring around the bid field (BUG-3)      | Small           | 1     | none                    |
| Dice fit in the turn area (BUG-4)            | Small           | 1     | none                    |
| Owner marker clear of the price (BUG-9)      | Small           | 1     | none                    |
| Station rent rows on the deed (BUG-1)        | Small           | 2     | Modal dialog            |
| Full title deed (BUG-10)                     | Small to medium | 2     | BUG-1, Modal dialog     |
| Auction in a modal dialog (BUG-2)            | Medium          | 3     | Modal dialog            |
| Cards in a modal dialog (BUG-5)              | Medium          | 3     | Modal dialog            |
| Hold the card move until OK (BUG-16)         | Medium          | 3     | BUG-5                   |
| Card stacks in the board centre (BUG-7)      | Small to medium | 4     | none                    |
| No hand header and group labels (BUG-8)      | Small to medium | 5     | Hand prototype          |
| Many properties fit the hand (BUG-11)        | Medium to large | 5     | Hand prototype          |
| Expanded hand with no scroll (BUG-12)        | Medium to large | 5     | Hand prototype          |
| Event log after a refresh (BUG-14)           | Small to medium | 6     | none                    |
| Debug mode env variable (BUG-17)             | Medium          | 6     | none                    |
| Turn-change toast for hot-seat (BUG-15)      | Medium          | 6     | Toast host              |
| Interactive board squares (BUG-13)           | Medium to large | 7     | BUG-10, BUG-2, phase 5  |

Size scale:

- **Small:** one or two files, a few lines, and one test or a visual check.
- **Medium:** a new component or a change across several files, with unit test updates.
- **Large:** a redesign or a change across web, API, shared schemas and browser tests.

## Dependencies

- One **modal dialog** component serves the auction (BUG-2), the drawn cards (BUG-5) and the square detail (BUG-13).
- One **full title deed** (BUG-1, BUG-10) serves the buy view, the auction and the square detail (BUG-13).
- The card hold (BUG-16) changes how a card is shown and closed. Do it with BUG-5.
- The hand changes (BUG-8, BUG-11, BUG-12) are one design task. BUG-13 uses the property actions that the hand has now, so it comes after the hand redesign.
- BUG-15 needs a toast host. No toast system exists in the web app.

## Phase 1: quick fixes

Each task is one small change. Each can go in its own commit.

### Same pips on all dice faces (BUG-6)

- [x] Delete the special case for the value 1 in `screens/game/turn/Dice.tsx:42-44`: a circle with `r="13"` and the class `turn-area__pip--one`. Use `PIPS[1]` and `r="6"`, as the other faces do.
- [x] Delete `.turn-area__pip--one` in `screens/game/turn/TurnArea.css:72-74`.
- Cause: a common style for the face with one pip. The spec (4.5) already says all pips are r 6 in `#1b1b1b`.
- Other faces have no special case.

### Focus ring around the bid field (BUG-3)

- [x] In `screens/game/flows/auction/Auction.css`, move the ring from `.auction__input:focus-visible` (lines 143-146) to `.auction__input-wrap:has(.auction__input:focus-visible)`. Set `outline: none` on the input.
- The wrapper already uses `:has([aria-invalid])` (line 148), so `:has()` is in use. `:focus-within` also works but shows the ring on a mouse click too.

### Dice fit in the turn area (BUG-4)

- [x] Give `.turn-area__dice` padding (about 12px top and bottom, 8px at the sides), or make the tumble stay inside the box (no `translateY`, a smaller rotation).
- Cause: the tumble animation (`TurnArea.css:43-60`) moves each die up 10px and turns it by -9° to +11°. A transform does not change the layout size. `.turn-area` has `overflow: hidden auto` (lines 6-21), so the top of the die is cut and a vertical scrollbar shows.
- Do not remove the overflow on `.turn-area`. Long phase views need that scroll.
- Check under reduced motion: no tumble, so no change.

### Owner marker clear of the price (BUG-9)

- The red bar is the **owner marker**, not a colour bar. The owner in the image has the red token (the dog, `#d9392f`). Lantern Row, Cobble Street and Saltmarsh Road are in the Sky group.
- Cause: the marker (`scene/Tile.tsx:89-96`, `geometries.marker` in `scene/resources.ts:21`, `MARKER_Z = 0.625` in `scene/layout.ts:23`) covers the outer 9% of the square. `squareTexture()` (`scene/textures.ts:149-151`) draws the price at the same outer edge, at baseline `TILE_H - 28`.
- [x] Decision (user, 2026-11-09): the owner marker is a deeper band (96px of the 560px texture, `MARKER_DEPTH` in `scene/layout.ts`) and the price is drawn on it, in the board ink or white by contrast (`markerInk` in `scene/colors.ts`). A mortgaged marker is an opaque, lighter colour. The prototype was not saved to `artifacts/`.
- [x] Check all four sides of the board and a square with houses (checked by the user).
- Spec: R-B4 and open question 5 (colour collisions) in `game-screen-2-spec.md`.

## Phase 2: full title deed

### Station rent rows on the deed (BUG-1) and full title deed (BUG-10)

Do both in one change. `screens/game/turn/PropertyCard.tsx` is the only deed component. The buy view (`turn/BuyView.tsx:29`) and the auction (`flows/auction/AuctionView.tsx:39`) use it.

- Now: `rentText()` (lines 7-13) gives one string. A street shows `rent[0]`, a station shows "$25 to $200", and a utility shows "4 or 10 × dice".
- Data (all in `packages/game-engine/src/board.ts`):
  - street: `price`, `rent` (6 values: base, 1 to 4 houses, hotel), `buildPrice`, `mortgage`
  - `STATION_RENT = [25, 50, 100, 200]` and `UTILITY_MULTIPLIER = [4, 10]` (lines 33-34)
  - rent with a colour set = `rent[0] * 2` (`landing.ts:28`); hotel cost = `buildPrice` (`plan/game-rules-reference.md`)
- **Decisions (user, 2026-11-09):** the full deed shows in a modal dialog only, never in the board centre. The purchase decision is a modal dialog with the full deed and the Buy and Auction buttons. The centre shows only the status line. The modal, the full deed, the purchase dialog and the auction dialog are one change.
- [x] Street rows: rent, rent with color set, 1 to 4 houses, hotel, house cost, hotel cost, mortgage value (`deedRows` in `turn/PropertyCard.tsx`).
- [x] Station rows: 1, 2, 3 and 4 stations owned, then mortgage value.
- [x] Utility rows: "4 × dice" with one utility, "10 × dice" with both, then mortgage value.
- [x] Compact variant and `current` highlight: dropped. The centre has no deed, so nothing uses them. Add the highlight with BUG-13 if the square detail needs it.
- [x] Height check: not needed, because the deed is in a dialog.
- [x] Update `turn/TurnArea.test.tsx` and other tests that read the old rent text. New tests: `turn/PropertyCard.test.tsx`, `GameScreen.test.tsx` (dialogs).
- Size: small to medium.

## Phase 3: modal dialog and card flow

### Modal dialog component

- No modal exists in the web app and no dialog library is installed. `handoff/HandoffPrompt.tsx` is a `div role="dialog"` that sets `inert` by hand; it is not reusable.
- [x] Build one `Modal` on a `<dialog>`. Changed (user, 2026-11-09): not `showModal()`, because the native modal makes the Menu inert and paints over the top bar. The Modal uses `show()` in a scrim below the top bar and sets `inert` on the other regions by hand. Use the prototype as the reference: `dialog()` in `artifacts/game-screen/js/app.js:445-472` and `dialog.dlg`, `.narrow`, `::backdrop` in `artifacts/game-screen/styles.css:243-245`. Use the tokens in `styles/tokens.css`.
- [x] Mount it as a child of `.game-layout`, outside `.game-layout__regions`. The hot-seat handoff sets `inert` on that element, so a dialog inside it would be inert.
- [x] Add a "not closable" option. A phase dialog (the auction) must not close on Esc: call `preventDefault` on the `cancel` event and show no close button.
- [x] Give focus to the first control on open and return it on close (`showModal` and `close` do this; the dialog opens in a ref callback, so a child can take the focus in its effect).
- [x] Check `showModal` in jsdom (jsdom 30 has none; the shim is in `testing/setup.ts`). Add a small test shim if jsdom does not support it.

### Auction in a modal dialog (BUG-2)

- Now: `AuctionView` is the view of the `awaiting_bid` phase (`turn/centrePhases.ts:25`). `TurnArea` shows it in the board centre (`GameScreen.tsx:213`).
- [x] Show `AuctionView` in the modal dialog while the phase is `awaiting_bid`, on the device that has a seat to bid (user decision, 2026-11-09: a modal makes the Menu inert, so the other devices keep the read-only auction in the board centre). Keep all content: title deed, current bid, bidders, bid input, quick-bid buttons, Bid and Pass.
- [x] Use the full deed from phase 2.
- [x] Check the `BidForm` autofocus (`AuctionView.tsx:117-119`) inside the dialog.
- [x] Check a hot-seat auction where the next bidder is on the same device (checked by the user).
- [x] Update the auction browser test T10 (not run: ports 5173 and 8787 were in use). The top bar with the Menu stays above the phase dialog, so Save, Finish and Leave game stay reachable. T23 and the other browser tests that click Buy or Menu during a phase dialog are not run.

### Cards in a modal dialog (BUG-5)

- Now: `CardNotice` (`flows/card/CardNotice.tsx`) shows above `TurnArea` (`GameScreen.tsx:207`). `flows/card/useCardNotice.ts:38-70` gives its state. OK only closes it on this device and sends no action.
- [x] Show the card in the modal dialog, for Chance and Community Chest. Decided (user, 2026-11-10): the title is "<name> drew a card"; the body is the card face and OK; Esc works like OK; no × button; no animation. The dialog comes before a phase dialog (Buy), which follows after OK.
- [x] Keep OK as a local close. It sends no action (gameplay doc 2.1).
- [x] Show the card on every device. Each device closes it on its own.

### Hold the card move until OK (BUG-16)

Decided (user, 2026-11-10): only the token waits. The rail cash, the owner markers and the log show the end state during the hold.

The server sends the whole result in one action: roll, move to Chance, card, move to the card target. The web plays all moves, then shows the card. The fix is web only.

- Data flow now:
  - `game/store.ts` keeps the events of the last action in `lastActionEvents`.
  - `screens/game/motion/useMotionPlayer.ts` sends them to the queue in `scene/motion.ts`.
  - `planMotion` (`motion.ts:103-132`) makes a step for `DiceRolled` and for each `PlayerMoved`. It ignores `CardDrawn`.
  - `useCardNotice.ts:45` shows nothing while a step plays, so the card shows after the last move.
- The engine sends `CardDrawn` before the card's own `PlayerMoved` (`packages/game-engine/src/cardplay.ts:56`), so the event order supports a hold.
- [x] In `planMotion`, add a `card` hold step at each `CardDrawn` that a move follows.
- [x] In `useMotionPlayer`, stop at a hold step with no timer. Add a `release()` to the motion context (`screens/game/motion/context.ts`).
- [x] In `useCardNotice`, show the card while the current step is a hold. OK calls `release()`.
- [x] `restingSites` (`motion.ts:65-78`) already keeps the token on the Chance square while the hold waits. Check it.
- [x] In `TurnArea.tsx:35-43`, do not show "Moving…" during a hold. Hide the phase actions (for example Buy for the utility) until OK.
- [x] Reduced motion: today `useMotionPlayer.ts:82` calls `settle()` and puts the token on the last square at once. Change it: moves show at once, but a hold step still waits for OK, with the token on the card square.
- [x] Cases: two cards in one action; a new action, a snapshot message or a reconnect during a hold (settle and release); a card with no move; a card of a remote player (each device holds on its own).
- [x] Update `MotionProvider.test.tsx` (reduced motion and settle cases) and `CardNotice.test.tsx`.

### Spec

- [x] Spec updated: modal dialogs are allowed for the purchase, the auction, the drawn cards and the square detail (`game-screen-2-spec.md` 5.2, 8.7, open question 11).

## Phase 4: board centre

### Card stacks in the board centre (BUG-7)

- Now: the centre is one plane (`scene/BoardScene.tsx:213-220`, `geometries.centre` in `scene/resources.ts:17`). `centreTexture()` (`scene/textures.ts:267-293`) draws two dashed outlines at 45° with the labels "CHEST" and "CHANCE". In world units the places are about (-2.68, -2.68) and (+2.68, +2.68), each about 1.4 × 0.92, turned 45° on the y axis.
- Decided (user, 2026-11-10): 5 thin cards per stack; the top card shows the deck colour, a light border and the deck name; the dashed outlines and labels are removed; the stacks are static.
- [x] Add a stack of a few thin boxes for each deck, at those two places. Put a card-back texture on the top card. Use `makeTexture()` (`textures.ts:43`) and the existing colours `SURFACE.chance` and `SURFACE.chest`.
- [x] Add the geometry and materials to `createResources()`, as the `bar` and `marker` resources do.
- [x] Remove the dashed outlines and labels, or make them lighter.
- [x] Use a fixed stack height. The redacted state does not have the deck size (`packages/shared/src/state.ts:110`). Keep the deck order on the server.
- [x] Check by calculation (the pane was too small for a screenshot) that the turn area in the centre does not cover the stacks.
- No-WebGL path: `Unavailable` (`BoardScene.tsx:50-59`) has no 2D board, so no change there. Reduced motion: no animation is added.

## Phase 5: property hand redesign

### Hand prototype

**Make a UI prototype first.** Do not change `screens/game/hand/` before the user approves the prototype.

1. [x] Make the new hand layout in the game screen prototype (`artifacts/game-screen`). Ask the user before you save the artifact. Done 2026-11-10 in the local copy only (not committed, not saved as a new artifact). Run `pnpm artifact:game-screen` and press "Marlow owns all 28" in the Prototype panel.
2. [x] Get the user's approval of the prototype (2026-11-10). Decided with the user: no debt controls in the hand (the board centre handles debt), no "Owes" pill, and the debt auto-open stays.
3. [x] Update `game-screen-2-spec.md` 4.6 and R-H1 to R-H6 to the approved design.
4. [x] Then change the code (BUG-8, BUG-11, BUG-12).

Proposed direction for the prototype:

- One grid with a column for each property group (up to 10 columns), in both states.
- Compact cards (smaller width, name and price) in the grid. Cards in a column stack down and overlap in the collapsed state.
- With 28 properties, all cards fit at 1024px and wider with no scroll. A different layout is acceptable if it does this better.

### No hand header and group labels (BUG-8)

- Now: the header (`hand/PropertyHand.tsx:449-467`) is the `property-hand__toggle` button with "<name>'s properties", "count · $value" and an arrow. The same row holds the "Owes $X" pill and the hot-seat seat switcher. `StackLabel` (lines 86-99) shows "Sky · 3" and a tick for a full set.
- [x] Remove the header block and the group labels.
- [x] Find a new place for (done: the tab above the hand holds the token and the count and is the keyboard entry; the seat switcher is in the side column; there is no "Owes" pill and no Pay in the hand; the tick is on the colour band):
  - the keyboard entry. The peek is `aria-hidden` and has no focusable element (lines 247-250).
  - the "Owes $X" pill and the Pay button
  - the seat switcher on a hot-seat device
  - the "set complete" tick (for example on the card colour band)
- [x] Keep an `aria-label` on each group list. Now each list uses `aria-labelledby` on the label.
- [x] Update about 10 assertions (done) in `PropertyHand.test.tsx` (lines 89, 96, 105, 134, 144, 460-520).
- Spec conflict: R-H1 (count labels) and R-H3 (hand label and total value). The spec note says they change with this task.

### Many properties fit the hand (BUG-11)

- Now: the peek (`PropertyHand.css:159-200`) is one flex row with no wrap and a 28px gap. Each stack is `flex: 0 1 156px` with `min-width: 56px`. Cards are 156px boxes with a 25px offset. 10 groups need at least 812px plus labels, and the labels do not shrink. The centred row goes off both edges.
- [x] Use the approved prototype layout.
- Spec: 4.6 says the collapsed hand fits up to 10 stacks with no scroll.

### Expanded hand with no scroll (BUG-12)

- Now: the surface is `width: min(960px, 100%)` and `max-height: 60vh`. `.property-hand__groups` (CSS lines 306-318) is a centred wrapping flex row with `overflow-y: auto`. At 960px only 1 or 2 groups fit in a row, so 28 cards need about 6 rows.
- The inline `Detail` actions panel (lines 180-245) also takes height.
- [x] Use the approved prototype layout. All properties show with no scroll. The panel can be bigger.
- [x] Keep the open and close behaviour (hover, click to pin, focus, Esc, and open by itself while this device settles a debt; lines 329-400).
- [x] Keep reduced motion: no animation.

## Phase 6: data and platform

### Event log after a refresh (BUG-14)

**Decision:** send the earlier events in the snapshot message.

- Cause: the store (`game/store.ts`) fills the log only from `game.actions` messages and action responses. `applySnapshot` (lines 80-108) clears the log on a first load. The snapshot message (`apps/api/src/realtime/resume.ts:144-186`) has only `{game, state}`.
- A short reconnect (gap 1 to 100) already replays the missed `game.actions` (`replayActions`, `resume.ts:75-121`). A refresh, a long gap or a new topic set gets a snapshot message with no events.
- Events are in `game_events` (`apps/api/src/db/migrations.ts:112-127`). Save and Finish delete the rows after the turn-start game snapshot (`apps/api/src/game/service.ts:372-420`), so the stored events always match the state after a rollback.
- [ ] `packages/shared/src/stream.ts:73-76`: add an optional `events: [{version, events}]` to the snapshot message payload.
- [ ] `apps/api/src/realtime/resume.ts` `snapshotMessage` and `onSnapshot` in `realtime/messages.ts`: read `game_events` up to `state.version` and add them.
- [ ] `game/store.ts` `applySnapshot`: fill `events` from the payload. Keep `lastActionEvents` empty, so no animation or card replays.
- [ ] `screens/game/log/GameLog.tsx:43`: `initialCount` is read at mount. Do not show the earlier lines as new.
- [ ] Tests: resume tests in the API, store tests, and a browser test (refresh, then the log has the earlier lines).
- [ ] Update `plan/api-schema.md` (snapshot) and run `pnpm openapi` if the stream schema is in the OpenAPI document.
- Events need no redaction. They already go to every seat in `game.actions`.
- See open decision 4 (a limit on the number of events).

### Debug mode env variable (BUG-17)

- The debug panel can also set the next dice roll and the top card of a deck (added 2026-11-10). These edits use `DebugEdit`, so the same flag gates them.

**Decision:** only the API reads the variable. The web gets the value from the API at run time. The API refuses to start when the flag is on and `NODE_ENV` is `production`.

Why this is not a one-line change:

1. **Build time and run time.** A Vite variable (`VITE_*`) goes into the bundle at `pnpm build` and does not change after that. An API variable is read when Node starts. The prod image builds the web one time (`Dockerfile:45`) and copies it into `/app/web` (`Dockerfile:60`).
2. **One image for prod and e2e.** The compose `e2e` service runs the same `harborfront:local` image with test settings. Browser test T19 (`apps/e2e/tests/game-leave-debug.spec.ts:41-56`) clicks the Debug button. A build-time flag would need a second build, and that build would not test the true prod bundle.
3. **One source of truth.** If the web and the API read different variables, the Debug button can show while the API refuses `DebugEdit`. The server is the authority for actions, so the API decides.
4. **No separate route.** `DebugEdit` is a normal game action on `POST /api/games/:id/actions` (`apps/api/src/routes/gameplay.ts:65-77`). The engine handles it (`packages/game-engine/src/debug.ts`). The check goes in the API, not in the engine, so the engine stays pure.
5. **Production rule.** `GAME_SEED` and `PRESENCE_GRACE_MS` are ignored in production (`apps/api/src/index.ts:45-65`). `GUEST_SIGN_IN_ENABLED` makes the API refuse to start (`apps/api/src/auth/config.ts:29-37`). The debug flag uses the second pattern, so a wrong deploy fails at start.
6. **Test setups.** The browser suites for property and debt, jail cards, bankruptcy and T19 call `debugEdit` (`apps/e2e/support/api.ts:126`). Each place that starts an API for tests must set the flag.
7. **Docs say "always on".** `plan/api-schema.md` (Debug edit) and the gameplay doc question 24 must change.

Tasks:

- [x] API config: read the variable (name: open decision 1). Default off. Refuse to start when it is on and `NODE_ENV` is `production`. Log it in the start settings line (`apps/api/src/index.ts:69`).
- [x] Pass `debug: boolean` through `AppOptions` / `resolveDeps` (`apps/api/src/routes/common.ts:25-55`) to the game service.
- [x] Refuse `DebugEdit` in `service.submit` when the flag is off, with a new error code in the shared error schema (not 404; the route stays).
- [x] Add `debug` to `GET /api/auth/methods` (`apps/api/src/routes/auth.ts:34`, `authMethodsSchema` in `packages/shared`): `{google, guest, debug}`.
- [x] Web: read `debug` from the methods query (`session/queries.ts:38-48`, `staleTime: Infinity`). Do not mount `DebugPanel` (`GameScreen.tsx:28, 158`) when it is false. Keep the "(debug)" log lines for earlier edits.
- [x] Turn the flag on in: `apps/api/package.json` `dev` script, `apps/e2e/playwright.config.ts` webServer env (lines 79-86), `compose.yaml` `e2e` and `dev` services, `ops/local.env`, `.env.example`.
- [x] Tests: `apps/api/src/game/service.test.ts` (flag on and flag off), the methods route test, `DebugPanel.test.tsx` or `GameScreen.test.tsx` (hidden when off).
- [x] Run `pnpm openapi`. Update README (env table), `plan/api-schema.md`, the spec R-D1 and R-D5, and the gameplay doc question 24.

### Turn-change toast for hot-seat (BUG-15)

- Now: `handoff/HandoffPrompt.tsx` is a full-screen `role="dialog"` with "Pass to <name>" and "I'm <name>, start my turn". It sets `inert` on `.game-layout__regions`. `useHotSeatHandoff` (`game/useGame.ts:97-117`) and `isHotSeatHandoff` (`game/selectors.ts:83-95`) control it.
- `isHotSeatHandoff` uses `actingSeat`: the bidder, the trade partner or the player on turn. So the overlay also shows for an auction bid or a trade answer between hot-seat seats, not only at a turn change.
- No toast system exists.
- [x] Build a small toast host (a hook and a component, not a context: one notice at a time). Decided 2026-11-10: centre of the board, styled like the handoff screen with the 3D pawn, 500 ms fades and 1 second in full view: a context, an `aria-live="polite"` region, and a timed close. Mount it outside `.game-layout__regions`.
- [x] Show "It is <name>'s turn" on **every device** in the game when the turn changes. Use the `TurnEnded` event in `lastActionEvents` (`packages/shared/src/events.ts:151`). `lastActionEvents` is empty after a snapshot message, so a reload shows no toast.
- [x] For an acting-seat change on one device (auction bidder, trade answer): decided 2026-11-10, no toast. Turn changes only.
- [x] Remove `HandoffPrompt` and `useHotSeatHandoff`. Keep the hand switch in `PropertyHand.tsx:316-320`.
- [x] The privacy step is removed on purpose. The next player's properties and actions show at once.
- [x] Unit tests: `HandoffPrompt.test.tsx` (delete), `GameScreen.test.tsx:375`, `game/useGame.test.tsx:154-190`, `game/selectors.test.ts:149-163`, and new toast tests.
- [x] Browser tests (updated 2026-11-10, not run in this sandbox): `apps/e2e/support/game.ts:133, 140` (the "handoff" step), `core-game.spec.ts` (lines 5-6, 22, 55-59), `game-auction-trade.spec.ts` T11 (lines 42-68, rewrite), `session.spec.ts:246`.
- [x] Design docs: the spec (1.2, 5.3, R-T5) and the gameplay doc (section 1 and 3) already describe the toast.
- [x] When the code is done, replace the planned-change note for T11 in `plan/e2e-test-plan.md` with the final text.

## Phase 7: board interaction

### Interactive board squares (BUG-13)

- The click path exists. `scene/Tile.tsx:11-51` has an `onSelect` prop with `onClick` (a drag of more than 5px is not a click), hover and `useCursor`. `scene/BoardScene.tsx` passes `onSquareClick`. But `Board` in `screens/GameScreen.tsx:170-182` does not pass `onSquareClick`.
- [x] Pass `onSquareClick` for streets, stations and utilities. Open the modal dialog (phase 3) with the full deed (phase 2), the property owner, the buildings and the mortgage state.
- [x] Move `Detail` and `ActionButton` and the seat choice out of `hand/PropertyHand.tsx` (lines 134-245, 403-420) into shared parts. Use them in the hand and in the dialog.
- [x] Gate the actions with `propertyActions` (`hand/propertyActions.ts:135`) and `mayActWith`. Send the same actions: `Build`, `SellBuilding`, `Mortgage`, `Unmortgage` through `actions.send`. The server stays the authority.
- [x] Keyboard and no-WebGL access (decided 2026-11-10: a "Squares" button in the top bar opens a list dialog; only properties are clickable on the board): the Canvas is `aria-hidden` (`BoardScene.tsx:273`) and `Unavailable` has no board. Add an accessible list of squares (buttons) that opens the same dialog. This is the largest new part.
- [x] Tests: dialog content, actions enabled and disabled, keyboard path.
- Spec: R-B5 ("tap a square to see its title deed").

## Open decisions

1. **Debug variable name (BUG-17).** For example `DEBUG_MODE_ENABLED`, in the style of `GUEST_SIGN_IN_ENABLED`.
2. **Owner marker or price (BUG-9).** Decided: price on a deeper marker. Spec open question 5 (owner marker that does not rely on colour) is related.
3. **Toast text for other handoffs (BUG-15).** The text for an auction bid or a trade answer between hot-seat seats, for example "Cara, answer the trade".
4. **Event limit in the snapshot message (BUG-14).** All events of the game, or the last N. The log store keeps at most 2000 events (`game/store.ts:11`).

## Validation

- Run `pnpm check` and `pnpm test` before each commit.
- Run the related Playwright tests for browser flows: T10 (auction), T11 (hot-seat trade), T19 (debug), the core game script and the session tests.
- Check the board changes (BUG-7, BUG-9, BUG-13) in the browser, with reduced motion on and off.
- For API or schema changes (BUG-14, BUG-17), run `pnpm openapi` and commit `apps/api/openapi.json` in the same commit.
- Update the status in `open-bugs.md` and mark the task here when a fix is done.
