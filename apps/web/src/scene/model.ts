import type { RedactedGameState } from "@monopoly/shared";
import { UNKNOWN_OWNER_COLOR, playerLook } from "./colors.ts";
import type { AvatarKind } from "./sculpt.ts";

export interface ScenePlayer {
  id: string;
  name: string;
  colorIndex: number;
}

export interface TokenModel {
  id: string;
  square: number;
  inJail: boolean;
  colorIndex: number;
  avatar: AvatarKind;
  metal: number;
  name: string;
}

export interface DeedModel {
  square: number;
  ownerId: string;
  ownerColor: string;
  houses: number;
  mortgaged: boolean;
}

export interface SceneModel {
  tokens: TokenModel[];
  deeds: DeedModel[];
}

/**
 * What the scene draws, from the game state and the player colours. A player without an entry in
 * `players` takes the colour of their place in the state; bankrupt players have no token.
 */
export function buildSceneModel(
  state: RedactedGameState | null,
  players?: readonly ScenePlayer[],
): SceneModel {
  if (!state) return { tokens: [], deeds: [] };
  const given = new Map(players?.map((p) => [p.id, p]));
  const colorOf = new Map<string, number>();
  state.players.forEach((p, i) => colorOf.set(p.id, given.get(p.id)?.colorIndex ?? i));

  const tokens = state.players
    .filter((p) => p.active)
    .map((p): TokenModel => {
      const colorIndex = colorOf.get(p.id)!;
      const look = playerLook(colorIndex);
      return {
        id: p.id,
        square: p.position,
        inJail: p.inJail,
        colorIndex,
        avatar: look.avatar,
        metal: look.metal,
        name: given.get(p.id)?.name ?? p.name,
      };
    });

  const deeds = Object.entries(state.ownership)
    .map(([key, deed]): DeedModel => {
      const colorIndex = colorOf.get(deed.ownerId);
      return {
        square: Number(key),
        ownerId: deed.ownerId,
        ownerColor: colorIndex === undefined ? UNKNOWN_OWNER_COLOR : playerLook(colorIndex).color,
        houses: deed.houses,
        mortgaged: deed.mortgaged,
      };
    })
    .sort((a, b) => a.square - b.square);

  return { tokens, deeds };
}
