import { mayAct } from "../../../../game/index.ts";
import { useT } from "../../../../i18n/index.ts";
import { Waiting } from "../../turn/ActionBar.tsx";
import type { CentrePhaseProps } from "../../turn/index.ts";
import { OfferColumn } from "./OfferColumn.tsx";
import "./TradeFlow.css";

// `awaiting_trade_response`: both sides of the offer, read only. The partner accepts or declines.
// The proposer withdraws the offer. A device with no seat in the trade only waits. A rejected
// action shows through the error notice of the turn area, which wraps every phase view.
export function TradeResponseView({ turn }: CentrePhaseProps) {
  const t = useT();
  const { game, state } = turn.view;
  const trade = state?.trade ?? null;
  const nameOf = (id: string) => state?.players.find((p) => p.id === id)?.name ?? t("trade.player");

  if (!state || !trade) {
    return (
      <section className="trade-flow trade-flow--response" aria-label={t("turn.phase.trade")}>
        <h2 className="trade-flow__title">{t("turn.phase.trade")}</h2>
        <Waiting turn={turn} />
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
      aria-label={t("turn.phase.trade")}
      aria-busy={turn.pending || undefined}
    >
      <h2 className="trade-flow__title">
        {mayAnswer ? t("trade.from", { name: from }) : t("trade.offers", { from, to })}
      </h2>

      <div className="trade-flow__columns">
        <OfferColumn giver={from} offer={trade.give} state={state} />
        <OfferColumn giver={to} offer={trade.get} state={state} />
      </div>

      {!mayAnswer && <Waiting turn={turn} />}

      {(mayAnswer || mayWithdraw) && (
        <div className="trade-flow__actions">
          {mayWithdraw && (
            <button
              type="button"
              className="trade-flow__btn trade-flow__btn--outline"
              disabled={turn.pending}
              onClick={() => turn.send({ type: "CancelTrade" })}
            >
              {t("trade.withdraw")}
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
                {t("lobby.invites.decline")}
              </button>
              <button
                type="button"
                className="trade-flow__btn trade-flow__btn--primary"
                disabled={turn.pending}
                onClick={() => turn.send({ type: "AcceptTrade" })}
              >
                {t("lobby.invites.accept")}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
