import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

/**
 * What every seated client sees when the host cancels (board LobbyStates, "Guest · host
 * cancelled"). The room is gone, so this takes the place of the room.
 */
export function GameCancelled({ hostName }: { hostName: string }) {
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
            Game cancelled
          </h1>
          <p className="room__text">{hostName} cancelled this game before it started.</p>
          <Link to="/" className="room__button room__button--primary">
            Back to lobby
          </Link>
        </section>
      </main>
    </div>
  );
}
