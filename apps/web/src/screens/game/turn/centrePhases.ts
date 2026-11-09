import type { Phase } from "@monopoly/shared";
import type { ComponentType } from "react";
import { DebtView } from "../flows/debt/index.ts";
import { TradeResponseView } from "../flows/trade/index.ts";
import { EndTurnView } from "./EndTurnView.tsx";
import { JailView } from "./JailView.tsx";
import { AuctionCentreView, BuyStatusView } from "./ModalPhaseViews.tsx";
import { RollView } from "./RollView.tsx";
import type { Turn } from "./useTurn.ts";

export interface CentrePhaseProps {
  turn: Turn;
}

export type CentrePhaseView = ComponentType<CentrePhaseProps>;

// The view of each phase in the board centre. The purchase and the auction have their buttons in a
// modal dialog (`PhaseModal`) on the device that decides or bids, so there the centre shows only
// their status. The other devices follow the auction in the centre. A phase with no entry
// (game_over) shows the neutral "waiting" view. The card reveal is no phase: the game screen shows it above this view.
export const centrePhases: Partial<Record<Phase, CentrePhaseView>> = {
  awaiting_roll: RollView,
  awaiting_buy_decision: BuyStatusView,
  awaiting_jail_choice: JailView,
  awaiting_end_turn: EndTurnView,
  awaiting_bid: AuctionCentreView,
  awaiting_debt: DebtView,
  awaiting_trade_response: TradeResponseView,
};
