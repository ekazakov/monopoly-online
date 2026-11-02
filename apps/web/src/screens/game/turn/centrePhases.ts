import type { Phase } from "@monopoly/shared";
import type { ComponentType } from "react";
import { AuctionView } from "../flows/auction/index.ts";
import { DebtView } from "../flows/debt/index.ts";
import { TradeResponseView } from "../flows/trade/index.ts";
import { BuyView } from "./BuyView.tsx";
import { EndTurnView } from "./EndTurnView.tsx";
import { JailView } from "./JailView.tsx";
import { RollView } from "./RollView.tsx";
import type { Turn } from "./useTurn.ts";

export interface CentrePhaseProps {
  turn: Turn;
}

export type CentrePhaseView = ComponentType<CentrePhaseProps>;

// The view of each phase in the board centre. A phase with no entry (game_over) shows the neutral
// "waiting" view. The card reveal is no phase: the game screen shows it above this view.
export const centrePhases: Partial<Record<Phase, CentrePhaseView>> = {
  awaiting_roll: RollView,
  awaiting_buy_decision: BuyView,
  awaiting_jail_choice: JailView,
  awaiting_end_turn: EndTurnView,
  awaiting_bid: AuctionView,
  awaiting_debt: DebtView,
  awaiting_trade_response: TradeResponseView,
};
