import type { Game, LobbyGame } from "@monopoly/shared";
import { client, unwrap } from "../api.ts";

// The open games and the invites of the user arrive on the `lobby` and `user:<id>` topics of the
// stream, with a full list on each connect. Only My games has no topic, so it is fetched.

/** `GET /api/me/games`: the waiting and active games of the user, newest first. */
export async function listMyGames(): Promise<LobbyGame[]> {
  return (await unwrap(await client.api.me.games.$get())).games;
}

/** `POST /api/invites/:id/accept`: joins the game and returns it. */
export async function acceptInvite(id: string): Promise<Game> {
  return (await unwrap(await client.api.invites[":id"].accept.$post({ param: { id } }))).game;
}

/** `POST /api/invites/:id/decline`: answers 204 with no body. */
export async function declineInvite(id: string): Promise<void> {
  const res = await client.api.invites[":id"].decline.$post({ param: { id } });
  if (!res.ok) await unwrap(res);
}
