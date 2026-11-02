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
      {value === 1 && (
        <circle className="turn-area__pip turn-area__pip--one" cx="36" cy="36" r="13" />
      )}
      {value !== null &&
        value !== 1 &&
        (PIPS[value] ?? []).map(([x, y]) => (
          <circle key={`${x}-${y}`} className="turn-area__pip" cx={x} cy={y} r="6" />
        ))}
    </svg>
  );
}

interface DiceProps {
  dice: DiceValues | null;
  /** The roll is from an earlier turn: shown dimmed until the new roll. */
  stale?: boolean;
}

export function Dice({ dice, stale = false }: DiceProps) {
  const label = !dice
    ? "Dice: not rolled yet"
    : `${stale ? "Last roll" : "Dice"}: ${dice[0]} and ${dice[1]}`;
  return (
    <div
      className={`turn-area__dice${stale || !dice ? " turn-area__dice--dim" : ""}`}
      role="img"
      aria-label={label}
    >
      <Die value={dice?.[0] ?? null} />
      <Die value={dice?.[1] ?? null} />
    </div>
  );
}
