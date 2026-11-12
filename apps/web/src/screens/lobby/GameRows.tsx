import { useId, useState } from "react";
import { MAX_SEATS } from "@monopoly/shared";
import type { LobbyGame, Token } from "@monopoly/shared";
import { useT } from "../../i18n/index.ts";
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
  const t = useT();
  return (
    <span className="lobby__count" aria-label={t("lobby.seatsOf", { count, max: MAX_SEATS })}>
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
  const t = useT();
  const full = game.seatCount >= MAX_SEATS;
  return (
    <li className="lobby__row" data-full={(full && !mine) || undefined}>
      <div className="lobby__row-main">
        <span className="lobby__row-name">{game.name}</span>
        <span className="lobby__row-note">
          {t("lobby.hostedCreated", {
            name: game.ownerName,
            time: timeAgo(game.createdAt, now, t),
          })}
        </span>
      </div>
      <TokenStack tokens={game.tokens} />
      <SeatCount count={game.seatCount} />
      {mine ? (
        <button type="button" className="lobby__button" onClick={() => onOpen(game)}>
          {t("lobby.row.open")}
        </button>
      ) : full ? (
        <button type="button" className="lobby__button" disabled>
          {t("lobby.row.full")}
        </button>
      ) : (
        <button
          type="button"
          className="lobby__button lobby__button--primary"
          disabled={busy}
          aria-label={t("lobby.row.joinLabel", { game: game.name })}
          onClick={() => onJoin(game.id)}
        >
          {t("lobby.row.join")}
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
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const questionId = useId();
  return (
    <li className="lobby__row">
      <div className="lobby__row-main">
        <span className="lobby__row-name">
          {game.name}
          <span className="lobby__status" data-status="saved">
            {t("lobby.status.saved")}
          </span>
        </span>
        <span className="lobby__row-note">
          {t("lobby.youHostSeats", { seats: t("count.seats", { count: game.seatCount }) })}
        </span>
      </div>
      <TokenStack tokens={game.tokens} />
      <SeatCount count={game.seatCount} />
      {confirming ? (
        <div className="lobby__confirm" role="group" aria-labelledby={questionId}>
          <p id={questionId} className="lobby__text">
            {t("lobby.saved.finishQuestion")}
          </p>
          <button
            type="button"
            className="lobby__button"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            {t("lobby.saved.keep")}
          </button>
          <button
            type="button"
            className="lobby__button lobby__button--danger"
            disabled={busy}
            onClick={() => onFinish(game)}
          >
            {t("lobby.saved.finishGame")}
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="lobby__button"
            disabled={busy}
            aria-label={t("lobby.saved.finishLabel", { game: game.name })}
            onClick={() => setConfirming(true)}
          >
            {t("lobby.saved.finish")}
          </button>
          <button
            type="button"
            className="lobby__button lobby__button--primary"
            disabled={busy}
            aria-label={t("lobby.saved.continueLabel", { game: game.name })}
            onClick={() => onContinue(game)}
          >
            {t("lobby.saved.continue")}
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
  const t = useT();
  const waiting = game.status === "waiting";
  const saved = game.status === "saved";
  const host =
    game.ownerName === userName
      ? t("lobby.youHost")
      : t("lobby.hostedBy", { name: game.ownerName });
  const open = waiting || saved;
  return (
    <li className="lobby__row">
      <div className="lobby__row-main">
        <span className="lobby__row-name">
          {game.name}
          <span className="lobby__status" data-status={game.status}>
            {waiting
              ? t("lobby.status.waiting")
              : saved
                ? t("lobby.status.saved")
                : t("lobby.status.inProgress")}
          </span>
        </span>
        <span className="lobby__row-note">
          {t("lobby.myGameNote", { host, count: game.seatCount, max: MAX_SEATS })}
        </span>
      </div>
      <TokenStack tokens={game.tokens} />
      <SeatCount count={game.seatCount} />
      <button
        type="button"
        className="lobby__button"
        aria-label={t(open ? "lobby.row.openLabel" : "lobby.row.resumeLabel", { game: game.name })}
        onClick={() => onOpen(game)}
      >
        {open ? t("lobby.row.open") : t("lobby.row.resume")}
      </button>
    </li>
  );
}
