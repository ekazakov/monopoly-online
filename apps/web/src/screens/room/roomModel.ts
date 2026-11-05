import { MAX_SEATS, type Game, type Seat } from "@monopoly/shared";
import { isApiError } from "../../api/index.ts";

export interface RoomView {
  isOwner: boolean;
  seated: boolean;
  full: boolean;
  host: Seat | undefined;
  canStart: boolean;
}

export function roomView(game: Game, userId: string): RoomView {
  return {
    isOwner: game.ownerId === userId,
    seated: game.seats.some((seat) => seat.controllerUserId === userId),
    full: game.seats.length >= MAX_SEATS,
    host: game.seats.find((seat) => seat.userId === game.ownerId),
    canStart: game.seats.length >= 2,
  };
}

export interface SeatLabels {
  host: boolean;
  you: boolean;
  thisDevice: boolean;
  note: string;
  removable: boolean;
}

export function seatLabels(game: Game, seat: Seat, userId: string): SeatLabels {
  const mine = seat.controllerUserId === userId;
  const controller = game.seats.find(
    (s) => s.kind === "user" && s.userId === seat.controllerUserId,
  );
  let note = "Joined";
  if (seat.kind === "hotseat") {
    note = mine
      ? "Plays on this device"
      : controller
        ? `Plays on ${controller.name}'s device`
        : "Plays on another device";
  }
  return {
    host: seat.userId === game.ownerId,
    you: seat.userId === userId,
    thisDevice: seat.kind === "hotseat" && mine,
    note,
    removable: game.status === "waiting" && seat.kind === "hotseat" && mine,
  };
}

export const roomCopy = {
  takenOnJoin:
    "A seat in this game already uses your name. Ask the person who controls that seat to change its name, then try again.",
  full: "This game is full.",
  started: "This game has already started.",
  notEnough: "Add at least one more player to start.",
  seatTaken: "A seat already uses that name. Try another one.",
  failed: "That did not work. Check the connection and try again.",
} as const;

export type RoomAction =
  | "join"
  | "leave"
  | "start"
  | "remove"
  | "add"
  | "token"
  | "invite"
  | "cancel";

/**
 * "Waiting for Ravi to accept." for the invites that are still pending, or "" for none. The start
 * hint adds it, so the host knows who has not answered when they decide to start.
 */
export function waitingForInvitees(invites: readonly { name: string }[]): string {
  const names = invites.map((invite) => invite.name);
  if (names.length === 0) return "";
  const list =
    names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `Waiting for ${list} to accept.`;
}

export function errorText(action: RoomAction, error: unknown): string {
  if (isApiError(error)) {
    switch (error.code) {
      case "seat_name_taken":
        return action === "join" ? roomCopy.takenOnJoin : roomCopy.seatTaken;
      case "game_full":
        return roomCopy.full;
      case "game_not_waiting":
        return roomCopy.started;
      case "not_enough_players":
        return roomCopy.notEnough;
      case "already_joined":
        return "Already in this game.";
      case "already_invited":
        return "Already invited. They have not answered yet.";
      case "cannot_invite_self":
        return "You are already in this game.";
      case "token_taken":
        return "Another player just took that figure. Pick a different one.";
      case "owner_cannot_leave":
        return "The host cannot leave the game.";
      case "not_a_member":
      case "not_your_seat":
        return "You can only change the seats on your own device.";
      case "not_game_owner":
        return "Only the host can do that.";
      case "not_found":
        return action === "join" || action === "cancel"
          ? "This game no longer exists. The host may have cancelled it."
          : "This seat is already gone.";
    }
  }
  return roomCopy.failed;
}
