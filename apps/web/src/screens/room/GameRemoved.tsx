import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useT } from "../../i18n/index.ts";

/**
 * What a player sees when the host removes them before the start (board LobbyStates, "Guest ·
 * removed by host"). The room is closed to them, so this takes the place of the room.
 */
export function GameRemoved({ hostName }: { hostName: string }) {
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
            {t("room.removed.title", { name: hostName })}
          </h1>
          <p className="room__text">{t("room.removed.text", { name: hostName })}</p>
          <Link to="/" className="room__button room__button--primary">
            {t("room.backToLobby")}
          </Link>
        </section>
      </main>
    </div>
  );
}
