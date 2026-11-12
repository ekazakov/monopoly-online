import { useEffect, useState } from "react";
import { useT } from "../../../i18n/index.ts";
import type { DiceValues } from "./useTurn.ts";

const PIPS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[36, 36]],
  2: [
    [20, 20],
    [52, 52],
  ],
  3: [
    [20, 20],
    [36, 36],
    [52, 52],
  ],
  4: [
    [20, 20],
    [52, 20],
    [20, 52],
    [52, 52],
  ],
  5: [
    [20, 20],
    [52, 20],
    [36, 36],
    [20, 52],
    [52, 52],
  ],
  6: [
    [20, 20],
    [52, 20],
    [20, 36],
    [52, 36],
    [20, 52],
    [52, 52],
  ],
};

function Die({ value }: { value: number | null }) {
  return (
    <svg className="turn-area__die" viewBox="0 0 72 72" aria-hidden="true">
      <rect className="turn-area__die-face" x="2" y="2" width="68" height="68" rx="12" />
      {value !== null &&
        (PIPS[value] ?? []).map(([x, y]) => (
          <circle key={`${x}-${y}`} className="turn-area__pip" cx={x} cy={y} r="6" />
        ))}
    </svg>
  );
}

/** Time between two faces while the dice tumble. */
export const TUMBLE_MS = 80;

const randomFace = () => 1 + Math.floor(Math.random() * 6);

/** Random faces that change every `TUMBLE_MS` while `active`. */
function useTumble(active: boolean): DiceValues {
  const [faces, setFaces] = useState<DiceValues>([randomFace(), randomFace()]);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setFaces([randomFace(), randomFace()]), TUMBLE_MS);
    return () => clearInterval(id);
  }, [active]);
  return faces;
}

interface DiceProps {
  dice: DiceValues | null;
  /** The roll is from an earlier turn: shown dimmed until the new roll. */
  stale?: boolean;
  /** The dice tumble and show no result: `dice` is not shown until this is off. */
  rolling?: boolean;
}

export function Dice({ dice, stale = false, rolling = false }: DiceProps) {
  const t = useT();
  const tumble = useTumble(rolling);
  const shown = rolling ? tumble : dice;
  const label = rolling
    ? t("turn.dice.rolling")
    : !dice
      ? t("turn.dice.none")
      : t(stale ? "turn.dice.last" : "turn.dice.now", { a: dice[0], b: dice[1] });
  const dim = !rolling && (stale || !dice);
  return (
    <div
      className={`turn-area__dice${dim ? " turn-area__dice--dim" : ""}${rolling ? " turn-area__dice--rolling" : ""}`}
      role="img"
      aria-label={label}
    >
      <Die value={shown?.[0] ?? null} />
      <Die value={shown?.[1] ?? null} />
    </div>
  );
}
