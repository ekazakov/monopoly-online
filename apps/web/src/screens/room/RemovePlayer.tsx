import { useRef, useState } from "react";
import { useT } from "../../i18n/index.ts";

interface Props {
  /** The joined player the host can remove. */
  name: string;
  /** Names of the hot-seat seats on the device of this player. They go with the player. */
  alsoRemoves: string[];
  /** A remove is on its way. */
  pending: boolean;
  onRemove: () => void;
}

/**
 * Remove for a joined player, with a confirm step (board LobbyHostReady). The step opens on "Keep",
 * the safe answer, and closing it returns the focus to the button that opened it. Nobody is
 * banned: the text says the player can join again with the game link.
 */
export function RemovePlayer({ name, alsoRemoves, pending, onRemove }: Props) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const questionId = `room-remove-${name}`;

  return (
    <>
      <button
        ref={openRef}
        type="button"
        className="room__button room__button--quiet"
        aria-label={t("room.seat.removeLabel", { name })}
        aria-expanded={confirming}
        onClick={() => {
          setConfirming(true);
          // The confirm step is not in the page until the next render.
          queueMicrotask(() => keepRef.current?.focus());
        }}
      >
        {t("room.seat.remove")}
      </button>
      {confirming && (
        <div className="room__confirm room__seat-confirm" role="group" aria-labelledby={questionId}>
          <p id={questionId} className="room__text">
            {t("room.removePlayer.question", { name })}
            {alsoRemoves.length > 0 &&
              ` ${t("room.removePlayer.alsoGo", { list: alsoRemoves.join(", ") })}`}
          </p>
          <div className="room__row">
            <button
              ref={keepRef}
              type="button"
              className="room__button"
              onClick={() => {
                setConfirming(false);
                queueMicrotask(() => openRef.current?.focus());
              }}
            >
              {t("room.removePlayer.keep")}
            </button>
            <button
              type="button"
              className="room__button room__button--danger"
              aria-disabled={pending || undefined}
              aria-busy={pending || undefined}
              onClick={() => !pending && onRemove()}
            >
              {pending ? t("room.removePlayer.pending") : t("room.seat.remove")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
