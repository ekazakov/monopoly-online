import type { ReactNode } from "react";
import { GAME_REGION_LABELS, type GameRegion } from "./regions.ts";
import "./GameLayout.css";

export type GameLayoutProps = { [R in GameRegion]?: ReactNode } & {
  /** Covers the regions: the turn toast and the modal dialogs. A dialog makes the regions inert while it is shown. */
  overlay?: ReactNode;
};

// The game screen shell (spec 3.1 and 7). It places the six regions and owns no game state.
// Board layer: full-bleed, behind every other region, so a zoomed board shows under the chrome.
// Centre: the board column. Its content sits in the middle of the board, on top of it.
export function GameLayout({ rail, log, board, centre, hand, menu, overlay }: GameLayoutProps) {
  return (
    <main className="game-layout" aria-label="Game">
      <h1 className="game-layout__title">Game</h1>
      <div className="game-layout__regions">
        <section
          className="game-layout__board"
          data-region="board"
          aria-label={GAME_REGION_LABELS.board}
        >
          {board}
        </section>
        <div className="game-layout__top">
          <section
            className="game-layout__log"
            data-region="log"
            aria-label={GAME_REGION_LABELS.log}
          >
            {log}
          </section>
          <nav
            className="game-layout__menu"
            data-region="menu"
            aria-label={GAME_REGION_LABELS.menu}
          >
            {menu}
          </nav>
        </div>
        <aside
          className="game-layout__rail"
          data-region="rail"
          aria-label={GAME_REGION_LABELS.rail}
        >
          {rail}
        </aside>
        <section
          className="game-layout__centre"
          data-region="centre"
          aria-label={GAME_REGION_LABELS.centre}
        >
          {centre}
        </section>
        <section
          className="game-layout__hand"
          data-region="hand"
          aria-label={GAME_REGION_LABELS.hand}
        >
          {hand}
        </section>
      </div>
      {overlay}
    </main>
  );
}
