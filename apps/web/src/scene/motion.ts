import { BOARD_SIZE } from "@monopoly/game-engine";
import type { GameEvent } from "@monopoly/shared";

// The motion model: the events of an action become steps (a dice roll, a walk, a jump), and a
// queue hands them out in order. No renderer here; the dice view and the tokens play the steps.

export type DiceValues = Extract<GameEvent, { type: "DiceRolled" }>["dice"];

export type MotionStep =
  | { kind: "roll"; playerId: string; dice: DiceValues }
  /** `path` holds the squares the token enters, in order. The last one is the target. */
  | { kind: "walk"; playerId: string; from: number; path: readonly number[] }
  | { kind: "jump"; playerId: string; from: number; to: number };

/** Time of one dice roll. */
export const ROLL_MS = 700;
/** Time of one square of a walk. */
export const HOP_MS = 170;
/** Time of a jump. */
export const JUMP_MS = 350;

export function stepDuration(step: MotionStep): number {
  switch (step.kind) {
    case "roll":
      return ROLL_MS;
    case "walk":
      return HOP_MS * step.path.length;
    case "jump":
      return JUMP_MS;
  }
}

/** The squares from `from` (not included) to `to` (included), forward round the board. */
export function walkPath(from: number, to: number): number[] {
  const count = (to - from + BOARD_SIZE) % BOARD_SIZE;
  return Array.from({ length: count }, (_, i) => (from + i + 1) % BOARD_SIZE);
}

/**
 * A card can send a token back, for example "go back 3 squares". The engine event has only `from`
 * and `to`, so such a move is the one that goes down the board with no lap (`PassedGo`) and no
 * jail (`SentToJail`) after it. Walking it forward would take the token round the whole board.
 */
function isBackward(move: Extract<GameEvent, { type: "PlayerMoved" }>, after?: GameEvent): boolean {
  if (move.to >= move.from) return false;
  const lapOrJail =
    (after?.type === "PassedGo" || after?.type === "SentToJail") &&
    after.playerId === move.playerId;
  return !lapOrJail;
}

/**
 * The steps of one action. Every move starts at the `from` of its event, not at the square the
 * token is on now, so a late or repeated plan still draws the same path.
 */
export function planMotion(events: readonly GameEvent[]): MotionStep[] {
  const steps: MotionStep[] = [];
  events.forEach((event, i) => {
    if (event.type === "DiceRolled") {
      steps.push({ kind: "roll", playerId: event.playerId, dice: event.dice });
    } else if (event.type === "PlayerMoved" && event.from !== event.to) {
      steps.push(
        isBackward(event, events[i + 1])
          ? { kind: "jump", playerId: event.playerId, from: event.from, to: event.to }
          : {
              kind: "walk",
              playerId: event.playerId,
              from: event.from,
              path: walkPath(event.from, event.to),
            },
      );
    }
  });
  return steps;
}

/** Steps wait here until the renderer takes them. A new action adds its steps behind the old ones. */
export interface MotionQueue {
  /** Adds the steps of one action. */
  push: (events: readonly GameEvent[]) => void;
  /** Takes the oldest step, or `undefined` when the queue is empty. */
  next: () => MotionStep | undefined;
  /** Drops all waiting steps, for example when a snapshot puts the tokens on their squares. */
  clear: () => void;
  readonly size: number;
}

export function createMotionQueue(): MotionQueue {
  let steps: MotionStep[] = [];
  return {
    push(events) {
      steps = steps.concat(planMotion(events));
    },
    next: () => steps.shift(),
    clear() {
      steps = [];
    },
    get size() {
      return steps.length;
    },
  };
}
