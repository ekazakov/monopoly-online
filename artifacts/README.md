# Artifacts

Standalone copies of two Claude artifacts. They run with Node only. There is no Python and no build step.

```bash
node serve.mjs game-screen 8791      # or: pnpm game-screen
node serve.mjs design-system 8792    # or: pnpm design-system
```

Run `pnpm <name>` from this folder. This folder is not in the pnpm workspace.

| Folder | What it holds |
|---|---|
| `game-screen/` | Game screen prototype: a three.js board with scripted turns. See the Prototype panel. |
| `design-system/` | Harborfront Design System. `index.html` is a small viewer that lists every board from `project/canvas.json`. |

Notes:

- `serve.mjs` is a static file server with caching off. ES modules need a server, so opening `index.html` from disk does not work.
- A network connection is needed. Fonts load from Google Fonts. three.js loads from jsDelivr.
- `design-system/project/support.js` is the Design Component runtime that every `.dc.html` board loads. The Claude canvas editor is not included. Its comments, database and export features need the Claude platform.
