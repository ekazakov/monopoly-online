import { SQUARES } from "@monopoly/game-engine";
import { squareInfoName, useT } from "../../../i18n/index.ts";
import { AuctionView } from "../flows/auction/index.ts";
import { Waiting } from "./ActionBar.tsx";
import { propertyForSale } from "./BuyView.tsx";
import { Dice } from "./Dice.tsx";
import { Status } from "./Status.tsx";
import { lastRoll } from "./useTurn.ts";
import type { Turn } from "./useTurn.ts";

// The board centre while a modal dialog (`PhaseModal`) holds the phase: the title only, with the
// dice. The dialog has the deed and the buttons. A device that has no seat to act gets no dialog,
// because a dialog makes the Menu inert, and the owner must reach Save and Finish there.
export function BuyStatusView({ turn }: { turn: Turn }) {
  const t = useT();
  const { dice, stale } = lastRoll(turn.view);
  const square = propertyForSale(turn);
  return (
    <>
      {dice && <Dice dice={dice} stale={stale} />}
      {square && <Status title={t("turn.forSale", { name: squareInfoName(square, t) })} />}
      {!turn.actor && <Waiting turn={turn} />}
    </>
  );
}

// The bidder has the form in the dialog. Every other device follows the auction here, read-only.
export function AuctionCentreView({ turn }: { turn: Turn }) {
  if (!turn.actor) return <AuctionView turn={turn} />;
  return <AuctionStatusView turn={turn} />;
}

function AuctionStatusView({ turn }: { turn: Turn }) {
  const t = useT();
  const auction = turn.view.state?.auction ?? null;
  const square = auction ? SQUARES[auction.square] : undefined;
  return (
    <>
      <Status
        title={
          square ? t("turn.auctionOf", { name: squareInfoName(square, t) }) : t("turn.auction")
        }
      />
    </>
  );
}
