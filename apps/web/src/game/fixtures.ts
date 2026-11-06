// Recorded messages for the tests, built from a real seeded engine game and checked by the shared
// schemas. Not part of the app.
import { applyAction, actorFor, createGame } from "@monopoly/game-engine";
import type { Action, GameState } from "@monopoly/game-engine";
import {
  actionResponseSchema,
  gameActionsMessageSchema,
  gameEventSchema,
  gameSchema,
  redactedGameStateSchema,
  roomUpdatedMessageSchema,
  snapshotMessageSchema,
  TOKENS,
} from "@monopoly/shared";
import type {
  ActionResponse,
  Game,
  GameEvent,
  RedactedGameState,
  Seat,
  StreamMessage,
} from "@monopoly/shared";

const uuid = () => crypto.randomUUID();

export const redact = ({ rng: _rng, decks: _decks, ...state }: GameState): RedactedGameState =>
  redactedGameStateSchema.parse(state);

export interface Step {
  action: Action;
  /** The engine state after the action. */
  full: GameState;
  state: RedactedGameState;
  events: GameEvent[];
}

export interface Fixture {
  /** Users: `owner` has seat `a` and the hot-seat seats `c`; `guest` has seat `b`. */
  ownerId: string;
  guestId: string;
  game: Game;
  seats: { a: Seat; b: Seat; c: Seat };
  start: GameState;
  steps: Step[];
}

export function roomOf(fields: Partial<Game> = {}) {
  const ownerId = uuid();
  const guestId = uuid();
  const seat = (order: number, name: string, kind: Seat["kind"], userId: string | null): Seat => ({
    id: uuid(),
    order,
    name,
    kind,
    userId,
    controllerUserId: userId ?? ownerId,
    // The server numbers seats from 1, and the first free token goes to the first seat.
    token: TOKENS[order - 1]!,
    claimed: false,
  });
  const seats = {
    a: seat(1, "Ann", "user", ownerId),
    b: seat(2, "Bo", "user", guestId),
    c: seat(3, "Cy", "hotseat", null),
  };
  const game = gameSchema.parse({
    id: uuid(),
    name: "Friday night",
    status: "active",
    ownerId,
    version: 0,
    createdAt: "2026-11-02T10:00:00.000Z",
    seats: [seats.a, seats.b, seats.c],
    invites: [],
    ...fields,
  });
  return { game, ownerId, guestId, seats };
}

/** A simple legal move for the player who must act. */
function nextAction(state: GameState, step: number): Action {
  const playerId = actorFor(state);
  switch (state.turn.phase) {
    case "awaiting_buy_decision":
      // Declining starts an auction, so the fixture has both flows.
      return step % 3 === 0
        ? { type: "DeclineProperty", playerId }
        : { type: "BuyProperty", playerId };
    case "awaiting_end_turn":
      return { type: "EndTurn", playerId };
    case "awaiting_bid":
      return { type: "PassBid", playerId };
    case "awaiting_debt":
      return { type: "Resign", playerId };
    default:
      return { type: "RollDice", playerId };
  }
}

/** Play `count` accepted actions from a seeded game with the three seats of a room. */
export function recordFixture(count: number, seed = 7): Fixture {
  const room = roomOf();
  const start = createGame({
    seed,
    players: [room.seats.a, room.seats.b, room.seats.c].map((s) => ({ id: s.id, name: s.name })),
  });
  const steps: Step[] = [];
  let state = start;
  for (let i = 0; i < count; i++) {
    let action = nextAction(state, i);
    let result = applyAction(state, action);
    if (!result.ok && action.type === "BuyProperty") {
      action = { type: "DeclineProperty", playerId: action.playerId };
      result = applyAction(state, action);
    }
    if (!result.ok) throw new Error(`${action.type}: ${result.error.message}`);
    state = result.state;
    steps.push({
      action,
      full: state,
      state: redact(state),
      events: gameEventSchema.array().parse(result.events),
    });
  }
  return { ...room, start, steps };
}

export const topicOf = (game: Game) => `game:${game.id}` as const;

export function snapshotMessage(
  game: Game,
  state: RedactedGameState | null,
  version = state?.version ?? 0,
): StreamMessage {
  return snapshotMessageSchema.parse({
    topic: topicOf(game),
    type: "snapshot",
    version,
    payload: { game, state },
  });
}

export function roomMessage(game: Game): StreamMessage {
  return roomUpdatedMessageSchema.parse({
    topic: topicOf(game),
    type: "room.updated",
    version: game.version,
    payload: { game },
  });
}

export function actionsMessage(game: Game, step: Step): StreamMessage {
  return gameActionsMessageSchema.parse({
    topic: topicOf(game),
    type: "game.actions",
    version: step.state.version,
    payload: { events: step.events, state: step.state },
  });
}

/** The response of the action POST. For a repeat, pass the later `current` step. */
export function actionResponse(step: Step, current: Step = step): ActionResponse {
  return actionResponseSchema.parse({
    version: step.state.version,
    events: step.events,
    state: current.state,
  });
}

/** The game with its room changed, like a status change at the end. */
export const withStatus = (game: Game, status: Game["status"]): Game => ({ ...game, status });
