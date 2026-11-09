import { STATION_RENT, UTILITY_MULTIPLIER } from "@monopoly/game-engine";
import type { PropertySquare } from "@monopoly/game-engine";
import { formatMoney } from "./format.ts";

const DARK_BANDS = new Set(["brown", "navy", "station"]);

interface DeedRow {
  label: string;
  value: string;
  /** The row starts a new block, with a rule above it. */
  rule?: boolean;
}

/** The rows of a title deed, in print order: price, rent, then the costs. */
export function deedRows(square: PropertySquare): DeedRow[] {
  const mortgage = { label: "Mortgage value", value: formatMoney(square.mortgage), rule: true };
  const price = { label: "Price", value: formatMoney(square.price) };

  if (square.kind === "street") {
    const [base, ...built] = square.rent;
    return [
      price,
      { label: "Rent", value: formatMoney(base) },
      { label: "Rent with color set", value: formatMoney(base * 2) },
      ...built.map((rent, index) => ({
        label:
          index === built.length - 1 ? "With hotel" : `With ${index + 1} house${index ? "s" : ""}`,
        value: formatMoney(rent),
      })),
      { label: "House cost", value: formatMoney(square.buildPrice), rule: true },
      { label: "Hotel cost", value: formatMoney(square.buildPrice) },
      { ...mortgage, rule: false },
    ];
  }
  if (square.kind === "station") {
    return [
      price,
      ...STATION_RENT.map((rent, index) => ({
        label: index === 0 ? "Rent with 1 station" : `Rent with ${index + 1} stations`,
        value: formatMoney(rent),
      })),
      mortgage,
    ];
  }
  return [
    price,
    { label: "Rent with 1 utility", value: `${UTILITY_MULTIPLIER[0]} × dice` },
    { label: "Rent with 2 utilities", value: `${UTILITY_MULTIPLIER[1]} × dice` },
    mortgage,
  ];
}

// The full title deed (BUG-1, BUG-10): the group colour, name, price, every rent, the building
// costs and the mortgage value. It is too tall for the board centre, so it shows in a modal dialog.
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
        {deedRows(square).map((row) => (
          <div key={row.label} className={row.rule ? "turn-area__deed-rule" : undefined}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
