import { SQUARES, applyAction, isProperty, unmortgageCost } from "@monopoly/game-engine";
import type {
  ActionType,
  GameError,
  GameState,
  Phase,
  PropertySquare,
  SquareGroup,
} from "@monopoly/game-engine";
import type { RedactedGameState } from "@monopoly/shared";

// The engine actions read only what the redacted state keeps (`ownership`, `players`, `turn`,
// `auction`, `trade`). The drift test of this file runs them on a full engine state and on the
// redacted one, so a handler that starts to need `rng` or `decks` fails a test here.
const forEngine = (state: RedactedGameState) => state as unknown as GameState;

export const MANAGE_ACTIONS = ["Build", "SellBuilding", "Mortgage", "Unmortgage"] as const;
export type ManageAction = (typeof MANAGE_ACTIONS)[number];

export const GROUP_LABELS: Record<SquareGroup, string> = {
  brown: "Brown",
  sky: "Sky",
  pink: "Pink",
  orange: "Orange",
  red: "Red",
  yellow: "Yellow",
  green: "Green",
  navy: "Navy",
  station: "Stations",
  utility: "Utilities",
};

export interface PropertyActions {
  canBuild: boolean;
  canSell: boolean;
  canMortgage: boolean;
  canUnmortgage: boolean;
  /** Why the action is refused, or null when it is allowed. */
  reason: Record<"build" | "sell" | "mortgage" | "unmortgage", string | null>;
  /** Money of each action from the board data: the price, the refund, the loan and the cost. */
  cost: {
    /** Streets only. */
    build: number | null;
    /** Streets only. */
    sell: number | null;
    mortgage: number | null;
    /** The mortgage value and the 10% interest. */
    unmortgage: number | null;
  };
  /**
   * The seat is inside a window where it may manage property. Outside it (not its turn, an
   * auction, a trade, the end) the card is view-only and `notNow` says why.
   */
  manageable: boolean;
  notNow: string | null;
}

/** Codes about who acts and when, not about the property. */
const WINDOW_CODES: readonly GameError["code"][] = [
  "unknown_player",
  "player_inactive",
  "not_your_turn",
  "wrong_phase",
];

function phaseReason(phase: Phase): string {
  switch (phase) {
    case "awaiting_debt":
      return "Settle the debt first";
    case "awaiting_buy_decision":
      return "Decide on the property first";
    case "awaiting_bid":
      return "Wait for the auction to end";
    case "awaiting_trade_response":
      return "Answer the trade first";
    case "game_over":
      return "The game is over";
    default:
      return "Not now";
  }
}

function reasonFor(
  type: ManageAction,
  error: GameError,
  info: PropertySquare,
  phase: Phase,
  needed: number | null,
): string {
  switch (error.code) {
    case "unknown_player":
      return "Not a player of this game";
    case "player_inactive":
      return "Out of the game";
    case "not_your_turn":
      return "Wait for your turn";
    case "wrong_phase":
      return phaseReason(phase);
    case "not_owner":
      return "Not your property";
    case "not_a_street":
      return "Only streets take buildings";
    case "not_a_property":
      return "Not a property";
    case "incomplete_group":
      return `Needs the full ${GROUP_LABELS[info.group]} set`;
    case "group_mortgaged":
      return "Lift the mortgage on the set first";
    case "max_buildings":
      return "Already has a hotel";
    case "uneven_build":
      return type === "Build"
        ? "Build on a street with fewer buildings first"
        : "Sell from a street with more buildings first";
    case "no_buildings":
      return "No buildings to sell";
    case "already_mortgaged":
      return "Already mortgaged";
    case "not_mortgaged":
      return "Not mortgaged";
    case "has_buildings":
      return "Sell the buildings first";
    case "insufficient_funds":
      return needed === null ? "Not enough cash" : `Needs $${needed.toLocaleString("en-US")}`;
    default:
      return error.message;
  }
}

/**
 * What the seat may do with one property now. Each action is tried on the engine reducer
 * (`applyAction`, which checks `mayAct`, the phase and the building and mortgage rules), so the
 * answer is the server answer. The result is thrown away. The reason texts are for the screen.
 */
export function propertyActions(
  state: RedactedGameState,
  seatId: string,
  square: number,
): PropertyActions {
  const info = SQUARES[square];
  const property = info && isProperty(info) ? info : null;
  const street = property?.kind === "street" ? property : null;
  const cost = {
    build: street?.buildPrice ?? null,
    sell: street ? street.buildPrice / 2 : null,
    mortgage: property?.mortgage ?? null,
    unmortgage: property ? unmortgageCost(property.mortgage) : null,
  };
  const needed: Record<ManageAction, number | null> = {
    Build: cost.build,
    SellBuilding: null,
    Mortgage: null,
    Unmortgage: cost.unmortgage,
  };

  const refusal = (type: ManageAction): GameError | null => {
    if (!property) return { code: "not_a_property", message: "Not a property" };
    const result = applyAction(forEngine(state), { type, playerId: seatId, square });
    return result.ok ? null : result.error;
  };
  const refusals = {
    build: refusal("Build"),
    sell: refusal("SellBuilding"),
    mortgage: refusal("Mortgage"),
    unmortgage: refusal("Unmortgage"),
  };
  const textOf = (type: ManageAction, error: GameError | null) =>
    !error
      ? null
      : property
        ? reasonFor(type, error, property, state.turn.phase, needed[type])
        : error.message;
  const reason = {
    build: textOf("Build", refusals.build),
    sell: textOf("SellBuilding", refusals.sell),
    mortgage: textOf("Mortgage", refusals.mortgage),
    unmortgage: textOf("Unmortgage", refusals.unmortgage),
  };
  const manageable = Object.values(refusals).some(
    (error) =>
      error === null || (error.code !== "not_a_property" && !WINDOW_CODES.includes(error.code)),
  );
  return {
    canBuild: reason.build === null,
    canSell: reason.sell === null,
    canMortgage: reason.mortgage === null,
    canUnmortgage: reason.unmortgage === null,
    reason,
    cost,
    manageable,
    // Mortgage has the widest phases, so its refusal is the best "not now" text.
    notNow: manageable ? null : reason.mortgage,
  };
}

/** The action types the hand sends, for the `mayAct` check of the component. */
export const ACTION_OF: Record<"build" | "sell" | "mortgage" | "unmortgage", ActionType> = {
  build: "Build",
  sell: "SellBuilding",
  mortgage: "Mortgage",
  unmortgage: "Unmortgage",
};
