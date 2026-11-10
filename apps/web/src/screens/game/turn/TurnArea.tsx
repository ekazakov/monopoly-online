import { useState } from "react";
import { PROPOSE_PHASES, TradeBuilder, canProposeTrade } from "../flows/trade/index.ts";
import { useMotionStep } from "../motion/index.ts";
import { centrePhases } from "./centrePhases.ts";
import { Dice } from "./Dice.tsx";
import { ErrorNotice } from "./ErrorNotice.tsx";
import { Status } from "./Status.tsx";
import { lastRoll, useTurn } from "./useTurn.ts";
import { WaitingView } from "./WaitingView.tsx";
import "./TurnArea.css";

// The board centre (spec 4.5 and 5.2): the content of the phase, then its actions. One root
// element, because the layout `centre` cell is a size container. The Trade button opens the trade
// builder in place of the phase view, in every phase where the engine allows `ProposeTrade`.
export function TurnArea({ userId }: { userId: string }) {
  const turn = useTurn(userId);
  const motion = useMotionStep();
  const { phase } = turn.view;
  const PhaseView = (phase && centrePhases[phase]) || WaitingView;
  const [trading, setTrading] = useState(false);
  const tradeAllowed = phase !== null && PROPOSE_PHASES.includes(phase);
  // The phase moved on (for example a remote trade offer): the builder closes for good.
  if (trading && !tradeAllowed) setTrading(false);

  // Spec 5.2: while the dice roll and the token moves, the centre shows only the animation and
  // nothing is clickable. During a card hold the card dialog is open, and the phase actions (for
  // example Buy for the utility the token has not reached yet) wait for OK.
  if (motion?.kind === "roll") {
    return (
      <div className="turn-area turn-area--motion" aria-busy="true">
        <Dice dice={null} rolling />
        <Status title="Rolling…" />
      </div>
    );
  }
  if (motion) {
    const { dice, stale } = lastRoll(turn.view);
    return (
      <div className="turn-area turn-area--motion" aria-busy="true">
        {dice && !stale && <Dice dice={dice} />}
        <Status title={motion.kind === "hold" ? "Drew a card" : "Moving…"} />
      </div>
    );
  }

  if (trading) {
    return <TradeBuilder userId={userId} onClose={() => setTrading(false)} />;
  }

  return (
    <div className="turn-area" aria-busy={turn.pending || undefined}>
      <PhaseView turn={turn} />
      {canProposeTrade(turn) && (
        <button
          type="button"
          className="turn-area__btn turn-area__btn--outline"
          onClick={() => setTrading(true)}
        >
          Trade
        </button>
      )}
      <ErrorNotice />
    </div>
  );
}
