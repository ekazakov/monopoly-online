import { useEffect, useRef } from "react";
import { useT } from "../../i18n/index.ts";

/**
 * What every seated client sees when the host finishes a saved game while they have its room open
 * (board SavedGames, "Room · owner finished the saved game"). It takes the place of the room.
 */
export function SavedGameFinished({
  hostName,
  onSeeResult,
}: {
  hostName: string;
  onSeeResult: () => void;
}) {
  const t = useT();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The room the user was reading changed under them: the heading takes the focus.
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <div className="room">
      <header className="room__top">
        <span className="room__brand">Harborfront</span>
      </header>
      <main className="room__main">
        <section className="room__panel" role="status">
          <h1 ref={headingRef} tabIndex={-1} className="room__title">
            {t("room.finished.title", { name: hostName })}
          </h1>
          <p className="room__text">{t("room.finished.text", { name: hostName })}</p>
          <button
            type="button"
            className="room__button room__button--primary"
            onClick={onSeeResult}
          >
            {t("room.finished.see")}
          </button>
        </section>
      </main>
    </div>
  );
}
