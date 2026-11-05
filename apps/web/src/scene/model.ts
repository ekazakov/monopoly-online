import { TOKENS } from "@monopoly/shared";
import type { RedactedGameState, Token } from "@monopoly/shared";
import { UNKNOWN_OWNER_COLOR, tokenLook } from "./colors.ts";
import type { AvatarKind } from "./sculpt.ts";

export interface ScenePlayer {
  id: string;
  name: string;
  /** The token of the seat. It decides the colour and the figure. */
  token: Token;
}

export interface TokenModel {
  id: string;
  square: number;
  inJail: boolean;
  token: Token;
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
  const tokenOf = new Map<string, Token>();
  // Without a seat for a player, the token follows the place in the state. This is for a state
  // that is shown before the room is known.
  state.players.forEach((p, i) =>
    tokenOf.set(p.id, given.get(p.id)?.token ?? TOKENS[i % TOKENS.length]!),
  );

  const tokens = state.players
    .filter((p) => p.active)
    .map((p): TokenModel => {
      const token = tokenOf.get(p.id)!;
      const look = tokenLook(token);
      return {
        id: p.id,
        square: p.position,
        inJail: p.inJail,
        token,
        avatar: look.avatar,
        metal: look.metal,
        name: given.get(p.id)?.name ?? p.name,
      };
    });

  const deeds = Object.entries(state.ownership)
    .map(([key, deed]): DeedModel => {
      const token = tokenOf.get(deed.ownerId);
      return {
        square: Number(key),
        ownerId: deed.ownerId,
        ownerColor: token === undefined ? UNKNOWN_OWNER_COLOR : tokenLook(token).hex,
        houses: deed.houses,
        mortgaged: deed.mortgaged,
      };
    })
    .sort((a, b) => a.square - b.square);

  return { tokens, deeds };
}
