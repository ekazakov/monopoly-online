import { SQUARES, isProperty } from "@monopoly/game-engine";
import { ActionBar } from "./ActionBar.tsx";
import { formatMoney } from "./format.ts";
import { PropertyCard } from "./PropertyCard.tsx";
import type { Turn } from "./useTurn.ts";

/** The property the player on turn stands on, when it is one that can be bought. */
export function propertyForSale(turn: Turn) {
  const square = turn.view.currentPlayer ? SQUARES[turn.view.currentPlayer.position] : undefined;
  return square && isProperty(square) ? square : null;
}

// `awaiting_buy_decision`: buy at the listed price, or decline and send the property to auction.
// A player who cannot pay cannot buy, so the property goes to auction (gameplay 2.1). The view is
// the content of the purchase dialog (`PhaseModal`) with the full title deed. The dialog title is
// "<name> is for sale". The board centre shows only `BuyStatusView`.
export function BuyView({ turn }: { turn: Turn }) {
  const player = turn.view.currentPlayer;
  const square = propertyForSale(turn);
  if (!player || !square) return null;

  const short = player.cash < square.price;
  return (
    <>
      <PropertyCard square={square} />
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
