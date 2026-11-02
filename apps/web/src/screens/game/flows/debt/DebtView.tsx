import { useEffect, useId, useRef, useState } from "react";
import type { RedactedGameState } from "@monopoly/shared";
import { useGameActions } from "../../../../game/index.ts";
import { ActionBar } from "../../turn/ActionBar.tsx";
import type { CentrePhaseProps } from "../../turn/centrePhases.ts";
import { formatMoney } from "../../turn/format.ts";
import { Status } from "../../turn/Status.tsx";
import type { Turn } from "../../turn/useTurn.ts";
import {
  consequenceText,
  creditorName,
  raiseOptions,
  reasonLabel,
  summarizeDebt,
} from "./debtModel.ts";
import type { DebtSummary, RaiseOption } from "./debtModel.ts";
import "./DebtView.css";

type State = RedactedGameState;

const debtLabel = (state: State, debt: DebtSummary["first"]) =>
  `${reasonLabel(debt.reason)} to ${creditorName(state, debt.creditor)}`;

// `awaiting_debt`: the player on turn owes money that their cash does not cover. The assets do
// (the engine declares the bankruptcy at once when they do not), so the player raises cash by
// selling buildings and mortgaging, then pays. Devices with no seat that may act only watch.
export function DebtView({ turn }: CentrePhaseProps) {
  const { state } = turn.view;
  const summary = state ? summarizeDebt(state) : null;

  if (!state || !summary || !turn.actor) return <DebtWatch turn={turn} summary={summary} />;
  return <DebtorPanel turn={turn} state={state} summary={summary} />;
}

function DebtWatch({ turn, summary }: { turn: Turn; summary: DebtSummary | null }) {
  const { state } = turn.view;
  const name = summary?.debtorName ?? turn.actorName;
  return (
    <div className="debt-view">
      <Status
        title="Debt to settle"
        sub={
          state && summary
            ? `${debtLabel(state, summary.first)}: ${formatMoney(summary.first.amount)}`
            : undefined
        }
      />
      <p className="turn-area__waiting">
        <span className="turn-area__spinner" aria-hidden="true" />
        {name ? `Waiting for ${name} to settle a debt` : "Waiting for the game"}
      </p>
    </div>
  );
}

function DebtorPanel({ turn, state, summary }: { turn: Turn; state: State; summary: DebtSummary }) {
  const { first, later, shortfall, cash, debtorName } = summary;
  const short = shortfall > 0;
  const laterTotal = later.reduce((sum, debt) => sum + debt.amount, 0);
  const [confirming, setConfirming] = useState(false);
  const [declined, setDeclined] = useState(false);
  const shared = turn.view.mySeats.length > 1;

  return (
    <div className="debt-view">
      <div className="debt-view__head">
        {shared && <span className="debt-view__label">{debtorName} owes</span>}
        <span className="debt-view__label">{debtLabel(state, first)}</span>
        <span className="debt-view__amount">{formatMoney(first.amount)}</span>
        <span className="debt-view__cash">Cash {formatMoney(cash)}</span>
      </div>
      <p
        className={`debt-view__short${short ? "" : " debt-view__short--ok"}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {short ? `Still short by ${formatMoney(shortfall)}` : "Your cash covers it"}
      </p>
      {later.length > 0 && (
        <p className="turn-area__sub">
          After this you owe {formatMoney(laterTotal)} more ({later.length}{" "}
          {later.length === 1 ? "debt" : "debts"}).
        </p>
      )}

      {confirming ? (
        <BankruptcyConfirm
          turn={turn}
          text={consequenceText(state, summary.debtorId)}
          onCancel={() => {
            setDeclined(true);
            setConfirming(false);
          }}
        />
      ) : (
        <>
          <ActionBar
            turn={turn}
            actions={[
              {
                label: `Pay ${formatMoney(first.amount)}`,
                action: { type: "PayDebt" },
                primary: true,
                why: short ? `Raise ${formatMoney(shortfall)} more first.` : undefined,
              },
            ]}
          />
          {short && <RaiseCash turn={turn} state={state} summary={summary} />}
          {summary.hopeless && (
            <p className="turn-area__sub">
              Your assets cannot cover this debt, even if you sell everything.
            </p>
          )}
          <BankruptcyStart
            turn={turn}
            focusOnMount={declined}
            onStart={() => setConfirming(true)}
          />
        </>
      )}
    </div>
  );
}

function RaiseCash({ turn, state, summary }: { turn: Turn; state: State; summary: DebtSummary }) {
  const { options, hiddenMortgages } = raiseOptions(state, summary.debtorId);
  const base = useId();

  return (
    <section className="debt-view__raise" aria-label="Raise cash">
      <h3 className="debt-view__raise-title">Raise cash</h3>
      {options.length === 0 ? (
        <p className="debt-view__none">You have nothing left to sell or mortgage.</p>
      ) : (
        <ul className="debt-view__rows">
          {options.map((option) => (
            <RaiseRow key={option.key} turn={turn} option={option} id={`${base}-${option.key}`} />
          ))}
        </ul>
      )}
      {hiddenMortgages > 0 && (
        <p className="debt-view__note">
          Sell the buildings of a colour group before you mortgage it.
        </p>
      )}
    </section>
  );
}

function RaiseRow({ turn, option, id }: { turn: Turn; option: RaiseOption; id: string }) {
  const sell = option.kind === "sell";
  const type = sell ? "SellBuilding" : "Mortgage";
  const money = formatMoney(option.amount);

  return (
    <li className="debt-view__row">
      <span
        className="debt-view__swatch"
        style={{ background: `var(--hf-street-${option.group})` }}
        aria-hidden="true"
      />
      <span className="debt-view__what">
        <strong>{option.name}</strong>
        <span id={id}>{option.refusal ?? (sell ? `Has ${option.detail}` : "Mortgage value")}</span>
      </span>
      <button
        type="button"
        className="turn-area__btn turn-area__btn--outline turn-area__btn--small"
        disabled={turn.pending || option.refusal !== null || !turn.can(type)}
        aria-label={
          sell
            ? `Sell one building on ${option.name} for ${money}`
            : `Mortgage ${option.name} for ${money}`
        }
        aria-describedby={id}
        onClick={() => turn.send({ type, square: option.square })}
      >
        {sell ? "Sell" : "Mortgage"} +{money}
      </button>
    </li>
  );
}

// Back from the confirm step, the keyboard focus returns to the button that opened it.
function BankruptcyStart({
  turn,
  focusOnMount,
  onStart,
}: {
  turn: Turn;
  focusOnMount: boolean;
  onStart: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);

  return (
    <button
      ref={ref}
      type="button"
      className="turn-area__btn turn-area__btn--outline debt-view__danger"
      disabled={turn.pending}
      onClick={onStart}
    >
      Declare bankruptcy
    </button>
  );
}

// The engine has no separate bankruptcy action: `Resign` is a bankruptcy to the creditors, or to
// the bank when no debt is owed to a player. It goes as the seat that owes the debt, not as the
// first seat of the device that "may" resign, because any seat may.
function BankruptcyConfirm({
  turn,
  text,
  onCancel,
}: {
  turn: Turn;
  text: string;
  onCancel: () => void;
}) {
  const actions = useGameActions();
  const titleId = useId();
  const seatId = turn.actor?.id;
  const keep = useRef<HTMLButtonElement>(null);
  // The safe choice gets the focus when the step opens.
  useEffect(() => keep.current?.focus(), []);

  return (
    <div className="debt-view__confirm" role="group" aria-labelledby={titleId}>
      <p className="debt-view__confirm-title" id={titleId}>
        Declare bankruptcy?
      </p>
      <p className="debt-view__confirm-text">{text}</p>
      <p className="debt-view__confirm-text">This cannot be undone.</p>
      <div className="turn-area__actions">
        <button
          type="button"
          className="turn-area__btn turn-area__btn--outline"
          onClick={onCancel}
          ref={keep}
        >
          Keep playing
        </button>
        <button
          type="button"
          className="turn-area__btn turn-area__btn--outline debt-view__danger"
          disabled={turn.pending || !seatId}
          onClick={() => {
            if (!seatId || turn.pending) return;
            void Promise.resolve(actions.send({ type: "Resign" }, { seatId })).catch(() => {});
          }}
        >
          Declare bankruptcy
        </button>
      </div>
    </div>
  );
}
