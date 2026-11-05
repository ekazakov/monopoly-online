import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { SQUARES, isProperty } from "@monopoly/game-engine";
import { Waiting } from "../../turn/ActionBar.tsx";
import { formatMoney } from "../../turn/format.ts";
import { PropertyCard } from "../../turn/PropertyCard.tsx";
import { Status } from "../../turn/Status.tsx";
import type { Turn } from "../../turn/useTurn.ts";
import { tokenLook } from "../../../../scene/colors.ts";
import { checkBid, minimumBid, raiseList, raiseTargets } from "./bid.ts";
import "./Auction.css";

type Auction = NonNullable<NonNullable<Turn["view"]["state"]>["auction"]>;

// `awaiting_bid` (gameplay 5.1): the bidders take turns in seat order. A pass is final, a bid is
// capped by cash, and there is no timer. The result of the auction shows in the log.
export function AuctionView({ turn }: { turn: Turn }) {
  const { state, game } = turn.view;
  const auction = state?.auction ?? null;
  const square = auction ? SQUARES[auction.square] : undefined;
  if (!state || !auction) {
    return (
      <div className="auction">
        <Status title="Auction" />
        <Waiting name={turn.actorName} />
      </div>
    );
  }

  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? "";
  const seatToken = (id: string) => game?.seats.find((seat) => seat.id === id)?.token ?? "dog";
  const mine = new Set(turn.view.mySeats.map((seat) => seat.id));
  const actorCash = state.players.find((p) => p.id === auction.actorId)?.cash ?? 0;

  return (
    <div className="auction" aria-busy={turn.pending || undefined}>
      <Status title={square ? `Auction: ${square.name}` : "Auction"} />
      <div className="auction__top">
        {square && isProperty(square) && <PropertyCard square={square} />}
        <div className="auction__high" aria-live="polite" aria-atomic="true">
          <p className="auction__label">Current bid</p>
          <p className="auction__amount">
            {auction.highBidderId === null ? "No bids" : formatMoney(auction.highBid)}
          </p>
          <p className="auction__by">
            {auction.highBidderId === null
              ? `Opening bid from ${formatMoney(minimumBid(0))}`
              : `by ${name(auction.highBidderId)}`}
          </p>
        </div>
      </div>
      <ul className="auction__bidders" aria-label="Bidders">
        {auction.bidderOrder.map((id) => {
          const status = bidderStatus(auction, id);
          return (
            <li
              key={id}
              className={`auction__bidder auction__bidder--${status.kind}`}
              aria-current={status.kind === "turn" ? "step" : undefined}
            >
              <span
                className="auction__dot"
                style={{ background: tokenLook(seatToken(id)).cssColor }}
                aria-hidden="true"
              />
              <span className="auction__name">
                {name(id)}
                {mine.has(id) && <span className="auction__device"> · this device</span>}
              </span>
              <span className="auction__state">{status.text}</span>
            </li>
          );
        })}
      </ul>
      {turn.actor ? (
        <BidForm
          key={`${auction.actorId}:${auction.highBid}`}
          turn={turn}
          auction={auction}
          cash={actorCash}
          label={turn.view.mySeats.length > 1 ? `${turn.actorName}'s bid` : "Your bid"}
        />
      ) : (
        <Waiting name={turn.actorName} />
      )}
      <p className="auction__sending" role="status" aria-live="polite">
        {turn.pending ? "Sending…" : ""}
      </p>
    </div>
  );
}

function bidderStatus(auction: Auction, id: string) {
  if (auction.passed.includes(id)) return { kind: "passed", text: "Passed" } as const;
  if (id === auction.highBidderId) return { kind: "leading", text: "Leading" } as const;
  if (id === auction.actorId) return { kind: "turn", text: "To bid" } as const;
  return { kind: "in", text: "In" } as const;
}

interface BidFormProps {
  turn: Turn;
  auction: Auction;
  cash: number;
  label: string;
}

// Keyed by the bidder and the best bid, so a new turn to bid starts with the lowest valid bid
// and takes the focus.
function BidForm({ turn, auction, cash, label }: BidFormProps) {
  const { highBid } = auction;
  const [draft, setDraft] = useState(String(minimumBid(highBid)));
  const input = useRef<HTMLInputElement>(null);
  const base = useId();
  const check = checkBid(draft, highBid, cash);
  const canBid = turn.can("Bid");

  useEffect(() => {
    input.current?.focus();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (check.ok && canBid) turn.send({ type: "Bid", amount: check.amount });
  }

  const hint =
    highBid === 0
      ? `Opening bid: at least ${formatMoney(minimumBid(0))}.`
      : `Raise the best bid by ${raiseList()}.`;

  return (
    <form className="auction__form" onSubmit={submit} noValidate>
      <p className="auction__cash">
        {turn.actorName}, you have {formatMoney(cash)}
      </p>
      <div className="auction__field">
        <label htmlFor={`${base}-amount`} className="auction__field-label">
          {label}
        </label>
        <div className="auction__input-wrap">
          <span aria-hidden="true">$</span>
          <input
            id={`${base}-amount`}
            ref={input}
            className="auction__input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-invalid={!check.ok || undefined}
            aria-describedby={`${base}-hint${check.ok ? "" : ` ${base}-why`}`}
          />
        </div>
      </div>
      <div className="auction__raises" role="group" aria-label="Quick bids">
        {raiseTargets(highBid).map(({ raise, target }) => (
          <button
            key={raise}
            type="button"
            className="turn-area__btn turn-area__btn--outline"
            disabled={turn.pending || !canBid || target > cash}
            aria-label={`${highBid === 0 ? "" : "+"}${formatMoney(raise)}, bid ${formatMoney(target)}`}
            onClick={() => setDraft(String(target))}
          >
            {highBid === 0 ? "" : "+"}
            {formatMoney(raise)}
          </button>
        ))}
      </div>
      <p id={`${base}-hint`} className="auction__hint">
        {hint}
      </p>
      {!check.ok && (
        <p id={`${base}-why`} className="auction__why">
          {check.why}
        </p>
      )}
      <div className="turn-area__actions">
        <button
          type="submit"
          className="turn-area__btn turn-area__btn--primary"
          disabled={turn.pending || !canBid || !check.ok}
          aria-describedby={check.ok ? undefined : `${base}-why`}
        >
          {check.ok ? `Bid ${formatMoney(check.amount)}` : "Bid"}
        </button>
        <button
          type="button"
          className="turn-area__btn turn-area__btn--outline"
          disabled={turn.pending || !turn.can("PassBid")}
          aria-describedby={`${base}-pass`}
          onClick={() => turn.send({ type: "PassBid" })}
        >
          Pass
        </button>
      </div>
      <p id={`${base}-pass`} className="auction__hint">
        A pass is final: you cannot bid again in this auction.
      </p>
    </form>
  );
}
