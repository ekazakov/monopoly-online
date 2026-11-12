import { useEffect, useRef } from "react";
import { useGame } from "../../../../game/index.ts";
import { useT } from "../../../../i18n/index.ts";
import { Status } from "../../turn/Status.tsx";
import "../../turn/TurnArea.css";

export interface SavedNoticeProps {
  userId: string;
  /** OK: the device goes home. */
  onOk: () => void;
}

// What every device of a game sees when the game is saved while it is open (design board "Owner
// controls", gameplay 3.1). It takes the place of the turn area. The owner is told how to
// continue the game; the others are told whose game it is and where it will be.
export function SavedNotice({ userId, onOk }: SavedNoticeProps) {
  const t = useT();
  const { game } = useGame(userId);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => okRef.current?.focus(), []);

  const isOwner = game?.ownerId === userId;
  const ownerName =
    game?.seats.find((seat) => seat.userId === game.ownerId)?.name ?? t("saved.theOwner");
  return (
    <div className="turn-area">
      <Status
        title={isOwner ? t("saved.title") : t("saved.titleBy", { name: ownerName })}
        sub={isOwner ? t("saved.sub") : t("saved.subBy", { name: ownerName })}
      />
      <button
        ref={okRef}
        type="button"
        className="turn-area__btn turn-area__btn--primary"
        onClick={onOk}
      >
        {t("common.ok")}
      </button>
    </div>
  );
}
