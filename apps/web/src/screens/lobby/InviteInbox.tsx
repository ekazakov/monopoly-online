import type { Invite } from "@monopoly/shared";
import { useId } from "react";
import { timeAgo } from "./time.ts";

export interface InviteInboxProps {
  invites: readonly Invite[];
  now: number;
  /** The id of the invite that is being answered, if any. */
  busyId: string | null;
  onAccept: (invite: Invite) => void;
  onDecline: (invite: Invite) => void;
}

/** The invites of the user, live. It is not drawn when there is none. */
export function InviteInbox({ invites, now, busyId, onAccept, onDecline }: InviteInboxProps) {
  const headingId = useId();
  if (invites.length === 0) return null;
  return (
    <section className="lobby__panel lobby__panel--alert" aria-labelledby={headingId}>
      <div className="lobby__panel-head">
        <h2 id={headingId}>Invites</h2>
        <span
          className="lobby__badge"
          aria-label={`${invites.length} new ${invites.length === 1 ? "invite" : "invites"}`}
        >
          {invites.length}
        </span>
      </div>
      <ul className="lobby__list" aria-label="Invites" aria-live="polite">
        {invites.map((invite) => (
          <li key={invite.id} className="lobby__row">
            {/* The invite has the name of the host but not the token of the host. */}
            <span className="lobby__initial" aria-hidden="true">
              {invite.hostName.slice(0, 1).toUpperCase()}
            </span>
            <div className="lobby__row-main">
              <span className="lobby__row-name">{invite.hostName} invited you</span>
              <span className="lobby__row-note">
                {invite.gameName} · {timeAgo(invite.createdAt, now)}
              </span>
            </div>
            <div className="lobby__actions">
              <button
                type="button"
                className="lobby__button"
                disabled={busyId === invite.id}
                aria-label={`Decline the invite to ${invite.gameName}`}
                onClick={() => onDecline(invite)}
              >
                Decline
              </button>
              <button
                type="button"
                className="lobby__button lobby__button--primary"
                disabled={busyId === invite.id}
                aria-label={`Accept the invite to ${invite.gameName}`}
                onClick={() => onAccept(invite)}
              >
                Accept
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
