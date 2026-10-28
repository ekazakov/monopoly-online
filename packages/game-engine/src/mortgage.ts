import type { ActionOf } from "./actions.ts";
import { groupSquares, isProperty, SQUARES } from "./board.ts";
import type { PropertySquare } from "./board.ts";
import { charge, getPlayer, updatePlayer } from "./helpers.ts";
import { entryOf, setEntry } from "./ownership.ts";
import { fail } from "./state.ts";
import type { Failure, GameEvent, GameState, Ownership, Result } from "./state.ts";

/** Lifting a mortgage costs the mortgage value plus 10%, rounded up to whole dollars. */
// Whole-dollar math: `Math.ceil(50 * 1.1)` is 56 because 50 * 1.1 is 55.00000000000001.
export const unmortgageCost = (mortgageValue: number) =>
  mortgageValue + Math.ceil(mortgageValue / 10);

interface Deed {
  readonly info: PropertySquare;
  readonly entry: Ownership;
}

/** The square must be a property that the player owns. */
function deedOf(state: GameState, playerId: string, square: number): Deed | Failure {
  const info = SQUARES[square];
  if (!info || !isProperty(info)) return fail("not_a_property", "This square cannot be mortgaged");
  const entry = entryOf(state, square);
  if (entry?.ownerId !== playerId)
    return fail("not_owner", "The player does not own this property");
  return { info, entry };
}

const isFailure = (value: Deed | Failure): value is Failure => "ok" in value;

/** Mortgage a property for half its price. Sell every building in its group first. */
export function handleMortgage(state: GameState, action: ActionOf<"Mortgage">): Result {
  const deed = deedOf(state, action.playerId, action.square);
  if (isFailure(deed)) return deed;
  if (deed.entry.mortgaged) return fail("already_mortgaged", "This property is already mortgaged");
  if (groupSquares(deed.info.group).some((sq) => (entryOf(state, sq)?.houses ?? 0) > 0)) {
    return fail("has_buildings", "Sell every building in this colour group first");
  }

  const player = getPlayer(state, action.playerId);
  const amount = deed.info.mortgage;
  const next = setEntry(
    updatePlayer(state, player.id, { cash: player.cash + amount }),
    action.square,
    { ...deed.entry, mortgaged: true },
  );
  const events: GameEvent[] = [
    { type: "PropertyMortgaged", playerId: player.id, square: action.square, amount },
  ];
  return { ok: true, state: next, events };
}

/** Lift a mortgage for the mortgage value plus 10%. */
export function handleUnmortgage(state: GameState, action: ActionOf<"Unmortgage">): Result {
  const deed = deedOf(state, action.playerId, action.square);
  if (isFailure(deed)) return deed;
  if (!deed.entry.mortgaged) return fail("not_mortgaged", "This property is not mortgaged");

  const cost = unmortgageCost(deed.info.mortgage);
  const paid = charge(state, action.playerId, cost);
  if (!paid) return fail("insufficient_funds", `The player cannot pay $${cost}`);
  const next = setEntry(paid, action.square, { ...deed.entry, mortgaged: false });
  const events: GameEvent[] = [
    { type: "PropertyUnmortgaged", playerId: action.playerId, square: action.square, cost },
  ];
  return { ok: true, state: next, events };
}
