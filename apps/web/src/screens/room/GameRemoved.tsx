import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

/**
 * What a player sees when the host removes them before the start (board LobbyStates, "Guest ·
 * removed by host"). The room is closed to them, so this takes the place of the room.
 */
export function GameRemoved({ hostName }: { hostName: string }) {
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
            {hostName} removed you
          </h1>
          <p className="room__text">
            {hostName} removed you before the game started. You can join another open game, or this
            one again with its link.
          </p>
          <Link to="/" className="room__button room__button--primary">
            Back to lobby
          </Link>
        </section>
      </main>
    </div>
  );
}
