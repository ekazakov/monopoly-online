// Seeded engine games for the tests of the hand. Not part of the app.
import { createGame } from "@monopoly/game-engine";
import type { GameState, Ownership, Phase } from "@monopoly/game-engine";
import { redact, roomOf } from "../../../game/fixtures.ts";

export type Who = "a" | "b" | "c";

export interface DealSpec {
  /** The player on turn. Default `a`. */
  current?: Who;
  /** Default `awaiting_roll`. */
  phase?: Phase;
  /** Square, owner and the deed fields. */
  deeds?: ReadonlyArray<readonly [square: number, who: Who, deed?: Partial<Ownership>]>;
  cash?: Partial<Record<Who, number>>;
  /** Debts to the bank: the amount each player owes. */
  owes?: Partial<Record<Who, number>>;
  /** Players that are out of the game. */
  out?: readonly Who[];
  /** Set `auction` with this bidder to act (phase `awaiting_bid`). */
  bidder?: Who;
  version?: number;
}

export const SKY = [6, 8, 9] as const;
export const BROWN = [1, 3] as const;
export const NORTH_STATION = 5;
export const POWER_WORKS = 12;
export const BEACON_HILL = 21;

/** A seeded game of the three seats of a room, patched as the spec says, with its redacted state. */
export function deal(spec: DealSpec = {}, room = roomOf()) {
  const id = (who: Who) => room.seats[who].id;
  const start = createGame({
    seed: 11,
    players: [room.seats.a, room.seats.b, room.seats.c].map((s) => ({ id: s.id, name: s.name })),
  });
  const phase = spec.phase ?? "awaiting_roll";
  const bidder = spec.bidder ? id(spec.bidder) : null;
  const full: GameState = {
    ...start,
    version: spec.version ?? 0,
    players: start.players.map((p) => {
      const who = (["a", "b", "c"] as const).find((w) => id(w) === p.id);
      if (!who) return p;
      return {
        ...p,
        cash: spec.cash?.[who] ?? p.cash,
        active: !spec.out?.includes(who),
      };
    }),
    ownership: Object.fromEntries(
      (spec.deeds ?? []).map(([square, who, deed]) => [
        String(square),
        { ownerId: id(who), houses: 0, mortgaged: false, ...deed },
      ]),
    ),
    turn: { ...start.turn, currentPlayerId: id(spec.current ?? "a"), phase },
    debts: Object.entries(spec.owes ?? {}).map(([who, amount]) => ({
      debtorId: id(who as Who),
      creditor: { type: "bank" as const },
      amount,
      reason: "tax" as const,
      then: "finish_roll" as const,
    })),
    auction: bidder
      ? {
          square: 6,
          bidderOrder: [id("a"), id("b"), id("c")],
          passed: [],
          highBid: 0,
          highBidderId: null,
          actorId: bidder,
          then: "finish_roll",
          queue: [],
          returnPhase: "awaiting_roll",
        }
      : null,
  };
  return { ...room, id, full, state: redact(full) };
}

/** Sky Row with houses on the three streets, owned by `a`. */
export const skyWith = (houses: readonly [number, number, number], deed: Partial<Ownership> = {}) =>
  SKY.map((square, i) => [square, "a", { houses: houses[i], ...deed }] as const);
