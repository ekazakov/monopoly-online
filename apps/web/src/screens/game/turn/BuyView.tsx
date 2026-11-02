import { SQUARES, isProperty } from "@monopoly/game-engine";
import { ActionBar } from "./ActionBar.tsx";
import { Dice } from "./Dice.tsx";
import { formatMoney } from "./format.ts";
import { PropertyCard } from "./PropertyCard.tsx";
import { Status } from "./Status.tsx";
import { lastRoll } from "./useTurn.ts";
import type { Turn } from "./useTurn.ts";

// `awaiting_buy_decision`: buy at the listed price, or decline and send the property to auction.
// A player who cannot pay cannot buy, so the property goes to auction (gameplay 2.1).
export function BuyView({ turn }: { turn: Turn }) {
  const { state } = turn.view;
  const player = turn.view.currentPlayer;
  const square = player ? SQUARES[player.position] : undefined;
  if (!state || !player || !square || !isProperty(square)) {
    const { dice, stale } = lastRoll(turn.view);
    return (
      <>
        <Dice dice={dice} stale={stale} />
        <ActionBar turn={turn} actions={[]} />
      </>
    );
  }

  const short = player.cash < square.price;
  return (
    <>
      <PropertyCard square={square} />
      <Status title={`${square.name} is for sale`} />
      <ActionBar
        turn={turn}
        actions={[
          {
            label: `Buy ${formatMoney(square.price)}`,
            action: { type: "BuyProperty" },
            primary: true,
            why: short
              ? `Not enough cash: ${formatMoney(player.cash)} of ${formatMoney(square.price)}. Auction it instead.`
              : undefined,
          },
          { label: "Auction", action: { type: "DeclineProperty" } },
        ]}
      />
    </>
  );
}
