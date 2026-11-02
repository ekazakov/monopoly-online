import { ActionBar } from "./ActionBar.tsx";
import { Dice } from "./Dice.tsx";
import { Status } from "./Status.tsx";
import { lastRoll } from "./useTurn.ts";
import type { Turn } from "./useTurn.ts";

// `awaiting_end_turn`: nothing is due. The engine sends a double that freed the player from jail
// here too, because that double gives no extra roll.
export function EndTurnView({ turn }: { turn: Turn }) {
  const { dice, stale } = lastRoll(turn.view);
  const freedByDoubles = !stale && dice !== null && dice[0] === dice[1];

  return (
    <>
      <Dice dice={dice} stale={stale} />
      {freedByDoubles && (
        <Status title="Doubles!" sub="Doubles that free you from jail give no extra roll." />
      )}
      <ActionBar
        turn={turn}
        actions={[{ label: "Next turn", action: { type: "EndTurn" }, primary: true }]}
      />
    </>
  );
}
