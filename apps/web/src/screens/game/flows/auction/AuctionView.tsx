import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, Ref } from "react";
import { MIN_RAISE, RAISES, SQUARES, isProperty } from "@monopoly/game-engine";
import { useT } from "../../../../i18n/index.ts";
import { Waiting } from "../../turn/ActionBar.tsx";
import { formatMoney } from "../../turn/format.ts";
import { PropertyCard } from "../../turn/PropertyCard.tsx";
import { Status } from "../../turn/Status.tsx";
import type { Turn } from "../../turn/useTurn.ts";
import { tokenLook } from "../../../../scene/colors.ts";
import { checkBid, minimumBid, quickAdd } from "./bid.ts";
import type { BidCheck } from "./bid.ts";
import "./Auction.css";

type Auction = NonNullable<NonNullable<Turn["view"]["state"]>["auction"]>;

// Keys that can type a non-digit into the bid field. Ctrl and Cmd shortcuts are not blocked.
const BLOCKED_KEYS = new Set([".", ",", "e", "E", "+", "-"]);

// `awaiting_bid` (gameplay 5.1): the bidders take turns in seat order. A pass is final, a bid is
// capped by cash, and there is no timer. The result of the auction shows in the log.
export function AuctionView({ turn, inDialog = false }: { turn: Turn; inDialog?: boolean }) {
  const t = useT();
  const { state, game } = turn.view;
  const auction = state?.auction ?? null;
  const square = auction ? SQUARES[auction.square] : undefined;
  if (!state || !auction) {
    return (
      <div className="auction">
        <Status title={t("turn.auction")} />
        <Waiting turn={turn} />
      </div>
    );
  }

  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? "";
  const seatToken = (id: string) => game?.seats.find((seat) => seat.id === id)?.token ?? "dog";
  const actorCash = state.players.find((p) => p.id === auction.actorId)?.cash ?? 0;
  const table: TableProps = { auction, name, seatToken };

  return (
    <div className="auction" aria-busy={turn.pending || undefined}>
      {/* In the dialog, the dialog title says this. */}
      {!inDialog && (
        <Status title={square ? t("turn.auctionOf", { name: square.name }) : t("turn.auction")} />
      )}
      <div className="auction__top">
        {square && isProperty(square) && <PropertyCard square={square} />}
        {/* The current bid is not shown. This visually hidden region still announces each change. */}
        <div className="auction__sr" aria-live="polite" aria-atomic="true">
          <p>{t("auction.current")}</p>
          <p>
            {auction.highBidderId === null ? t("auction.noBids") : formatMoney(auction.highBid)}
          </p>
          <p>
            {auction.highBidderId === null
              ? t("auction.openingFrom", { min: formatMoney(minimumBid(0)) })
              : t("auction.by", { name: name(auction.highBidderId) })}
          </p>
        </div>
      </div>
      {turn.actor ? (
        <BidForm
          key={`${auction.actorId}:${auction.highBid}`}
          turn={turn}
          table={table}
          cash={actorCash}
          label={
            turn.view.mySeats.length > 1
              ? t("auction.bidOf", { name: turn.actorName })
              : t("auction.yourBid")
          }
        />
      ) : (
        <>
          <BidderTable {...table} />
          <Waiting turn={turn} />
        </>
      )}
      <p className="auction__sending" role="status" aria-live="polite">
        {turn.pending ? t("auction.sending") : ""}
      </p>
    </div>
  );
}

/** The row class of a bidder who has not passed: the leader, the acting bidder, or another bidder. */
function rowKind(auction: Auction, id: string): "leading" | "turn" | "in" {
  if (id === auction.highBidderId) return "leading";
  if (id === auction.actorId) return "turn";
  return "in";
}

interface TableProps {
  auction: Auction;
  name: (id: string) => string;
  seatToken: (id: string) => Parameters<typeof tokenLook>[0];
  /** Set only for the form: the acting row gets the bid controls. */
  controls?: BidControls;
}

/** What the acting row needs for the bid controls. */
interface BidControls {
  baseId: string;
  label: string;
  draft: string;
  highBid: number;
  min: number;
  cash: number;
  check: BidCheck;
  /** True while a send is pending or this device may not bid. */
  busy: boolean;
  inputRef: Ref<HTMLInputElement>;
  onDraft: (value: string) => void;
}

// One row per bidder who has not passed, in bidder order. The bid controls sit only in the row of
// the seat that must act on this device. Other rows, and a device with no acting seat, get the
// read-only table.
function BidderTable({ auction, name, seatToken, controls }: TableProps) {
  const t = useT();
  return (
    <table className="auction__table" aria-label={t("auction.bidders")}>
      <thead>
        <tr>
          <th scope="col">{t("auction.colName")}</th>
          <th scope="col">{t("auction.colLast")}</th>
          <th scope="col">{t("auction.colBid")}</th>
          <th scope="col">{t("auction.colQuick")}</th>
          <th scope="col">
            <span className="auction__sr">{t("auction.colAction")}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {auction.bidderOrder
          .filter((id) => !auction.passed.includes(id))
          .map((id) => {
            const kind = rowKind(auction, id);
            const last: number | undefined = auction.bids[id];
            const row = controls !== undefined && id === auction.actorId ? controls : undefined;
            return (
              <tr
                key={id}
                className={`auction__row auction__row--${kind}`}
                aria-current={kind === "turn" ? "step" : undefined}
              >
                <th scope="row">
                  <div className="auction__name">
                    <span
                      className="auction__dot"
                      style={{ background: tokenLook(seatToken(id)).cssColor }}
                      aria-hidden="true"
                    />
                    <span className="auction__person">{name(id)}</span>
                  </div>
                </th>
                <td data-label={t("auction.colLast")} className="auction__last">
                  {last === undefined ? "–" : formatMoney(last)}
                  {kind === "leading" && (
                    <span className="auction__sr"> {t("auction.leading")}</span>
                  )}
                </td>
                <td data-label={t("auction.colBid")}>{row && <BidField {...row} />}</td>
                <td data-label={t("auction.colQuick")}>{row && <QuickRaises controls={row} />}</td>
                <td>{row && <MakeBidButton controls={row} />}</td>
              </tr>
            );
          })}
      </tbody>
    </table>
  );
}

function BidField({ baseId, label, draft, min, cash, check, inputRef, onDraft }: BidControls) {
  return (
    <>
      <label htmlFor={`${baseId}-amount`} className="auction__sr">
        {label}
      </label>
      <div className="auction__input-wrap">
        <span aria-hidden="true">$</span>
        <input
          id={`${baseId}-amount`}
          ref={inputRef}
          className="auction__input"
          type="number"
          inputMode="numeric"
          min={min}
          max={cash}
          step={1}
          autoComplete="off"
          value={draft}
          onKeyDown={(event) => {
            if (!event.ctrlKey && !event.metaKey && BLOCKED_KEYS.has(event.key)) {
              event.preventDefault();
            }
          }}
          // Only digits stay. A pasted "4.5" becomes "45". The paste replaces the whole value: a
          // number field reports no selection, and the field starts filled with the minimum bid, so
          // adding to it would turn a pasted "20" into "1020". With no digits, the value stays.
          onPaste={(event) => {
            event.preventDefault();
            const digits = event.clipboardData.getData("text").replace(/\D/g, "");
            if (digits !== "") onDraft(digits);
          }}
          onChange={(event) => onDraft(event.target.value.replace(/\D/g, ""))}
          aria-invalid={!check.ok || undefined}
          aria-describedby={`${baseId}-hint${check.ok ? "" : ` ${baseId}-why`}`}
        />
      </div>
      {!check.ok && (
        <p id={`${baseId}-why`} className="auction__why">
          {check.why}
        </p>
      )}
    </>
  );
}

function QuickRaises({ controls }: { controls: BidControls }) {
  const t = useT();
  const { draft, highBid, cash, busy, onDraft } = controls;
  return (
    <div className="auction__quick">
      {RAISES.map((raise) => {
        const next = quickAdd(draft, raise, highBid, cash);
        return (
          <button
            key={raise}
            type="button"
            className="turn-area__btn turn-area__btn--outline"
            disabled={busy || !next.ok}
            aria-label={t("auction.quickLabel", {
              raise: `+${formatMoney(raise)}`,
              target: formatMoney(next.amount),
            })}
            onClick={() => onDraft(String(next.amount))}
          >
            +{formatMoney(raise)}
          </button>
        );
      })}
    </div>
  );
}

function MakeBidButton({ controls }: { controls: BidControls }) {
  const t = useT();
  const { baseId, check, busy } = controls;
  return (
    <button
      type="submit"
      className="turn-area__btn turn-area__btn--primary"
      disabled={busy || !check.ok}
      // The name keeps the visible words and adds the amount: "Make a bid of $40".
      aria-label={
        check.ok ? t("auction.makeBidFor", { amount: formatMoney(check.amount) }) : undefined
      }
      aria-describedby={check.ok ? undefined : `${baseId}-why`}
    >
      {t("auction.makeBid")}
    </button>
  );
}

interface BidFormProps {
  turn: Turn;
  table: TableProps;
  cash: number;
  label: string;
}

// Keyed by the bidder and the best bid, so a new turn to bid starts with the lowest valid bid
// and takes the focus.
function BidForm({ turn, table, cash, label }: BidFormProps) {
  const t = useT();
  const { highBid } = table.auction;
  const min = minimumBid(highBid);
  const [draft, setDraft] = useState(String(min));
  const input = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const check = checkBid(draft, highBid, cash, t);
  const canBid = turn.can("Bid");

  useEffect(() => {
    input.current?.focus();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (check.ok && canBid && !turn.pending) turn.send({ type: "Bid", amount: check.amount });
  }

  const hint =
    highBid === 0
      ? t("auction.hintOpening", { min: formatMoney(minimumBid(0)) })
      : t("auction.hintRaise", { min: formatMoney(MIN_RAISE) });

  const controls: BidControls = {
    baseId,
    label,
    draft,
    highBid,
    min,
    cash,
    check,
    busy: turn.pending || !canBid,
    inputRef: input,
    onDraft: setDraft,
  };

  return (
    <form className="auction__form" onSubmit={submit} noValidate>
      <p className="auction__cash">
        {t("auction.youHave", { name: turn.actorName, cash: formatMoney(cash) })}
      </p>
      <BidderTable {...table} controls={controls} />
      <p id={`${baseId}-hint`} className="auction__hint">
        {hint}
      </p>
      <div className="auction__pass">
        <button
          type="button"
          className="turn-area__btn turn-area__btn--outline"
          disabled={turn.pending || !turn.can("PassBid")}
          aria-describedby={`${baseId}-pass`}
          onClick={() => turn.send({ type: "PassBid" })}
        >
          {t("auction.pass")}
        </button>
        <p id={`${baseId}-pass`} className="auction__hint">
          {t("auction.passFinal")}
        </p>
      </div>
    </form>
  );
}
