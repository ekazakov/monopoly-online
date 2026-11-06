import { actorFor, applyAction } from "@monopoly/game-engine";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
// The app (and with it `@hono/zod-openapi`) loads before `@monopoly/shared`, as the zod extension needs.
import { createApp } from "../app.ts";
import { postJson, sendAs, signIn } from "../auth/test-helpers.ts";
import {
  apiErrorSchema,
  gameResponseSchema,
  gameResultResponseSchema,
  lobbyGamesResponseSchema,
  streamMessageSchema,
} from "@monopoly/shared";
import type { StreamMessage } from "@monopoly/shared";
import type { Kysely } from "kysely";
import { createDb } from "../db/client.ts";
import { migrateToLatest } from "../db/migrations.ts";
import type { Database } from "../db/schema.ts";
import { deserializeState } from "../game/loader.ts";
import { redactState } from "../game/redact.ts";
import { playGame } from "../game/test-helpers.ts";
import { createBus } from "../realtime/bus.ts";
import { gameTopic } from "../realtime/messages.ts";
import type { StreamEnvelope } from "../realtime/messages.ts";
import { startedGame, submitStep } from "../realtime/test-helpers.ts";
import type { StartedGame } from "../realtime/test-helpers.ts";

const SEED = 2;

describe("game lifecycle routes", () => {
  let db: Kysely<Database>;
  let app: ReturnType<typeof createApp>;
  let started: StartedGame;
  let seen: StreamMessage[];

  beforeEach(async () => {
    db = createDb(":memory:");
    await migrateToLatest(db);
    const bus = createBus<StreamEnvelope>();
    app = createApp(db, { seed: () => SEED, bus });
    started = await startedGame(app, SEED);
    seen = [];
    bus.subscribe(gameTopic(started.game.id), (message) => {
      seen.push(streamMessageSchema.parse(message));
    });
  });

  afterEach(async () => {
    await db.destroy();
  });

  const finish = (cookie: string, id = started.game.id) =>
    sendAs(app, "POST", `/api/games/${id}/finish`, cookie);
  const save = (cookie: string, id = started.game.id) =>
    sendAs(app, "POST", `/api/games/${id}/save`, cookie);
  const errorCode = async (res: Response) => apiErrorSchema.parse(await res.json()).error.code;

  async function play(count: number) {
    for (const step of playGame(SEED, count, started.initial).steps) {
      expect((await submitStep(app, started, step)).status).toBe(200);
    }
  }

  const gameRow = () =>
    db
      .selectFrom("games")
      .select(["status", "version"])
      .where("id", "=", started.game.id)
      .executeTakeFirstOrThrow();

  async function turnStartState() {
    const row = await db
      .selectFrom("game_snapshots")
      .select(["version", "state"])
      .where("turn_start", "=", 1)
      .orderBy("version", "desc")
      .executeTakeFirstOrThrow();
    return deserializeState(row.state);
  }

  test("an active game rolls back to the start of the turn and finishes", async () => {
    await play(8);
    const before = await gameRow();
    const turnStart = await turnStartState();
    expect(turnStart.version).toBeLessThan(before.version);

    const res = await finish(started.owner.cookie);

    expect(res.status).toBe(200);
    const { game } = gameResponseSchema.parse(await res.json());
    expect(game).toMatchObject({ id: started.game.id, status: "finished" });
    expect(game.version).toBe(before.version + 1);
    expect(await gameRow()).toEqual({ status: "finished", version: before.version + 1 });
  });

  test("every device gets a snapshot with the new game and the rolled back state", async () => {
    await play(8);
    const turnStart = await turnStartState();
    seen.length = 0;

    const res = await finish(started.owner.cookie);
    const { game } = gameResponseSchema.parse(await res.json());

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      topic: gameTopic(started.game.id),
      type: "snapshot",
      version: game.version,
      payload: { game, state: redactState({ ...turnStart, version: game.version }) },
    });
  });

  test("a saved game finishes with no rollback and keeps its version", async () => {
    await play(8);
    // Save (C3) does not exist yet: set the status by hand.
    await db
      .updateTable("games")
      .set({ status: "saved" })
      .where("id", "=", started.game.id)
      .execute();
    const before = await gameRow();
    seen.length = 0;

    const res = await finish(started.owner.cookie);

    expect(res.status).toBe(200);
    expect(await gameRow()).toEqual({ status: "finished", version: before.version });
    expect(seen.map((m) => m.type)).toEqual(["snapshot"]);
    expect(seen[0]?.version).toBe(before.version);
  });

  test("only the owner can finish: a guest gets 403 not_game_owner", async () => {
    const res = await finish(started.guest.cookie);
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("not_game_owner");
    expect((await gameRow()).status).toBe("active");
    expect(seen).toHaveLength(0);
  });

  test("an unknown game is 404 and no session is 401", async () => {
    const missing = "00000000-0000-4000-8000-0000000000aa";
    const res = await finish(started.owner.cookie, missing);
    expect(res.status).toBe(404);
    expect((await sendAs(app, "POST", `/api/games/${started.game.id}/finish`, "")).status).toBe(
      401,
    );
  });

  test("a finished game is 409 game_not_active", async () => {
    expect((await finish(started.owner.cookie)).status).toBe(200);
    const again = await finish(started.owner.cookie);
    expect(again.status).toBe(409);
    expect(await errorCode(again)).toBe("game_not_active");
  });

  test("a waiting game is 409 game_not_active", async () => {
    const room = gameResponseSchema.parse(
      await (await postJson(app, "/api/games", started.owner.cookie, { name: "Dock" })).json(),
    ).game;
    const res = await finish(started.owner.cookie, room.id);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("game_not_active");
  });

  test("a user who is not in the game cannot finish it", async () => {
    const stranger = await signIn(app, "Zed");
    const res = await finish(stranger.cookie);
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("not_game_owner");
  });

  describe("save", () => {
    const claimedSeats = () =>
      db.selectFrom("seats").select("claimed_at").where("game_id", "=", started.game.id).execute();

    test("rolls back to the start of the turn, saves, and clears all claims", async () => {
      await play(8);
      await db
        .updateTable("seats")
        .set({ claimed_at: "2026-11-06T10:00:00.000Z" })
        .where("game_id", "=", started.game.id)
        .execute();
      const before = await gameRow();
      const turnStart = await turnStartState();
      expect(turnStart.version).toBeLessThan(before.version);
      seen.length = 0;

      const res = await save(started.owner.cookie);

      expect(res.status).toBe(200);
      const { game } = gameResponseSchema.parse(await res.json());
      expect(game).toMatchObject({ status: "saved", version: before.version + 1 });
      expect(game.seats.every((seat) => !seat.claimed)).toBe(true);
      expect((await claimedSeats()).every((seat) => seat.claimed_at === null)).toBe(true);
      expect(await gameRow()).toEqual({ status: "saved", version: before.version + 1 });
      expect(seen).toEqual([
        {
          topic: gameTopic(started.game.id),
          type: "snapshot",
          version: game.version,
          payload: { game, state: redactState({ ...turnStart, version: game.version }) },
        },
      ]);
    });

    test("only the owner can save", async () => {
      const res = await save(started.guest.cookie);
      expect(res.status).toBe(403);
      expect(await errorCode(res)).toBe("not_game_owner");
      expect((await gameRow()).status).toBe("active");
      expect(seen).toHaveLength(0);
    });

    test.each(["saved", "finished"] as const)(
      "a %s game is 409 game_not_active",
      async (status) => {
        await db.updateTable("games").set({ status }).where("id", "=", started.game.id).execute();
        const res = await save(started.owner.cookie);
        expect(res.status).toBe(409);
        expect(await errorCode(res)).toBe("game_not_active");
      },
    );

    test("a waiting game is 409 and an unknown game is 404", async () => {
      const room = gameResponseSchema.parse(
        await (await postJson(app, "/api/games", started.owner.cookie, { name: "Dock" })).json(),
      ).game;
      const waiting = await save(started.owner.cookie, room.id);
      expect(waiting.status).toBe(409);
      expect(await errorCode(waiting)).toBe("game_not_active");
      const missing = await save(started.owner.cookie, "00000000-0000-4000-8000-0000000000aa");
      expect(missing.status).toBe(404);
    });

    test("a saved game accepts no actions", async () => {
      expect((await save(started.owner.cookie)).status).toBe(200);
      const step = playGame(SEED, 1, started.initial).steps[0]!;
      const res = await submitStep(app, started, step);
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("game_not_active");
    });
  });

  describe("claim", () => {
    const claim = (cookie: string, id = started.game.id) =>
      sendAs(app, "POST", `/api/games/${id}/claim`, cookie);
    const claimed = async () => {
      const { game } = gameResponseSchema.parse(
        await (
          await sendAs(app, "GET", `/api/games/${started.game.id}`, started.owner.cookie)
        ).json(),
      );
      return Object.fromEntries(game.seats.map((seat) => [seat.name, seat.claimed]));
    };

    test("claims the seats that the caller controls, and tells the room", async () => {
      await play(4);
      expect((await save(started.owner.cookie)).status).toBe(200);
      seen.length = 0;

      const res = await claim(started.guest.cookie);

      expect(res.status).toBe(200);
      const { game } = gameResponseSchema.parse(await res.json());
      // Alice (owner) and Carol (hot-seat, owner's) are not claimed; Bobby is.
      expect(await claimed()).toEqual({ Alice: false, Bobby: true, Carol: false });
      expect(game.status).toBe("saved");
      expect(seen).toEqual([
        {
          topic: gameTopic(started.game.id),
          type: "room.updated",
          version: game.version,
          payload: { game },
        },
      ]);
    });

    test("the owner claims every seat that they control, hot-seat seats too", async () => {
      expect((await save(started.owner.cookie)).status).toBe(200);
      expect((await claim(started.owner.cookie)).status).toBe(200);
      expect(await claimed()).toEqual({ Alice: true, Bobby: false, Carol: true });
    });

    test("a second claim changes nothing", async () => {
      expect((await save(started.owner.cookie)).status).toBe(200);
      await claim(started.guest.cookie);
      const first = await db.selectFrom("seats").select(["name", "claimed_at"]).execute();
      expect((await claim(started.guest.cookie)).status).toBe(200);
      expect(await db.selectFrom("seats").select(["name", "claimed_at"]).execute()).toEqual(first);
    });

    test("a game that is not saved is 409 game_not_saved", async () => {
      const res = await claim(started.guest.cookie);
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("game_not_saved");
    });

    test("a user with no seat is 403 not_a_member, an unknown game is 404", async () => {
      expect((await save(started.owner.cookie)).status).toBe(200);
      const stranger = await signIn(app, "Zed");
      const res = await claim(stranger.cookie);
      expect(res.status).toBe(403);
      expect(await errorCode(res)).toBe("not_a_member");
      const missing = await claim(started.owner.cookie, "00000000-0000-4000-8000-0000000000aa");
      expect(missing.status).toBe(404);
    });

    test("a save clears the claims again", async () => {
      expect((await save(started.owner.cookie)).status).toBe(200);
      await claim(started.guest.cookie);
      await db
        .updateTable("games")
        .set({ status: "active" })
        .where("id", "=", started.game.id)
        .execute();
      expect((await save(started.owner.cookie)).status).toBe(200);
      expect(await claimed()).toEqual({ Alice: false, Bobby: false, Carol: false });
    });
  });

  describe("restore", () => {
    const restore = (cookie: string, id = started.game.id) =>
      sendAs(app, "POST", `/api/games/${id}/restore`, cookie);

    test("continues with the same state, claims the owner's seats, and tells every device", async () => {
      await play(8);
      expect((await save(started.owner.cookie)).status).toBe(200);
      const saved = await gameRow();
      const savedState = await turnStartState();
      seen.length = 0;

      const res = await restore(started.owner.cookie);

      expect(res.status).toBe(200);
      const { game } = gameResponseSchema.parse(await res.json());
      expect(game).toMatchObject({ status: "active", version: saved.version });
      expect(Object.fromEntries(game.seats.map((seat) => [seat.name, seat.claimed]))).toEqual({
        Alice: true,
        Bobby: false,
        Carol: true,
      });
      expect(await gameRow()).toEqual({ status: "active", version: saved.version });
      expect(seen).toEqual([
        {
          topic: gameTopic(started.game.id),
          type: "snapshot",
          version: saved.version,
          payload: { game, state: redactState(savedState) },
        },
      ]);
    });

    test("the same dice come back: a roll after restore equals a roll on a copy of the state", async () => {
      await play(8);
      expect((await save(started.owner.cookie)).status).toBe(200);
      const savedState = await turnStartState();
      expect((await restore(started.owner.cookie)).status).toBe(200);

      const actor = actorFor(savedState);
      const expected = applyAction(savedState, { type: "RollDice", playerId: actor });
      expect(expected.ok).toBe(true);
      const cookie = started.cookieOfSeat(actor);
      const res = await app.request(`/api/games/${started.game.id}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          seatId: actor,
          action: { type: "RollDice" },
          expectedVersion: savedState.version,
          clientActionId: crypto.randomUUID(),
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { events: unknown };
      if (!expected.ok) return;
      expect(body.events).toEqual(JSON.parse(JSON.stringify(expected.events)));
    });

    test("the discarded steps of the turn play again with the same events", async () => {
      const steps = playGame(SEED, 8, started.initial).steps;
      await play(8);
      const turnStart = await turnStartState();
      const discarded = steps.filter((step) => step.state.version > turnStart.version);
      expect(discarded.length).toBeGreaterThan(0);
      expect((await save(started.owner.cookie)).status).toBe(200);
      expect((await restore(started.owner.cookie)).status).toBe(200);

      let current = (await gameRow()).version;
      for (const step of discarded) {
        const { playerId, ...action } = step.action;
        const res = await postJson(
          app,
          `/api/games/${started.game.id}/actions`,
          started.cookieOfSeat(playerId),
          {
            seatId: playerId,
            action,
            expectedVersion: current,
            clientActionId: crypto.randomUUID(),
          },
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { version: number; events: unknown };
        expect(body.events).toEqual(JSON.parse(JSON.stringify(step.events)));
        current = body.version;
      }
    });

    test("only the owner can restore", async () => {
      expect((await save(started.owner.cookie)).status).toBe(200);
      const res = await restore(started.guest.cookie);
      expect(res.status).toBe(403);
      expect(await errorCode(res)).toBe("not_game_owner");
      expect((await gameRow()).status).toBe("saved");
    });

    test.each(["active", "finished"] as const)(
      "a %s game is 409 game_not_saved",
      async (status) => {
        await db.updateTable("games").set({ status }).where("id", "=", started.game.id).execute();
        const res = await restore(started.owner.cookie);
        expect(res.status).toBe(409);
        expect(await errorCode(res)).toBe("game_not_saved");
      },
    );

    test("a waiting game is 409 and an unknown game is 404", async () => {
      const room = gameResponseSchema.parse(
        await (await postJson(app, "/api/games", started.owner.cookie, { name: "Dock" })).json(),
      ).game;
      expect((await restore(started.owner.cookie, room.id)).status).toBe(409);
      const missing = await restore(started.owner.cookie, "00000000-0000-4000-8000-0000000000aa");
      expect(missing.status).toBe(404);
    });

    test("save, restore and save again works", async () => {
      expect((await save(started.owner.cookie)).status).toBe(200);
      expect((await restore(started.owner.cookie)).status).toBe(200);
      const again = await save(started.owner.cookie);
      expect(again.status).toBe(200);
      const { game } = gameResponseSchema.parse(await again.json());
      expect(game).toMatchObject({ status: "saved", version: 2 });
      expect(game.seats.every((seat) => !seat.claimed)).toBe(true);
    });
  });

  describe("result of a game finished by the owner", () => {
    test("has no winner, names the owner, and ranks the players in the game by net worth", async () => {
      await play(8);
      expect((await finish(started.owner.cookie)).status).toBe(200);

      const res = await sendAs(
        app,
        "GET",
        `/api/games/${started.game.id}/result`,
        started.guest.cookie,
      );

      expect(res.status).toBe(200);
      const { result } = gameResultResponseSchema.parse(await res.json());
      expect(result.winner).toBeNull();
      expect(result.finishedBy).toBe("Alice");
      expect(result.standings).toHaveLength(3);
      expect(result.standings.every((s) => s.status === "in_game")).toBe(true);
      const worth = result.standings.map((s) => s.netWorth);
      expect([...worth].sort((x, y) => y - x)).toEqual(worth);
    });

    test("a saved game has no result yet", async () => {
      expect((await save(started.owner.cookie)).status).toBe(200);
      const res = await sendAs(
        app,
        "GET",
        `/api/games/${started.game.id}/result`,
        started.owner.cookie,
      );
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("game_not_finished");
    });
  });

  describe("my games", () => {
    const mine = async (cookie: string) =>
      lobbyGamesResponseSchema.parse(
        await (await sendAs(app, "GET", "/api/me/games", cookie)).json(),
      ).games;

    test("a saved game is listed for the owner and the guest, with its status and owner", async () => {
      expect((await save(started.owner.cookie)).status).toBe(200);
      for (const cookie of [started.owner.cookie, started.guest.cookie]) {
        const rows = await mine(cookie);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          id: started.game.id,
          status: "saved",
          ownerId: started.owner.user.id,
          ownerName: "Alice",
          seatCount: 3,
        });
      }
    });

    test("it is active again after Restore and gone after Finish", async () => {
      expect((await save(started.owner.cookie)).status).toBe(200);
      expect(
        (await sendAs(app, "POST", `/api/games/${started.game.id}/restore`, started.owner.cookie))
          .status,
      ).toBe(200);
      expect((await mine(started.guest.cookie)).map((g) => g.status)).toEqual(["active"]);
      expect((await finish(started.owner.cookie)).status).toBe(200);
      expect(await mine(started.owner.cookie)).toEqual([]);
    });

    test("a saved game is not in the open list", async () => {
      expect((await save(started.owner.cookie)).status).toBe(200);
      const res = await sendAs(app, "GET", "/api/games?status=waiting", started.guest.cookie);
      expect(lobbyGamesResponseSchema.parse(await res.json()).games).toEqual([]);
    });

    test("a user with no seat does not see it", async () => {
      expect((await save(started.owner.cookie)).status).toBe(200);
      const stranger = await signIn(app, "Zed");
      expect(await mine(stranger.cookie)).toEqual([]);
    });
  });
});
