/*
 * Trade flow for the board centre (spec 4.5, 5.2: no modals). The orchestrator wires it up:
 *
 * 1. Response view. Register in `turn/centrePhases.ts`:
 *      awaiting_trade_response: TradeResponseView
 *    The turn area already wraps every phase view with its error notice, so a rejected action
 *    shows there. The view needs `.turn-area` around it for the "Waiting for ..." line.
 *
 * 2. Entry point. The Trade button belongs in the turn area, next to the main action. Offer it
 *    when `canProposeTrade(turn)` is true. It follows the engine rules: `ProposeTrade` is allowed
 *    only in awaiting_roll, awaiting_jail_choice, awaiting_end_turn and awaiting_debt, and only to
 *    the seat that `mayAct` for it (the player on turn; a remote turn stays watch only). The
 *    engine `mayAct` ignores the phase, so use `canProposeTrade`, not `turn.can` alone. It also
 *    needs one other active player. The button opens `<TradeBuilder userId onClose />` in the
 *    board centre in place of the turn area. The builder closes itself (`onClose`) after the
 *    server accepts `ProposeTrade`; the phase then becomes awaiting_trade_response.
 *
 * The engine action for "Decline" is `RejectTrade`.
 */
export { TradeBuilder } from "./TradeBuilder.tsx";
export { TradeResponseView } from "./TradeResponseView.tsx";
export { canProposeTrade, proposingSeat, PROPOSE_PHASES } from "./tradeModel.ts";
