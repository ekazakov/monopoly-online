import { SQUARES, isProperty } from "@monopoly/game-engine";
import type { RedactedGameState, TradeOffer } from "@monopoly/shared";
import { formatMoney } from "../../turn/format.ts";
import { jailCardLabel, propertyNote } from "./tradeModel.ts";

const DARK_BANDS = new Set(["brown", "navy", "station"]);

export function GroupChip({ group }: { group: string }) {
  return (
    <span
      className={`trade-flow__chip${DARK_BANDS.has(group) ? " trade-flow__chip--dark" : ""}`}
      style={{ background: `var(--hf-street-${group})` }}
      aria-hidden="true"
    />
  );
}

interface OfferColumnProps {
  /** The name of the side that hands the items over. */
  giver: string;
  offer: TradeOffer;
  state: RedactedGameState;
}

// A read-only list of what one side hands over.
export function OfferColumn({ giver, offer, state }: OfferColumnProps) {
  const empty = offer.cash === 0 && offer.squares.length === 0 && offer.jailCards.length === 0;
  return (
    <section className="trade-flow__column" aria-label={`${giver} gives`}>
      <h3 className="trade-flow__heading">{giver} gives</h3>
      {empty ? (
        <p className="trade-flow__none">Nothing</p>
      ) : (
        <ul className="trade-flow__items">
          {offer.squares.map((square) => {
            const info = SQUARES[square];
            const entry = state.ownership[String(square)];
            if (!info || !isProperty(info)) return null;
            const note = propertyNote({
              houses: entry?.houses ?? 0,
              mortgaged: entry?.mortgaged ?? false,
            });
            return (
              <li key={`s${square}`} className="trade-flow__item">
                <GroupChip group={info.group} />
                <span className="trade-flow__name">
                  {info.name}
                  {note && <span className="trade-flow__note"> · {note}</span>}
                </span>
                <span className="trade-flow__value">{formatMoney(info.price)}</span>
              </li>
            );
          })}
          {offer.jailCards.map((deck, index) => (
            <li key={`j${index}`} className="trade-flow__item">
              <span className="trade-flow__name">{jailCardLabel(deck)}</span>
            </li>
          ))}
          {offer.cash > 0 && (
            <li className="trade-flow__item">
              <span className="trade-flow__name">Cash</span>
              <span className="trade-flow__value">{formatMoney(offer.cash)}</span>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
