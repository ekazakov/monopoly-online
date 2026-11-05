import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
// The app (and with it `@hono/zod-openapi`) loads before `@monopoly/shared`, as the zod extension needs.
import { createTestApp, postJson, sendAs, signIn } from "../auth/test-helpers.ts";
import {
  MAX_SEATS,
  apiErrorSchema,
  gameResponseSchema,
  invitesResponseSchema,
} from "@monopoly/shared";
import type { Game, User } from "@monopoly/shared";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import type { RoomEvent } from "../rooms/service.ts";

const START = new Date("2026-01-01T00:00:00.000Z");
const MISSING_ID = "00000000-0000-4000-8000-0000000000aa";

describe("invite routes", () => {
  let db: Kysely<Database>;
  let app: Awaited<ReturnType<typeof createTestApp>>["app"];
  let events: RoomEvent[];
  let clock = START;
  const tick = () => {
    clock = new Date(clock.getTime() + 1000);
  };

  beforeEach(async () => {
    events = [];
    clock = START;
    ({ app, db } = await createTestApp({ now: () => clock, onRoomEvent: (e) => events.push(e) }));
  });

  afterEach(async () => {
    await db.destroy();
  });

  type Player = { cookie: string; user: User };

  const errorCode = async (res: Response) => apiErrorSchema.parse(await res.json()).error.code;
  const gameOf = async (res: Response) => gameResponseSchema.parse(await res.json()).game;

  async function createRoom(owner: Player, name = "Harbor") {
    const res = await postJson(app, "/api/games", owner.cookie, { name });
    expect(res.status).toBe(201);
    return gameOf(res);
  }
  const invite = (game: Game, host: Player, name: string) =>
    postJson(app, `/api/games/${game.id}/invites`, host.cookie, { name });
  const accept = (id: string, who: Player) =>
    sendAs(app, "POST", `/api/invites/${id}/accept`, who.cookie);
  const decline = (id: string, who: Player) =>
    sendAs(app, "POST", `/api/invites/${id}/decline`, who.cookie);
  const join = (game: Game, who: Player) =>
    sendAs(app, "POST", `/api/games/${game.id}/join`, who.cookie);
  const start = (game: Game, who: Player) =>
    sendAs(app, "POST", `/api/games/${game.id}/start`, who.cookie);
  const myInvites = async (who: Player) => {
    const res = await sendAs(app, "GET", "/api/me/invites", who.cookie);
    expect(res.status).toBe(200);
    return invitesResponseSchema.parse(await res.json()).invites;
  };
  const stateOf = async (inviteId: string) =>
    (await db.selectFrom("invites").select("state").where("id", "=", inviteId).executeTakeFirst())
      ?.state;

  /** Ann hosts a game and has invited Bo. */
  async function invited() {
    const ann = await signIn(app, "Ann");
    const bo = await signIn(app, "Bo");
    const room = await createRoom(ann);
    const withInvite = await gameOf(await invite(room, ann, "Bo"));
    return { ann, bo, room, inviteId: withInvite.invites[0]!.id };
  }

  describe("invite by name", () => {
    test("the name match ignores case; the invite shows in the game and holds no seat", async () => {
      const ann = await signIn(app, "Ann");
      const bo = await signIn(app, "Bo");
      const room = await createRoom(ann);
      events.length = 0;

      const res = await invite(room, ann, "bO");
      expect(res.status).toBe(201);
      const game = await gameOf(res);
      expect(game.invites).toEqual([
        { id: expect.any(String), userId: bo.user.id, name: "Bo", state: "pending" },
      ]);
      expect(game.seats).toHaveLength(1);
      expect(events.map((e) => e.type)).toEqual(["room.updated", "invites.updated"]);
      expect(events[1]).toEqual({ type: "invites.updated", userIds: [bo.user.id] });

      const read = await sendAs(app, "GET", `/api/games/${room.id}`, bo.cookie);
      expect((await gameOf(read)).invites).toHaveLength(1);
    });

    test("only the host invites: not_game_owner", async () => {
      const { bo, room } = await invited();
      const cy = await signIn(app, "Cy");
      await join(room, bo);
      for (const who of [bo, cy]) {
        const res = await invite(room, who, "Cy");
        expect(res.status).toBe(403);
        expect(await errorCode(res)).toBe("not_game_owner");
      }
    });

    test("after start the invite is game_not_waiting", async () => {
      const { ann, bo, room } = await invited();
      await join(room, bo);
      await signIn(app, "Cy");
      await start(room, ann);
      const res = await invite(room, ann, "Cy");
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("game_not_waiting");
    });

    test("an unknown name is 404 user_not_found; an unknown game is 404", async () => {
      const ann = await signIn(app, "Ann");
      const room = await createRoom(ann);
      const unknown = await invite(room, ann, "Nobody");
      expect(unknown.status).toBe(404);
      expect(await errorCode(unknown)).toBe("user_not_found");
      const noGame = await postJson(app, `/api/games/${MISSING_ID}/invites`, ann.cookie, {
        name: "Bo",
      });
      expect(noGame.status).toBe(404);
      expect(await errorCode(noGame)).toBe("not_found");
    });

    test("the host cannot invite themself", async () => {
      const ann = await signIn(app, "Ann");
      const room = await createRoom(ann);
      const res = await invite(room, ann, "ANN");
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("cannot_invite_self");
    });

    test("a user who has a seat is already_joined", async () => {
      const ann = await signIn(app, "Ann");
      const bo = await signIn(app, "Bo");
      const room = await createRoom(ann);
      await join(room, bo);
      const res = await invite(room, ann, "Bo");
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("already_joined");
    });

    test("a pending invite is already_invited", async () => {
      const { ann, room } = await invited();
      const res = await invite(room, ann, "Bo");
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("already_invited");
    });

    test("a name of 1 character is a validation error", async () => {
      const ann = await signIn(app, "Ann");
      const room = await createRoom(ann);
      const res = await invite(room, ann, "B");
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe("validation_error");
    });

    test("a declined invite goes back to pending with a new time", async () => {
      const { ann, bo, room, inviteId } = await invited();
      await decline(inviteId, bo);
      expect(await stateOf(inviteId)).toBe("declined");
      tick();
      const again = await gameOf(await invite(room, ann, "Bo"));
      // The same row: there is one invite for each invited user.
      expect(again.invites.map((i) => [i.id, i.state])).toEqual([[inviteId, "pending"]]);
      const [row] = await myInvites(bo);
      expect(row).toMatchObject({ id: inviteId, createdAt: clock.toISOString() });
    });
  });

  describe("my invites", () => {
    test("lists the pending invites of the user, newest first, with game and host names", async () => {
      const ann = await signIn(app, "Ann");
      const cy = await signIn(app, "Cy");
      const bo = await signIn(app, "Bo");
      const first = await createRoom(ann, "First");
      tick();
      const second = await createRoom(cy, "Second");
      await invite(first, ann, "Bo");
      tick();
      await invite(second, cy, "Bo");

      expect(await myInvites(bo)).toEqual([
        {
          id: expect.any(String),
          gameId: second.id,
          gameName: "Second",
          hostName: "Cy",
          state: "pending",
          createdAt: clock.toISOString(),
        },
        {
          id: expect.any(String),
          gameId: first.id,
          gameName: "First",
          hostName: "Ann",
          state: "pending",
          // Sent after the first tick, one second after the start.
          createdAt: new Date(START.getTime() + 1000).toISOString(),
        },
      ]);
      expect(await myInvites(ann)).toEqual([]);
    });

    test("needs a session", async () => {
      expect((await sendAs(app, "GET", "/api/me/invites")).status).toBe(401);
      expect((await sendAs(app, "POST", `/api/invites/${MISSING_ID}/accept`)).status).toBe(401);
      expect((await sendAs(app, "POST", `/api/invites/${MISSING_ID}/decline`)).status).toBe(401);
    });
  });

  describe("accept", () => {
    test("seats the invitee, sets the invite to accepted and announces it", async () => {
      const { bo, room, inviteId } = await invited();
      events.length = 0;
      const res = await accept(inviteId, bo);
      expect(res.status).toBe(200);
      const game = await gameOf(res);
      expect(game.id).toBe(room.id);
      expect(game.seats.map((s) => [s.name, s.token])).toEqual([
        ["Ann", "dog"],
        ["Bo", "cat"],
      ]);
      expect(game.invites).toEqual([]);
      expect(await stateOf(inviteId)).toBe("accepted");
      expect(await myInvites(bo)).toEqual([]);
      expect(events.map((e) => e.type)).toEqual(["room.updated", "invites.updated"]);
    });

    test("a full game is game_full, and the invite stays pending", async () => {
      const { room, bo, inviteId } = await invited();
      for (let i = 1; i < MAX_SEATS; i++) {
        expect((await join(room, await signIn(app, `Player${i}`))).status).toBe(200);
      }
      const res = await accept(inviteId, bo);
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("game_full");
      expect(await stateOf(inviteId)).toBe("pending");
      expect(await db.selectFrom("seats").select("id").execute()).toHaveLength(MAX_SEATS);
    });

    test("a hot-seat seat with the name of the invitee is seat_name_taken", async () => {
      const { ann, bo, room, inviteId } = await invited();
      await postJson(app, `/api/games/${room.id}/seats`, ann.cookie, { name: "Bo" });
      const res = await accept(inviteId, bo);
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("seat_name_taken");
      expect(await stateOf(inviteId)).toBe("pending");
    });

    test("after start the invite has expired and the accept is game_not_waiting", async () => {
      const { ann, room, bo, inviteId } = await invited();
      await postJson(app, `/api/games/${room.id}/seats`, ann.cookie, { name: "Guest" });
      expect((await start(room, ann)).status).toBe(200);
      const res = await accept(inviteId, bo);
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("game_not_waiting");
      expect(await db.selectFrom("seats").select("id").execute()).toHaveLength(2);
    });

    test("a user who is not the invitee gets 404 not_found, as does an unknown or bad id", async () => {
      const { ann, inviteId } = await invited();
      const cy = await signIn(app, "Cy");
      for (const [id, who] of [
        [inviteId, cy],
        [inviteId, ann],
        [MISSING_ID, cy],
        ["not-a-uuid", cy],
      ] as const) {
        const res = await accept(id, who);
        expect(res.status).toBe(404);
        expect(await errorCode(res)).toBe("not_found");
      }
      expect(await stateOf(inviteId)).toBe("pending");
    });

    test("a second accept and an accept after a decline are 404", async () => {
      const { bo, inviteId } = await invited();
      expect((await accept(inviteId, bo)).status).toBe(200);
      expect((await accept(inviteId, bo)).status).toBe(404);

      const other = await invited2();
      expect((await decline(other.inviteId, other.bo)).status).toBe(204);
      expect((await accept(other.inviteId, other.bo)).status).toBe(404);
    });

    test("a user who joins by the link no longer has a pending invite", async () => {
      const { bo, room, inviteId } = await invited();
      events.length = 0;
      expect((await join(room, bo)).status).toBe(200);
      expect(await stateOf(inviteId)).toBe("accepted");
      expect(await myInvites(bo)).toEqual([]);
      expect(events.map((e) => e.type)).toEqual(["room.updated", "invites.updated"]);
    });
  });

  /** A second host and invitee, for a test that needs two invites. */
  async function invited2() {
    const dee = await signIn(app, "Dee");
    const eve = await signIn(app, "Eve");
    const room = await createRoom(dee, "Second");
    const game = await gameOf(await invite(room, dee, "Eve"));
    return { dee, bo: eve, inviteId: game.invites[0]!.id };
  }

  describe("decline", () => {
    test("sets the invite to declined, empties the inbox and tells the host", async () => {
      const { bo, room, inviteId } = await invited();
      events.length = 0;
      const res = await decline(inviteId, bo);
      expect(res.status).toBe(204);
      expect(await res.text()).toBe("");
      expect(await stateOf(inviteId)).toBe("declined");
      expect(await myInvites(bo)).toEqual([]);
      expect(events.map((e) => e.type)).toEqual(["room.updated", "invites.updated"]);
      const updated = events[0]!;
      if (updated.type !== "room.updated") throw new Error("unreachable");
      expect(updated.game.id).toBe(room.id);
      expect(updated.game.invites).toEqual([]);
    });

    test("a user who is not the invitee gets 404; a second decline is 404", async () => {
      const { ann, bo, inviteId } = await invited();
      const cy = await signIn(app, "Cy");
      for (const who of [cy, ann]) {
        const res = await decline(inviteId, who);
        expect(res.status).toBe(404);
        expect(await errorCode(res)).toBe("not_found");
      }
      expect((await decline(inviteId, bo)).status).toBe(204);
      expect((await decline(inviteId, bo)).status).toBe(404);
    });

    test("after start the decline is game_not_waiting", async () => {
      const { ann, room, bo, inviteId } = await invited();
      await postJson(app, `/api/games/${room.id}/seats`, ann.cookie, { name: "Guest" });
      await start(room, ann);
      const res = await decline(inviteId, bo);
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("game_not_waiting");
    });
  });

  describe("start and cancel", () => {
    test("start expires the pending invites and announces it to the invitees", async () => {
      const { ann, room, bo, inviteId } = await invited();
      const cy = await signIn(app, "Cy");
      await invite(room, ann, "Cy");
      const declined = await signIn(app, "Dee");
      const declinedInvite = (await gameOf(await invite(room, ann, "Dee"))).invites.find(
        (i) => i.userId === declined.user.id,
      )!;
      await decline(declinedInvite.id, declined);
      await postJson(app, `/api/games/${room.id}/seats`, ann.cookie, { name: "Guest" });
      events.length = 0;

      expect((await start(room, ann)).status).toBe(200);

      expect(await stateOf(inviteId)).toBe("expired");
      expect(await stateOf(declinedInvite.id)).toBe("declined");
      expect(await myInvites(bo)).toEqual([]);
      expect(await myInvites(cy)).toEqual([]);
      const announced = events.find((e) => e.type === "invites.updated");
      if (announced?.type !== "invites.updated") throw new Error("unreachable");
      expect(announced.userIds.sort()).toEqual([bo.user.id, cy.user.id].sort());
    });

    test("a start without invites announces nothing about invites", async () => {
      const ann = await signIn(app, "Ann");
      const room = await createRoom(ann);
      await postJson(app, `/api/games/${room.id}/seats`, ann.cookie, { name: "Guest" });
      events.length = 0;
      await start(room, ann);
      expect(events.map((e) => e.type)).toEqual(["started"]);
    });

    test("cancel removes the invites with the game and announces it to the invitees", async () => {
      const { ann, bo, room, inviteId } = await invited();
      events.length = 0;
      expect((await sendAs(app, "DELETE", `/api/games/${room.id}`, ann.cookie)).status).toBe(204);
      expect(await stateOf(inviteId)).toBeUndefined();
      expect(await myInvites(bo)).toEqual([]);
      expect(events).toEqual([
        { type: "room.cancelled", gameId: room.id },
        { type: "invites.updated", userIds: [bo.user.id] },
      ]);
    });
  });
});
