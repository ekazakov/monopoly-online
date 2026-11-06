import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { GameResult, Seat, Standing, Token } from "@monopoly/shared";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { gameResultQuery } from "../../game/index.ts";
import { AvatarIcon } from "../game/rail/avatars.tsx";
import { tokenLook } from "../../scene/colors.ts";
import { formatMoney } from "../game/rail/PlayerRow.tsx";
import "./GameResultScreen.css";

export interface GameResultScreenProps {
  gameId: string;
  /** The seats of the room: the standings carry no seat order, so the colours come from here. */
  seats: readonly Seat[];
  userId: string;
}

// The result of a finished game (design board "Game result"). It reads the result from the
// server, so a reload shows the same screen. Focus goes to the heading when the content shows.
export function GameResultScreen({ gameId, seats, userId }: GameResultScreenProps) {
  const result = useQuery(gameResultQuery(gameId));
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Runs when the content changes: loaded, failed, or loaded after a retry.
  const status = result.status;
  useEffect(() => {
    if (status !== "pending") headingRef.current?.focus();
  }, [status]);

  const home = () => void navigate({ to: "/" });
  // A failed refetch keeps the old data, so the error shows only when there is no result.
  const tryAgain = () => void result.refetch();

  if (result.isPending) return <Loading />;
  if (!result.data) {
    return (
      <main className="result" aria-labelledby="result-title">
        <div className="result__card">
          <h1
            id="result-title"
            className="result__title result__title--error"
            ref={headingRef}
            tabIndex={-1}
          >
            Result not available
          </h1>
          <p className="result__error" role="alert">
            <ErrorIcon />
            We could not load the result. Check the connection and try again.
          </p>
          <div className="result__actions">
            <button
              type="button"
              className="result__button result__button--primary"
              onClick={tryAgain}
            >
              Try again
            </button>
            <button type="button" className="result__button" onClick={home}>
              Back to home
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="result" aria-labelledby="result-title">
      <div className="result__card">
        <Summary result={result.data} headingRef={headingRef} />
        <h2 className="result__subtitle">Final standings</h2>
        <Standings result={result.data} seats={seats} userId={userId} />
        <div className="result__actions">
          <button type="button" className="result__button result__button--primary" onClick={home}>
            Back to home
          </button>
        </div>
      </div>
    </main>
  );
}

function Summary({
  result,
  headingRef,
}: {
  result: GameResult;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const rounds = result.rounds === 1 ? "1 round" : `${result.rounds} rounds`;
  return (
    <header className="result__summary">
      <div className="result__eyebrow">Game over</div>
      <h1 id="result-title" className="result__title" ref={headingRef} tabIndex={-1}>
        {result.winner ? `${result.winner.name} wins` : "Game finished"}
      </h1>
      <p className="result__rounds">
        {result.winner
          ? `Last player left after ${rounds}.`
          : `Finished by ${result.finishedBy ?? "the owner"} after ${rounds}.`}
      </p>
    </header>
  );
}

function Standings({
  result,
  seats,
  userId,
}: {
  result: GameResult;
  seats: readonly Seat[];
  userId: string;
}) {
  const tokenOf = (seatId: string) => seats.find((seat) => seat.id === seatId)?.token ?? "dog";
  return (
    <div className="result__scroll">
      <table className="result__table">
        <caption className="result__sr">Final standings</caption>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Player</th>
            <th scope="col" className="result__num">
              Final cash
            </th>
            <th scope="col" className="result__num">
              Properties
            </th>
            <th scope="col" className="result__num">
              Net worth
            </th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {result.standings.map((standing) => (
            <Row
              key={standing.seatId}
              standing={standing}
              token={tokenOf(standing.seatId)}
              onDevice={standing.controllerUserId === userId}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  standing,
  token,
  onDevice,
}: {
  standing: Standing;
  token: Token;
  onDevice: boolean;
}) {
  const look = tokenLook(token);
  const out = standing.status !== "winner";
  const figures = [standing.cash, standing.properties, standing.netWorth];
  return (
    <tr className="result__row" data-winner={!out || undefined}>
      <th scope="row" className="result__rank">
        {standing.rank}
      </th>
      <td>
        <div className="result__player">
          <span
            className="result__avatar"
            role="img"
            aria-label={`${standing.name}, ${look.label}`}
            style={{ borderColor: look.cssColor }}
          >
            <AvatarIcon kind={look.avatar} size={26} />
          </span>
          <span className="result__name">
            {standing.name}
            {onDevice && <span className="result__tag">This device</span>}
          </span>
        </div>
      </td>
      {figures.map((value, index) => (
        <td key={index} className="result__num" data-strong={!out || undefined}>
          {out ? (
            <>
              <span aria-hidden="true">—</span>
              <span className="result__sr">none</span>
            </>
          ) : index === 1 ? (
            value
          ) : (
            formatMoney(value)
          )}
        </td>
      ))}
      <td className="result__status">
        <StatusLabel standing={standing} />
      </td>
    </tr>
  );
}

function StatusLabel({ standing }: { standing: Standing }) {
  const { status, outRound } = standing;
  if (status === "winner") {
    return (
      <span className="result__status-label result__status-label--winner">
        <CrownIcon />
        Winner
      </span>
    );
  }
  const bankrupt = status === "bankrupt";
  return (
    <span className="result__status-label result__status-label--out">
      {bankrupt ? <BankruptIcon /> : <ResignedIcon />}
      {bankrupt ? "Bankrupt" : "Resigned"} · round {outRound}
    </span>
  );
}

function Loading() {
  return (
    <main className="result" aria-label="Game result">
      <div className="result__card" role="status" aria-live="polite" aria-busy="true">
        <div className="result__skeleton-head" aria-hidden="true">
          <span className="result__block result__block--title" />
          <span className="result__block result__block--line" />
        </div>
        <div className="result__loading-text">Loading the result…</div>
        <div aria-hidden="true">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="result__skeleton-row">
              <span className="result__block result__block--avatar" />
              <span className="result__block result__block--name" />
              <span className="result__spacer" />
              <span className="result__block result__block--cell" />
              <span className="result__block result__block--cell-s" />
              <span className="result__block result__block--cell" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

const icon = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  className: "result__icon",
} as const;

const CrownIcon = () => (
  <svg {...icon}>
    <path d="M4 18h16M5 18L3.5 7.5l5 4L12 5l3.5 6.5 5-4L19 18" />
  </svg>
);
const BankruptIcon = () => (
  <svg {...icon}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 8l8 8M16 8l-8 8" />
  </svg>
);
const ResignedIcon = () => (
  <svg {...icon}>
    <path d="M6 21V4M6 5h11l-2 4 2 4H6" />
  </svg>
);
const ErrorIcon = () => (
  <svg {...icon}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6M12 16.5v.5" />
  </svg>
);
