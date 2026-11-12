import { SQUARES, groupSquares, isProperty } from "@monopoly/game-engine";
import type { CSSProperties } from "react";
import { useGame } from "../../../game/index.ts";
import { GROUP_ORDER, money } from "../hand/handModel.ts";
import { squareName, useT } from "../../../i18n/index.ts";
import { Modal } from "../modal/Modal.tsx";
import "./Square.css";

// The list of all properties in a dialog (spec 5.2, R-B5, BUG-13). It is the way to the square detail
// for the keyboard, a screen reader and a device with no WebGL: the 3D board has no 2D fallback.
export function SquareList({
  userId,
  onPick,
  onClose,
}: {
  userId: string;
  onPick: (square: number) => void;
  onClose: () => void;
}) {
  const { game, state } = useGame(userId);
  const t = useT();
  const ownerName = (square: number) => {
    const entry = state?.ownership[String(square)];
    if (!entry) return t("square.notOwned");
    return game?.seats.find((seat) => seat.id === entry.ownerId)?.name ?? t("square.owned");
  };

  return (
    <Modal title={t("square.properties")} onClose={onClose}>
      <div className="square-list">
        {GROUP_ORDER.map((group) => (
          <section key={group} className="square-list__group">
            <h3 className="square-list__heading">{t(`group.${group}`)}</h3>
            <ul className="square-list__items" aria-label={t(`group.${group}`)}>
              {groupSquares(group).map((square) => {
                const info = SQUARES[square]!;
                if (!isProperty(info)) return null;
                return (
                  <li key={square}>
                    <button
                      type="button"
                      className="square-list__item"
                      style={{ "--group-color": `var(--hf-street-${group})` } as CSSProperties}
                      onClick={() => onPick(square)}
                    >
                      <span className="square-list__chip" aria-hidden="true" />
                      <span className="square-list__name">{squareName(square, t)}</span>
                      <span className="square-list__price">{money(info.price)}</span>
                      <span className="square-list__owner">{ownerName(square)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
