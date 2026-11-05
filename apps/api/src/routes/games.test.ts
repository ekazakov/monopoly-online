import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
// The app (and with it `@hono/zod-openapi`) loads before `@monopoly/shared`, as the zod extension needs.
import { createTestApp, postJson, sendAs, signIn } from "../auth/test-helpers.ts";
import {
  MAX_SEATS,
  TOKENS,
  apiErrorSchema,
  gameResponseSchema,
  lobbyGamesResponseSchema,
  redactedGameStateSchema,
  startGameResponseSchema,
} from "@monopoly/shared";
import type { Game, User } from "@monopoly/shared";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { createGameStateLoader, deserializeState } from "../game/loader.ts";
import type { RoomEvent } from "../rooms/service.ts";

const START = new Date("2026-01-01T00:00:00.000Z");
const MISSING_ID = "00000000-0000-4000-8000-0000000000aa";

describe("game room routes", () => {
  let db: Kysely<Database>;
  let app: Awaited<ReturnType<typeof createTestApp>>["app"];
  let events: RoomEvent[];
  let seed = 1;

  beforeEach(async () => {
    events = [];
    seed = 1;
    ({ app, db } = await createTestApp({
      now: () => START,
      seed: () => seed,
      onRoomEvent: (e) => events.push(e),
    }));
  });

  afterEach(async () => {
    await db.destroy();
  });

  const errorCode = async (res: Response) => apiErrorSchema.parse(await res.json()).error.code;
  const gameOf = async (res: Response) => gameResponseSchema.parse(await res.json()).game;
  const orders = (game: Game) => game.seats.map((s) => s.order);
  const names = (game: Game) => game.seats.map((s) => s.name);

  type Player = { cookie: string; user: User };

  async function createRoom(owner: Player, name = "Harbor") {
    const res = await postJson(app, "/api/games", owner.cookie, { name });
    expect(res.status).toBe(201);
    return gameOf(res);
  }
  const join = (game: Game, who: Player) =>
    sendAs(app, "POST", `/api/games/${game.id}/join`, who.cookie);
  const leave = (game: Game, who: Player) =>
    sendAs(app, "POST", `/api/games/${game.id}/leave`, who.cookie);
  const addSeat = (game: Game, who: Player, name: string) =>
    postJson(app, `/api/games/${game.id}/seats`, who.cookie, { name });
  const removeSeat = (game: Game, who: Player, seatId: string) =>
    sendAs(app, "DELETE", `/api/games/${game.id}/seats/${seatId}`, who.cookie);
  const start = (game: Game, who: Player) =>
    sendAs(app, "POST", `/api/games/${game.id}/start`, who.cookie);

  /** An owner and `count - 1` more users, all seated. */
  async function fullRoom(count: number) {
    const owner = await signIn(app, "Ann");
    const room = await createRoom(owner);
    const others: Player[] = [];
    for (let i = 1; i < count; i++) {
      const p = await signIn(app, `Player${i}`);
      expect((await join(room, p)).status).toBe(200);
      others.push(p);
    }
    return { owner, others, room };
  }

  describe("create and read", () => {
    test("creates a waiting game with the owner on seat 1", async () => {
      const ann = await signIn(app, "Ann");
      const res = await postJson(app, "/api/games", ann.cookie, { name: "  Harbor  " });
      expect(res.status).toBe(201);
      const game = await gameOf(res);
      expect(game).toMatchObject({
        name: "Harbor",
        status: "waiting",
        version: 0,
        ownerId: ann.user.id,
        createdAt: START.toISOString(),
      });
      expect(game.seats).toEqual([
        {
          id: expect.any(String),
          order: 1,
          name: "Ann",
          kind: "user",
          userId: ann.user.id,
          controllerUserId: ann.user.id,
          token: "dog",
        },
      ]);
      expect(game.invites).toEqual([]);
    });

    test("seats get the tokens of the free-token order", async () => {
      const { owner, room } = await fullRoom(6);
      const game = await gameOf(await sendAs(app, "GET", `/api/games/${room.id}`, owner.cookie));
      expect(game.seats.map((seat) => seat.token)).toEqual([
        "dog",
        "cat",
        "penguin",
        "car",
        "horse",
        "duck",
      ]);
    });

    test("any signed-in user can read the game; seats are in order", async () => {
      const { room } = await fullRoom(3);
      const bo = await signIn(app, "Outsider");
      const res = await sendAs(app, "GET", `/api/games/${room.id}`, bo.cookie);
      expect(res.status).toBe(200);
      const game = await gameOf(res);
      expect(game.id).toBe(room.id);
      expect(orders(game)).toEqual([1, 2, 3]);
      expect(names(game)).toEqual(["Ann", "Player1", "Player2"]);
    });

    test("unknown game and malformed id are 404 not_found", async () => {
      const ann = await signIn(app, "Ann");
      for (const id of [MISSING_ID, "not-a-uuid"]) {
        const res = await sendAs(app, "GET", `/api/games/${id}`, ann.cookie);
        expect(res.status).toBe(404);
        expect(await errorCode(res)).toBe("not_found");
      }
      const join404 = await sendAs(app, "POST", "/api/games/not-a-uuid/join", ann.cookie);
      expect(join404.status).toBe(404);
    });

    test.each([
      ["empty name", { name: "" }],
      ["spaces only", { name: "   " }],
      ["61 characters", { name: "x".repeat(61) }],
      ["an extra key", { name: "Harbor", seatLimit: 4 }],
      ["no body fields", {}],
    ])("rejects %s with validation_error", async (_label, body) => {
      const ann = await signIn(app, "Ann");
      const res = await postJson(app, "/api/games", ann.cookie, body);
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe("validation_error");
      expect(await db.selectFrom("games").select("id").execute()).toEqual([]);
    });

    test("accepts a name of 1 and of 60 characters", async () => {
      const ann = await signIn(app, "Ann");
      expect((await postJson(app, "/api/games", ann.cookie, { name: "x" })).status).toBe(201);
      expect((await postJson(app, "/api/games", ann.cookie, { name: "x".repeat(60) })).status).toBe(
        201,
      );
    });

    test("every route answers 401 without a session", async () => {
      const ann = await signIn(app, "Ann");
      const room = await createRoom(ann);
      const base = `/api/games/${room.id}`;
      const responses = [
        await postJson(app, "/api/games", undefined, { name: "Harbor" }),
        await sendAs(app, "GET", base),
        await sendAs(app, "POST", `${base}/join`),
        await sendAs(app, "POST", `${base}/leave`),
        await postJson(app, `${base}/seats`, undefined, { name: "Cy" }),
        await sendAs(app, "DELETE", `${base}/seats/${MISSING_ID}`),
        await sendAs(app, "POST", `${base}/start`),
      ];
      for (const res of responses) {
        expect(res.status).toBe(401);
        expect(await errorCode(res)).toBe("unauthorized");
      }
    });

    test("a foreign Origin is refused", async () => {
      const ann = await signIn(app, "Ann");
      const res = await app.request("/api/games", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: ann.cookie,
          origin: "https://evil.example",
        },
        body: JSON.stringify({ name: "Harbor" }),
      });
      expect(res.status).toBe(403);
      expect(await errorCode(res)).toBe("forbidden_origin");
    });
  });

  describe("join and leave", () => {
    test("join adds a user seat named after the user", async () => {
      const ann = await signIn(app, "Ann");
      const bo = await signIn(app, "Bo");
      const room = await createRoom(ann);
      const res = await join(room, bo);
      expect(res.status).toBe(200);
      const game = await gameOf(res);
      expect(game.seats[1]).toMatchObject({
        order: 2,
        name: "Bo",
        kind: "user",
        userId: bo.user.id,
        controllerUserId: bo.user.id,
      });
      expect(game.seats).toHaveLength(2);
    });

    test("join twice is already_joined; the owner cannot join their own game", async () => {
      const ann = await signIn(app, "Ann");
      const bo = await signIn(app, "Bo");
      const room = await createRoom(ann);
      await join(room, bo);
      for (const who of [bo, ann]) {
        const res = await join(room, who);
        expect(res.status).toBe(409);
        expect(await errorCode(res)).toBe("already_joined");
      }
      const game = await gameOf(await sendAs(app, "GET", `/api/games/${room.id}`, ann.cookie));
      expect(game.seats).toHaveLength(2);
    });

    test("join an unknown game is 404", async () => {
      const bo = await signIn(app, "Bo");
      const res = await sendAs(app, "POST", `/api/games/${MISSING_ID}/join`, bo.cookie);
      expect(res.status).toBe(404);
      expect(await errorCode(res)).toBe("not_found");
    });

    test("a full room refuses the 7th join and a hot-seat add", async () => {
      const { owner, room } = await fullRoom(MAX_SEATS);
      const late = await signIn(app, "Late");
      const res = await join(room, late);
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("game_full");
      const hot = await addSeat(room, owner, "Hot");
      expect(hot.status).toBe(409);
      expect(await errorCode(hot)).toBe("game_full");
      expect(await db.selectFrom("seats").select("id").execute()).toHaveLength(MAX_SEATS);
    });

    test("two joins for the last seat: one wins, one is game_full", async () => {
      const { room } = await fullRoom(MAX_SEATS - 1);
      const a = await signIn(app, "RaceA");
      const b = await signIn(app, "RaceB");
      const [ra, rb] = await Promise.all([join(room, a), join(room, b)]);
      expect([ra.status, rb.status].sort((x, y) => x - y)).toEqual([200, 409]);
      expect(await errorCode(ra.status === 409 ? ra : rb)).toBe("game_full");
      const seats = await db
        .selectFrom("seats")
        .select("seat_order")
        .orderBy("seat_order")
        .execute();
      expect(seats.map((s) => s.seat_order)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    test("join with the name of a hot-seat seat is seat_name_taken; remove and add again recovers", async () => {
      const ann = await signIn(app, "Ann");
      const bo = await signIn(app, "Bo");
      const room = await createRoom(ann);
      const withHot = await gameOf(await addSeat(room, ann, "bo"));
      const res = await join(room, bo);
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("seat_name_taken");

      const hotId = withHot.seats[1]!.id;
      expect((await removeSeat(room, ann, hotId)).status).toBe(200);
      expect((await addSeat(room, ann, "Bobby")).status).toBe(201);
      const joined = await join(room, bo);
      expect(joined.status).toBe(200);
      expect(names(await gameOf(joined))).toEqual(["Ann", "Bobby", "Bo"]);
    });

    test("leave removes the user's seat and hot-seat seats, and renumbers", async () => {
      const ann = await signIn(app, "Ann");
      const bo = await signIn(app, "Bo");
      const cy = await signIn(app, "Cy");
      const room = await createRoom(ann);
      await join(room, bo);
      await addSeat(room, bo, "BoTwo");
      await join(room, cy);
      await addSeat(room, ann, "AnnTwo");
      // Order now: Ann, Bo, BoTwo, Cy, AnnTwo.
      const res = await leave(room, bo);
      expect(res.status).toBe(200);
      const game = await gameOf(res);
      expect(names(game)).toEqual(["Ann", "Cy", "AnnTwo"]);
      expect(orders(game)).toEqual([1, 2, 3]);
      const rows = await db.selectFrom("seats").select(["name", "seat_order"]).execute();
      expect(rows).toHaveLength(3);
      // The user can join again.
      expect((await join(room, bo)).status).toBe(200);
    });

    test("leave without a seat is not_a_member; the owner cannot leave", async () => {
      const { owner, room } = await fullRoom(2);
      const stranger = await signIn(app, "Stranger");
      const a = await leave(room, stranger);
      expect(a.status).toBe(403);
      expect(await errorCode(a)).toBe("not_a_member");
      const b = await leave(room, owner);
      expect(b.status).toBe(409);
      expect(await errorCode(b)).toBe("owner_cannot_leave");
    });
  });

  describe("hot-seat seats", () => {
    test("add creates a hot-seat seat controlled by the caller", async () => {
      const ann = await signIn(app, "Ann");
      const room = await createRoom(ann);
      const res = await addSeat(room, ann, "  Guest  ");
      expect(res.status).toBe(201);
      const game = await gameOf(res);
      expect(game.seats[1]).toMatchObject({
        order: 2,
        name: "Guest",
        kind: "hotseat",
        userId: null,
        controllerUserId: ann.user.id,
      });
    });

    test("a joined player can add a hot-seat seat; a stranger cannot", async () => {
      const { room, others } = await fullRoom(2);
      expect((await addSeat(room, others[0]!, "Guest")).status).toBe(201);
      const stranger = await signIn(app, "Stranger");
      const res = await addSeat(room, stranger, "Other");
      expect(res.status).toBe(403);
      expect(await errorCode(res)).toBe("not_a_member");
    });

    test("names are unique per game, case-insensitive, including user seats", async () => {
      const ann = await signIn(app, "Ann");
      const room = await createRoom(ann);
      await addSeat(room, ann, "Guest");
      for (const name of ["guest", "GUEST", "ann"]) {
        const res = await addSeat(room, ann, name);
        expect(res.status).toBe(409);
        expect(await errorCode(res)).toBe("seat_name_taken");
      }
      // Another game may reuse the name.
      const other = await createRoom(ann, "Second");
      expect((await addSeat(other, ann, "Guest")).status).toBe(201);
    });

    test.each([["x"], ["x".repeat(17)], ["   "]])("rejects the name %j", async (name) => {
      const ann = await signIn(app, "Ann");
      const room = await createRoom(ann);
      const res = await addSeat(room, ann, name);
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe("validation_error");
    });

    test("remove deletes the seat and renumbers", async () => {
      const ann = await signIn(app, "Ann");
      const room = await createRoom(ann);
      await addSeat(room, ann, "One");
      const three = await gameOf(await addSeat(room, ann, "Two"));
      const res = await removeSeat(room, ann, three.seats[1]!.id);
      expect(res.status).toBe(200);
      const game = await gameOf(res);
      expect(names(game)).toEqual(["Ann", "Two"]);
      expect(orders(game)).toEqual([1, 2]);
    });

    test("remove rules: unknown seat, stranger, not your seat, user seats", async () => {
      const { owner, others, room } = await fullRoom(2);
      const bo = others[0]!;
      const withHot = await gameOf(await addSeat(room, bo, "BoGuest"));
      const hot = withHot.seats.find((s) => s.kind === "hotseat")!;
      const ownerSeat = withHot.seats[0]!;
      const stranger = await signIn(app, "Stranger");

      const unknown = await removeSeat(room, owner, MISSING_ID);
      expect([unknown.status, await errorCode(unknown)]).toEqual([404, "not_found"]);

      const asStranger = await removeSeat(room, stranger, hot.id);
      expect([asStranger.status, await errorCode(asStranger)]).toEqual([403, "not_a_member"]);

      const foreign = await removeSeat(room, owner, hot.id);
      expect([foreign.status, await errorCode(foreign)]).toEqual([403, "not_your_seat"]);

      const otherUserSeat = await removeSeat(room, bo, ownerSeat.id);
      expect([otherUserSeat.status, await errorCode(otherUserSeat)]).toEqual([
        403,
        "not_your_seat",
      ]);

      const ownUserSeat = await removeSeat(room, bo, withHot.seats[1]!.id);
      expect([ownUserSeat.status, await errorCode(ownUserSeat)]).toEqual([
        409,
        "cannot_remove_user_seat",
      ]);

      expect((await removeSeat(room, bo, hot.id)).status).toBe(200);
    });
  });

  describe("start", () => {
    test("non-owner start is 403 not_game_owner", async () => {
      const { others, room } = await fullRoom(2);
      const res = await start(room, others[0]!);
      expect(res.status).toBe(403);
      expect(await errorCode(res)).toBe("not_game_owner");
    });

    test("start with one seat is 409 not_enough_players", async () => {
      const ann = await signIn(app, "Ann");
      const room = await createRoom(ann);
      const res = await start(room, ann);
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("not_enough_players");
      expect(await db.selectFrom("game_snapshots").select("game_id").execute()).toEqual([]);
    });

    test("start an unknown game is 404", async () => {
      const ann = await signIn(app, "Ann");
      const res = await sendAs(app, "POST", `/api/games/${MISSING_ID}/start`, ann.cookie);
      expect(res.status).toBe(404);
    });

    test("an owner with one user seat and one hot-seat seat can start", async () => {
      const ann = await signIn(app, "Ann");
      const room = await createRoom(ann);
      await addSeat(room, ann, "Guest");
      expect((await start(room, ann)).status).toBe(200);
    });

    test("start makes the game active with a version 0 snapshot and a redacted state", async () => {
      const { owner, room } = await fullRoom(3);
      const res = await start(room, owner);
      expect(res.status).toBe(200);
      const body = startGameResponseSchema.parse(await res.json());
      expect(body.game).toMatchObject({ id: room.id, status: "active", version: 0 });
      expect(body.game.seats).toHaveLength(3);
      expect(body.state.version).toBe(0);
      expect(body.state).not.toHaveProperty("rng");
      expect(body.state).not.toHaveProperty("decks");
      expect(redactedGameStateSchema.safeParse(body.state).success).toBe(true);
      // Engine player id = seat id, name = seat name.
      expect(body.state.players.map((p) => p.id).sort()).toEqual(
        body.game.seats.map((s) => s.id).sort(),
      );
      expect(body.state.players.map((p) => p.name).sort()).toEqual(["Ann", "Player1", "Player2"]);

      const row = await db.selectFrom("games").selectAll().executeTakeFirstOrThrow();
      expect(row).toMatchObject({ status: "active", version: 0 });
      const snapshots = await db.selectFrom("game_snapshots").selectAll().execute();
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]).toMatchObject({ game_id: room.id, version: 0, turn_start: 1 });
      const stored = deserializeState(snapshots[0]!.state);
      expect(stored).toHaveProperty("rng");
      expect(stored).toHaveProperty("decks");
      expect(stored.players.map((p) => p.id)).toEqual(body.state.players.map((p) => p.id));

      const read = await gameOf(await sendAs(app, "GET", `/api/games/${room.id}`, owner.cookie));
      expect(read.status).toBe("active");
    });

    test("the same seed gives the same start state", async () => {
      const startWith = async (ownerName: string, startSeed: number) => {
        const owner = await signIn(app, ownerName);
        const room = await createRoom(owner);
        await addSeat(room, owner, "Guest");
        await addSeat(room, owner, "Other");
        seed = startSeed;
        const body = startGameResponseSchema.parse(await (await start(room, owner)).json());
        const row = await db
          .selectFrom("game_snapshots")
          .select("state")
          .where("game_id", "=", room.id)
          .executeTakeFirstOrThrow();
        const stored = deserializeState(row.state);
        // Seat ids are random, so describe the turn order by seat order.
        const seatOrder = new Map(body.game.seats.map((s) => [s.id, s.order]));
        return {
          turnOrder: body.state.players.map((p) => seatOrder.get(p.id)),
          decks: stored.decks,
          rng: stored.rng,
        };
      };
      const first = await startWith("OwnerA", 42);
      expect(await startWith("OwnerB", 42)).toEqual(first);
      expect((await startWith("OwnerC", 43)).decks).not.toEqual(first.decks);
    });

    test("start twice is game_not_waiting and writes one snapshot", async () => {
      const { owner, room } = await fullRoom(2);
      expect((await start(room, owner)).status).toBe(200);
      const again = await start(room, owner);
      expect(again.status).toBe(409);
      expect(await errorCode(again)).toBe("game_not_waiting");
      expect(await db.selectFrom("game_snapshots").select("game_id").execute()).toHaveLength(1);
    });

    test("two simultaneous starts: one wins", async () => {
      const { owner, room } = await fullRoom(2);
      const [a, b] = await Promise.all([start(room, owner), start(room, owner)]);
      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 409]);
      expect(await errorCode(a.status === 409 ? a : b)).toBe("game_not_waiting");
    });

    test("join, add, remove and leave after start are game_not_waiting", async () => {
      const { owner, others, room } = await fullRoom(2);
      const withHot = await gameOf(await addSeat(room, owner, "Guest"));
      const hotId = withHot.seats.find((s) => s.kind === "hotseat")!.id;
      expect((await start(room, owner)).status).toBe(200);
      const late = await signIn(app, "Late");

      const results = [
        await join(room, late),
        await addSeat(room, owner, "Another"),
        await removeSeat(room, owner, hotId),
        await leave(room, others[0]!),
        await leave(room, owner),
      ];
      for (const res of results) {
        expect(res.status).toBe(409);
        expect(await errorCode(res)).toBe("game_not_waiting");
      }
      expect(await db.selectFrom("seats").select("id").execute()).toHaveLength(3);
    });

    test("start puts the state in the loader cache", async () => {
      await db.destroy();
      // The loader never reaches the database here: a cache hit is the proof.
      const loader = createGameStateLoader({} as Kysely<Database>);
      ({ app, db } = await createTestApp({ seed: () => 7, loader }));
      const { owner, room } = await fullRoom(2);
      await start(room, owner);
      expect(await loader.load(room.id)).toMatchObject({ version: 0 });
    });
  });

  /** `fullRoom`, with `room` read again so that it holds the seats that joined. */
  async function seated(count: number) {
    const full = await fullRoom(count);
    const res = await sendAs(app, "GET", `/api/games/${full.room.id}`, full.owner.cookie);
    return { ...full, room: await gameOf(res) };
  }

  describe("seat tokens", () => {
    const setToken = (game: Game, who: Player, seatId: string, token: unknown) =>
      app.request(`/api/games/${game.id}/seats/${seatId}/token`, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: who.cookie },
        body: JSON.stringify({ token }),
      });
    const tokenOf = async (seatId: string) =>
      (
        await db
          .selectFrom("seats")
          .select("token")
          .where("id", "=", seatId)
          .executeTakeFirstOrThrow()
      ).token;

    test("6 seats get 6 different tokens, user seats and hot-seat seats alike", async () => {
      const { owner, room } = await seated(4);
      await addSeat(room, owner, "Guest1");
      const full = await gameOf(await addSeat(room, owner, "Guest2"));
      expect(full.seats).toHaveLength(MAX_SEATS);
      expect(new Set(full.seats.map((s) => s.token)).size).toBe(MAX_SEATS);
      expect(full.seats.map((s) => s.token)).toEqual([...TOKENS]);
    });

    test("a freed token is the next one given", async () => {
      const { owner, others, room } = await seated(3);
      await leave(room, others[0]!);
      const next = await gameOf(await addSeat(room, owner, "Guest"));
      expect(next.seats.map((s) => s.token)).toEqual([TOKENS[0], TOKENS[2], TOKENS[1]]);
    });

    test("the controller changes the token of a seat; the room is announced", async () => {
      const { owner, room } = await seated(2);
      events.length = 0;
      const res = await setToken(room, owner, room.seats[0]!.id, "duck");
      expect(res.status).toBe(200);
      const game = await gameOf(res);
      expect(game.seats[0]!.token).toBe("duck");
      expect(game.seats[1]!.token).toBe("cat");
      expect(events.map((e) => e.type)).toEqual(["room.updated"]);
    });

    test("the controller of a hot-seat seat changes its token", async () => {
      const { owner, room } = await seated(1);
      const withHot = await gameOf(await addSeat(room, owner, "Guest"));
      const hot = withHot.seats[1]!;
      const res = await setToken(room, owner, hot.id, "horse");
      expect(res.status).toBe(200);
      expect(await tokenOf(hot.id)).toBe("horse");
    });

    test("the token the seat has is accepted again", async () => {
      const { owner, room } = await seated(1);
      expect((await setToken(room, owner, room.seats[0]!.id, "dog")).status).toBe(200);
    });

    test("a user who does not control the seat gets not_your_seat; a stranger not_a_member", async () => {
      const { owner, others, room } = await seated(2);
      const stranger = await signIn(app, "Stranger");
      const ownerSeat = room.seats[0]!.id;

      const guest = await setToken(room, others[0]!, ownerSeat, "duck");
      expect(guest.status).toBe(403);
      expect(await errorCode(guest)).toBe("not_your_seat");

      const outsider = await setToken(room, stranger, ownerSeat, "duck");
      expect(outsider.status).toBe(403);
      expect(await errorCode(outsider)).toBe("not_a_member");

      expect(await tokenOf(ownerSeat)).toBe("dog");
      // The owner of the game does not control the seat of another user either.
      const other = await setToken(room, owner, room.seats[1]!.id, "duck");
      expect(await errorCode(other)).toBe("not_your_seat");
    });

    test("a token that another seat has is token_taken and the old token stays", async () => {
      const { owner, room } = await seated(2);
      const res = await setToken(room, owner, room.seats[0]!.id, "cat");
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("token_taken");
      expect(await tokenOf(room.seats[0]!.id)).toBe("dog");
      // The create and the join only: the refused change is not announced.
      expect(events.map((e) => e.type)).toEqual(["room.created", "room.updated"]);
    });

    test("two seats take the same free token at once: one wins, one is token_taken", async () => {
      const { owner, others, room } = await seated(2);
      const [a, b] = await Promise.all([
        setToken(room, owner, room.seats[0]!.id, "duck"),
        setToken(room, others[0]!, room.seats[1]!.id, "duck"),
      ]);
      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 409]);
      expect(await errorCode(a.status === 409 ? a : b)).toBe("token_taken");
    });

    test("the unique index refuses a duplicate token that gets past the service", async () => {
      const { room } = await seated(2);
      await expect(
        db.updateTable("seats").set({ token: "dog" }).where("id", "=", room.seats[1]!.id).execute(),
      ).rejects.toThrow(/UNIQUE/i);
    });

    test("after start the token is game_not_waiting", async () => {
      const { owner, room } = await seated(2);
      await start(room, owner);
      const res = await setToken(room, owner, room.seats[0]!.id, "duck");
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("game_not_waiting");
    });

    test("unknown seat and unknown game are 404; a bad token is 400", async () => {
      const { owner, room } = await seated(1);
      expect((await setToken(room, owner, MISSING_ID, "duck")).status).toBe(404);
      const noGame = await app.request(`/api/games/${MISSING_ID}/seats/${MISSING_ID}/token`, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: owner.cookie },
        body: JSON.stringify({ token: "duck" }),
      });
      expect(noGame.status).toBe(404);
      const bad = await setToken(room, owner, room.seats[0]!.id, "hat");
      expect(bad.status).toBe(400);
      expect(await errorCode(bad)).toBe("validation_error");
    });
  });

  describe("cancel", () => {
    const cancel = (game: Game, who: Player) =>
      sendAs(app, "DELETE", `/api/games/${game.id}`, who.cookie);

    test("the owner cancels a waiting game: 204, then the link is 404", async () => {
      const { owner, room } = await seated(2);
      events.length = 0;
      const res = await cancel(room, owner);
      expect(res.status).toBe(204);
      expect(await res.text()).toBe("");
      expect(events).toEqual([{ type: "room.cancelled", gameId: room.id }]);
      const after = await sendAs(app, "GET", `/api/games/${room.id}`, owner.cookie);
      expect(after.status).toBe(404);
    });

    test("a guest cannot cancel: not_game_owner, and the game stays", async () => {
      const { others, room } = await seated(2);
      events.length = 0;
      const res = await cancel(room, others[0]!);
      expect(res.status).toBe(403);
      expect(await errorCode(res)).toBe("not_game_owner");
      expect(events).toEqual([]);
      expect((await sendAs(app, "GET", `/api/games/${room.id}`, others[0]!.cookie)).status).toBe(
        200,
      );
    });

    test("after start the cancel is game_not_waiting", async () => {
      const { owner, room } = await seated(2);
      await start(room, owner);
      events.length = 0;
      const res = await cancel(room, owner);
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("game_not_waiting");
      expect(events).toEqual([]);
      expect(await db.selectFrom("games").select("id").execute()).toHaveLength(1);
    });

    test("an unknown game is 404", async () => {
      const owner = await signIn(app, "Ann");
      const res = await sendAs(app, "DELETE", `/api/games/${MISSING_ID}`, owner.cookie);
      expect(res.status).toBe(404);
    });

    test("the delete cascades to the seats and the invites of the game only", async () => {
      const { owner, others, room } = await seated(2);
      const other = await createRoom(others[0]!, "Other");
      const invite = (gameId: string, userId: string, by: string) =>
        db
          .insertInto("invites")
          .values({
            id: crypto.randomUUID(),
            game_id: gameId,
            invited_user_id: userId,
            invited_by_user_id: by,
            state: "pending",
            created_at: START.toISOString(),
            updated_at: START.toISOString(),
          })
          .execute();
      const guest = await signIn(app, "Invitee");
      await invite(room.id, guest.user.id, owner.user.id);
      await invite(other.id, guest.user.id, others[0]!.user.id);

      expect((await cancel(room, owner)).status).toBe(204);

      expect(await db.selectFrom("seats").select("game_id").execute()).toEqual([
        { game_id: other.id },
      ]);
      expect(await db.selectFrom("invites").select("game_id").execute()).toEqual([
        { game_id: other.id },
      ]);
      expect(await db.selectFrom("games").select("id").execute()).toEqual([{ id: other.id }]);
    });
  });

  describe("lobby lists", () => {
    let clock = START;
    const tick = (ms = 1000) => {
      clock = new Date(clock.getTime() + ms);
    };

    beforeEach(async () => {
      await db.destroy();
      clock = START;
      ({ app, db } = await createTestApp({ now: () => clock, onRoomEvent: (e) => events.push(e) }));
    });

    const listOf = async (res: Response) => {
      expect(res.status).toBe(200);
      return lobbyGamesResponseSchema.parse(await res.json()).games;
    };
    const openGames = async (who: Player) =>
      listOf(await sendAs(app, "GET", "/api/games?status=waiting", who.cookie));
    const myGames = async (who: Player) =>
      listOf(await sendAs(app, "GET", "/api/me/games", who.cookie));

    test("a row has the owner name, the seat count and the tokens in seat order", async () => {
      const { owner, room } = await seated(2);
      await addSeat(room, owner, "Guest");
      const viewer = await signIn(app, "Viewer");
      expect(await openGames(viewer)).toEqual([
        {
          id: room.id,
          name: "Harbor",
          ownerName: "Ann",
          status: "waiting",
          seatCount: 3,
          tokens: ["dog", "cat", "penguin"],
          createdAt: START.toISOString(),
        },
      ]);
    });

    test("the open list is newest first and has at most 50 games", async () => {
      const owner = await signIn(app, "Ann");
      const ids: string[] = [];
      for (let i = 0; i < 51; i++) {
        tick();
        ids.push((await createRoom(owner, `Game ${i}`)).id);
      }
      const list = await openGames(owner);
      expect(list).toHaveLength(50);
      expect(list.map((g) => g.id)).toEqual(ids.slice(1).reverse());
    });

    test("games with the same time keep one order between reads", async () => {
      const owner = await signIn(app, "Ann");
      for (let i = 0; i < 4; i++) await createRoom(owner, `Game ${i}`);
      const first = (await openGames(owner)).map((g) => g.id);
      expect(first).toHaveLength(4);
      expect((await openGames(owner)).map((g) => g.id)).toEqual(first);
    });

    test("full games stay in the open list, shown as 6 of 6", async () => {
      const { room } = await seated(MAX_SEATS);
      const [row] = await openGames(await signIn(app, "Viewer"));
      expect(row).toMatchObject({ id: room.id, seatCount: MAX_SEATS });
      expect(row!.tokens).toEqual([...TOKENS]);
    });

    test("a started game leaves the open list; a cancelled game too", async () => {
      const { owner, room } = await seated(2);
      tick();
      const other = await createRoom(owner, "Second");
      const viewer = await signIn(app, "Viewer");
      expect((await openGames(viewer)).map((g) => g.id)).toEqual([other.id, room.id]);

      await start(room, owner);
      expect((await openGames(viewer)).map((g) => g.id)).toEqual([other.id]);
      await sendAs(app, "DELETE", `/api/games/${other.id}`, owner.cookie);
      expect(await openGames(viewer)).toEqual([]);
    });

    test("the open list needs a session and status=waiting", async () => {
      const user = await signIn(app, "Ann");
      expect((await sendAs(app, "GET", "/api/games?status=waiting")).status).toBe(401);
      expect((await sendAs(app, "GET", "/api/me/games")).status).toBe(401);
      for (const query of ["", "?status=active", "?status=waiting&x=1"]) {
        const res = await sendAs(app, "GET", `/api/games${query}`, user.cookie);
        expect(res.status).toBe(400);
        expect(await errorCode(res)).toBe("validation_error");
      }
    });

    test("My games has the waiting and active games of the user, newest first", async () => {
      const ann = await signIn(app, "Ann");
      const bo = await signIn(app, "Bo");
      const first = await createRoom(ann, "First");
      await join(first, bo);
      tick();
      const second = await createRoom(ann, "Second");
      tick();
      const third = await createRoom(bo, "Third");
      tick();
      await createRoom(ann, "Not Bo's");
      await addSeat(second, ann, "Hot");
      await start(second, ann);

      const mine = await myGames(bo);
      expect(mine.map((g) => [g.id, g.status])).toEqual([
        [third.id, "waiting"],
        [first.id, "waiting"],
      ]);
      expect((await myGames(ann)).map((g) => g.status)).toEqual(["waiting", "active", "waiting"]);
    });

    test("a finished game is not in My games", async () => {
      const { owner, room } = await seated(2);
      await start(room, owner);
      expect(await myGames(owner)).toHaveLength(1);
      await db.updateTable("games").set({ status: "finished" }).execute();
      expect(await myGames(owner)).toEqual([]);
    });

    test("My games has a game where the user only controls a hot-seat seat", async () => {
      const { owner, others, room } = await seated(2);
      // Today the API cannot leave a user with a hot-seat seat and no seat of their own. The
      // list reads `controller_user_id`, so it holds when a later task allows it.
      await db
        .updateTable("seats")
        .set({ kind: "hotseat", user_id: null })
        .where("game_id", "=", room.id)
        .where("controller_user_id", "=", others[0]!.user.id)
        .execute();
      expect((await myGames(others[0]!)).map((g) => g.id)).toEqual([room.id]);
      expect((await myGames(owner)).map((g) => g.id)).toEqual([room.id]);
      expect(await myGames(await signIn(app, "Stranger"))).toEqual([]);
    });
  });

  describe("onRoomEvent", () => {
    test("is called after join, add, remove, leave and start, with the committed game", async () => {
      const ann = await signIn(app, "Ann");
      const bo = await signIn(app, "Bo");
      const room = await createRoom(ann);
      // Creating a room is announced to the lobby only: nobody watches a new room yet.
      expect(events.map((e) => e.type)).toEqual(["room.created"]);
      events.length = 0;

      await join(room, bo);
      const added = await gameOf(await addSeat(room, ann, "Guest"));
      await removeSeat(room, ann, added.seats[2]!.id);
      await leave(room, bo);
      await join(room, bo);
      expect(events.map((e) => e.type)).toEqual(Array(5).fill("room.updated"));
      const updates = events.flatMap((e) => (e.type === "room.updated" ? [e.game] : []));
      expect(updates.map((g) => g.seats.length)).toEqual([2, 3, 2, 1, 2]);
      expect(updates[0]!.id).toBe(room.id);

      events.length = 0;
      await start(room, ann);
      expect(events).toHaveLength(1);
      const started = events[0]!;
      expect(started.type).toBe("started");
      if (started.type !== "started") throw new Error("unreachable");
      expect(started.game.status).toBe("active");
      expect(started.state).not.toHaveProperty("rng");
    });

    test("is not called when the request fails", async () => {
      const ann = await signIn(app, "Ann");
      const room = await createRoom(ann);
      await join(room, ann);
      await leave(room, ann);
      await addSeat(room, ann, "Ann");
      await start(room, ann);
      expect(events.map((e) => e.type)).toEqual(["room.created"]);
    });

    test("a failing listener does not fail the request", async () => {
      await db.destroy();
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      ({ app, db } = await createTestApp({
        onRoomEvent: () => {
          throw new Error("listener");
        },
      }));
      const ann = await signIn(app, "Ann");
      const room = await createRoom(ann);
      expect((await addSeat(room, ann, "Guest")).status).toBe(201);
      error.mockRestore();
    });
  });
});
