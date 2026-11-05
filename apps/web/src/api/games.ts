import { gameStateResponseSchema, type Game, type GameResult, type Token } from "@monopoly/shared";
import { apiFetch, client, unwrap } from "../api.ts";

export async function createGame(name: string): Promise<Game> {
  return (await unwrap(await client.api.games.$post({ json: { name } }))).game;
}

export async function getGame(id: string): Promise<Game> {
  return (await unwrap(await client.api.games[":id"].$get({ param: { id } }))).game;
}

export async function joinGame(id: string): Promise<Game> {
  return (await unwrap(await client.api.games[":id"].join.$post({ param: { id } }))).game;
}

export async function leaveGame(id: string): Promise<Game> {
  return (await unwrap(await client.api.games[":id"].leave.$post({ param: { id } }))).game;
}

export async function addHotSeat(id: string, name: string): Promise<Game> {
  return (
    await unwrap(await client.api.games[":id"].seats.$post({ param: { id }, json: { name } }))
  ).game;
}

export async function removeSeat(id: string, seatId: string): Promise<Game> {
  return (
    await unwrap(await client.api.games[":id"].seats[":seatId"].$delete({ param: { id, seatId } }))
  ).game;
}

/** `PUT /api/games/:id/seats/:seatId/token`: the controller of the seat picks another figure. */
export async function changeToken(id: string, seatId: string, token: Token): Promise<Game> {
  return (
    await unwrap(
      await client.api.games[":id"].seats[":seatId"].token.$put({
        param: { id, seatId },
        json: { token },
      }),
    )
  ).game;
}

export async function startGame(id: string) {
  return unwrap(await client.api.games[":id"].start.$post({ param: { id } }));
}

// `app.ts` does not mount the gameplay routes yet, so `AppType` has no `/state` path. Until it
// does, the call goes through `apiFetch` (same 401 handling) and the shared schema checks the body.
// Then it can become `client.api.games[":id"].state.$get(...)` with no change for callers.
export async function getState(id: string) {
  const res = await apiFetch(`/api/games/${encodeURIComponent(id)}/state`);
  return gameStateResponseSchema.parse(await unwrap(res));
}

/** The result of a finished game. Answers 409 `game_not_finished` for a game that is still running. */
export async function getResult(id: string): Promise<GameResult> {
  return (await unwrap(await client.api.games[":id"].result.$get({ param: { id } }))).result;
}
