import type { Phase } from "@monopoly/shared";
import { Dice } from "./Dice.tsx";
import { Status } from "./Status.tsx";
import { Waiting } from "./ActionBar.tsx";
import { lastRoll } from "./useTurn.ts";
import type { Turn } from "./useTurn.ts";

const PHASE_TITLES: Partial<Record<Phase, string>> = {
  awaiting_debt: "Debt to settle",
  awaiting_bid: "Auction",
  awaiting_trade_response: "Trade offer",
  game_over: "Game over",
};

// The neutral view for a phase with no view in `centrePhases` yet, and for a game with no state.
export function WaitingView({ turn }: { turn: Turn }) {
  const { phase } = turn.view;
  const { dice, stale } = lastRoll(turn.view);
  const title = (phase && PHASE_TITLES[phase]) ?? null;

  return (
    <>
      {dice && <Dice dice={dice} stale={stale} />}
      {title && <Status title={title} />}
      {phase === "game_over" ? null : <Waiting name={turn.actorName} />}
    </>
  );
}
