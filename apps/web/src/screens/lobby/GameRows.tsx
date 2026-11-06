import { useId, useState } from "react";
import { MAX_SEATS } from "@monopoly/shared";
import type { LobbyGame, Token } from "@monopoly/shared";
import { tokenLook } from "../../scene/colors.ts";
import { AvatarIcon } from "../game/rail/avatars.tsx";
import { timeAgo } from "./time.ts";

/** The figures that sit at the table, as overlapping discs with the colour ring of each token. */
export function TokenStack({ tokens }: { tokens: readonly Token[] }) {
  return (
    <span className="lobby__tokens" aria-hidden="true">
      {tokens.map((token) => (
        <span
          key={token}
          className="lobby__token"
          style={{ borderColor: tokenLook(token).cssColor }}
        >
          <AvatarIcon kind={token} size={21} />
        </span>
      ))}
    </span>
  );
}

/** "2 / 6", read as "2 of 6 seats". */
export function SeatCount({ count }: { count: number }) {
  return (
    <span className="lobby__count" aria-label={`${count} of ${MAX_SEATS} seats`}>
      {count} / {MAX_SEATS}
    </span>
  );
}

export interface OpenGameRowProps {
  game: LobbyGame;
  now: number;
  /** The user has a seat: the action is Open, not Join. */
  mine: boolean;
  busy: boolean;
  onJoin: (gameId: string) => void;
  onOpen: (game: LobbyGame) => void;
}

/** One row of Open games: Join, Open for a game the user is in, or Full. */
export function OpenGameRow({ game, now, mine, busy, onJoin, onOpen }: OpenGameRowProps) {
  const full = game.seatCount >= MAX_SEATS;
  return (
    <li className="lobby__row" data-full={(full && !mine) || undefined}>
      <div className="lobby__row-main">
        <span className="lobby__row-name">{game.name}</span>
        <span className="lobby__row-note">
          Hosted by {game.ownerName} · created {timeAgo(game.createdAt, now)}
        </span>
      </div>
      <TokenStack tokens={game.tokens} />
      <SeatCount count={game.seatCount} />
      {mine ? (
        <button type="button" className="lobby__button" onClick={() => onOpen(game)}>
          Open
        </button>
      ) : full ? (
        <button type="button" className="lobby__button" disabled>
          Full
        </button>
      ) : (
        <button
          type="button"
          className="lobby__button lobby__button--primary"
          disabled={busy}
          aria-label={`Join ${game.name}`}
          onClick={() => onJoin(game.id)}
        >
          Join
        </button>
      )}
    </li>
  );
}

/** One row of Saved games, for the owner (board SavedGames): Continue, or Finish with a confirm. */
export function SavedGameRow({
  game,
  busy,
  onContinue,
  onFinish,
}: {
  game: LobbyGame;
  /** A Continue or a Finish is on its way for some game. */
  busy: boolean;
  onContinue: (game: LobbyGame) => void;
  onFinish: (game: LobbyGame) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const questionId = useId();
  return (
    <li className="lobby__row">
      <div className="lobby__row-main">
        <span className="lobby__row-name">
          {game.name}
          <span className="lobby__status" data-status="saved">
            Saved
          </span>
        </span>
        <span className="lobby__row-note">
          You are the host · {game.seatCount} {game.seatCount === 1 ? "seat" : "seats"}
        </span>
      </div>
      <TokenStack tokens={game.tokens} />
      <SeatCount count={game.seatCount} />
      {confirming ? (
        <div className="lobby__confirm" role="group" aria-labelledby={questionId}>
          <p id={questionId} className="lobby__text">
            Finish this game with no winner? You cannot undo this.
          </p>
          <button
            type="button"
            className="lobby__button"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            Keep game
          </button>
          <button
            type="button"
            className="lobby__button lobby__button--danger"
            disabled={busy}
            onClick={() => onFinish(game)}
          >
            Finish game
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="lobby__button"
            disabled={busy}
            aria-label={`Finish ${game.name}`}
            onClick={() => setConfirming(true)}
          >
            Finish
          </button>
          <button
            type="button"
            className="lobby__button lobby__button--primary"
            disabled={busy}
            aria-label={`Continue ${game.name}`}
            onClick={() => onContinue(game)}
          >
            Continue
          </button>
        </>
      )}
    </li>
  );
}

/** One row of My games: Open for a waiting room or a saved game, Resume for a game in progress. */
export function MyGameRow({
  game,
  userName,
  onOpen,
}: {
  game: LobbyGame;
  userName: string;
  onOpen: (game: LobbyGame) => void;
}) {
  const waiting = game.status === "waiting";
  const saved = game.status === "saved";
  const host = game.ownerName === userName ? "You are the host" : `Hosted by ${game.ownerName}`;
  return (
    <li className="lobby__row">
      <div className="lobby__row-main">
        <span className="lobby__row-name">
          {game.name}
          <span className="lobby__status" data-status={game.status}>
            {waiting ? "Waiting" : saved ? "Saved" : "In progress"}
          </span>
        </span>
        <span className="lobby__row-note">
          {host} · {game.seatCount} of {MAX_SEATS} seats
        </span>
      </div>
      <TokenStack tokens={game.tokens} />
      <SeatCount count={game.seatCount} />
      <button
        type="button"
        className="lobby__button"
        aria-label={`${waiting || saved ? "Open" : "Resume"} ${game.name}`}
        onClick={() => onOpen(game)}
      >
        {waiting || saved ? "Open" : "Resume"}
      </button>
    </li>
  );
}
