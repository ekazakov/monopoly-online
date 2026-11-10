# Harborfront: Game screen 2, UI design specification and requirements

|                  |                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Companion doc    | [game-screen-2-gameplay.md](game-screen-2-gameplay.md): play modes, turn flow, rules and gameplay questions |
| Canvas           | Harborfront Design System: https://claude.ai/artifact/RtcjA9YX1Sq77osCjy58PK                                |
| Artboard         | `project/Wireframe2.dc.html`, titled "Game screen 2", interactive, `expand: fill`                           |
| Reference frame  | 1440 × 900 px                                                                                               |
| Related boards   | Game screen (`Screens.dc.html`), Game parts (`GameParts.dc.html`), Colour tokens (`Main.dc.html`)           |
| Avatar reference | Harborfront Avatars: https://claude.ai/artifact/RaQcXVRWRdHJo58bJx2SaC                                      |
| Status           | Wireframe, mid-fidelity. Last updated 2026-11-03                                                            |

In the requirement lists, **MUST** means required for the first playable release and **SHOULD** means strongly recommended. Each requirement has a tag:

- **[Done]**: the artboard already shows it.
- **[Gap]**: not designed yet.

---

## 1. Overview

### 1.1 Purpose

This is the main in-game screen of Harborfront, a property-trading board game. Players see the board, every player's cash, their own property hand and the running game log, and they take their turn from it.

### 1.2 Screen situations

The screen has to be designed for three situations: **local turn** (full controls), **local handoff** (a turn-change toast; it replaced the "Pass to <name>" interstitial, BUG-15) and **remote turn** (watch only). The rules for when each one applies are in the gameplay doc, section 1. This spec covers how each one looks (5.3).

### 1.3 Target devices

- **Desktop**, 1280–1440 px wide. The reference is 1440 × 900.
- **Tablet** in landscape (around 1024 × 768) and portrait (around 768 × 1024). Touch first.
- Phones are **out of scope** for this screen.

---

## 2. Design tokens used

### 2.1 Colour

| Role                   | Value                             | Used for                                     |
| ---------------------- | --------------------------------- | -------------------------------------------- |
| Ground                 | `#0e1822`                         | Page background                              |
| Panel, log             | `#1a2d3d`                         | Game log bar                                 |
| Panel, raised          | `#121f2a`                         | Menu button fill                             |
| Panel, avatar          | `#16222d`                         | Avatar disc                                  |
| Line                   | `#2c4254`                         | Button borders, panel borders                |
| Ink                    | `#e9f0ea`                         | Primary text, icons on dark                  |
| Ink soft               | `#a9bcc9`                         | Secondary text, stack labels, avatar strokes |
| Ring                   | `#6b8294`                         | Avatar ring (neutral)                        |
| Accent                 | `#e2574c`                         | Primary button                               |
| Accent hover           | `#ea6d63`                         | Primary button hover                         |
| Accent ink             | `#1a0b09`                         | Text on the accent (5.2:1)                   |
| Board frame            | `#e9e2cf`                         | Board outer frame                            |
| Board grid lines       | `#cdd6c6`                         | 2px gaps between squares                     |
| Board centre           | `#cfe3cc`                         | Inner field                                  |
| Square / card face     | `#eef4e9`                         | Squares and property cards                   |
| Card ink               | `#17211b`                         | Card text and borders                        |
| Die face / pips / edge | `#f7f5ee` / `#1b1b1b` / `#3d5a4a` | Dice                                         |
| Coin                   | `#f0b429` fill, `#8a5a3c` rim     | Cash icon                                    |

**Property groups**

| Group    | Colour    | Group     | Colour    |
| -------- | --------- | --------- | --------- |
| Brown    | `#8a5a3c` | Red       | `#d93a32` |
| Sky      | `#9bd4ea` | Yellow    | `#f2cd2e` |
| Pink     | `#d9569b` | Green     | `#2f9e5b` |
| Orange   | `#ee8a2c` | Navy      | `#2459a6` |
| Stations | `#17211b` | Utilities | `#a9bcc9` |

**Player colours.** The log uses them today, but the avatars don't show them yet (see R-P4).

| Player | Colour          | Avatar           |
| ------ | --------------- | ---------------- |
| Ines   | Blue `#2f6fd0`  | Cat              |
| Marlow | Red `#d9392f`   | Scottish terrier |
| Tove   | Green `#2fa05c` | Penguin          |
| Ravi   | Gold `#f0b429`  | Racing car       |
| Horse            | Profile, facing left. Pointed ear, a long head with eye and nostril dots, mane strokes along the neck, a deep body, two legs, and a tail on the right    |
| Duck             | Profile, facing left. Round head, a flat bill, an eye dot, a rounded body with an upturned tail on the right, and a wing outline                       |

### 2.2 Typography

| Style        | Font             | Weight | Size / line height | Notes                       |
| ------------ | ---------------- | ------ | ------------------ | --------------------------- |
| Button label | Barlow           | 600    | 14–15px            | Uppercase, 0.04em tracking  |
| Player name  | Barlow           | 600    | 15 / 18px          | Ink, no background          |
| Cash         | Barlow           | 600    | 16px               | `tabular-nums`              |
| Log line     | Barlow           | 500    | 14 / 20px          | Ink                         |
| Stack label  | Barlow           | 500    | 12px               | Ink soft                    |
| Card name    | Barlow Condensed | 700    | 13 / 16px          | Uppercase, 0.04em, ellipsis |
| Card price   | Barlow           | 600    | 14px               | `tabular-nums`              |

Fonts load from Google Fonts: Barlow 500/600 and Barlow Condensed 600/700.

### 2.3 Shape, size and focus

- **Radii:**
  - board 6px
  - buttons 7px
  - log bar 0 0 10px 10px (it hangs from the top edge)
  - die 12px on a 72px die
  - card 4px 4px 0 0
- **Touch target:** every button is at least 44 × 44px.
- **Focus:** a 2px `#e9f0ea` outline with a 2px offset (`:focus-visible`).
- **Hover:** `rgba(255,255,255,0.08)` on ghost buttons, and `#ea6d63` on the primary button.

---

## 3. Layout

### 3.1 Region map (1440 × 900)

```
┌──────────────────────────────────────────────────────────────────────┐
│                 [ Game log bar · max 640 ]                    [MENU] │  top
├────────────┬───────────────────────────────────────────┬─────────────┤
│ ◯ Ines     │  ┌─────────────────────────────────────┐  │             │
│   ● 1,340  │  │            board 11 × 11            │  │             │
│ ◯ Marlow   │  │        ┌───────────────────┐        │  │   168px     │
│   ● 1,500  │  │        │    [⚃] [⚂]        │        │  │   (empty)   │
│ ◯ Tove     │  │        │   [ NEXT TURN ]   │        │  │             │
│   ●   820  │  │        └───────────────────┘        │  │             │
│ ◯ Ravi     │  └─────────────────────────────────────┘  │             │
│   ● 2,010  │                                           │             │
├────────────┴───────────────────────────────────────────┴─────────────┤
│   Brown·2    Sky·3    Red    Stations·2    Utilities      ← hand     │  bottom
└──────────────────────────────────────────────────────────────────────┘
```

| Region       | Spec                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root         | `min-height: 900px`, a flex column, `overflow: hidden`, ground background                                                                                                 |
| Top bar      | The log bar is centred in a row with `padding: 0 280px` and `max-width: 640px`. The Menu button is absolutely positioned at `top: 12px; right: 12px`                      |
| Middle row   | `flex: 1`, a row of three columns: player rail, board, right spacer                                                                                                       |
| Player rail  | `flex: 0 0 auto`, `padding: 16px 0 16px 8px`, `gap: 16px`, top-aligned                                                                                                    |
| Board column | `flex: 1 1 0`, `container-type: size`, centres the board, `padding: 8px`                                                                                                  |
| Right spacer | `flex: 0 0 168px`, empty. It balances the rail so the board sits centred                                                                                                  |
| Bottom hand  | A centred row of stacks with `gap: 28px` and `margin-bottom: -48px`, so the cards peek up from the bottom edge. This is the collapsed state; the expanded state is in 4.6 |

### 3.2 Board sizing

- **Board size:** `width: min(100cqw, 100cqh)` with `aspect-ratio: 1/1`. It is the largest square that fits the column.
- **Frame:** 8px padding in `#e9e2cf`.
- **Grid:** `repeat(11, minmax(0,1fr))` columns and rows, with 2px gaps that show `#cdd6c6`.
- **Centre field:** spans `grid-column: 2/11; grid-row: 2/11`, which is 9 × 9 cells.

---

## 4. Components

### 4.1 Game log

- **Container:** a bar in `#1a2d3d`.
  - padding 8px 8px 8px 20px
  - radius 0 0 10 10
  - `role="log"`, `aria-label="Game log"`
- **List:**
  - `flex-direction: column-reverse`, so the newest entry sits at the bottom, right above the board
  - `overflow-y: auto`
- **Heights:** **28px** collapsed, which shows the latest line only. **240px** expanded, which shows about 8 lines and scrolls.
- **Entry:**
  - a 10px dot in the player's colour, a 10px gap, then the text at 14/20
  - each line is at least 28px tall
- **Toggle:**
  - a 44px icon button with a 20px chevron
  - the chevron rotates 180° when the log is open
  - `aria-expanded` is `true` or `false`
  - `aria-label` reads "Expand game log" or "Collapse game log"
- **Sample entries, newest first:**
  - "Marlow bought Beacon Hill for $220."
  - "Marlow rolled 4 and 3 and landed on Beacon Hill."
  - "Tove paid $120 rent to Ines."
  - and 8 earlier entries
- **State:** `open: false` by default, stored in component state.

### 4.2 Menu button

- **Size:** at least 44px tall, `padding: 0 18px`.
- **Style:** `#121f2a` fill, `#2c4254` border, 14/600 uppercase label "Menu".
- **Opens:** settings, rules, sound, leave game. The session owner also gets save and exit, and finish game (gameplay doc 3.1, R-G9). Design: the "Owner controls" board.

**Squares button (BUG-13, 2026-11-10):** a "Squares" button sits next to the Menu, with the same style. It opens a modal dialog "Properties": every property in colour groups, with its price and owner. Picking one opens the square detail (R-B5). It is the way to the detail for the keyboard, a screen reader and a device with no WebGL.

### 4.3 Player rail

There is one row per player. Each row is a flex row with a 10px gap, centred on the cross axis.

**Avatar**

- **Disc:** 56 × 56px, round, `#16222d` fill, 2px `#6b8294` ring.
- **Icon:** a 38 × 38px SVG on a **48 × 48 grid**, outline style:
  - `fill: none`
  - stroke `#a9bcc9` at width **2.4**, round caps and joins
  - eyes and nose drawn as small filled dots (r 1.1–1.4)
  - fine details such as whiskers and the beard at stroke 1.6–1.8
- **Accessible name:** `role="img"`, with an `aria-label` of the name and avatar, plus "active" for the player on turn.

**Avatar set.** These are drawn from the 3D token set on the Harborfront Avatars page:

| Avatar           | Pose and key features                                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cat              | Front-facing, sitting. Pointed ears, two eyes, a nose, two whiskers per side, a pear-shaped body with a leg line, and a tail curling up on the right |
| Scottish terrier | Profile, facing left. Long muzzle, upright ear, eye and nose dots, beard strokes, a deep body, two short legs, and a carrot tail pointing up         |
| Penguin          | Front-facing. Egg-shaped body, an inner belly plate, flippers, a triangle beak, two eyes, two oval feet                                              |
| Racing car       | Profile. A low body with a cabin, a window, two wheel arches, and two wheels with hubs. Shifted 5 units up to sit optically centred                  |

Each avatar has one fixed colour: dog red `#d9392f`, cat blue `#2f6fd0`, penguin green `#2fa05c`, racing car gold `#f0b429`, horse purple `#8e4fc9` (`--hf-pawn-purple`), duck teal `#1fa7a1` (`--hf-pawn-teal`). The game uses these six tokens. The reference page has two more avatars that are not used: **Octopus and Dwarf jester**.

**Label block.** A flex column with a 2px gap, to the right of the avatar:

1. **Name:** 15/600, ink, **no background or pill**.
2. **Cash:** a 14px coin (`#f0b429` with a 2px `#8a5a3c` rim), a 6px gap, then the amount at 16/600 tabular.

**Current data**

| Order | Name            | Avatar     | Cash  |
| ----- | --------------- | ---------- | ----- |
| 1     | Ines            | Cat        | 1,340 |
| 2     | Marlow (active) | Terrier    | 1,500 |
| 3     | Tove            | Penguin    | 820   |
| 4     | Ravi            | Racing car | 2,010 |

### 4.4 Board

- **Squares:** 40 in total, 9 per side plus 4 corners. Each has an `#eef4e9` face.
- **Colour bar:** 28% of the square's depth, on the **inner edge** facing the centre.
  - bottom row: bar at the top
  - top row: bar at the bottom
  - left column: bar on the right
  - right column: bar on the left
- **Order from Start**, the bottom-right corner, running clockwise towards the left:
  - **Bottom:** Brown, ·, Brown, ·, ·, Sky, ·, Sky, Sky
  - **Left:** Pink, ·, Pink, Pink, ·, Orange, ·, Orange, Orange
  - **Top:** Red, ·, Red, Red, ·, Yellow, Yellow, ·, Yellow
  - **Right:** Green, Green, ·, Green, ·, ·, Navy, ·, Navy

  A "·" is a non-property square (Chance, Chest, Tax, Station, Utility). These are blank in the wireframe.

- **Corners:** blank in the wireframe. They will be Start, Jail, Free Parking and Go to Jail.
- **Card stacks:** a stack of Community Chest cards and a stack of Chance cards lie in the board centre, at the two marked places, with the card back up. The stack height is fixed, because the device does not know the deck size (BUG-7).

### 4.5 Board centre: turn area

This is a flex column, centred both ways, with a **20px gap**.

1. **Dice:**
   - two 72 × 72px dice, 16px apart
   - face `#f7f5ee`, a 2px `#3d5a4a` edge, radius 12
   - pips r 6 in `#1b1b1b` on every face. The face with one pip has no red or larger pip (BUG-6)
   - the dice stay fully visible during the roll animation, with no scrollbar (BUG-4)
   - the pair is a group with `role="img"` and `aria-label="Dice: 4 and 3"`
   - each die SVG is `aria-hidden`
2. **Next turn button:**
   - primary (`.hf-primary`): `#e2574c` fill with `#1a0b09` text, hover `#ea6d63`
   - at least 44px tall, `padding: 0 28px`, label 15/600 uppercase "Next turn"
   - it sits directly **under the dice**

This area is the agreed home for every turn action. 5.2 covers how it presents them, and the phases themselves are in the gameplay doc, section 2.

### 4.6 Property hand

> **Redesigned (BUG-8, BUG-11, BUG-12), approved 2026-11-10 with the prototype in `artifacts/game-screen`.** The collapsed hand has no header or group labels. Update 2026-11-10: the expanded web hand uses the grouped Manage properties panel from the supplied prototype reference.

- **Grid:** one column per property group, in board order (brown, sky, pink, orange, red, yellow, green, navy, stations, utilities). There are up to 10 columns. A "Get out of jail free" card is a further column in the prototype; the web hand does not show it yet (R-H5). There are no group labels.
- **Column width:** `clamp(70px, (width − 32px − gaps) / columns, 112px)`. At 1024px and wider all 10 columns fit in the collapsed state with no scroll. Below 1024px the grid scrolls sideways.
- **Card (collapsed):** a compact card with a 6px colour band, a name and a price on one row (11px condensed name with ellipsis, 10px price) and a row for house pips or the mortgaged tag. The cards of a column overlap downward with a 22px step, so the band, name and price of every card show. The row peeks 38px above the bottom edge of the window, so the front card shows 22px.
- **Set complete:** a small tick on the colour band of every card in the complete set. The band is the part of a card that always shows.
- **Card states:** mortgaged (hatched or dimmed, with the tag "Mortgaged"), houses 1–4 and hotel pips.
- **Closed hand:** no pill, avatar or count is shown above the cards. An invisible button over the cards keeps click, tap and keyboard access. When open, it becomes the panel close control. It is the keyboard entry (a button with `aria-expanded`) and the pin toggle. Its accessible name is "<name>'s properties, <count>, <value>". There is no header block, no hand label and no debt pill.
- **Peek:** the collapsed cards are not buttons and are not in the tab order. A click on them pins the hand open.

#### Expanded hand

The hand has two states. The whole hand opens at once and every property is shown and manageable from it.

- **Opening:**
  - Desktop: moving the pointer onto the hand area expands it after about 150ms. It collapses about 300ms after the pointer leaves. A click on the hand area or on the tab **pins** it open, and a second click on the tab or Esc closes it.
  - Touch: a tap on the hand area toggles it. There is no hover-only behaviour.
  - Keyboard: focus entering the hand expands it, and Esc collapses it and returns the focus to the tab.
- **Layout:** a Manage properties panel rises above the collapsed hand. It is at most 920px wide and 720px tall, limited by the window height. The board does not resize. The header shows the owner, cash and property count. The footer shows the property value and Done. The property list scrolls between the header and footer.
- **Groups:** show colour groups in board order, followed by stations and utilities. Each group has a label and a set-complete mark when applicable.
- **Property rows:** each row shows the colour, name, buildings, rent, and Build, Sell building, Mortgage or Unmortgage actions with their costs. Stations and utilities have no building actions. Property names and summaries are static text. They do not select a row or open further details. Narrow layouts put actions below the property name.
- **Actions:** all property actions are available directly in the panel. A refused action is disabled. Hover or keyboard focus shows its reason. The server remains the authority for each action. An action pins the panel open while it is sent. Outside management windows, the rows show the view-only reason.
- **Closing:** Done and Esc close the panel and return focus to the tab. The close control also closes a panel opened by hover.
- **Debt:** the debt has no controls in the hand. The board centre shows the amount due, the Raise cash list and Pay (5.2). While this device settles a debt the panel still opens by itself, so the player can see the properties.
- **Motion:** no animation under reduced motion.

### 4.7 Debug panel

A tool to test the game logic. It is not part of the game design. It shows only when debug mode is on (gameplay doc, Q23 and Q24; BUG-17).

- **Button:** "Debug", to the left of the Menu button, in the `menu` slot. The same size and type as the Menu button, with a **dashed** border and the soft ink, so that it does not look like a game control.
- **Panel:** a disclosure in place under the button, not a modal, like the Menu panel (4.2). 340px wide, dashed border. Esc or a click outside closes it. Focus goes to the "Debug" heading when it opens.
- **Who can edit:** only the player on turn, in `awaiting_roll`, `awaiting_jail_choice`, `awaiting_end_turn` and `awaiting_debt`. In the other phases the controls are disabled and a line says why: "Wait for your turn.", "Not available now. Finish the offer, auction or trade first." or "The game is over."
- **Sections:**
  - **Cash:** one row for each active player: the name, a number field with the current cash, and **Set**.
  - **Deeds:** a multi-select list of deeds in three groups: Streets, Stations and Utilities, each in board order, with the current owner of each deed. Then an owner list (the players and Bank), buildings (None, 1 to 4 houses, Hotel), Mortgaged, and **Apply**. Apply sets the same owner, buildings and mortgage on every chosen deed, in one action. Only streets keep buildings: a station or utility gets none. The fields fill from the first chosen deed. A mortgaged deed or a bank deed has no buildings. A line under the list says how many deeds are chosen.
  - **Player tokens:** a player list, a square list (all 40 squares), and **Move**. The move is a teleport: no rent, card, buy offer or Start salary. A jailed player who is moved leaves Jail.
  - **Next roll:** two die lists (1 to 6) and **Set**. The next roll of the game uses these values once: a turn roll, a jail roll or the utility rent roll, by any player. Then the seeded dice continue. The values stay on the server and the panel does not show them later.
  - **Top card:** a deck list (Chance, Community Chest), a card list with every card of the deck, and **Put on top**. The next draw from that deck is this card. A Get Out of Jail Free card that a player holds is not in the deck, so the server refuses it.
- **Result:** each edit is one `DebugEdit` action. A batch of deeds is one action. The rail, the hand and the board show the new state. The token goes to the new square at once, with no walk. The log shows one line for each change, for example "Ann (debug): Bo's cash set to $500.", "Ann (debug): next roll set to 3 and 4." or "Ann (debug): "Nearest Utility" put on top of Chance." The top card line tells every device the next card; that is acceptable in debug mode. A status line in the panel confirms the edit or shows the error.
- **Words:** "player token", never "pawn".

---

## 5. Interaction and behaviour

### 5.1 Game log

- Clicking the chevron toggles collapsed and expanded.
- New entries appear at the bottom, and while collapsed the latest line replaces the previous one.
- SHOULD: briefly highlight a new entry, but not under reduced motion.

### 5.2 Turn area presentation (board centre)

The board centre changes with each phase of the turn. The phase list and what each phase offers are in the gameplay doc, section 2.

- **One primary action at a time:** a `.hf-primary` button, placed under the phase content.
- **Secondary actions:** outline buttons (`#2c4254` border) beside or below the primary.
- **Phase content, shown above the actions:**

  | Content                                           | Used in                                        |
  | ------------------------------------------------- | ---------------------------------------------- |
  | Dice, with the last roll dimmed before a new roll | Start of turn, rolling, doubles, turn resolved |
  | Title deed (from Game parts)                      | Buying a property, paying rent                 |
  | Card reveal                                       | Chance and Chest                               |
  | Amount due                                        | Tax, rent, debt                                |
  | Short status line                                 | Jail options, "Roll again"                     |

- **Phases with no action** (rolling, moving): the centre shows only the animation, and nothing is clickable.
- **Debt:** the centre shows the amount due and who it is owed to, with Pay disabled until cash covers it. Next turn is not shown. Raising cash happens in the expanded hand (4.6).
- **Bankrupt:** the centre shows a short result ("<name> is out of the game") for one beat, then the turn moves on.
- **Modal dialogs.** The purchase decision (BUG-10), the auction (BUG-2), the drawn Chance and Chest card (BUG-5) and the square detail (BUG-13) show in a modal dialog. The other flows in 8.7 use the board centre, or the expanded hand for managing properties. A phase dialog, such as the purchase or the auction, does not close on Esc and has no close button. The dialog title is the status of the phase ("<name> is for sale", "Auction: <name>"). The dialog sits over the board, rail, centre and hand, which are inert, but under the top bar: the log and the Menu stay above it and work, so Save, Finish and Leave game stay reachable. It is a non-modal `<dialog>` in a scrim, not `showModal()`, because a native modal dialog makes the whole page inert. The purchase and the auction show only on a device that has a seat to act. The other devices follow the auction in the board centre and see only the status of a purchase. The full title deed (price, every rent, house and hotel cost, mortgage value) is too tall for the board centre, so the centre never shows a deed. The dialog is a child of the game layout, outside the game regions, and waits for the end of the roll and move animation and for a hot-seat handoff. See [bug-fix-plan.md](bug-fix-plan.md), phase 3.
- **Title deed.** The deed shows the full property data: for a street, rent, rent with a colour set, 1 to 4 houses, hotel, house cost, hotel cost and mortgage value; for a station, the rent for 1 to 4 stations; for a utility, 4 × dice and 10 × dice (BUG-1, BUG-10).
- **Card hold.** When a card moves the token, the token stops on the Chance or Chest square. It moves on only after OK on this device (BUG-16).
- **Current wireframe:** only the **Turn resolved** phase, with dice 4 + 3, then Next turn.

### 5.3 Device and seat presentation

- **Seat grouping:** the rail groups players by device.
  - local players carry a small "This device" marker
  - remote players show a connection dot: online, reconnecting or away
- **Turn-change toast** (replaces the handoff interstitial, BUG-15):
  - a toast "It is <name>'s turn" shows on every device in the game, with no confirm button
  - it sits in the centre of the board, over the dice and the buttons (approved 2026-11-10, after a prototype with two placements in `artifacts/game-screen`)
  - it looks like the handoff screen without the button (changed 2026-11-10): a scrim at 70% opacity, the 3D figure of the next player on its plinth (150px; the flat icon when WebGL is not available), the name and the sentence "It's <name>'s turn.". It fades in over 500 ms, shows for 1 second and fades out over 500 ms (2 seconds in all). It has no button. While it shows, the action controls are disabled (the game regions are inert and the scrim takes the pointer); the top bar with the log and the Menu stays usable. It is a polite live region, so a screen reader hears it
  - a toast shows for a turn change only. An auction bidder or a trade responder on the same device sees the phase in the board centre, not a toast
  - there is no privacy step: on a shared device the next player's properties and actions show at once. This is on purpose
- **Remote turn:**
  - the board centre shows the same phase content but **read-only**
  - the action buttons are replaced by a status line, "<name> is deciding…"
  - the log and dice keep updating live
- **Hand label:** always names whose hand is shown, for example "Marlow's properties". Planned change (BUG-8): the hand header is removed; the hand redesign decides where the name goes.
- **Debt badges:** a player in debt, or with a pending debt that falls due at the start of their next turn, carries a badge with the amount on the rail.
- **Bankrupt players:** the row stays on the rail dimmed and struck through. That player watches the game as a spectator: the board, log and rail update, and no action is available.

---

## 6. Accessibility

| Requirement                                                                                        | Status          |
| -------------------------------------------------------------------------------------------------- | --------------- |
| Real `<button>` elements for every control, with a visible focus ring                              | Done            |
| Touch and click targets at least 44 × 44px                                                         | Done            |
| `role="log"` on the game log (polite live region by default)                                       | Done            |
| Icon-only toggle has an `aria-label` and `aria-expanded`                                           | Done            |
| Avatars have `role="img"` and an `aria-label` with the name, avatar and active state               | Done            |
| Dice group has an `aria-label` with the rolled values                                              | Done            |
| Text contrast at least 4.5:1 (ink and ink soft on ground both pass; accent ink on accent is 5.2:1) | Done            |
| Players differ by **shape** (unique avatar) as well as colour                                      | Done            |
| The active player isn't shown by colour alone: use size, a tag or a marker                         | Gap             |
| Respect `prefers-reduced-motion` for dice, token movement and the log highlight                    | Done            |
| Expanded hand opens on focus, closes on Esc, and its card actions are reachable by keyboard        | Gap             |
| Keyboard order: log toggle → Menu → turn actions → hand                                            | Gap (to verify) |

---

## 7. Responsive behaviour (desktop and tablet)

| Width                            | Layout                                                                                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **≥ 1280**                       | As drawn: left rail, centred board, 168px right spacer, hand at the bottom                                                                                                                                       |
| **1024–1279** (tablet landscape) | The right spacer shrinks to 0–80px. The board stays as large as fits. The hand cards shrink to 132px wide (the expanded hand wraps into more rows)                                                               |
| **768–1023** (tablet portrait)   | The rail becomes a **horizontal strip** above the board, with the avatar, name and cash in a row. The board takes the full width. The collapsed hand is a compact strip, and a tap opens the expanded hand (4.6) |

Rules:

- The log bar's horizontal padding MUST be fluid, for example `padding-inline: clamp(16px, 20vw, 280px)`. The fixed 280px squeezes the log to nothing below about 1200px.
- The board stays square and never scrolls on its own.
- Every target stays at least 44px. On tablets, hover states must not be the only way to reveal information.

---

## 8. Requirements

### 8.1 Layout and chrome

- **R-L1 MUST** [Done] Dark ground layout with the log at top centre, Menu top right, players on the left, board in the centre and hand at the bottom.
- **R-L2 MUST** [Done] The board is the largest square that fits the middle column.
- **R-L3 MUST** [Gap] The log padding is fluid, and the layout reflows as in section 7.
- **R-L4 SHOULD** [Gap] Show a round counter, for example "Round 7", in the log bar or next to Menu.

### 8.2 Players

- **R-P1 MUST** [Done] Each player has a unique outline avatar, drawn as in 4.3.
- **R-P2 MUST** [Done] Name to the right of the avatar, with the cash below it. The label has no background.
- **R-P3 MUST** [Gap] Mark the player on turn visibly, for example with a larger ring, a "Turn" tag or an accent ring. Today it appears only in the `aria-label`.
- **R-P4 SHOULD** [Gap] Colour each avatar's ring with the player's colour, so the rail matches the log dots.
- **R-P5 MUST** [Gap] Use one currency. The rail shows a coin with "1,340", while the cards, the log and Game parts use "$". Pick one everywhere.
- **R-P6 MUST** [Gap] Status badges on the avatar: in jail, holds a Get Out of Jail card, in debt or pending debt (with the amount), bankrupt and watching (dimmed and struck through), disconnected. When each state applies is in the gameplay doc, section 4.
- **R-P7 SHOULD** [Done: icons] Outline icons for the horse and the duck, so 6 players have 6 avatars. The avatar picker in the lobby is still open (Token picker boards, milestone 2 A3). The octopus and the dwarf jester are not used.
- **R-P8 MUST** [Gap] Group players by device, with a "This device" marker (5.3).

### 8.3 Board

- **R-B1 MUST** [Done] A 40-square loop with group colour bars on the inner edge.
- **R-B2 MUST** [Gap] Show player tokens on their squares. More than one token on a square is offset or fanned.
- **R-B3 MUST** [Gap] Show square names and prices, special-square icons (Chance, Chest, Tax, Station, Utility) and the four corners. Reuse the Game parts components.
- **R-B4 MUST** [Gap] Show ownership as an owner-colour marker on each owned square, plus houses (1–4) and hotels. The marker must not cover the square's price (BUG-9).
- **R-B5 SHOULD** [Done] Let players click or tap a property square (street, station or utility) to open the square detail: a modal dialog with the full title deed, the owner, the buildings and the mortgage state and, for the owner on this device, the property actions (Build, Sell building, Mortgage, Unmortgage) with the reason when one is refused. The server stays the authority. Other squares do nothing. The square is highlighted while the dialog is open. Keyboard and no-WebGL users get the same dialog from the Squares button (4.2). Still a gap: highlight the last move path briefly.

### 8.4 Turn actions (board centre)

- **R-T1 MUST** [Done] The dice are in the board centre.
- **R-T2 MUST** [Done] The Next turn button sits under the dice.
- **R-T3 MUST** [Gap] Design the board centre for every phase in the gameplay doc, section 2 (including In debt and Bankrupt), following 5.2.
- **R-T4 MUST** [Gap] Show the read-only remote-turn state (5.3).
- **R-T5 MUST** [Done] Show a turn-change toast on every device (5.3): centre of the board, a 2-second run with 500 ms fades, turn changes only. It replaces the "Pass to <name>" handoff interstitial (BUG-15).
- **R-T6 SHOULD** [Done] Animate the dice roll and the token movement, with reduced-motion fallbacks. Done. Reduced motion (device setting, or the switch in the Menu) turns off all animation: the result of a roll and the new token squares show at once.

### 8.5 Hand

- **R-H1 MUST** [Done] Group cards into colour stacks, one column per group, with no group labels (4.6).
- **R-H2 MUST** [Done] Keep prices visible. The compact collapsed card shows its name and price on one row, and the overlap leaves that row visible.
- **R-H3 MUST** [Done] The closed hand has no header, avatar or count pill. The expanded Manage panel shows the owner and cash in its header and the property count and total value in its footer.
- **R-H4 MUST** [Done] Card states: mortgaged (hatched or dimmed), set complete (a tick on the colour band), houses and hotel pips. Managing (build, sell building, mortgage, unmortgage) is done from the expanded cards.
- **R-H5 SHOULD** [Gap] Show Get Out of Jail Free cards in the hand.
- **R-H6 MUST** [Done] Expanded hand: opens on hover (desktop), click-pin, tap (touch) or focus; shows a scrollable Manage properties list with direct actions (4.6). The collapsed hand fits up to 10 columns with no scroll at 1024px and wider.

### 8.6 Game log

- **R-G1 MUST** [Done] Collapsible log, newest line at the bottom, colour-coded by player.
- **R-G2 SHOULD** [Gap] Show the player name in their colour, or bold, inside each line.
- **R-G3 SHOULD** [Gap] Filter the log, for example by money events only or by player.

### 8.7 Dialogs and other screens

The rules behind each flow are in the gameplay doc, section 5. The purchase decision, the auction (R-G4) and the card reveal (R-G6) show in a modal dialog (5.2). The other flows are shown in the board centre, except Manage properties, which lives in the expanded hand (4.6) and in the square detail dialog (R-B5). The "Dialog or screen" column is the flow's name only.

| ID   | Level  | Status | Dialog or screen                                                                                                     |
| ---- | ------ | ------ | -------------------------------------------------------------------------------------------------------------------- |
| R-G4 | MUST   | Gap    | Auction: current bid, bidders, bid buttons (no timer, gameplay 2.1)                                                  |
| R-G5 | MUST   | Gap    | Trade builder: two columns of properties, cash and cards, then propose, accept, reject or cancel (no counter-offers) |
| R-G6 | MUST   | Gap    | Chance and Chest card reveal                                                                                         |
| R-G7 | MUST   | Gap    | Manage properties: build, sell, mortgage, unmortgage                                                                 |
| R-G8 | MUST   | Gap    | Bankruptcy, and the end-of-game result screen ("Game result" board, task H10a)                                       |
| R-G9 | SHOULD | Gap    | Menu contents: rules, settings (sound, motion, theme), leave game; for the session owner, save and exit, finish game |

### 8.8 Debug panel

- **R-D1 MUST** [Done] A "Debug" button next to Menu opens a panel in place (4.7). The button shows only when the API has debug mode on (BUG-17).
- **R-D2 MUST** [Done] The player on turn can set the cash of any player, give any deed with buildings and a mortgage to any player or to the bank, and move any player token to any square with no landing.
- **R-D3 MUST** [Done] Off turn, and during a buy offer, an auction or a trade, the controls are disabled and say why.
- **R-D4 MUST** [Done] Each edit is a game action that the log shows as a "(debug)" line and that stays after a reload.
- **R-D5 SHOULD** [Done] Hide the panel unless debug mode is on. Debug mode is an API env variable, off by default and refused in production. The web reads it from `GET /api/auth/methods` (gameplay Q24, BUG-17).

---

## 9. Open design questions

Gameplay questions (player limits, disconnects, trades, house rules, timer, bots) are in the gameplay doc, section 6.

1. Are the 3D camera views from the Game screen board (Angle, Top, Low) still planned for this screen?
2. Which sound, music and motion settings does the Menu need?
3. Should a light theme (Light theme board) apply to this screen?
4. ~~Turn timer placement.~~ Closed: there is no turn timer in v1 (gameplay Q5).
5. **Colour collisions (parked).** Every player colour is close to a property-group colour: Marlow's red and the Red group, Ines's blue and Navy, Tove's green and Green, Ravi's gold and Yellow (and the cash coin). The owner marker (R-B4) can't rely on colour. Leading idea: show the owner's avatar glyph on owned squares and pick a separate palette for rings and log dots.
6. **Next turn placement.** The button sits where "Roll" would, right under the dice. Should it be disabled while a decision or debt is pending, show "Roll again" after doubles, and ask for confirmation when the player still has unspent options?
7. **Board density.** Squares are about 60px on desktop and 50px on tablet landscape, yet each holds a name, price, up to 6 tokens, an owner marker and up to 4 houses. The 9 × 9 centre (about 430px) must also hold a title deed, an auction or a debt state. Does it fit?
8. **Inspecting other players.** There is no way yet to see an opponent's properties or cash, which trades and rent decisions need. Where does it live (tap an avatar on the rail)?
9. **Tablet portrait strip.** The horizontal player strip doesn't fit 6 players at 768px.
10. **Expanded hand overlap.** The expanded hand covers the lower board. Does it ever hide something the player needs, such as the centre during an auction?
11. ~~**Modals.**~~ Closed: the purchase decision, the auction, the card reveal and the square detail use a modal dialog (5.2). The purchase and the auction show only on the device that has a seat to act (decided 2026-11-09, before the Menu was moved above the dialog; it could show on every device now). The top bar, with the Menu, stays above a phase dialog.
12. **Wireframe data.** Marlow shows $1,500 cash yet holds about $1,210 of properties at purchase price. The sample data should be made consistent.

---

## 10. Change log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-24 | Critique of Game screen 2. Decisions recorded: mixed device and hot-seat play, turn actions in the board centre, desktop and tablet targets                                                                                                                                                                                                              |
| 2026-10-25 | Dice moved from top right to the board centre. Next turn button added under the dice. Player names added to the right of the avatars, above the cash, with no label background. Generic person icons replaced with unique outline avatars (cat, terrier, penguin, racing car) drawn from the Harborfront Avatars page                                    |
| 2026-10-25 | Gameplay logic and gameplay questions moved to [game-screen-2-gameplay.md](game-screen-2-gameplay.md). This spec now covers UI and design only                                                                                                                                                                                                           |
| 2026-10-25 | Rules review: expanded-hand model replaces per-card pop-ups (4.6, R-H6), no modal dialogs for now, debt and spectator states added to the rail and board centre (5.2, 5.3, R-P6), tablet hand behaviour updated (7). Open design questions 5 to 12 added to section 9. Rules and property data are in [game-rules-reference.md](game-rules-reference.md) |
| 2026-10-31 | Review against the decided rules: no auction timer (R-G4), no counter-offers (R-G5), 6 players and tokens (questions 7 and 9), the turn timer question closed (question 4), the result screen gets its own board (R-G8) |
| 2026-11-03 | Debug panel added (4.7, R-D1 to R-D5): the player on turn edits cash, deeds and token squares to test the game logic. It is not part of the game design |
| 2026-11-03 | Debug panel: the Deeds list is a multi-select in three groups (Streets, Stations, Utilities), and one edit can hold a batch of changes (4.7) |
| 2026-11-03 | Horse and duck outline icons and 3D figures added, with the purple and teal pawn colours (4.3, R-P7)                                                                                    |
| 2026-11-10 | Property hand redesign approved (4.6, R-H1 to R-H6): one grid with a column per group, no header and no group labels, a tab above the hand, a side column in the expanded panel, no debt controls in the hand |
| 2026-11-09 | Bug review ([bug-fix-plan.md](bug-fix-plan.md)): modal dialogs for the auction, card reveal and square detail (5.2, 8.7, R-B5, question 11 closed); full title deed; card hold; turn-change toast replaces the handoff interstitial (1.2, 5.3, R-T5); same pips on all faces (4.5); card stacks (4.4); owner marker clear of the price (R-B4); debug mode behind an API flag (4.7, R-D1, R-D5); planned hand redesign (4.6) |
