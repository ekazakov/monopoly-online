import { useEffect, useRef } from "react";
import { useGame } from "../../../../game/index.ts";
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
  const { game } = useGame(userId);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => okRef.current?.focus(), []);

  const isOwner = game?.ownerId === userId;
  const ownerName = game?.seats.find((seat) => seat.userId === game.ownerId)?.name ?? "The owner";
  return (
    <div className="turn-area">
      <Status
        title={isOwner ? "Game saved" : `Game saved by ${ownerName}`}
        sub={
          isOwner
            ? "You can continue it from your saved games."
            : `${ownerName} can continue it later. You will find it in My games.`
        }
      />
      <button
        ref={okRef}
        type="button"
        className="turn-area__btn turn-area__btn--primary"
        onClick={onOk}
      >
        OK
      </button>
    </div>
  );
}
