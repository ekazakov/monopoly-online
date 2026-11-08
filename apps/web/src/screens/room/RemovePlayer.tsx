import { useRef, useState } from "react";

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
        aria-label={`Remove ${name}`}
        aria-expanded={confirming}
        onClick={() => {
          setConfirming(true);
          // The confirm step is not in the page until the next render.
          queueMicrotask(() => keepRef.current?.focus());
        }}
      >
        Remove
      </button>
      {confirming && (
        <div className="room__confirm room__seat-confirm" role="group" aria-labelledby={questionId}>
          <p id={questionId} className="room__text">
            Remove {name} from this game? {name} can join again with the game link.
            {alsoRemoves.length > 0 && ` ${alsoRemoves.join(", ")} on their device go too.`}
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
              Keep
            </button>
            <button
              type="button"
              className="room__button room__button--danger"
              aria-disabled={pending || undefined}
              aria-busy={pending || undefined}
              onClick={() => !pending && onRemove()}
            >
              {pending ? "Removing" : "Remove"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
