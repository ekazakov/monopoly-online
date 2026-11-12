import { SQUARES } from "@monopoly/game-engine";
import { squareInfoName, useT } from "../../../i18n/index.ts";
import { AuctionView } from "../flows/auction/index.ts";
import { useMotionStep } from "../motion/index.ts";
import { BuyView, propertyForSale } from "../turn/BuyView.tsx";
import { useTurn } from "../turn/useTurn.ts";
import { Modal } from "./Modal.tsx";

// The phases that are a dialog (spec 5.2): the purchase and the auction, on the device that has a
// seat to act. Neither can be closed: the game ends them. The title of the dialog is the status of
// the phase. The top bar stays above the dialog, so the Menu works (Save, Finish, Leave game). A
// device with no seat to act gets no dialog and follows the phase in the board centre. The dialog
// waits while the dice and the token move. It must be a child of the game layout.
export function PhaseModal({ userId }: { userId: string }) {
  const t = useT();
  const turn = useTurn(userId);
  const moving = useMotionStep() !== null;
  const { phase } = turn.view;
  if (moving || !turn.actor) return null;

  const property = propertyForSale(turn);
  if (phase === "awaiting_buy_decision" && property) {
    return (
      <Modal key={phase} title={t("turn.forSale", { name: squareInfoName(property, t) })}>
        <BuyView turn={turn} />
      </Modal>
    );
  }
  if (phase === "awaiting_bid") {
    const auction = turn.view.state?.auction;
    const square = auction ? SQUARES[auction.square] : undefined;
    return (
      <Modal
        key={phase}
        title={
          square ? t("turn.auctionOf", { name: squareInfoName(square, t) }) : t("turn.auction")
        }
      >
        <AuctionView turn={turn} inDialog />
      </Modal>
    );
  }
  return null;
}
