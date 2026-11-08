import { MAX_SEATS, type Game, type Seat } from "@monopoly/shared";
import { useState } from "react";
import { tokenLook } from "../../scene/colors.ts";
import { AvatarIcon } from "../game/rail/avatars.tsx";
import { RemovePlayer } from "./RemovePlayer.tsx";
import { seatLabels } from "./roomModel.ts";

// Names who joined or left since the last room, for the polite live region.
function describeChange(before: Seat[], after: Seat[]): string {
  const ids = new Set(before.map((s) => s.id));
  const now = new Set(after.map((s) => s.id));
  const joined = after.filter((s) => !ids.has(s.id)).map((s) => `${s.name} joined`);
  const left = before.filter((s) => !now.has(s.id)).map((s) => `${s.name} left`);
  return [...joined, ...left].join(". ");
}

export function useSeatAnnouncement(seats: Seat[]): string {
  const [state, setState] = useState({ seats, text: "" });
  // Adjusting state while rendering keeps the text in step with the room, with no effect.
  if (state.seats !== seats) {
    const text = describeChange(state.seats, seats);
    setState({ seats, text: text || state.text });
  }
  return state.text;
}

interface Props {
  game: Game;
  userId: string;
  removingId: string | null;
  onRemove: (seat: Seat) => void;
  /** The id of the user whose removal is on its way. */
  removingPlayerId: string | null;
  onRemovePlayer: (seat: Seat) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}

export function SeatList({
  game,
  userId,
  removingId,
  onRemove,
  removingPlayerId,
  onRemovePlayer,
  headingRef,
}: Props) {
  const announcement = useSeatAnnouncement(game.seats);
  // A saved game is the restore room: each seat is back or not, and nobody joins or is invited.
  const saved = game.status === "saved";
  // An invite does not hold a seat, but an invited player will take one. The row of the invite
  // stands in for an open seat, so the list keeps its length of six rows.
  const empty = Array.from({
    length: saved ? 0 : Math.max(0, MAX_SEATS - game.seats.length - game.invites.length),
  });
  return (
    <section className="room__panel" aria-labelledby="room-players">
      <div className="room__panel-head">
        <h2 id="room-players" className="room__h2" ref={headingRef} tabIndex={-1}>
          Players
        </h2>
        <span className="room__count">{game.seats.length} of 6 seats</span>
      </div>
      <ul className="room__seats">
        {game.seats.map((seat) => {
          const labels = seatLabels(game, seat, userId);
          return (
            <li key={seat.id} className="room__seat">
              <span
                role="img"
                className="room__avatar"
                aria-label={`${seat.name}, ${tokenLook(seat.token).label}`}
                style={{ borderColor: tokenLook(seat.token).cssColor }}
              >
                <AvatarIcon kind={seat.token} size={26} />
              </span>
              <span className="room__seat-main">
                <span className="room__seat-name">{seat.name}</span>
                {labels.host && <span className="room__tag room__tag--host">Host</span>}
                {labels.you && <span className="room__tag">You</span>}
                {labels.thisDevice && <span className="room__tag">This device</span>}
                {saved ? (
                  <span className="room__seat-note" data-back={seat.claimed || undefined}>
                    {seat.claimed ? "Back" : "Not back yet"}
                  </span>
                ) : (
                  <span className="room__seat-note">{labels.note}</span>
                )}
              </span>
              {labels.playerRemovable && (
                <RemovePlayer
                  name={seat.name}
                  alsoRemoves={game.seats
                    .filter((s) => s.kind === "hotseat" && s.controllerUserId === seat.userId)
                    .map((s) => s.name)}
                  pending={removingPlayerId === seat.userId}
                  onRemove={() => onRemovePlayer(seat)}
                />
              )}
              {labels.removable && (
                <button
                  type="button"
                  className="room__button room__button--quiet"
                  onClick={() => onRemove(seat)}
                  aria-disabled={removingId === seat.id || undefined}
                  aria-label={`Remove ${seat.name}`}
                >
                  Remove
                </button>
              )}
            </li>
          );
        })}
        {(saved ? [] : game.invites).map((invite) => (
          <li key={invite.id} className="room__seat room__seat--invite">
            {/* An invite has no token yet: a plain disc with the initial of the name. */}
            <span className="room__avatar room__avatar--invite" aria-hidden="true">
              {invite.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="room__seat-main">
              <span className="room__seat-name">{invite.name}</span>
              <span className="room__tag">Invited</span>
              <span className="room__seat-note">Invited · waiting to accept</span>
            </span>
          </li>
        ))}
        {empty.map((_, index) => (
          <li key={`open-${index}`} className="room__seat room__seat--open">
            Open seat
          </li>
        ))}
      </ul>
      <p className="room__sr" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
