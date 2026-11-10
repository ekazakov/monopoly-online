import type { Game, LobbyGame, Seat, User } from "@monopoly/shared";
import { vi } from "vite-plus/test";

export interface ApiCall {
  method: string;
  path: string;
  body: unknown;
}

type Reply = Response | Promise<Response>;
type Handler = (call: ApiCall) => Reply;

export const userFixture: User = {
  id: "0b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d01",
  name: "Marlow",
  createdAt: "2026-11-02T10:00:00.000Z",
};

export function gameFixture(overrides: Partial<Game> = {}): Game {
  return {
    id: "7b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d11",
    name: "Friday game",
    status: "waiting",
    ownerId: userFixture.id,
    version: 0,
    createdAt: "2026-11-02T10:00:00.000Z",
    seats: [
      {
        id: "5b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d21",
        // The server numbers seats from 1.
        order: 1,
        name: "Marlow",
        kind: "user",
        userId: userFixture.id,
        controllerUserId: userFixture.id,
        token: "dog",
        claimed: false,
      },
    ],
    invites: [],
    ...overrides,
  };
}

/** A game of the owner in the given status, for the calls of Save, Finish, Claim and Restore. */
export function gameInStatus(status: Game["status"], overrides: Partial<Game> = {}): Game {
  return gameFixture({ status, version: status === "waiting" ? 0 : 7, ...overrides });
}

/** The same game with the given seats claimed, as `POST /claim` answers. */
export function withClaims(game: Game, seatIds: readonly string[]): Game {
  const ids = new Set(seatIds);
  return {
    ...game,
    seats: game.seats.map((seat: Seat) => ({ ...seat, claimed: ids.has(seat.id) || seat.claimed })),
  };
}

/** A row of the lobby: the game of the owner `userFixture`, with four seats. */
export function lobbyGameFixture(overrides: Partial<LobbyGame> = {}): LobbyGame {
  return {
    id: "7b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d11",
    name: "Friday game",
    ownerId: userFixture.id,
    ownerName: userFixture.name,
    status: "waiting",
    seatCount: 4,
    tokens: ["dog", "cat", "penguin", "car"],
    createdAt: "2026-11-02T10:00:00.000Z",
    ...overrides,
  };
}

export function errorReply(status: number, code: string, message = code, issues?: unknown) {
  return Response.json({ error: { code, message, ...(issues ? { issues } : {}) } }, { status });
}

export const noContent = () => new Response(null, { status: 204 });

/** The sign-in methods that `mockApi` answers by default: guest sign-in only, as in development. */
export const methodsFixture = { google: false, guest: true, debug: false };

// Replaces `fetch` with a table of "METHOD /path" -> reply. An unlisted call answers 404, except
// `GET /api/auth/methods`, which answers `methodsFixture` unless a test sets it.
// Returns the recorded calls. Unstub in afterEach with `vi.unstubAllGlobals()`.
export function mockApi(given: Record<string, Handler | Reply>): ApiCall[] {
  const routes: Record<string, Handler | Reply> = {
    "GET /api/auth/methods": Response.json(methodsFixture),
    ...given,
  };
  const calls: ApiCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const request = new Request(new URL(input, "http://localhost"), init);
      const text = await request.text();
      const call: ApiCall = {
        method: request.method,
        path: new URL(request.url).pathname,
        body: text ? (JSON.parse(text) as unknown) : undefined,
      };
      calls.push(call);
      const route = routes[`${call.method} ${call.path}`];
      if (route === undefined) return errorReply(404, "not_found");
      const reply = typeof route === "function" ? route(call) : route;
      // A Response body reads once, so each call gets its own copy.
      return reply instanceof Response ? reply.clone() : reply;
    }),
  );
  return calls;
}
