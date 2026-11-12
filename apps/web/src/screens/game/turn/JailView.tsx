import { JAIL_FINE, MAX_JAIL_ATTEMPTS } from "@monopoly/game-engine";
import { useT } from "../../../i18n/index.ts";
import { ActionBar } from "./ActionBar.tsx";
import { Dice } from "./Dice.tsx";
import { formatMoney } from "./format.ts";
import { Status } from "./Status.tsx";
import { lastRoll } from "./useTurn.ts";
import type { Turn } from "./useTurn.ts";

// `awaiting_jail_choice`: roll for doubles, pay the fine or use a Get Out of Jail Free card.
export function JailView({ turn }: { turn: Turn }) {
  const t = useT();
  const { dice, stale } = lastRoll(turn.view);
  const player = turn.view.currentPlayer;
  const attempt = (player?.jailTurns ?? 0) + 1;
  const last = attempt >= MAX_JAIL_ATTEMPTS;
  const fine = formatMoney(JAIL_FINE);

  const sub = t(last ? "turn.jail.attemptLast" : "turn.jail.attempt", {
    attempt,
    max: MAX_JAIL_ATTEMPTS,
    fine,
  });
  const hasCard = (player?.heldJailCards.length ?? 0) > 0;
  const cashShort = player !== null && player.cash < JAIL_FINE;

  return (
    <>
      <Dice dice={dice} stale={stale} />
      <Status title={t("turn.jail.title")} sub={sub} />
      <ActionBar
        turn={turn}
        actions={[
          { label: t("turn.jail.roll"), action: { type: "RollDice" }, primary: true },
          {
            label: t("turn.jail.pay", { fine }),
            action: { type: "PayJailFine" },
            why: cashShort ? t("turn.jail.payShort", { fine }) : undefined,
          },
          {
            label: hasCard ? t("turn.jail.card") : t("turn.jail.cardNone"),
            action: { type: "UseJailCard" },
            why: hasCard ? undefined : t("turn.jail.cardWhy"),
          },
        ]}
      />
    </>
  );
}
