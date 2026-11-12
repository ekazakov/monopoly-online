import { useId } from "react";
import type { ActionType } from "@monopoly/game-engine";
import { useT } from "../../../i18n/index.ts";
import { buildingText, money } from "./handModel.ts";
import type { HandCard } from "./handModel.ts";
import { ACTION_OF } from "./propertyActions.ts";
import type { ManageAction, PropertyActions } from "./propertyActions.ts";

// The details of one property with its actions (Build, Sell building, Mortgage, Unmortgage), shared by
// the expanded hand and the square detail dialog (BUG-13). The class names are the hand's, so the
// two places look the same. The server is the authority: a button only sends the action.

interface ActionButtonProps {
  label: string;
  amount: string | null;
  allowed: boolean;
  reason: string | null;
  busy: boolean;
  onClick: () => void;
}

function ActionButton({ label, amount, allowed, reason, busy, onClick }: ActionButtonProps) {
  const reasonId = useId();
  const shown = allowed ? null : reason;
  // `aria-disabled`, not `disabled`: a disabled button drops the keyboard focus and the reason is read.
  const blocked = !allowed || busy;
  return (
    <div className="property-hand__action">
      <button
        type="button"
        className="property-hand__button"
        aria-disabled={blocked}
        aria-describedby={shown ? reasonId : undefined}
        onClick={() => {
          if (!blocked) onClick();
        }}
      >
        {label}
        {amount ? (
          <>
            {" "}
            <span className="property-hand__amount">{amount}</span>
          </>
        ) : null}
      </button>
      {shown ? (
        <span className="property-hand__reason" id={reasonId}>
          {shown}
        </span>
      ) : null}
    </div>
  );
}

export interface PropertyDetailProps {
  id: string;
  card: HandCard;
  actions: PropertyActions;
  /** The engine `mayAct` check for each action, from the game store. */
  may: (type: ActionType) => boolean;
  busy: boolean;
  onAction: (type: ManageAction) => void;
}

export function PropertyDetail({ id, card, actions, may, busy, onAction }: PropertyDetailProps) {
  const t = useT();
  const refusal = (key: keyof typeof ACTION_OF, enabled: boolean) =>
    enabled && may(ACTION_OF[key]) ? null : (actions.reason[key] ?? t("hand.reason.waitTurn"));
  const canBuild = actions.canBuild && may("Build");
  const canSell = actions.canSell && may("SellBuilding");
  const canMortgage = actions.canMortgage && may("Mortgage");
  const canUnmortgage = actions.canUnmortgage && may("Unmortgage");
  const dollars = (amount: number | null, sign = "") =>
    amount === null ? null : `${sign}${money(amount)}`;

  return (
    <div
      id={id}
      className="property-hand__detail"
      role="group"
      aria-label={t("hand.actionsLabel", { name: card.name })}
    >
      <p className="property-hand__info">
        <strong>{card.name}</strong>
        {` · ${card.mortgaged ? t("hand.mortgaged") : buildingText(card.houses, t)} · ${card.rent}`}
      </p>
      {actions.manageable ? (
        <div className="property-hand__actions">
          {card.kind === "street" ? (
            <>
              <ActionButton
                label={card.houses === 4 ? t("hand.buildHotel") : t("hand.build")}
                amount={dollars(actions.cost.build)}
                allowed={canBuild}
                reason={refusal("build", canBuild)}
                busy={busy}
                onClick={() => onAction("Build")}
              />
              <ActionButton
                label={t("hand.sellBuilding")}
                amount={dollars(actions.cost.sell, "+")}
                allowed={canSell}
                reason={refusal("sell", canSell)}
                busy={busy}
                onClick={() => onAction("SellBuilding")}
              />
            </>
          ) : null}
          {card.mortgaged ? (
            <ActionButton
              key="mortgage"
              label={t("hand.unmortgage")}
              amount={dollars(actions.cost.unmortgage)}
              allowed={canUnmortgage}
              reason={refusal("unmortgage", canUnmortgage)}
              busy={busy}
              onClick={() => onAction("Unmortgage")}
            />
          ) : (
            <ActionButton
              key="mortgage"
              label={t("hand.mortgage")}
              amount={dollars(actions.cost.mortgage, "+")}
              allowed={canMortgage}
              reason={refusal("mortgage", canMortgage)}
              busy={busy}
              onClick={() => onAction("Mortgage")}
            />
          )}
        </div>
      ) : (
        <p className="property-hand__viewonly">
          {t("hand.viewOnly", { reason: actions.notNow?.toLowerCase() ?? "" })}
        </p>
      )}
    </div>
  );
}
