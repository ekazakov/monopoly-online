import type { ActionOf } from "./actions.ts";
import { SQUARES } from "./board.ts";
import type { Failure, GameEvent, GameState, Result } from "./state.ts";
import { fail } from "./state.ts";
import { charge, getPlayer, updatePlayer } from "./helpers.ts";
import { entryOf, groupLevels, ownedInGroup, setEntry } from "./ownership.ts";
import { groupSquares } from "./board.ts";

interface Street {
  readonly group: Extract<(typeof SQUARES)[number], { kind: "street" }>["group"];
  readonly buildPrice: number;
  readonly houses: number;
}

/**
 * Check what Build and SellBuilding share: the square is a street the player owns, and the
 * player owns the whole group.
 */
function streetOf(state: GameState, playerId: string, square: number): Street | Failure {
  const info = SQUARES[square];
  if (!info || info.kind !== "street") return fail("not_a_street", "Only streets have buildings");
  const entry = entryOf(state, square);
  if (entry?.ownerId !== playerId) return fail("not_owner", "The player does not own this street");
  return { group: info.group, buildPrice: info.buildPrice, houses: entry.houses };
}

const isFailure = (value: Street | Failure): value is Failure => "ok" in value;

/** Build one house, or a hotel on four houses. Evenly, on a full group with no mortgage. */
export function handleBuild(state: GameState, action: ActionOf<"Build">): Result {
  const street = streetOf(state, action.playerId, action.square);
  if (isFailure(street)) return street;

  const groupSize = groupSquares(street.group).length;
  if (ownedInGroup(state, street.group, action.playerId) !== groupSize) {
    return fail("incomplete_group", "The player must own every street of the colour group");
  }
  if (groupSquares(street.group).some((sq) => entryOf(state, sq)?.mortgaged)) {
    return fail("group_mortgaged", "A street of this group is mortgaged");
  }
  if (street.houses >= 5) return fail("max_buildings", "This street already has a hotel");
  if (street.houses > Math.min(...groupLevels(state, street.group))) {
    return fail("uneven_build", "Build evenly: build on a street with fewer buildings first");
  }

  const paid = charge(state, action.playerId, street.buildPrice);
  if (!paid) return fail("insufficient_funds", `The player cannot pay $${street.buildPrice}`);
  const houses = street.houses + 1;
  const next = setEntry(paid, action.square, {
    ownerId: action.playerId,
    houses,
    mortgaged: false,
  });
  const events: GameEvent[] = [
    {
      type: "BuildingBuilt",
      playerId: action.playerId,
      square: action.square,
      houses,
      cost: street.buildPrice,
    },
  ];
  return { ok: true, state: next, events };
}

/** Sell one building back to the bank for half its build price. Evenly, in reverse. */
export function handleSellBuilding(state: GameState, action: ActionOf<"SellBuilding">): Result {
  const street = streetOf(state, action.playerId, action.square);
  if (isFailure(street)) return street;

  if (street.houses === 0) return fail("no_buildings", "This street has no buildings");
  if (street.houses < Math.max(...groupLevels(state, street.group))) {
    return fail("uneven_build", "Sell evenly: sell from a street with more buildings first");
  }

  const refund = street.buildPrice / 2;
  const houses = street.houses - 1;
  const player = getPlayer(state, action.playerId);
  const sold = setEntry(
    updatePlayer(state, player.id, { cash: player.cash + refund }),
    action.square,
    {
      ownerId: action.playerId,
      houses,
      mortgaged: false,
    },
  );
  const events: GameEvent[] = [
    { type: "BuildingSold", playerId: action.playerId, square: action.square, houses, refund },
  ];
  return { ok: true, state: sold, events };
}
