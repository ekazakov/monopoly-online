import { STATION_RENT, UTILITY_MULTIPLIER } from "@monopoly/game-engine";
import type { PropertySquare } from "@monopoly/game-engine";
import { squareInfoName, useT } from "../../../i18n/index.ts";
import type { Translate } from "../../../i18n/index.ts";
import { formatMoney } from "./format.ts";

const DARK_BANDS = new Set(["brown", "navy", "station"]);

interface DeedRow {
  label: string;
  value: string;
  /** The row starts a new block, with a rule above it. */
  rule?: boolean;
}

/** The rows of a title deed, in print order: price, rent, then the costs. */
export function deedRows(square: PropertySquare, t: Translate): DeedRow[] {
  const mortgage = { label: t("deed.mortgage"), value: formatMoney(square.mortgage), rule: true };
  const price = { label: t("deed.price"), value: formatMoney(square.price) };

  if (square.kind === "street") {
    const [base, ...built] = square.rent;
    return [
      price,
      { label: t("deed.rent"), value: formatMoney(base) },
      { label: t("deed.rentSet"), value: formatMoney(base * 2) },
      ...built.map((rent, index) => ({
        label:
          index === built.length - 1
            ? t("deed.withHotel")
            : t("deed.withHouses", { count: index + 1 }),
        value: formatMoney(rent),
      })),
      { label: t("deed.houseCost"), value: formatMoney(square.buildPrice), rule: true },
      { label: t("deed.hotelCost"), value: formatMoney(square.buildPrice) },
      { ...mortgage, rule: false },
    ];
  }
  if (square.kind === "station") {
    return [
      price,
      ...STATION_RENT.map((rent, index) => ({
        label: t("deed.rentStations", { count: index + 1 }),
        value: formatMoney(rent),
      })),
      mortgage,
    ];
  }
  return [
    price,
    {
      label: t("deed.rentUtilities", { count: 1 }),
      value: t("deed.timesDice", { count: UTILITY_MULTIPLIER[0] }),
    },
    {
      label: t("deed.rentUtilities", { count: 2 }),
      value: t("deed.timesDice", { count: UTILITY_MULTIPLIER[1] }),
    },
    mortgage,
  ];
}

// The full title deed (BUG-1, BUG-10): the group colour, name, price, every rent, the building
// costs and the mortgage value. It is too tall for the board centre, so it shows in a modal dialog.
export function PropertyCard({ square }: { square: PropertySquare }) {
  const t = useT();
  const dark = DARK_BANDS.has(square.group);
  return (
    <div className="turn-area__deed">
      <div
        className={`turn-area__deed-head${dark ? " turn-area__deed-head--dark" : ""}`}
        style={{ background: `var(--hf-street-${square.group})` }}
      >
        <span className="turn-area__deed-kind">{t("deed.title")}</span>
        <span className="turn-area__deed-name">{squareInfoName(square, t)}</span>
      </div>
      <dl className="turn-area__deed-body">
        {deedRows(square, t).map((row) => (
          <div key={row.label} className={row.rule ? "turn-area__deed-rule" : undefined}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
