import { useT } from "../../../i18n/index.ts";
import { ActionBar } from "./ActionBar.tsx";
import { Dice } from "./Dice.tsx";
import { Status } from "./Status.tsx";
import { lastRoll } from "./useTurn.ts";
import type { Turn } from "./useTurn.ts";

// `awaiting_roll`: the start of a turn, or the extra roll after doubles.
export function RollView({ turn }: { turn: Turn }) {
  const t = useT();
  const { dice, stale } = lastRoll(turn.view);
  const doubles = turn.view.state?.turn.doubles ?? 0;
  const again = doubles > 0;

  return (
    <>
      <Dice dice={dice} stale={stale} />
      {again && <span className="turn-area__tag">{t("turn.doublesTag", { count: doubles })}</span>}
      {again ? (
        <Status title={t("turn.doubles")} sub={t("turn.doublesRule")} />
      ) : (
        <Status title={t("turn.turnOf", { name: turn.actorName })} />
      )}
      <ActionBar
        turn={turn}
        actions={[
          {
            label: again ? t("turn.rollAgain") : t("turn.roll"),
            action: { type: "RollDice" },
            primary: true,
          },
        ]}
      />
    </>
  );
}
