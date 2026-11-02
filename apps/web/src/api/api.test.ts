import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { ApiError, setUnauthorizedHandler } from "../api.ts";
import { errorReply, gameFixture, mockApi, noContent, userFixture } from "../testing/fakeApi.ts";
import {
  addHotSeat,
  createGame,
  createSession,
  deleteSession,
  getGame,
  getMe,
  getState,
  joinGame,
  leaveGame,
  removeSeat,
  startGame,
} from "./index.ts";

const game = gameFixture();
const id = game.id;
const seatId = "5b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d22";

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

describe("session calls", () => {
  test("getMe returns the user", async () => {
    mockApi({ "GET /api/me": Response.json({ user: userFixture }) });
    expect(await getMe()).toEqual(userFixture);
  });

  test("createSession posts the name and returns the user", async () => {
    const calls = mockApi({
      "POST /api/session": Response.json({ user: userFixture }, { status: 201 }),
    });
    expect(await createSession("Marlow")).toEqual(userFixture);
    expect(calls[0]).toMatchObject({ method: "POST", body: { name: "Marlow" } });
  });

  test("deleteSession accepts 204", async () => {
    const calls = mockApi({ "DELETE /api/session": noContent() });
    await expect(deleteSession()).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  test("deleteSession throws ApiError on a failure", async () => {
    mockApi({ "DELETE /api/session": errorReply(401, "unauthorized") });
    await expect(deleteSession()).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  });

  test("a failed call throws ApiError with the code and issues", async () => {
    mockApi({
      "POST /api/session": errorReply(400, "validation_error", "Bad", [
        { path: ["name"], message: "Too short" },
      ]),
    });
    const error = await createSession("M").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: "validation_error",
      issues: [{ path: ["name"], message: "Too short" }],
    });
  });
});

describe("game calls", () => {
  test("createGame posts the name", async () => {
    const calls = mockApi({ "POST /api/games": Response.json({ game }, { status: 201 }) });
    expect(await createGame("Friday game")).toEqual(game);
    expect(calls[0]).toMatchObject({ body: { name: "Friday game" } });
  });

  test("getGame, joinGame and leaveGame use the game id", async () => {
    const calls = mockApi({
      [`GET /api/games/${id}`]: Response.json({ game }),
      [`POST /api/games/${id}/join`]: Response.json({ game }),
      [`POST /api/games/${id}/leave`]: Response.json({ game }),
    });
    expect(await getGame(id)).toEqual(game);
    expect(await joinGame(id)).toEqual(game);
    expect(await leaveGame(id)).toEqual(game);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET /api/games/${id}`,
      `POST /api/games/${id}/join`,
      `POST /api/games/${id}/leave`,
    ]);
  });

  test("addHotSeat posts the seat name and removeSeat deletes the seat", async () => {
    const calls = mockApi({
      [`POST /api/games/${id}/seats`]: Response.json({ game }, { status: 201 }),
      [`DELETE /api/games/${id}/seats/${seatId}`]: Response.json({ game }),
    });
    expect(await addHotSeat(id, "Ines")).toEqual(game);
    expect(await removeSeat(id, seatId)).toEqual(game);
    expect(calls[0]).toMatchObject({ body: { name: "Ines" } });
  });

  test("startGame returns the game and the state", async () => {
    const body = { game: gameFixture({ status: "active" }), state: { version: 0 } };
    mockApi({ [`POST /api/games/${id}/start`]: Response.json(body) });
    expect(await startGame(id)).toEqual(body);
  });

  test("a game call error keeps the engine or API code", async () => {
    mockApi({ [`POST /api/games/${id}/join`]: errorReply(409, "game_full") });
    await expect(joinGame(id)).rejects.toMatchObject({ status: 409, code: "game_full" });
  });

  test("getState rejects a body that is not a state", async () => {
    mockApi({ [`GET /api/games/${id}/state`]: Response.json({ version: 0 }) });
    await expect(getState(id)).rejects.toThrow(/invalid|expected|required/i);
  });

  test("getState turns an error body into ApiError", async () => {
    mockApi({ [`GET /api/games/${id}/state`]: errorReply(409, "game_not_active") });
    await expect(getState(id)).rejects.toMatchObject({ status: 409, code: "game_not_active" });
  });
});

describe("401 handling", () => {
  test("any 401 calls the handler", async () => {
    mockApi({ [`GET /api/games/${id}`]: errorReply(401, "unauthorized") });
    const handler = vi.fn<() => void>();
    setUnauthorizedHandler(handler);
    await expect(getGame(id)).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("other errors do not call the handler", async () => {
    mockApi({ [`GET /api/games/${id}`]: errorReply(404, "not_found") });
    const handler = vi.fn<() => void>();
    setUnauthorizedHandler(handler);
    await expect(getGame(id)).rejects.toMatchObject({ status: 404 });
    expect(handler).not.toHaveBeenCalled();
  });

  test("the remover only removes its own handler", async () => {
    const first = vi.fn<() => void>();
    const remove = setUnauthorizedHandler(first);
    const second = vi.fn<() => void>();
    setUnauthorizedHandler(second);
    remove();
    mockApi({ "GET /api/me": errorReply(401, "unauthorized") });
    await getMe().catch(() => undefined);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
