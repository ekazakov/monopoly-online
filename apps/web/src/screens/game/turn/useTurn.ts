import type { ActionType } from "@monopoly/game-engine";
import type { ActionInput, PresenceStatus, Seat } from "@monopoly/shared";
import { seatThatMayAct, useGame, useGameActions, useGameSelector } from "../../../game/index.ts";
import type { GameView } from "../../../game/index.ts";

export type DiceValues = readonly [number, number];

export interface Turn {
  userId: string;
  view: GameView;
  /** The seat of this device that must act now, or null: this device only watches. */
  actor: Seat | null;
  /** The name of the player who must act now, also when that player is on another device. */
  actorName: string;
  /**
   * Whether the player who must act is there, when that player is on another device. Null for a
   * seat of this device, and while the server has not said.
   */
  actorPresence: PresenceStatus | null;
  /** This user owns the game, so the Menu has Save and Finish for a game that waits. */
  isOwner: boolean;
  /** An action is on its way: every button that sends one stays disabled. */
  pending: boolean;
  /** This device has a seat that may do the action now, and no action is pending. */
  can: (type: ActionType) => boolean;
  /** Sends the action as the seat that may do it. Does nothing when no seat may. */
  send: (action: ActionInput) => void;
}

/** The last roll: the dice of this turn, or the latest roll in the log (`stale`) before a new roll. */
export function lastRoll(view: GameView): { dice: DiceValues | null; stale: boolean } {
  const current = view.state?.turn.dice ?? null;
  if (current) return { dice: current, stale: false };
  for (let i = view.events.length - 1; i >= 0; i--) {
    const event = view.events[i]?.event;
    if (event?.type === "DiceRolled") return { dice: event.dice, stale: true };
  }
  return { dice: null, stale: false };
}

export function useTurn(userId: string): Turn {
  const view = useGame(userId);
  const actions = useGameActions();
  const { pending } = actions;
  const { game, state } = view;
  const presence = useGameSelector((s) => s.presence);

  const actorSeat = view.actingSeat;
  const actorName =
    state?.players.find((p) => p.id === actorSeat?.id)?.name ?? actorSeat?.name ?? "";
  const seatFor = (type?: ActionType) => seatThatMayAct(game, state, userId, type);

  return {
    userId,
    view,
    actor: seatFor(),
    actorName,
    actorPresence:
      actorSeat && !view.mySeats.some((s) => s.id === actorSeat.id)
        ? (presence[actorSeat.id] ?? null)
        : null,
    isOwner: game?.ownerId === userId,
    pending,
    can: (type) => !pending && seatFor(type) !== null,
    send(action) {
      const seat = seatFor(action.type);
      if (!seat || pending) return;
      // A rejection shows through `error` of the actions context, so it is not thrown again here.
      void Promise.resolve(actions.send(action, { seatId: seat.id })).catch(() => {});
    },
  };
}
