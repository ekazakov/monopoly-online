import { mayAct } from "../../../../game/index.ts";
import { Waiting } from "../../turn/ActionBar.tsx";
import type { CentrePhaseProps } from "../../turn/index.ts";
import { OfferColumn } from "./OfferColumn.tsx";
import "./TradeFlow.css";

// `awaiting_trade_response`: both sides of the offer, read only. The partner accepts or declines.
// The proposer withdraws the offer. A device with no seat in the trade only waits. A rejected
// action shows through the error notice of the turn area, which wraps every phase view.
export function TradeResponseView({ turn }: CentrePhaseProps) {
  const { game, state } = turn.view;
  const trade = state?.trade ?? null;
  const nameOf = (id: string) => state?.players.find((p) => p.id === id)?.name ?? "Player";

  if (!state || !trade) {
    return (
      <section className="trade-flow trade-flow--response" aria-label="Trade offer">
        <h2 className="trade-flow__title">Trade offer</h2>
        <Waiting name={turn.actorName} />
      </section>
    );
  }

  // The acting seat of this phase is the partner. In hot-seat play one device can hold both seats.
  const mayAnswer = turn.actor !== null;
  const mayWithdraw = mayAct(game, state, turn.userId, "CancelTrade");
  const from = nameOf(trade.fromId);
  const to = nameOf(trade.toId);

  return (
    <section
      className="trade-flow trade-flow--response"
      aria-label="Trade offer"
      aria-busy={turn.pending || undefined}
    >
      <h2 className="trade-flow__title">
        {mayAnswer ? `Trade offer from ${from}` : `${from} offers a trade to ${to}`}
      </h2>

      <div className="trade-flow__columns">
        <OfferColumn giver={from} offer={trade.give} state={state} />
        <OfferColumn giver={to} offer={trade.get} state={state} />
      </div>

      {!mayAnswer && <Waiting name={to} />}

      {(mayAnswer || mayWithdraw) && (
        <div className="trade-flow__actions">
          {mayWithdraw && (
            <button
              type="button"
              className="trade-flow__btn trade-flow__btn--outline"
              disabled={turn.pending}
              onClick={() => turn.send({ type: "CancelTrade" })}
            >
              Withdraw offer
            </button>
          )}
          {mayAnswer && (
            <>
              <button
                type="button"
                className="trade-flow__btn trade-flow__btn--outline"
                disabled={turn.pending}
                onClick={() => turn.send({ type: "RejectTrade" })}
              >
                Decline
              </button>
              <button
                type="button"
                className="trade-flow__btn trade-flow__btn--primary"
                disabled={turn.pending}
                onClick={() => turn.send({ type: "AcceptTrade" })}
              >
                Accept
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
