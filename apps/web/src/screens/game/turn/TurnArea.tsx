import { useState } from "react";
import { PROPOSE_PHASES, TradeBuilder, canProposeTrade } from "../flows/trade/index.ts";
import { centrePhases } from "./centrePhases.ts";
import { ErrorNotice } from "./ErrorNotice.tsx";
import { useTurn } from "./useTurn.ts";
import { WaitingView } from "./WaitingView.tsx";
import "./TurnArea.css";

// The board centre (spec 4.5 and 5.2): the content of the phase, then its actions. One root
// element, because the layout `centre` cell is a size container. The Trade button opens the trade
// builder in place of the phase view, in every phase where the engine allows `ProposeTrade`.
export function TurnArea({ userId }: { userId: string }) {
  const turn = useTurn(userId);
  const { phase } = turn.view;
  const PhaseView = (phase && centrePhases[phase]) || WaitingView;
  const [trading, setTrading] = useState(false);
  const tradeAllowed = phase !== null && PROPOSE_PHASES.includes(phase);
  // The phase moved on (for example a remote trade offer): the builder closes for good.
  if (trading && !tradeAllowed) setTrading(false);

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
