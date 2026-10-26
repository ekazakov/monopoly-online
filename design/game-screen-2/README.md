# Harborfront: Game screen 2 prototype

An interactive UI prototype of [plan/game-screen-2-spec.md](../plan/game-screen-2-spec.md). It has no game logic. Rolls, landings, rents and outcomes are canned in `js/data.js`, and the screen steps through them as a script.

## Run

```bash
python3 game-screen-2/serve.py
```

Then open http://localhost:8791. ES modules need a server, so opening `index.html` from disk won't work. The server turns caching off.

## What to try

- **Scripted demo.** Use the buttons in the board centre. Marlow's Next turn leads to "Pass to Tove" (handoff), then Tove's turn: roll, buy, doubles, roll again, pay rent. After that come Ravi's and Ines's remote turns, which play themselves read-only, and then Marlow again.
- **Prototype panel** (bottom left, dashed). Jump to any situation, player, any of the 11 phases, any dialog (auction, trade, incoming trade, manage, bankruptcy, game over, square detail), or a player state (jail, jail card, connection, bankrupt, mortgaged). You can also switch the camera view.
- **Board.** Drag to orbit (limited, so the board stays readable) and scroll to zoom. Click any square to see its title deed.
- **Hand.** Hover over or focus a stack to fan it. Click a card for its deed.
- **Log.** The chevron expands it. When it's open, filter chips appear.
- **Menu.** Rules, sound, music, reduce motion, camera, leave game.

## Files

| File | What it holds |
|---|---|
| `index.html`, `styles.css` | Layout, tokens and responsive rules (spec sections 2, 3 and 7) |
| `js/app.js` | UI rendering, the scripted turn flow, dialogs and the prototype panel |
| `js/board3d.js` | three.js board, ported from `harborfront-3d.html`, plus avatar tokens, ownership markers, houses, picking and the handoff avatar stage |
| `js/sculpt.js` | SDF avatar sculpting, ported from the Harborfront Avatars page (cat, terrier, penguin, racing car) |
| `js/icons.js` | Outline avatar icons from the Game screen 2 artboard, dice, and Game parts icons |
| `js/data.js` | Squares, players, ownership, log, cards and the demo script |
