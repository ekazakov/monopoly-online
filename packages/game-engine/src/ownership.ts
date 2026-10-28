import { groupSquares } from "./board.ts";
import type { SquareGroup } from "./board.ts";
import type { GameState, Ownership } from "./state.ts";

export const squareKey = (square: number) => String(square);

export const entryOf = (state: GameState, square: number): Ownership | undefined =>
  state.ownership[squareKey(square)];

export const ownerOf = (state: GameState, square: number) => entryOf(state, square)?.ownerId;

export function setEntry(state: GameState, square: number, entry: Ownership): GameState {
  return { ...state, ownership: { ...state.ownership, [squareKey(square)]: entry } };
}

export function removeEntry(state: GameState, square: number): GameState {
  const { [squareKey(square)]: _removed, ...rest } = state.ownership;
  return { ...state, ownership: rest };
}

/** Squares a player owns, in board order. */
export function ownedSquares(state: GameState, playerId: string): number[] {
  return Object.entries(state.ownership)
    .filter(([, entry]) => entry.ownerId === playerId)
    .map(([square]) => Number(square))
    .sort((a, b) => a - b);
}

/** How many squares of a group a player owns. Mortgaged squares count. */
export function ownedInGroup(state: GameState, group: SquareGroup, playerId: string): number {
  return groupSquares(group).filter((square) => ownerOf(state, square) === playerId).length;
}

export function ownsFullGroup(state: GameState, group: SquareGroup, playerId: string): boolean {
  return ownedInGroup(state, group, playerId) === groupSquares(group).length;
}

/** Houses (1 to 4 on a street) and hotels (5) a player owns. */
export function buildingCounts(state: GameState, playerId: string) {
  let houses = 0;
  let hotels = 0;
  for (const entry of Object.values(state.ownership)) {
    if (entry.ownerId !== playerId) continue;
    if (entry.houses === 5) hotels++;
    else houses += entry.houses;
  }
  return { houses, hotels };
}

/** Building levels (0 to 5) of every street in a group, in board order. */
export function groupLevels(state: GameState, group: SquareGroup): number[] {
  return groupSquares(group).map((square) => entryOf(state, square)?.houses ?? 0);
}
