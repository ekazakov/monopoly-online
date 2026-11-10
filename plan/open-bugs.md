# Open bugs

This file records bugs that are reported but not fixed. Do not fix a bug when you record it.

The fix approach, size and order for each bug are in [bug-fix-plan.md](bug-fix-plan.md).

Images for a bug are in `plan/bug-images/`. Name each file `BUG-<number>-<n>.<ext>`.

## Entry format

```md
### BUG-<number>: <short title>

- Status: open
- Reported: <YYYY-MM-DD>
- Area: <web | api | game-engine | shared | e2e | ops>
- Steps to reproduce:
  1. ...
- Expected: ...
- Actual: ...
- Images: ![description](bug-images/BUG-<number>-1.png)
- Notes: ...
```

## Bugs

### BUG-1: Station title deed shows a rent range, not all rent options

- Status: fixed (2026-11-09), checked in the browser
- Reported: 2026-11-09
- Area: web
- Steps to reproduce:
  1. Open a title deed card for a station (for example North Station).
  2. Read the Rent row.
- Expected: The card shows the full rent for 1, 2, 3, and 4 stations owned.
- Actual: The card shows only a range: "Rent $25 to $200".
- Images: ![Title deed for North Station with the rent range $25 to $200](bug-images/BUG-1-1.png)
- Notes: The station rent values are $25, $50, $100, and $200 for 1, 2, 3, and 4 stations. Check the rules in `plan/game-rules-reference.md` before the fix.

### BUG-2: Auction is not in a modal dialog (change request)

- Status: fixed (2026-11-09), checked in the browser
- Reported: 2026-11-09
- Area: web
- Type: change request
- Steps to reproduce:
  1. Start an auction (for example for North Station).
- Expected: The auction shows in a modal dialog.
- Actual: The auction shows inline on the game screen, not in a modal dialog.
- Images: ![Auction for North Station shown inline](bug-images/BUG-2-1.png)
- Notes: Keep the existing auction content (title deed, current bid, bidders, bid input, quick-bid buttons, Bid and Pass).

### BUG-3: Focus ring on the bid input shows around the inner input only

- Status: fixed (2026-11-09)
- Reported: 2026-11-09
- Area: web
- Steps to reproduce:
  1. Start an auction.
  2. Click or tab to the "Your bid" input.
- Expected: The focus ring shows around the whole field (the box with the "$" sign and the number).
- Actual: The focus ring shows only around the inner HTML input element. The "$" sign is outside the ring.
- Images: ![Bid field with the focus ring around the inner input only](bug-images/BUG-3-1.png)
- Notes: A fix can use `:focus-within` on the field wrapper.

### BUG-4: Dice roll animation is cropped and a scrollbar shows

- Status: fixed (2026-11-09)
- Reported: 2026-11-09
- Area: web
- Steps to reproduce:
  1. Roll the dice.
  2. Look at the dice area while the "Rolling..." label shows.
- Expected: Both dice show fully during the animation. No scrollbar shows.
- Actual: The dice area crops the dice (the top of the left die is cut off). A vertical scrollbar shows at the right side of the dice area.
- Images: ![Dice animation with cropped dice and a visible scrollbar](bug-images/BUG-4-1.png)
- Notes: The dice container probably has too little height or an overflow setting that lets the rotating dice go outside it.

### BUG-5: Chance and Community Chest cards are not in modal dialogs (change request)

- Status: fixed (2026-11-10)
- Reported: 2026-11-09
- Area: web
- Type: change request
- Steps to reproduce:
  1. Move a player onto a Chance or Community Chest space (or draw a card in another way).
- Expected: The drawn card shows in a modal dialog.
- Actual: The card shows inline on the game screen, with the label "Mike2 drew a card" above it and an OK button below it.
- Images: ![Chance card "Marina fine" shown inline with an OK button](bug-images/BUG-5-1.png)
- Notes: Applies to both Chance and Community Chest cards. See also BUG-2 (auction in a modal dialog); the same modal component can serve both.

### BUG-6: Dice pips are red and larger on the face with one pip

- Status: fixed (2026-11-09)
- Reported: 2026-11-09
- Area: web
- Steps to reproduce:
  1. Roll a double 1 (both dice show one pip).
  2. Look at the dice faces.
- Expected: Dice pips (eyes) are always black and always the same size, on all faces.
- Actual: The pip on the face with one pip is red and larger than the pips on the other faces.
- Images: ![Two dice with a large red pip each](bug-images/BUG-6-1.png)
- Notes: The red large pip is a common style for the face with one pip. The request is to remove this special case. Check the other faces for the same problem.

### BUG-7: Board has no card stacks for Chest and Chance (change request)

- Status: fixed (2026-11-10)
- Reported: 2026-11-09
- Area: web
- Type: change request
- Steps to reproduce:
  1. Open a game and look at the center of the 3D board.
- Expected: A card stack shows for Community Chest and for Chance, in the marked places on the board.
- Actual: The board shows only dashed outlines with the labels "CHEST" and "CHANCE". No card stacks are there.
- Images: ![Board center with empty dashed outlines for Chest and Chance](bug-images/BUG-7-1.png)
- Notes: The dashed outlines are the places for the stacks. See also BUG-5 (drawn cards in modal dialogs). Preserve the reduced-motion and no-WebGL paths.

### BUG-8: Remove the properties header block and the group labels above property stacks (change request)

- Status: fixed (2026-11-10)
- Reported: 2026-11-09
- Area: web
- Type: change request
- Steps to reproduce:
  1. Open a game in which a player owns properties.
  2. Look at the property stacks below the board.
- Expected: The block with the title "EVGENII2'S PROPERTIES" (with the count and total value, "7 · $820", and the collapse arrow) is not shown. The labels above the property stacks (for example "Brown", "Sky · 3", "Pink · 3" with the check mark) are not shown.
- Actual: The header block and the group labels show on top of the board and the property stacks.
- Images: ![Properties header block and group labels over the board](bug-images/BUG-8-1.png)
- Notes: The property stacks stay. Only the header block and the labels are removed. The header also has the collapse control, so check that the stacks do not need it.

### BUG-9: Red bar on a board tile covers the property price

- Status: fixed (2026-11-09), checked in the browser
- Reported: 2026-11-09
- Area: web
- Steps to reproduce:
  1. Open a game and look at the board tiles that have a red bar at the bottom (the tiles after Chance on the same side, for example Lantern Row).
- Expected: The price text shows fully and is easy to read. The red bar does not cover it.
- Actual: The red bar at the bottom of the tile overlaps the price. Only the top of the price text shows (for example "$100").
- Images: ![Board tiles with a red bar over the price text](bug-images/BUG-9-1.png)
- Notes: The tiles in the image are Saltmarsh Road, Cobble Street, Lantern Row, and Chance. The red bar may be another element, for example an owner marker or a mortgage mark. Find out what it is before the fix.

### BUG-10: Purchase dialog shows only price and base rent (change request)

- Status: fixed (2026-11-09), checked in the browser
- Reported: 2026-11-09
- Area: web
- Type: change request
- Steps to reproduce:
  1. Move a player onto an unowned property (for example Net Loft Road).
  2. Look at the title deed in the purchase dialog.
- Expected: The title deed shows the full property information: price, rent, rent with a color set, rent with 1 to 4 houses, rent with a hotel, house cost, hotel cost, and mortgage value.
- Actual: The title deed shows only the price ("$180") and the base rent ("$14").
- Images: ![Title deed for Net Loft Road with only price and rent](bug-images/BUG-10-1.png)
- Notes: See also BUG-1 (full rent options for stations). Check `plan/game-rules-reference.md` and the engine board data for the available values. The same deed component may serve other places, such as the auction.

### BUG-11: Property card stacks do not fit when a player owns many properties (change request, needs a plan)

- Status: fixed (2026-11-10)
- Reported: 2026-11-09
- Area: web
- Type: change request
- Steps to reproduce:
  1. Open a game in which a player owns many properties (28 in the image).
  2. Look at the property stacks below the board.
- Expected: The team plans how to fit many property cards in the available space, with all cards readable.
- Actual: The stacks are in one row. They overlap each other and go outside the screen at the right side (cut-off names and prices, for example "Pay..." and "...ities · 2"). The board is partly hidden behind them.
- Images: ![Property stacks overlapping and cut off at the screen edge](bug-images/BUG-11-1.webp)
- Notes: This entry asks for a plan, not a quick fix. See BUG-8 (remove the header block and group labels) and BUG-12 (expanded panel).

### BUG-12: Expanded properties panel needs a scroll; show all properties without scroll (change request)

- Status: fixed (2026-11-10)
- Reported: 2026-11-09
- Area: web
- Type: change request
- Steps to reproduce:
  1. Open a game in which a player owns many properties (28 in the image).
  2. Expand the "EVGENII2'S PROPERTIES" panel.
- Expected: All properties fit in the panel without a scroll. The panel can be bigger, and a different way to show the properties is acceptable.
- Actual: The panel shows only some of the color groups (Brown, Sky, Pink, Orange, and the start of Red). The rest is below, and a scrollbar shows at the right side. The panel also covers a large part of the board.
- Images: ![Expanded properties panel with a scrollbar](bug-images/BUG-12-1.webp)
- Notes: Possible directions: a bigger panel, a more compact card, or more columns. Each group has a different number of cards, so a grid layout may use the space better. See BUG-11.

### BUG-13: Board cells are not interactive (change request)

- Status: open
- Reported: 2026-11-09
- Area: web
- Type: change request
- Steps to reproduce:
  1. Open a game.
  2. Click or tap a cell (property, station, or utility) on the board.
- Expected: A dialog opens with the full property information. If the current player owns the property, they can do all property actions from this dialog (for example build, sell, mortgage, and unmortgage, as far as the rules allow).
- Actual: Board cells do nothing when selected.
- Images: none
- Notes: This depends on the full property information from BUG-10, and it uses the modal dialog from BUG-2 and BUG-5. Keep keyboard access and the no-WebGL path. The server stays the authority for actions, so the dialog sends the same actions as the existing property controls.

### BUG-14: Event log is empty after a page refresh or reconnect

- Status: open
- Reported: 2026-11-09
- Area: web (and possibly api)
- Steps to reproduce:
  1. Play a game until the event log has entries.
  2. Refresh the page, or lose the connection and reconnect.
  3. Open the event log.
- Expected: The event log keeps the earlier events of the game.
- Actual: The event log is empty and shows "No events yet."
- Images: ![Event log panel with the text "No events yet."](bug-images/BUG-14-1.png)
- Notes: The web game store may keep events only in memory and fill them from the live stream. The API stores events with the game, so check if the loader or the SSE resume can send the earlier events (or if a REST endpoint is needed).

### BUG-15: Hot-seat turn change shows a full-screen confirmation overlay (change request)

- Status: open
- Reported: 2026-11-09
- Area: web
- Type: change request
- Steps to reproduce:
  1. Start a game with hot-seat players on one device.
  2. End a turn so that the next hot-seat player is up.
- Expected: A toast (notification) shows that it is now the next player's turn. The player does not need to confirm. All devices in the game get this notification, not only the hot-seat device (added 2026-11-09).
- Actual: A full-screen overlay shows "Pass to Mike" with the button "I'm Mike, start my turn". The player must press the button to continue.
- Images: ![Full-screen overlay: Pass to Mike, with a confirm button](bug-images/BUG-15-1.png)
- Notes: The overlay hides the properties and actions of the next player until they confirm. If the overlay is removed, that privacy step is also removed. The request accepts this. Update the related documentation and tests (for example the hot-seat browser tests) when the change is made.

### BUG-16: Token moves to the card's target cell before the player confirms the card (change request)

- Status: fixed (2026-11-10)
- Reported: 2026-11-09
- Area: web
- Type: change request
- Steps to reproduce:
  1. Move a player onto a Chance or Community Chest cell.
  2. Draw a card that moves the player to another cell (for example "Nearest Utility").
  3. Watch the token while the card shows.
- Expected: The token animation stops at the Chance or Chest cell. The token starts to move to the final cell only after the player confirms the card in the modal dialog.
- Actual: The token shows at the final cell (Power Works in the image) while the card still shows and waits for confirmation.
- Images: ![Token already at Power Works while the Chance card "Nearest Utility" waits for OK](bug-images/BUG-16-1.webp)
- Notes: The server applies the whole result in one action, so the web store must delay the second movement. Apply this to other players' devices too (they see the card and wait). Preserve the reduced-motion path. See BUG-5 (cards in modal dialogs).

### BUG-17: Add a separate env variable to turn debug mode on and off (change request)

- Status: open
- Reported: 2026-11-09
- Area: web, api
- Type: change request
- Steps to reproduce:
  1. Start the app (for example with `pnpm dev` or the Docker image).
  2. Look for a way to turn debug mode on or off (the debug button and debug actions in the UI, and the debug routes in the API).
- Expected: A separate environment variable turns debug mode on and off, for both the UI and the API. Debug mode is off when the variable is not set.
- Actual: No separate variable exists for debug mode. Debug features (for example the "DEBUG" button and the debug action "Pump House given to Evgenii2" in the event log) show without such a switch.
- Images: none
- Notes: The name of the variable is not decided yet. The API must refuse debug actions when the variable is off, and the web build must hide the debug UI. Add the variable to `ops/local.env` and the README. Debug mode must be off in production. The existing test seed and short presence grace time must stay disabled in production too.
