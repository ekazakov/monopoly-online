import { actorFor, applyAction, createGame, SQUARES, isProperty } from "@monopoly/game-engine";
import type { Action, GameEvent, GameState } from "@monopoly/game-engine";
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

export function newGame(seed: number): GameState {
  return createGame({
    seed,
    players: [
      { id: "seat-a", name: "Ann" },
      { id: "seat-b", name: "Bo" },
      { id: "seat-c", name: "Cy" },
    ],
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
export function playGame(seed: number, maxActions: number): PlayedGame {
  const initial = newGame(seed);
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
      })),
    )
    .execute();
}

export async function insertSnapshot(
  db: Kysely<Database>,
  state: GameState,
  gameId = GAME_ID,
): Promise<void> {
  await db
    .insertInto("game_snapshots")
    .values({ game_id: gameId, version: state.version, state: serializeState(state) })
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
