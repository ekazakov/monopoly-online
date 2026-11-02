import type { LogIconName } from "./describe.ts";

// 16px outline icons on a 16 grid. They repeat what the text says and are hidden from readers.
const PATHS: Record<LogIconName, string> = {
  dice: "M3 3h10v10H3zM6 6h.01M10 10h.01M10 6h.01M6 10h.01",
  move: "M2 8h10M8 4l4 4-4 4",
  coin: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM8 5v6M6 7h3a1 1 0 0 1 0 2H6",
  property: "M2 8l6-5 6 5M4 7v6h8V7",
  card: "M3 3h10v10H3zM5 6h6M5 9h4",
  build: "M2 13h12M4 13V7l4-3 4 3v6M7 13v-3h2v3",
  debt: "M8 2v8M5 7l3 3 3-3M3 13h10",
  jail: "M3 3h10v10H3zM6 3v10M10 3v10",
  auction: "M3 13h7M5 3l5 5M3 6l5 5M9 2l3 3",
  trade: "M2 5h10M9 2l3 3-3 3M14 11H4M7 8l-3 3 3 3",
  turn: "M3 8h8M8 4l4 4-4 4M13 3v10",
  end: "M4 14V2M4 3h8l-2 3 2 3H4",
};

export function LogIcon({ name }: { name: LogIconName }) {
  return (
    <svg
      className="game-log__icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
