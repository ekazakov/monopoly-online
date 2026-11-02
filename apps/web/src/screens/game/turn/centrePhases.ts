import type { Phase } from "@monopoly/shared";
import type { ComponentType } from "react";
import { BuyView } from "./BuyView.tsx";
import { EndTurnView } from "./EndTurnView.tsx";
import { JailView } from "./JailView.tsx";
import { RollView } from "./RollView.tsx";
import type { Turn } from "./useTurn.ts";

export interface CentrePhaseProps {
  turn: Turn;
}

export type CentrePhaseView = ComponentType<CentrePhaseProps>;

// Extension point: the view of each phase in the board centre. A phase with no entry shows the
// neutral "waiting" view. H7 adds auction, trade, card, debt and bankruptcy views here.
export const centrePhases: Partial<Record<Phase, CentrePhaseView>> = {
  awaiting_roll: RollView,
  awaiting_buy_decision: BuyView,
  awaiting_jail_choice: JailView,
  awaiting_end_turn: EndTurnView,
};
