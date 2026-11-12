import { SQUARES, isProperty } from "@monopoly/game-engine";
import type { ActionType } from "@monopoly/game-engine";
import { useId } from "react";
import { mayActWith, useGame, useGameActions } from "../../../game/index.ts";
import { errorMessage, squareName, useT } from "../../../i18n/index.ts";
import { buildingText, handOf } from "../hand/handModel.ts";
import { PropertyDetail } from "../hand/PropertyDetail.tsx";
import { propertyActions } from "../hand/propertyActions.ts";
import type { ManageAction } from "../hand/propertyActions.ts";
import { Modal } from "../modal/Modal.tsx";
import { PropertyCard } from "../turn/PropertyCard.tsx";
import "./Square.css";

// The detail of one property in a dialog (spec 5.2, R-B5, BUG-13): the full title deed, who owns
// it and in what state, and, for the owner on this device, the same actions as the expanded hand.
// The server stays the authority: a button only sends the action, and a refusal shows here.
export function SquareDetail({
  userId,
  square,
  onClose,
}: {
  userId: string;
  square: number;
  onClose: () => void;
}) {
  const view = useGame(userId);
  const { game, state } = view;
  const t = useT();
  const actions = useGameActions();
  const detailId = useId();
  const info = SQUARES[square];
  if (!info || !isProperty(info) || !state) return null;

  const entry = state.ownership[String(square)];
  const owner = entry ? game?.seats.find((seat) => seat.id === entry.ownerId) : undefined;
  const mine = owner ? view.mySeats.some((seat) => seat.id === owner.id) : false;
  const card =
    mine && owner
      ? handOf(state, owner.id, t)
          .groups.flatMap((group) => group.cards)
          .find((c) => c.square === square)
      : undefined;
  const may = (type: ActionType) => (owner ? mayActWith(game, state, owner.id, type) : false);
  const run = (type: ManageAction) => {
    if (!owner) return;
    actions.send({ type, square }, { seatId: owner.id, source: "square" }).catch(() => {
      // The rejection is shown from `error` of the actions context.
    });
  };

  const ownerText = !entry
    ? t("square.notOwnedLong")
    : `${t("square.ownedBy", { name: owner?.name ?? t("square.aPlayer") })}${
        entry.mortgaged
          ? ` · ${t("hand.mortgaged")}`
          : info.kind === "street" && entry.houses > 0
            ? ` · ${buildingText(entry.houses, t)}`
            : ""
      }`;
  const { error, errorSource, pending } = actions;

  return (
    <Modal key={square} title={squareName(square, t)} onClose={onClose}>
      <div className="square-detail">
        <PropertyCard square={info} />
        <p className="square-detail__owner">{ownerText}</p>
        {card && owner ? (
          <PropertyDetail
            id={detailId}
            card={card}
            actions={propertyActions(state, owner.id, square, t)}
            may={may}
            busy={pending}
            onAction={run}
          />
        ) : null}
        <p className="square-detail__status" role="status" aria-live="polite" aria-atomic="true">
          {error && errorSource === "square" ? errorMessage(error, t) : ""}
        </p>
      </div>
    </Modal>
  );
}
