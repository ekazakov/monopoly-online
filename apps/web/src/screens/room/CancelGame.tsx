import { useRef, useState } from "react";
import { useT } from "../../i18n/index.ts";

interface Props {
  /** A cancel is on its way. */
  pending: boolean;
  onCancel: () => void;
}

/**
 * Cancel game for the host, with a confirm step (boards LobbyHost and LobbyHostReady). The step
 * opens on "Keep game", the safe answer, and closing it returns the focus to the button that
 * opened it.
 */
export function CancelGame({ pending, onCancel }: Props) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  if (!confirming) {
    return (
      <button
        ref={openRef}
        type="button"
        className="room__button room__button--quiet"
        onClick={() => {
          setConfirming(true);
          // The confirm step is not in the page until the next render.
          queueMicrotask(() => keepRef.current?.focus());
        }}
      >
        {t("room.cancel.open")}
      </button>
    );
  }

  return (
    <div className="room__confirm" role="group" aria-labelledby="room-cancel-question">
      <p id="room-cancel-question" className="room__text">
        {t("room.cancel.question")}
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
          {t("room.cancel.keep")}
        </button>
        <button
          type="button"
          className="room__button room__button--danger"
          aria-disabled={pending || undefined}
          aria-busy={pending || undefined}
          onClick={() => !pending && onCancel()}
        >
          {pending ? t("room.cancel.pending") : t("room.cancel.open")}
        </button>
      </div>
    </div>
  );
}
