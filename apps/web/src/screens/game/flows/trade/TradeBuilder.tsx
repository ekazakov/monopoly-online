import { useId, useMemo, useState } from "react";
import type { RedactedGameState } from "@monopoly/shared";
import { useGame, useGameActions } from "../../../../game/index.ts";
import { errorMessage, useT } from "../../../../i18n/index.ts";
import { formatMoney } from "../../turn/format.ts";
import { GroupChip } from "./OfferColumn.tsx";
import {
  checkTrade,
  emptySide,
  jailCardLabel,
  ownedProperties,
  propertyNote,
  proposingSeat,
  summariseOffer,
} from "./tradeModel.ts";
import type { SideDraft } from "./tradeModel.ts";
import "./TradeFlow.css";

type Player = RedactedGameState["players"][number];

const toggle = (list: readonly number[], value: number) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

interface SideEditorProps {
  state: RedactedGameState;
  owner: Player;
  draft: SideDraft;
  cashProblem: string | null;
  onChange: (next: SideDraft) => void;
}

// One column of the builder: the properties, jail cards and cash that `owner` hands over.
function SideEditor({ state, owner, draft, cashProblem, onChange }: SideEditorProps) {
  const t = useT();
  const base = useId();
  const properties = ownedProperties(state, owner.id, t);
  const cashId = `${base}-cash`;
  const problemId = `${base}-cash-problem`;

  return (
    <section className="trade-flow__column" aria-label={t("trade.gives", { name: owner.name })}>
      <h3 className="trade-flow__heading">{t("trade.gives", { name: owner.name })}</h3>

      {properties.length === 0 && owner.heldJailCards.length === 0 && (
        <p className="trade-flow__none">{t("trade.noAssets")}</p>
      )}
      <ul className="trade-flow__items">
        {properties.map((property) => {
          const reasonId = `${base}-lock-${property.square}`;
          const note = propertyNote(property, t);
          return (
            <li key={property.square} className="trade-flow__pick">
              <label className="trade-flow__row">
                <input
                  type="checkbox"
                  checked={property.locked === null && draft.squares.includes(property.square)}
                  disabled={property.locked !== null}
                  aria-describedby={property.locked ? reasonId : undefined}
                  onChange={() =>
                    onChange({ ...draft, squares: toggle(draft.squares, property.square) })
                  }
                />
                <GroupChip group={property.group} />
                <span className="trade-flow__name">
                  {property.name}
                  {note && <span className="trade-flow__note"> · {note}</span>}
                </span>
                <span className="trade-flow__value">{formatMoney(property.price)}</span>
              </label>
              {property.locked && (
                <p id={reasonId} className="trade-flow__reason">
                  {property.locked}
                </p>
              )}
            </li>
          );
        })}
        {owner.heldJailCards.map((deck, index) => (
          <li key={`j${index}`} className="trade-flow__pick">
            <label className="trade-flow__row">
              <input
                type="checkbox"
                checked={draft.jailCards.includes(index)}
                onChange={() => onChange({ ...draft, jailCards: toggle(draft.jailCards, index) })}
              />
              <span className="trade-flow__name">{jailCardLabel(deck, t)}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="trade-flow__cash">
        <label htmlFor={cashId}>{t("trade.cashFrom", { name: owner.name })}</label>
        <span className="trade-flow__cash-field">
          <span aria-hidden="true">$</span>
          <input
            id={cashId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            value={draft.cash}
            aria-invalid={cashProblem ? true : undefined}
            aria-describedby={cashProblem ? problemId : undefined}
            onChange={(event) => onChange({ ...draft, cash: event.target.value })}
          />
        </span>
        <span className="trade-flow__available">
          {t("trade.of", { cash: formatMoney(owner.cash) })}
        </span>
      </div>
      {cashProblem && (
        <p id={problemId} className="trade-flow__reason">
          {cashProblem}
        </p>
      )}
    </section>
  );
}

interface TradeBuilderProps {
  userId: string;
  onClose: () => void;
}

// The trade builder in the board centre (spec 4.5, 5.2: no modal). Pick a partner, then what each
// side hands over. Propose sends `ProposeTrade`; the board centre then shows the response view.
export function TradeBuilder({ userId, onClose }: TradeBuilderProps) {
  const t = useT();
  const view = useGame(userId);
  const actions = useGameActions();
  const titleId = useId();
  const blockerId = useId();
  const { game, state } = view;

  const seat = proposingSeat(game, state, userId);
  const proposer = state?.players.find((p) => p.id === seat?.id) ?? null;
  const partners = useMemo(
    () => state?.players.filter((p) => p.active && p.id !== proposer?.id) ?? [],
    [state, proposer?.id],
  );

  const [chosen, setChosen] = useState<string | null>(null);
  const [give, setGive] = useState<SideDraft>(emptySide);
  const [get, setGet] = useState<SideDraft>(emptySide);

  if (!state || !seat || !proposer) {
    return (
      <section className="trade-flow" aria-labelledby={titleId}>
        <h2 id={titleId} className="trade-flow__title">
          {t("trade.propose")}
        </h2>
        <p className="trade-flow__none">{t("trade.cannot")}</p>
        <div className="trade-flow__actions">
          <button
            type="button"
            className="trade-flow__btn trade-flow__btn--outline"
            onClick={onClose}
          >
            {t("modal.close")}
          </button>
        </div>
      </section>
    );
  }

  // One possible partner needs no choice. A partner who left the game is no choice either.
  const partnerId =
    chosen !== null && partners.some((p) => p.id === chosen)
      ? chosen
      : partners.length === 1
        ? (partners[0]?.id ?? null)
        : null;
  const partner = partners.find((p) => p.id === partnerId) ?? null;
  const check = checkTrade(state, proposer, partner, give, get, t);

  const choose = (id: string) => {
    setChosen(id);
    setGet(emptySide);
  };

  async function propose() {
    if (!partner || !check.give || !check.get || check.blocker || actions.pending) return;
    try {
      await actions.send(
        { type: "ProposeTrade", toPlayerId: partner.id, give: check.give, get: check.get },
        { seatId: seat?.id },
      );
      onClose();
    } catch {
      // The rejection shows through the error of the actions context below.
    }
  }

  const error = actions.error;
  return (
    <section
      className="trade-flow"
      aria-labelledby={titleId}
      aria-busy={actions.pending || undefined}
    >
      <h2 id={titleId} className="trade-flow__title">
        {t("trade.propose")}
      </h2>

      <fieldset className="trade-flow__partners">
        <legend>{t("trade.with")}</legend>
        {partners.map((p) => (
          <label key={p.id} className="trade-flow__partner">
            <input
              type="radio"
              name={`${titleId}-partner`}
              checked={p.id === partnerId}
              onChange={() => choose(p.id)}
            />
            <span>{p.name}</span>
          </label>
        ))}
      </fieldset>

      <div className="trade-flow__columns">
        <SideEditor
          state={state}
          owner={proposer}
          draft={give}
          cashProblem={check.giveCashProblem}
          onChange={setGive}
        />
        {partner ? (
          <SideEditor
            key={partner.id}
            state={state}
            owner={partner}
            draft={get}
            cashProblem={check.getCashProblem}
            onChange={setGet}
          />
        ) : (
          <section className="trade-flow__column" aria-label={t("trade.partnerOffer")}>
            <p className="trade-flow__none">{t("trade.choosePartner")}</p>
          </section>
        )}
      </div>

      <p className="trade-flow__summary">
        {partner && check.give && check.get
          ? t("trade.summary", {
              name: proposer.name,
              give: summariseOffer(check.give, t),
              get: summariseOffer(check.get, t),
            })
          : t("trade.noOffer")}
      </p>
      {check.blocker && (
        <p id={blockerId} className="trade-flow__reason">
          {check.blocker}
        </p>
      )}

      <div className="trade-flow__actions">
        <button
          type="button"
          className="trade-flow__btn trade-flow__btn--outline"
          onClick={onClose}
        >
          {t("trade.cancel")}
        </button>
        <button
          type="button"
          className="trade-flow__btn trade-flow__btn--primary"
          disabled={actions.pending || check.blocker !== null}
          aria-describedby={check.blocker ? blockerId : undefined}
          onClick={() => void propose()}
        >
          {t("trade.proposeButton")}
        </button>
      </div>

      <div className="trade-flow__errors" role="status" aria-live="polite" aria-atomic="true">
        {error && (
          <p className="trade-flow__error" data-code={error.code}>
            {errorMessage(error, t)}
          </p>
        )}
      </div>
    </section>
  );
}
