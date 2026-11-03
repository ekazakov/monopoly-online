import { actorFor } from "@monopoly/game-engine";
import type { Action, GameState } from "@monopoly/game-engine";
import type { ActionInput } from "@monopoly/shared";
import type { Kysely, KyselyPlugin } from "kysely";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { createDb } from "../db/client.ts";
import { migrateToLatest } from "../db/migrations.ts";
import type { Database } from "../db/schema.ts";
import { createGameStateLoader, deserializeState, shouldSnapshot } from "./loader.ts";
import type { GameStateLoader } from "./loader.ts";
import { redactState } from "./redact.ts";
import { GameServiceError, createGameService } from "./service.ts";
import type { CommittedAction, GameService } from "./service.ts";
import {
  GAME_ID,
  OTHER_USER_ID,
  STRANGER_ID,
  USER_ID,
  UUID_SEAT_IDS,
  insertActiveGame,
  insertGame,
  newGame,
  playGame,
} from "./test-helpers.ts";

const SEED = 2;
const initial = newGame(SEED, UUID_SEAT_IDS);
const [first, second, third] = initial.players.map((p) => p.id) as [string, string, string];

const toInput = (action: Action) =>
  Object.fromEntries(Object.entries(action).filter(([key]) => key !== "playerId")) as ActionInput;

let db: Kysely<Database>;
let loader: GameStateLoader;
let service: GameService;
let controllers: Record<string, string>;
let version: number;

beforeEach(async () => {
  db = createDb(":memory:");
  await migrateToLatest(db);
  ({ controllers } = await insertActiveGame(db, initial));
  loader = createGameStateLoader(db);
  service = createGameService({ db, loader });
  version = 0;
});

afterEach(async () => {
  await db.destroy();
});

/** Submit as the user who controls the seat, on the version the test tracks. */
async function act(seatId: string, action: ActionInput, clientActionId = crypto.randomUUID()) {
  const result = await service.submitAction({
    gameId: GAME_ID,
    userId: controllers[seatId] as string,
    seatId,
    action,
    expectedVersion: version,
    clientActionId,
  });
  version = result.version;
  return result;
}

async function failure(promise: Promise<unknown>): Promise<GameServiceError> {
  const error = await promise.then(
    () => new Error("The call did not fail"),
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(GameServiceError);
  return error as GameServiceError;
}

async function counts() {
  const events = await db.selectFrom("game_events").select("version").execute();
  const snapshots = await db.selectFrom("game_snapshots").select("version").execute();
  const game = await db.selectFrom("games").select(["version", "status"]).executeTakeFirstOrThrow();
  return { events: events.length, snapshots: snapshots.length, game };
}

async function playThroughService(played: ReturnType<typeof playGame>) {
  for (const step of played.steps) {
    const result = await act(step.action.playerId, toInput(step.action));
    expect(result.version).toBe(step.state.version);
    expect(result.events).toEqual(step.events);
    expect(result.state).toEqual(redactState(step.state));
  }
}

describe("submitAction: replay", () => {
  test("a seeded script gives the same state and events as a direct engine replay", async () => {
    const played = playGame(SEED, 120, initial);
    expect(played.steps).toHaveLength(120);
    await playThroughService(played);

    const last = played.steps[119]?.state as GameState;
    expect(await loader.load(GAME_ID)).toEqual(last);
    expect(await createGameStateLoader(db).load(GAME_ID)).toEqual(last);

    const rows = await db
      .selectFrom("game_events")
      .selectAll()
      .where("game_id", "=", GAME_ID)
      .orderBy("version")
      .execute();
    expect(rows).toHaveLength(120);
    rows.forEach((row, i) => {
      const step = played.steps[i];
      expect(row.version).toBe(i + 1);
      expect(row.seat_id).toBe(step?.action.playerId);
      expect(JSON.parse(row.action)).toEqual(step?.action);
      expect(JSON.parse(row.events)).toEqual(step?.events);
    });
    const game = await db.selectFrom("games").selectAll().executeTakeFirstOrThrow();
    expect(game.version).toBe(120);
    expect(game.status).toBe("active");
  });

  test("the script covers roll, buy and end turn", async () => {
    const types = new Set(playGame(SEED, 120, initial).steps.map((s) => s.action.type));
    expect(types).toContain("RollDice");
    expect(types).toContain("BuyProperty");
    expect(types).toContain("EndTurn");
  });

  test("debug edits are stored as actions and replay to the same state", async () => {
    await act(first, {
      type: "DebugEdit",
      changes: [{ kind: "cash", targetId: second, cash: 42 }],
    });
    await act(first, {
      type: "DebugEdit",
      changes: [
        { kind: "deed", square: 39, ownerId: third, houses: 5, mortgaged: false },
        { kind: "deed", square: 37, ownerId: third, houses: 0, mortgaged: true },
      ],
    });
    const result = await act(first, {
      type: "DebugEdit",
      changes: [{ kind: "position", targetId: second, square: 30 }],
    });
    expect(result.events).toEqual([
      {
        type: "StateEdited",
        playerId: first,
        change: { kind: "position", targetId: second, square: 30 },
      },
    ]);

    const live = await loader.load(GAME_ID);
    const replayed = await createGameStateLoader(db).load(GAME_ID);
    expect(replayed).toEqual(live);
    expect(replayed?.players.find((p) => p.id === second)).toMatchObject({
      cash: 42,
      position: 30,
    });
    expect(replayed?.ownership["39"]).toEqual({ ownerId: third, houses: 5, mortgaged: false });
    expect(replayed?.ownership["37"]).toEqual({ ownerId: third, houses: 0, mortgaged: true });
  });

  test("a debug batch with one bad change is refused and stores nothing", async () => {
    const before = await counts();
    const error = await failure(
      act(first, {
        type: "DebugEdit",
        changes: [
          { kind: "deed", square: 39, ownerId: third, houses: 5, mortgaged: false },
          { kind: "deed", square: 5, ownerId: third, houses: 2, mortgaged: false },
        ],
      }),
    );
    expect(error.code).toBe("not_a_street");
    expect(await counts()).toEqual(before);
    expect((await loader.load(GAME_ID))?.ownership["39"]).toBeUndefined();
  });

  test("the server sets playerId from the seat", async () => {
    const result = await act(first, { type: "RollDice" });
    expect(result.events[0]).toMatchObject({ type: "DiceRolled", playerId: first });
    const row = await db.selectFrom("game_events").select("action").executeTakeFirstOrThrow();
    expect(JSON.parse(row.action)).toEqual({ type: "RollDice", playerId: first });
  });
});

describe("submitAction: version and duplicates", () => {
  test("a stale expectedVersion gives version_conflict with currentVersion", async () => {
    await act(first, { type: "RollDice" });
    const error = await failure(
      service.submitAction({
        gameId: GAME_ID,
        userId: USER_ID,
        seatId: first,
        action: { type: "RollDice" },
        expectedVersion: 0,
        clientActionId: crypto.randomUUID(),
      }),
    );
    expect(error).toMatchObject({ status: 409, code: "version_conflict", currentVersion: 1 });
    expect((await counts()).events).toBe(1);
  });

  test("an expectedVersion from the future is also a conflict", async () => {
    version = 5;
    const error = await failure(act(first, { type: "RollDice" }));
    expect(error).toMatchObject({ code: "version_conflict", currentVersion: 0 });
  });

  test("a repeated clientActionId returns the stored result and writes no second row", async () => {
    const id = crypto.randomUUID();
    const one = await act(first, { type: "RollDice" }, id);
    const again = await service.submitAction({
      gameId: GAME_ID,
      userId: USER_ID,
      seatId: first,
      action: { type: "RollDice" },
      expectedVersion: 0,
      clientActionId: id,
    });
    expect(again).toEqual(one);
    expect(await counts()).toMatchObject({ events: 1, game: { version: 1 } });
  });

  test("a retry after later actions returns the stored version with the newer state", async () => {
    const id = crypto.randomUUID();
    const one = await act(first, { type: "RollDice" }, id);
    const played = playGame(SEED, 3, initial);
    await act(
      played.steps[1]?.action.playerId as string,
      toInput(played.steps[1]?.action as Action),
    );
    expect(version).toBe(2);

    const retry = await service.submitAction({
      gameId: GAME_ID,
      userId: USER_ID,
      seatId: first,
      action: { type: "RollDice" },
      expectedVersion: 0,
      clientActionId: id,
    });
    expect(retry.version).toBe(1);
    expect(retry.events).toEqual(one.events);
    expect(retry.state.version).toBe(2);
    expect((await counts()).events).toBe(2);
  });
});

describe("submitAction: who may act", () => {
  const submitAs = (userId: string, seatId: string, gameId = GAME_ID) =>
    service.submitAction({
      gameId,
      userId,
      seatId,
      action: { type: "RollDice" },
      expectedVersion: 0,
      clientActionId: crypto.randomUUID(),
    });

  test("an unknown game is not_found", async () => {
    const error = await failure(submitAs(USER_ID, first, "10000000-0000-4000-8000-0000000000ff"));
    expect(error).toMatchObject({ status: 404, code: "not_found" });
  });

  test("a user without a seat in the game is not_a_member", async () => {
    const error = await failure(submitAs(STRANGER_ID, first));
    expect(error).toMatchObject({ status: 403, code: "not_a_member" });
  });

  test("an unknown seat is not_found", async () => {
    const error = await failure(submitAs(USER_ID, "20000000-0000-4000-8000-0000000000ff"));
    expect(error).toMatchObject({ status: 404, code: "not_found" });
  });

  test("a seat of another game is not_found", async () => {
    const otherGameId = "10000000-0000-4000-8000-000000000002";
    const other = newGame(9, [
      "30000000-0000-4000-8000-000000000001",
      "30000000-0000-4000-8000-000000000002",
      "30000000-0000-4000-8000-000000000003",
    ]);
    await insertActiveGame(db, other, otherGameId);
    const error = await failure(submitAs(USER_ID, other.players[0]?.id as string));
    expect(error).toMatchObject({ status: 404, code: "not_found" });
  });

  test("a seat of another device is not_your_seat", async () => {
    const error = await failure(submitAs(OTHER_USER_ID, first));
    expect(error).toMatchObject({ status: 403, code: "not_your_seat" });
    expect((await counts()).events).toBe(0);
  });

  test("a hot-seat seat controlled by the caller acts for the current player", async () => {
    const seat = await db
      .selectFrom("seats")
      .select(["kind", "user_id", "controller_user_id"])
      .where("id", "=", first)
      .executeTakeFirstOrThrow();
    expect(seat).toEqual({ kind: "hotseat", user_id: null, controller_user_id: USER_ID });
    expect(actorFor(initial)).toBe(first);
    const result = await act(first, { type: "RollDice" });
    expect(result.version).toBe(1);
  });

  test("a controlled seat that is not the actor gets not_your_turn", async () => {
    expect(controllers[third]).toBe(USER_ID);
    const error = await failure(act(third, { type: "RollDice" }));
    expect(error).toMatchObject({ status: 422, code: "not_your_turn" });
    expect(await counts()).toMatchObject({ events: 0, snapshots: 1, game: { version: 0 } });
  });

  test("an action in the wrong phase gets wrong_phase", async () => {
    const error = await failure(act(first, { type: "EndTurn" }));
    expect(error).toMatchObject({ status: 422, code: "wrong_phase" });
  });

  test("an engine rejection leaves no rows and keeps the cached state", async () => {
    await failure(act(first, { type: "BuyProperty" }));
    expect(await counts()).toMatchObject({ events: 0, snapshots: 1, game: { version: 0 } });
    expect(await loader.load(GAME_ID)).toEqual(initial);
  });
});

describe("submitAction: game status", () => {
  test("a waiting game refuses actions", async () => {
    const waitingId = "10000000-0000-4000-8000-000000000009";
    const waiting = newGame(4, ["seat-x", "seat-y", "seat-z"]);
    await insertGame(db, waiting, waitingId);
    const error = await failure(
      service.submitAction({
        gameId: waitingId,
        userId: USER_ID,
        seatId: "seat-x",
        action: { type: "RollDice" },
        expectedVersion: 0,
        clientActionId: crypto.randomUUID(),
      }),
    );
    expect(error).toMatchObject({ status: 409, code: "game_not_active" });
  });

  test("a player can resign off turn and the game goes on", async () => {
    const result = await act(second, { type: "Resign" });
    expect(result.events.map((e) => e.type)).toContain("PlayerResigned");
    expect(result.state.players.find((p) => p.id === second)?.active).toBe(false);
    expect((await counts()).game.status).toBe("active");
  });

  test("a game that ends becomes finished, stays readable and refuses actions", async () => {
    await act(second, { type: "Resign" });
    const endId = crypto.randomUUID();
    const end = await act(third, { type: "Resign" }, endId);
    expect(end.events.map((e) => e.type)).toContain("GameEnded");
    expect(end.state.turn.phase).toBe("game_over");
    expect(await counts()).toMatchObject({ game: { status: "finished", version: 2 } });

    const state = await service.getState({ gameId: GAME_ID, userId: OTHER_USER_ID });
    expect(state).toEqual({ version: 2, state: end.state });

    const error = await failure(act(first, { type: "RollDice" }));
    expect(error).toMatchObject({ status: 409, code: "game_not_active" });

    const retry = await service.submitAction({
      gameId: GAME_ID,
      userId: USER_ID,
      seatId: third,
      action: { type: "Resign" },
      expectedVersion: 1,
      clientActionId: endId,
    });
    expect(retry).toEqual(end);
  });
});

describe("snapshots", () => {
  test("a snapshot is written at every turn start and every N versions", async () => {
    const n = 7;
    service = createGameService({ db, loader, snapshot: { everyNVersions: n } });
    const played = playGame(SEED, 60, initial);
    await playThroughService(played);

    const expected: { version: number; turnStart: number; state: GameState }[] = [];
    let prev = initial;
    for (const step of played.steps) {
      if (shouldSnapshot(prev, step.state, { everyNVersions: n })) {
        const turnStart = step.state.turn.currentPlayerId !== prev.turn.currentPlayerId ? 1 : 0;
        expected.push({ version: step.state.version, turnStart, state: step.state });
      }
      prev = step.state;
    }
    expect(expected.some((e) => e.turnStart === 1)).toBe(true);
    expect(expected.some((e) => e.turnStart === 0)).toBe(true);

    const rows = await db
      .selectFrom("game_snapshots")
      .selectAll()
      .where("version", ">", 0)
      .orderBy("version")
      .execute();
    expect(rows.map((r) => ({ version: r.version, turnStart: r.turn_start }))).toEqual(
      expected.map((e) => ({ version: e.version, turnStart: e.turnStart })),
    );
    rows.forEach((row, i) => expect(deserializeState(row.state)).toEqual(expected[i]?.state));
  });

  test("no snapshot is written inside a turn", async () => {
    await act(first, { type: "RollDice" });
    expect((await counts()).snapshots).toBe(1);
  });

  test("the default rule snapshots at version 50", async () => {
    await playThroughService(playGame(SEED, 50, initial));
    const row = await db
      .selectFrom("game_snapshots")
      .select("version")
      .where("version", "=", 50)
      .executeTakeFirst();
    expect(row).toBeDefined();
  });
});

describe("races", () => {
  test("concurrent submissions on one version: exactly one wins", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        service.submitAction({
          gameId: GAME_ID,
          userId: USER_ID,
          seatId: first,
          action: { type: "RollDice" },
          expectedVersion: 0,
          clientActionId: crypto.randomUUID(),
        }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(4);
    for (const r of failed) {
      expect(r.reason).toMatchObject({ code: "version_conflict", currentVersion: 1 });
    }
    expect(await counts()).toMatchObject({ events: 1, game: { version: 1 } });
  });

  test("two services on one database: the database decides the winner", async () => {
    const other = createGameService({ db, loader: createGameStateLoader(db) });
    // Both load version 0 before either one commits.
    await loader.load(GAME_ID);
    const call = (s: GameService) =>
      s.submitAction({
        gameId: GAME_ID,
        userId: USER_ID,
        seatId: first,
        action: { type: "RollDice" },
        expectedVersion: 0,
        clientActionId: crypto.randomUUID(),
      });
    const results = await Promise.allSettled([call(service), call(other)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected");
    expect(lost?.reason).toMatchObject({ code: "version_conflict", currentVersion: 1 });
    expect(await counts()).toMatchObject({ events: 1, game: { version: 1 } });
  });

  test("two services with one clientActionId: both get the stored result", async () => {
    const other = createGameService({ db, loader: createGameStateLoader(db) });
    const clientActionId = crypto.randomUUID();
    const call = (s: GameService) =>
      s.submitAction({
        gameId: GAME_ID,
        userId: USER_ID,
        seatId: first,
        action: { type: "RollDice" },
        expectedVersion: 0,
        clientActionId,
      });
    const [a, b] = await Promise.all([call(service), call(other)]);
    expect(a).toEqual(b);
    expect(await counts()).toMatchObject({ events: 1, game: { version: 1 } });
  });
});

describe("cache, hooks and rollback", () => {
  test("the loader cache and the database agree after a commit", async () => {
    await playThroughService(playGame(SEED, 30, initial));
    const cached = await loader.load(GAME_ID);
    expect(cached).toEqual(await createGameStateLoader(db).load(GAME_ID));
    expect(cached?.version).toBe(30);
  });

  test("onCommitted gets the redacted state after the commit", async () => {
    const seen: CommittedAction[] = [];
    service = createGameService({
      db,
      loader,
      onCommitted: (committed) => {
        seen.push(committed);
      },
    });
    const result = await act(first, { type: "RollDice" });
    expect(seen).toEqual([
      { gameId: GAME_ID, version: 1, events: result.events, state: result.state },
    ]);
    expect(JSON.stringify(seen)).not.toMatch(/"(rng|decks)"/);

    await failure(act(first, { type: "EndTurn" }));
    expect(seen).toHaveLength(1);
  });

  test("a failing onCommitted hook does not fail the action", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    service = createGameService({
      db,
      loader,
      onCommitted: () => {
        throw new Error("boom");
      },
    });
    const result = await act(first, { type: "RollDice" });
    expect(result.version).toBe(1);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  test("a failed write rolls back every row and evicts the cache", async () => {
    // Fails the snapshot insert, which comes after the games and game_events writes.
    const failing: KyselyPlugin = {
      transformQuery({ node }) {
        if (node.kind === "InsertQueryNode" && JSON.stringify(node).includes("game_snapshots")) {
          throw new Error("disk full");
        }
        return node;
      },
      transformResult: async ({ result }) => result,
    };
    const evict = vi.spyOn(loader, "evict");
    service = createGameService({ db: db.withPlugin(failing), loader });
    // Roll until the turn changes, so the commit writes a snapshot.
    const played = playGame(SEED, 40, initial);
    const turnEnd = played.steps.findIndex((s) => s.events.some((e) => e.type === "TurnEnded"));
    await playThroughServiceUntil(turnEnd, played);
    const before = await counts();

    const step = played.steps[turnEnd];
    await expect(
      service.submitAction({
        gameId: GAME_ID,
        userId: controllers[step?.action.playerId as string] as string,
        seatId: step?.action.playerId as string,
        action: toInput(step?.action as Action),
        expectedVersion: version,
        clientActionId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("disk full");
    expect(await counts()).toEqual(before);
    expect(evict).toHaveBeenCalledWith(GAME_ID);
    // The next load comes from the database and shows the state before the failed action.
    expect((await loader.load(GAME_ID))?.version).toBe(version);
  });

  async function playThroughServiceUntil(count: number, played: ReturnType<typeof playGame>) {
    await playThroughService({ initial: played.initial, steps: played.steps.slice(0, count) });
  }
});

describe("getState", () => {
  test("returns the redacted state of an active game to any seated user", async () => {
    await act(first, { type: "RollDice" });
    for (const userId of [USER_ID, OTHER_USER_ID]) {
      const result = await service.getState({ gameId: GAME_ID, userId });
      expect(result.version).toBe(1);
      expect(result.state.version).toBe(1);
      expect(Object.keys(result.state)).not.toContain("rng");
      expect(Object.keys(result.state)).not.toContain("decks");
    }
  });

  test("unknown game is not_found, a stranger is not_a_member", async () => {
    expect(
      await failure(
        service.getState({ gameId: "10000000-0000-4000-8000-0000000000ff", userId: USER_ID }),
      ),
    ).toMatchObject({ status: 404, code: "not_found" });
    expect(await failure(service.getState({ gameId: GAME_ID, userId: STRANGER_ID }))).toMatchObject(
      { status: 403, code: "not_a_member" },
    );
  });

  test("a waiting game gives game_not_active", async () => {
    const waitingId = "10000000-0000-4000-8000-000000000009";
    await insertGame(db, newGame(4, ["seat-x", "seat-y", "seat-z"]), waitingId);
    expect(await failure(service.getState({ gameId: waitingId, userId: USER_ID }))).toMatchObject({
      status: 409,
      code: "game_not_active",
    });
  });
});
