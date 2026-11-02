import { ActionBar } from "./ActionBar.tsx";
import { Dice } from "./Dice.tsx";
import { Status } from "./Status.tsx";
import { lastRoll } from "./useTurn.ts";
import type { Turn } from "./useTurn.ts";

export const DOUBLES_RULE = "Roll again. Three doubles in a row sends you to jail.";

// `awaiting_roll`: the start of a turn, or the extra roll after doubles.
export function RollView({ turn }: { turn: Turn }) {
  const { dice, stale } = lastRoll(turn.view);
  const doubles = turn.view.state?.turn.doubles ?? 0;
  const again = doubles > 0;

  return (
    <>
      <Dice dice={dice} stale={stale} />
      {again && <span className="turn-area__tag">{`Doubles ×${doubles}`}</span>}
      {again ? (
        <Status title="Doubles!" sub={DOUBLES_RULE} />
      ) : (
        <Status title={`${turn.actorName}’s turn`} />
      )}
      <ActionBar
        turn={turn}
        actions={[
          { label: again ? "Roll again" : "Roll", action: { type: "RollDice" }, primary: true },
        ]}
      />
    </>
  );
}
