import type { Invite, LobbyGame, StreamMessage } from "@monopoly/shared";
import { describe, expect, test } from "vite-plus/test";
import { OPEN_GAMES_LIMIT, initialLobbyState, lobbyReducer } from "./lobbyModel.ts";

const game = (n: number, fields: Partial<LobbyGame> = {}): LobbyGame => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  name: `Game ${n}`,
  ownerId: "00000000-0000-4000-8000-000000000001",
  ownerName: "Ann",
  status: "waiting",
  seatCount: 1,
  tokens: ["dog"],
  createdAt: new Date(Date.UTC(2026, 10, 2, 10, 0, n)).toISOString(),
  ...fields,
});
const msg = (type: string, payload: unknown, topic = "lobby"): StreamMessage =>
  ({ topic, type, version: 0, payload }) as StreamMessage;
const snapshot = (games: LobbyGame[]) => msg("lobby.snapshot", { games });

describe("lobbyReducer", () => {
  test("starts with nothing loaded, which is not an empty list", () => {
    expect(initialLobbyState).toEqual({ games: null, invites: null });
  });

  test("a snapshot replaces the list, also with an empty one", () => {
    const first = lobbyReducer(initialLobbyState, snapshot([game(1)]));
    expect(first.games).toEqual([game(1)]);
    expect(lobbyReducer(first, snapshot([])).games).toEqual([]);
  });

  test("an update adds a game or replaces the game with the same id, newest first", () => {
    let state = lobbyReducer(initialLobbyState, snapshot([game(2), game(1)]));
    state = lobbyReducer(state, msg("lobby.updated", { game: game(3) }));
    expect(state.games?.map((g) => g.name)).toEqual(["Game 3", "Game 2", "Game 1"]);
    state = lobbyReducer(state, msg("lobby.updated", { game: game(1, { seatCount: 4 }) }));
    expect(state.games?.map((g) => [g.name, g.seatCount])).toEqual([
      ["Game 3", 1],
      ["Game 2", 1],
      ["Game 1", 4],
    ]);
  });

  test("equal times keep one order, by id", () => {
    const at = "2026-11-02T10:00:00.000Z";
    const a = game(1, { createdAt: at });
    const b = game(2, { createdAt: at });
    const state = lobbyReducer(
      lobbyReducer(initialLobbyState, snapshot([a])),
      msg("lobby.updated", { game: b }),
    );
    expect(state.games?.map((g) => g.id)).toEqual([b.id, a.id]);
  });

  test("the list keeps at most 50 games, dropping the oldest", () => {
    const games = Array.from({ length: OPEN_GAMES_LIMIT }, (_, i) => game(i + 1));
    const state = lobbyReducer(
      lobbyReducer(initialLobbyState, snapshot(games)),
      msg("lobby.updated", { game: game(OPEN_GAMES_LIMIT + 1) }),
    );
    expect(state.games).toHaveLength(OPEN_GAMES_LIMIT);
    expect(state.games?.[0]?.name).toBe(`Game ${OPEN_GAMES_LIMIT + 1}`);
    expect(state.games?.some((g) => g.name === "Game 1")).toBe(false);
  });

  test("a removal drops the game and ignores an unknown id", () => {
    const state = lobbyReducer(initialLobbyState, snapshot([game(1), game(2)]));
    expect(
      lobbyReducer(state, msg("lobby.removed", { gameId: game(1).id })).games?.map((g) => g.name),
    ).toEqual(["Game 2"]);
    expect(lobbyReducer(state, msg("lobby.removed", { gameId: game(9).id })).games).toHaveLength(2);
  });

  test("an update or removal before the first snapshot changes nothing", () => {
    expect(lobbyReducer(initialLobbyState, msg("lobby.updated", { game: game(1) }))).toBe(
      initialLobbyState,
    );
    expect(lobbyReducer(initialLobbyState, msg("lobby.removed", { gameId: game(1).id }))).toBe(
      initialLobbyState,
    );
  });

  test("invites.updated replaces the invites and leaves the games alone", () => {
    const invite: Invite = {
      id: "00000000-0000-4000-8000-0000000000a1",
      gameId: game(1).id,
      gameName: "Game 1",
      hostName: "Ann",
      state: "pending",
      createdAt: game(1).createdAt,
    };
    const base = lobbyReducer(initialLobbyState, snapshot([game(1)]));
    const state = lobbyReducer(base, msg("invites.updated", { invites: [invite] }, "user:x"));
    expect(state.invites).toEqual([invite]);
    expect(state.games).toBe(base.games);
    expect(lobbyReducer(state, msg("invites.updated", { invites: [] }, "user:x")).invites).toEqual(
      [],
    );
  });

  test("a message of another kind returns the same state", () => {
    const state = lobbyReducer(initialLobbyState, snapshot([game(1)]));
    expect(lobbyReducer(state, msg("room.cancelled", { gameId: game(1).id }, "game:x"))).toBe(
      state,
    );
  });
});
