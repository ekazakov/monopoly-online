import { STATION_RENT, UTILITY_MULTIPLIER } from "@monopoly/game-engine";
import type { PropertySquare } from "@monopoly/game-engine";
import { formatMoney } from "./format.ts";

const DARK_BANDS = new Set(["brown", "navy", "station"]);

function rentText(square: PropertySquare): string {
  if (square.kind === "street") return formatMoney(square.rent[0]);
  if (square.kind === "station") {
    return `${formatMoney(STATION_RENT[0])} to ${formatMoney(STATION_RENT[3])}`;
  }
  return `${UTILITY_MULTIPLIER[0]} or ${UTILITY_MULTIPLIER[1]} × dice`;
}

// A compact title deed: the group colour, name, price and base rent.
export function PropertyCard({ square }: { square: PropertySquare }) {
  const dark = DARK_BANDS.has(square.group);
  return (
    <div className="turn-area__deed">
      <div
        className={`turn-area__deed-head${dark ? " turn-area__deed-head--dark" : ""}`}
        style={{ background: `var(--hf-street-${square.group})` }}
      >
        <span className="turn-area__deed-kind">Title deed</span>
        <span className="turn-area__deed-name">{square.name}</span>
      </div>
      <dl className="turn-area__deed-body">
        <div>
          <dt>Price</dt>
          <dd>{formatMoney(square.price)}</dd>
        </div>
        <div>
          <dt>Rent</dt>
          <dd>{rentText(square)}</dd>
        </div>
      </dl>
    </div>
  );
}
