import { actorFor, applyAction, createGame, SQUARES, isProperty } from "@monopoly/game-engine";
import type { Action, GameEvent, GameState } from "@monopoly/game-engine";
import { TOKENS } from "@monopoly/shared";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { serializeState } from "./loader.ts";

export const USER_ID = "00000000-0000-4000-8000-000000000001";
export const GAME_ID = "10000000-0000-4000-8000-000000000001";

export interface Step {
  action: Action;
  state: GameState;
  events: readonly GameEvent[];
}

export interface PlayedGame {
  initial: GameState;
  steps: Step[];
}

export const DEFAULT_SEAT_IDS = ["seat-a", "seat-b", "seat-c"] as const;
const SEAT_NAMES = ["Ann", "Bo", "Cy"] as const;

export function newGame(seed: number, seatIds: readonly string[] = DEFAULT_SEAT_IDS): GameState {
  return createGame({
    seed,
    players: seatIds.map((id, i) => ({ id, name: SEAT_NAMES[i] ?? `Player ${i + 1}` })),
  });
}

/** A simple deterministic policy: buy when affordable, never bid, resign when a debt cannot be paid. */
function nextAction(state: GameState): Action {
  const playerId = actorFor(state);
  const player = state.players.find((p) => p.id === playerId);
  switch (state.turn.phase) {
    case "awaiting_roll":
    case "awaiting_jail_choice":
      return { type: "RollDice", playerId };
    case "awaiting_buy_decision": {
      const info = SQUARES[player?.position ?? 0];
      const price = info && isProperty(info) ? info.price : Infinity;
      return { type: (player?.cash ?? 0) >= price ? "BuyProperty" : "DeclineProperty", playerId };
    }
    case "awaiting_end_turn":
      return { type: "EndTurn", playerId };
    case "awaiting_debt": {
      const debt = state.debts.find((d) => d.debtorId === playerId);
      const canPay = debt !== undefined && (player?.cash ?? 0) >= debt.amount;
      return { type: canPay ? "PayDebt" : "Resign", playerId };
    }
    case "awaiting_bid":
      return { type: "PassBid", playerId };
    case "awaiting_trade_response":
      return { type: "RejectTrade", playerId };
    case "game_over":
      throw new Error("The game is over");
  }
}

/** Play a seeded game with the policy above. Every step keeps the state after the action. */
export function playGame(
  seed: number,
  maxActions: number,
  initial: GameState = newGame(seed),
): PlayedGame {
  const steps: Step[] = [];
  let state = initial;
  while (steps.length < maxActions && state.turn.phase !== "game_over") {
    const action = nextAction(state);
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(`${action.type} rejected: ${result.error.code}`);
    state = result.state;
    steps.push({ action, state, events: result.events });
  }
  return { initial, steps };
}

/** Insert the user, game and seats that the log rows refer to. */
export async function insertGame(db: Kysely<Database>, state: GameState, gameId = GAME_ID) {
  await db
    .insertInto("users")
    .values({ id: USER_ID, name: "Owner", name_key: "owner" })
    .onConflict((oc) => oc.doNothing())
    .execute();
  await db.insertInto("games").values({ id: gameId, name: "Game", owner_id: USER_ID }).execute();
  await db
    .insertInto("seats")
    .values(
      state.players.map((p, i) => ({
        id: p.id,
        game_id: gameId,
        seat_order: i,
        name: p.name,
        name_key: p.name.toLowerCase(),
        kind: "hotseat" as const,
        user_id: null,
        controller_user_id: USER_ID,
        token: TOKENS[i]!,
      })),
    )
    .execute();
}

export async function insertSnapshot(
  db: Kysely<Database>,
  state: GameState,
  gameId = GAME_ID,
  turnStart: 0 | 1 = 0,
): Promise<void> {
  await db
    .insertInto("game_snapshots")
    .values({
      game_id: gameId,
      version: state.version,
      state: serializeState(state),
      turn_start: turnStart,
    })
    .execute();
}

export async function insertSteps(
  db: Kysely<Database>,
  steps: readonly Step[],
  gameId = GAME_ID,
): Promise<void> {
  if (steps.length === 0) return;
  await db
    .insertInto("game_events")
    .values(
      steps.map((step) => ({
        game_id: gameId,
        version: step.state.version,
        client_action_id: `action-${step.state.version}`,
        seat_id: step.action.playerId,
        action: JSON.stringify(step.action),
        events: JSON.stringify(step.events),
      })),
    )
    .execute();
}

export const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";
export const STRANGER_ID = "00000000-0000-4000-8000-000000000003";
export const UUID_SEAT_IDS = [
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "20000000-0000-4000-8000-000000000003",
] as const;

/**
 * An active game of three seats, listed in turn order: the first (on turn) is a hot-seat seat of
 * `USER_ID`, the second a seat of `OTHER_USER_ID`, the third a seat of `USER_ID`. `STRANGER_ID`
 * has no seat. Writes the users, game, seats and the version-0 snapshot.
 */
export async function insertActiveGame(
  db: Kysely<Database>,
  state: GameState,
  gameId = GAME_ID,
): Promise<{ seats: readonly string[]; controllers: Record<string, string> }> {
  await db
    .insertInto("users")
    .values([
      { id: USER_ID, name: "Owner", name_key: "owner" },
      { id: OTHER_USER_ID, name: "Other", name_key: "other" },
      { id: STRANGER_ID, name: "Stranger", name_key: "stranger" },
    ])
    .onConflict((oc) => oc.doNothing())
    .execute();
  await db
    .insertInto("games")
    .values({ id: gameId, name: "Game", owner_id: USER_ID, status: "active" })
    .execute();
  const roles = [
    { userId: null, controllerId: USER_ID, kind: "hotseat" as const },
    { userId: OTHER_USER_ID, controllerId: OTHER_USER_ID, kind: "user" as const },
    { userId: USER_ID, controllerId: USER_ID, kind: "user" as const },
  ];
  const controllers: Record<string, string> = {};
  await db
    .insertInto("seats")
    .values(
      state.players.map((p, i) => {
        const role = roles[i] as (typeof roles)[number];
        controllers[p.id] = role.controllerId;
        return {
          id: p.id,
          game_id: gameId,
          seat_order: i,
          name: p.name,
          name_key: p.name.toLowerCase(),
          kind: role.kind,
          user_id: role.userId,
          controller_user_id: role.controllerId,
          token: TOKENS[i]!,
        };
      }),
    )
    .execute();
  // Like `start` in the room service: the first snapshot is a turn start.
  await insertSnapshot(db, state, gameId, 1);
  return { seats: state.players.map((p) => p.id), controllers };
}
