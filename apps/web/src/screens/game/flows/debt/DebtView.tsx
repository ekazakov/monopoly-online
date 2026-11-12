import { useEffect, useId, useRef, useState } from "react";
import type { RedactedGameState } from "@monopoly/shared";
import { useGameActions } from "../../../../game/index.ts";
import { useT } from "../../../../i18n/index.ts";
import type { Translate } from "../../../../i18n/index.ts";
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

const debtLabel = (state: State, debt: DebtSummary["first"], t: Translate) =>
  t("debt.label", {
    reason: reasonLabel(debt.reason, t),
    to: creditorName(state, debt.creditor, t),
  });

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
  const t = useT();
  const { state } = turn.view;
  const name = summary?.debtorName ?? turn.actorName;
  return (
    <div className="debt-view">
      <Status
        title={t("turn.phase.debt")}
        sub={
          state && summary
            ? `${debtLabel(state, summary.first, t)}: ${formatMoney(summary.first.amount)}`
            : undefined
        }
      />
      <p className="turn-area__waiting">
        <span className="turn-area__spinner" aria-hidden="true" />
        {name ? t("debt.waiting", { name }) : t("turn.waitingGame")}
      </p>
    </div>
  );
}

function DebtorPanel({ turn, state, summary }: { turn: Turn; state: State; summary: DebtSummary }) {
  const t = useT();
  const { first, later, shortfall, cash, debtorName } = summary;
  const short = shortfall > 0;
  const laterTotal = later.reduce((sum, debt) => sum + debt.amount, 0);
  const [confirming, setConfirming] = useState(false);
  const [declined, setDeclined] = useState(false);
  const shared = turn.view.mySeats.length > 1;

  return (
    <div className="debt-view">
      <div className="debt-view__head">
        {shared && <span className="debt-view__label">{t("debt.owes", { name: debtorName })}</span>}
        <span className="debt-view__label">{debtLabel(state, first, t)}</span>
        <span className="debt-view__amount">{formatMoney(first.amount)}</span>
        <span className="debt-view__cash">{t("debt.cash", { amount: formatMoney(cash) })}</span>
      </div>
      <p
        className={`debt-view__short${short ? "" : " debt-view__short--ok"}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {short ? t("debt.short", { amount: formatMoney(shortfall) }) : t("debt.covered")}
      </p>
      {later.length > 0 && (
        <p className="turn-area__sub">
          {t("debt.later", {
            amount: formatMoney(laterTotal),
            debts: t("count.debts", { count: later.length }),
          })}
        </p>
      )}

      {confirming ? (
        <BankruptcyConfirm
          turn={turn}
          text={consequenceText(state, summary.debtorId, t)}
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
                label: t("debt.pay", { amount: formatMoney(first.amount) }),
                action: { type: "PayDebt" },
                primary: true,
                why: short ? t("debt.raiseMore", { amount: formatMoney(shortfall) }) : undefined,
              },
            ]}
          />
          {short && <RaiseCash turn={turn} state={state} summary={summary} />}
          {summary.hopeless && <p className="turn-area__sub">{t("debt.hopeless")}</p>}
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
  const t = useT();
  const { options, hiddenMortgages } = raiseOptions(state, summary.debtorId, t);
  const base = useId();

  return (
    <section className="debt-view__raise" aria-label={t("debt.raise")}>
      <h3 className="debt-view__raise-title">{t("debt.raise")}</h3>
      {options.length === 0 ? (
        <p className="debt-view__none">{t("debt.nothing")}</p>
      ) : (
        <ul className="debt-view__rows">
          {options.map((option) => (
            <RaiseRow key={option.key} turn={turn} option={option} id={`${base}-${option.key}`} />
          ))}
        </ul>
      )}
      {hiddenMortgages > 0 && <p className="debt-view__note">{t("debt.sellFirst")}</p>}
    </section>
  );
}

function RaiseRow({ turn, option, id }: { turn: Turn; option: RaiseOption; id: string }) {
  const t = useT();
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
        <span id={id}>
          {option.refusal ?? (sell ? t("debt.has", { detail: option.detail }) : t("deed.mortgage"))}
        </span>
      </span>
      <button
        type="button"
        className="turn-area__btn turn-area__btn--outline turn-area__btn--small"
        disabled={turn.pending || option.refusal !== null || !turn.can(type)}
        aria-label={
          sell
            ? t("debt.sellLabel", { name: option.name, amount: money })
            : t("debt.mortgageLabel", { name: option.name, amount: money })
        }
        aria-describedby={id}
        onClick={() => turn.send({ type, square: option.square })}
      >
        {sell ? t("debt.sell") : t("hand.mortgage")} +{money}
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
  const t = useT();
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
      {t("debt.bankruptcy")}
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
  const t = useT();
  const actions = useGameActions();
  const titleId = useId();
  const seatId = turn.actor?.id;
  const keep = useRef<HTMLButtonElement>(null);
  // The safe choice gets the focus when the step opens.
  useEffect(() => keep.current?.focus(), []);

  return (
    <div className="debt-view__confirm" role="group" aria-labelledby={titleId}>
      <p className="debt-view__confirm-title" id={titleId}>
        {t("debt.confirmTitle")}
      </p>
      <p className="debt-view__confirm-text">{text}</p>
      <p className="debt-view__confirm-text">{t("debt.undone")}</p>
      <div className="turn-area__actions">
        <button
          type="button"
          className="turn-area__btn turn-area__btn--outline"
          onClick={onCancel}
          ref={keep}
        >
          {t("menu.keepPlaying")}
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
          {t("debt.bankruptcy")}
        </button>
      </div>
    </div>
  );
}
