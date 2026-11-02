import { JAIL_FINE, MAX_JAIL_ATTEMPTS } from "@monopoly/game-engine";
import { ActionBar } from "./ActionBar.tsx";
import { Dice } from "./Dice.tsx";
import { formatMoney } from "./format.ts";
import { Status } from "./Status.tsx";
import { lastRoll } from "./useTurn.ts";
import type { Turn } from "./useTurn.ts";

// `awaiting_jail_choice`: roll for doubles, pay the fine or use a Get Out of Jail Free card.
export function JailView({ turn }: { turn: Turn }) {
  const { dice, stale } = lastRoll(turn.view);
  const player = turn.view.currentPlayer;
  const attempt = (player?.jailTurns ?? 0) + 1;
  const last = attempt >= MAX_JAIL_ATTEMPTS;
  const fine = formatMoney(JAIL_FINE);

  const sub = last
    ? `Attempt ${attempt} of ${MAX_JAIL_ATTEMPTS}. If you miss, you pay the ${fine} fine and move.`
    : `Attempt ${attempt} of ${MAX_JAIL_ATTEMPTS}. Roll doubles, pay ${fine} or use a card.`;
  const hasCard = (player?.heldJailCards.length ?? 0) > 0;
  const cashShort = player !== null && player.cash < JAIL_FINE;

  return (
    <>
      <Dice dice={dice} stale={stale} />
      <Status title="In jail" sub={sub} />
      <ActionBar
        turn={turn}
        actions={[
          { label: "Roll for doubles", action: { type: "RollDice" }, primary: true },
          {
            label: `Pay ${fine}`,
            action: { type: "PayJailFine" },
            why: cashShort ? `Paying the fine needs ${fine} cash.` : undefined,
          },
          {
            label: hasCard ? "Use card" : "Use card (none)",
            action: { type: "UseJailCard" },
            why: hasCard ? undefined : "You hold no Get Out of Jail Free card.",
          },
        ]}
      />
    </>
  );
}
