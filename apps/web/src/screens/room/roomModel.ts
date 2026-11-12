import { MAX_SEATS, type Game, type Seat } from "@monopoly/shared";
import { isApiError } from "../../api/index.ts";
import { joinNames } from "../../i18n/index.ts";
import type { Translate } from "../../i18n/index.ts";

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
  /** The host can remove this joined player, with the hot-seat seats on their device. */
  playerRemovable: boolean;
}

export function seatLabels(game: Game, seat: Seat, userId: string, t: Translate): SeatLabels {
  const mine = seat.controllerUserId === userId;
  const controller = game.seats.find(
    (s) => s.kind === "user" && s.userId === seat.controllerUserId,
  );
  let note = t("room.seat.joined");
  if (seat.kind === "hotseat") {
    note = mine
      ? t("room.seat.thisDevice")
      : controller
        ? t("room.seat.deviceOf", { name: controller.name })
        : t("room.seat.otherDevice");
  }
  return {
    host: seat.userId === game.ownerId,
    you: seat.userId === userId,
    thisDevice: seat.kind === "hotseat" && mine,
    note,
    removable: game.status === "waiting" && seat.kind === "hotseat" && mine,
    playerRemovable:
      game.status === "waiting" &&
      game.ownerId === userId &&
      seat.kind === "user" &&
      seat.userId !== userId,
  };
}

/**
 * What the host reads in the restore room about the seats that have not claimed yet. Start is
 * never blocked: the game waits for the player whose turn it is (gameplay 3.2).
 */
export function notBackHint(seats: readonly Seat[], t: Translate): string {
  const names = seats.filter((seat) => !seat.claimed).map((seat) => seat.name);
  if (names.length === 0) return t("room.notBack.none");
  if (names.length === 1) {
    return t("room.notBack.one", { name: names[0]! });
  }
  return t("room.notBack.many", { list: joinNames(names, t) });
}

export type RoomAction =
  | "join"
  | "leave"
  | "start"
  | "remove"
  | "removePlayer"
  | "add"
  | "token"
  | "invite"
  | "cancel"
  | "claim"
  | "restore";

/**
 * "Waiting for Ravi to accept." for the invites that are still pending, or "" for none. The start
 * hint adds it, so the host knows who has not answered when they decide to start.
 */
export function waitingForInvitees(invites: readonly { name: string }[], t: Translate): string {
  const names = invites.map((invite) => invite.name);
  if (names.length === 0) return "";
  return t("room.waitingForInvitees", { list: joinNames(names, t) });
}

export function errorText(action: RoomAction, error: unknown, t: Translate): string {
  if (isApiError(error)) {
    switch (error.code) {
      case "seat_name_taken":
        return action === "join" ? t("room.error.takenOnJoin") : t("room.error.seatTaken");
      case "game_full":
        return t("room.error.full");
      case "game_not_waiting":
        return t("room.error.started");
      case "game_not_saved":
        return t("room.error.notSaved");
      case "not_enough_players":
        return t("room.notEnough");
      case "already_joined":
        return t("room.error.alreadyJoined");
      case "already_invited":
        return t("room.error.alreadyInvited");
      case "cannot_invite_self":
        return t("room.error.inviteSelf");
      case "token_taken":
        return t("room.error.tokenTaken");
      case "owner_cannot_leave":
        return t("room.error.ownerLeave");
      case "not_a_member":
      case "not_your_seat":
        return t("room.error.notYourSeat");
      case "not_game_owner":
        return t("room.error.notOwner");
      case "cannot_remove_self":
        return t("room.error.removeSelf");
      case "not_found":
        if (action === "removePlayer") return t("room.error.playerGone");
        return action === "join" || action === "cancel"
          ? t("room.error.gameGone")
          : t("room.error.seatGone");
    }
  }
  return t("room.error.failed");
}
