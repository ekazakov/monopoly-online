import { BOARD_SIZE } from "@monopoly/game-engine";
import type { GameEvent } from "@monopoly/shared";

// The motion model: the events of an action become steps (a dice roll, a walk, a jump), and a
// queue hands them out in order. No renderer here; the dice view and the tokens play the steps.

export type DiceValues = Extract<GameEvent, { type: "DiceRolled" }>["dice"];

export type MotionStep =
  | { kind: "roll"; playerId: string; dice: DiceValues }
  /**
   * `path` holds the squares the token enters, in order. The last one is the target. `fromJail` is
   * true when the token leaves the jail cell with this move, so it waits in the cell until then.
   */
  | { kind: "walk"; playerId: string; from: number; fromJail: boolean; path: readonly number[] }
  | { kind: "jump"; playerId: string; from: number; fromJail: boolean; to: number }
  /**
   * The player has drawn a card that moves their token. The token stays where it is and the queue
   * waits, with no timer, until `release()` (OK on the card). `eventIndex` is the index of the
   * `CardDrawn` event in the events of the action.
   */
  | { kind: "hold"; playerId: string; eventIndex: number };

export type MoveStep = Extract<MotionStep, { kind: "walk" | "jump" }>;

export function isMove(step: MotionStep | null | undefined): step is MoveStep {
  return step?.kind === "walk" || step?.kind === "jump";
}

/** What is on screen now: the step that plays, and the steps that wait behind it. */
export interface MotionPlayback {
  current: MotionStep | null;
  waiting: readonly MotionStep[];
}

export const IDLE_PLAYBACK: MotionPlayback = { current: null, waiting: [] };

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
    case "hold":
      // No timer: a hold ends with `release()`.
      return 0;
  }
}

/** The squares a move stands on, from the start to the target. */
export function stepSquares(step: MoveStep): number[] {
  return step.kind === "walk" ? [step.from, ...step.path] : [step.from, step.to];
}

/** Where along a move the token is `elapsedMs` after it began: hop number `hop` of `hops`, `t` in [0, 1]. */
export function hopAt(step: MoveStep, elapsedMs: number): { hop: number; hops: number; t: number } {
  const hops = step.kind === "walk" ? step.path.length : 1;
  const each = step.kind === "walk" ? HOP_MS : JUMP_MS;
  if (elapsedMs >= each * hops) return { hop: hops - 1, hops, t: 1 };
  const elapsed = Math.max(0, elapsedMs);
  const hop = Math.floor(elapsed / each);
  return { hop, hops, t: (elapsed - hop * each) / each };
}

/**
 * The tokens as they stand on the board now. The game state is already at the end of the action,
 * so a token with a move that has not finished yet stays on the square that move starts from.
 */
export function restingSites<T extends { id: string; square: number; inJail: boolean }>(
  sites: readonly T[],
  playback: MotionPlayback,
): T[] {
  const first = new Map<string, MoveStep>();
  for (const step of [playback.current, ...playback.waiting]) {
    if (isMove(step) && !first.has(step.playerId)) first.set(step.playerId, step);
  }
  if (first.size === 0) return [...sites];
  return sites.map((site) => {
    const step = first.get(site.id);
    return step ? { ...site, square: step.from, inJail: step.fromJail } : site;
  });
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
    // The jail cell holds the token until the move that frees it.
    const fromJail = (playerId: string) =>
      events.slice(0, i).some((e) => e.type === "LeftJail" && e.playerId === playerId);
    if (event.type === "DiceRolled") {
      steps.push({ kind: "roll", playerId: event.playerId, dice: event.dice });
    } else if (event.type === "CardDrawn") {
      // The engine puts the move of a card after its `CardDrawn`. The hold keeps the token on the
      // card square until the player has read the card.
      const rest = events.slice(i + 1);
      const end = rest.findIndex((e) => e.type === "CardDrawn");
      const moves = rest
        .slice(0, end === -1 ? undefined : end)
        .some((e) => e.type === "PlayerMoved" && e.playerId === event.playerId && e.from !== e.to);
      if (moves) steps.push({ kind: "hold", playerId: event.playerId, eventIndex: i });
    } else if (event.type === "PlayerMoved" && event.from !== event.to) {
      steps.push(
        isBackward(event, events[i + 1])
          ? {
              kind: "jump",
              playerId: event.playerId,
              from: event.from,
              fromJail: fromJail(event.playerId),
              to: event.to,
            }
          : {
              kind: "walk",
              playerId: event.playerId,
              from: event.from,
              fromJail: fromJail(event.playerId),
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
  /** The waiting steps, oldest first. */
  pending: () => MotionStep[];
  readonly size: number;
}

export function createMotionQueue(): MotionQueue {
  let steps: MotionStep[] = [];
  return {
    push(events) {
      steps = steps.concat(planMotion(events));
    },
    next: () => steps.shift(),
    pending: () => [...steps],
    clear() {
      steps = [];
    },
    get size() {
      return steps.length;
    },
  };
}
