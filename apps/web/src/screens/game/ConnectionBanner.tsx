import { useGameSelector } from "../../game/index.ts";
import "./ConnectionBanner.css";

// The connection of this device, not of the other players (design board "Away and connection").
// Another player who is away shows in the rail and in the board centre. A connection that is
// opening or open shows nothing.
export function ConnectionBanner() {
  const connection = useGameSelector((s) => s.connection);
  if (connection !== "reconnecting" && connection !== "closed") return null;
  const closed = connection === "closed";
  return (
    <div className="conn-banner" data-connection={connection} role="status">
      <span className="conn-banner__dot" aria-hidden="true" />
      <span>
        <b>{closed ? "Connection closed." : "Reconnecting…"}</b>{" "}
        {closed
          ? "Reload the page to return to the game."
          : "Your moves wait until the connection returns."}
      </span>
    </div>
  );
}
