import type { Phase } from "@monopoly/shared";
import { useT } from "../../../i18n/index.ts";
import type { MessageKey } from "../../../i18n/index.ts";
import { Dice } from "./Dice.tsx";
import { Status } from "./Status.tsx";
import { Waiting } from "./ActionBar.tsx";
import { lastRoll } from "./useTurn.ts";
import type { Turn } from "./useTurn.ts";

const PHASE_TITLES: Partial<Record<Phase, MessageKey>> = {
  awaiting_debt: "turn.phase.debt",
  awaiting_bid: "turn.auction",
  awaiting_trade_response: "turn.phase.trade",
  game_over: "turn.phase.over",
};

// The neutral view for a phase with no view in `centrePhases` yet, and for a game with no state.
export function WaitingView({ turn }: { turn: Turn }) {
  const t = useT();
  const { phase } = turn.view;
  const { dice, stale } = lastRoll(turn.view);
  const titleKey = (phase && PHASE_TITLES[phase]) ?? null;
  const title = titleKey ? t(titleKey) : null;

  return (
    <>
      {dice && <Dice dice={dice} stale={stale} />}
      {title && <Status title={title} />}
      {phase === "game_over" ? null : <Waiting turn={turn} />}
    </>
  );
}
