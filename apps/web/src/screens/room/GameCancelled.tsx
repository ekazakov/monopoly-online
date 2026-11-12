import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useT } from "../../i18n/index.ts";

/**
 * What every seated client sees when the host cancels (board LobbyStates, "Guest · host
 * cancelled"). The room is gone, so this takes the place of the room.
 */
export function GameCancelled({ hostName }: { hostName: string }) {
  const t = useT();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The room the user was reading is gone: the heading takes the focus and is announced.
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <div className="room">
      <header className="room__top">
        <span className="room__brand">Harborfront</span>
      </header>
      <main className="room__main">
        <section className="room__panel" role="status">
          <h1 ref={headingRef} tabIndex={-1} className="room__title">
            {t("room.cancelled.title")}
          </h1>
          <p className="room__text">{t("room.cancelled.text", { name: hostName })}</p>
          <Link to="/" className="room__button room__button--primary">
            {t("room.backToLobby")}
          </Link>
        </section>
      </main>
    </div>
  );
}
