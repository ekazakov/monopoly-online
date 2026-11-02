// The SSE stream: `GET /api/stream?topics=game:<id>[,game:<id2>]`. Every topic is checked before
// the stream opens, so a bad request is a normal JSON error. The message contract and the resume
// rules are in `realtime/messages.ts` and `realtime/resume.ts`.
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { parseStreamTopics, streamQuerySchema } from "@monopoly/shared";
import type { Game } from "@monopoly/shared";
import { streamSSE } from "hono/streaming";
import { requireSession } from "../auth/index.ts";
import { errorBody } from "../errors.ts";
import type { GameStateLoader } from "../game/loader.ts";
import type { Bus } from "../realtime/bus.ts";
import { openConnection } from "../realtime/connection.ts";
import { gameIdOf, sseEventId } from "../realtime/messages.ts";
import type { StreamEnvelope } from "../realtime/messages.ts";
import { createTopicReader, parseLastEventId } from "../realtime/resume.ts";
import { RoomError } from "../rooms/service.ts";
import type { RoomService } from "../rooms/service.ts";
import { errorResponses, sessionSecurity, type AppDeps, type AppEnv } from "./common.ts";

/** A comment line is sent this often, so proxies keep the idle stream open. */
export const HEARTBEAT_MS = 15_000;

const streamRoute = createRoute({
  ...sessionSecurity,
  method: "get",
  path: "/stream",
  tags: ["realtime"],
  summary: "Open the event stream of one or more games",
  description:
    "Server-sent events. Each message has `event:` set to its type (`snapshot`, `room.updated`, `game.actions`) and `data:` set to the JSON envelope `{ topic, type, version, payload }`. `id:` is the engine version and is set only on `snapshot` of a started game and on `game.actions`. A comment line every 15 seconds keeps the stream open. After a reconnect with `Last-Event-ID`, the missed `game.actions` are replayed when the gap is 1 to 100 versions, and a `snapshot` is sent when the gap is larger, the id is not a valid version, or the game is not `active`.",
  request: { query: streamQuerySchema },
  responses: {
    200: {
      description: "An event stream, kept open until the client disconnects",
      content: { "text/event-stream": { schema: z.string() } },
    },
    ...errorResponses(400, 401, 403, 404, 500),
  },
});

export interface StreamRoutesDeps extends AppDeps {
  rooms: RoomService;
  loader: GameStateLoader;
  bus: Bus<StreamEnvelope>;
  /** Interval of the heartbeat comment. Defaults to `HEARTBEAT_MS`. */
  heartbeatMs?: number;
  /** Largest version gap that is replayed. Defaults to `RESUME_MAX_GAP`. */
  resumeMaxGap?: number;
}

const isSeated = (game: Game, userId: string) =>
  game.seats.some((seat) => seat.userId === userId || seat.controllerUserId === userId);

export function streamRoutes(deps: StreamRoutesDeps) {
  const { rooms, loader, bus, db } = deps;
  const heartbeatMs = deps.heartbeatMs ?? HEARTBEAT_MS;
  const readTopic = createTopicReader({
    db,
    loader,
    readGame: (gameId) => rooms.get(gameId),
    maxGap: deps.resumeMaxGap,
  });
  const routes = new OpenAPIHono<AppEnv>();
  // `.use` returns a plain Hono type, so it stays out of the typed chain below.
  routes.use("/stream", requireSession(deps));

  return routes.openapi(streamRoute, async (c) => {
    const topics = parseStreamTopics(c.req.valid("query").topics);
    if (!topics) {
      return c.json(
        errorBody("validation_error", "Invalid topics", [
          { path: ["topics"], message: "Use 1 to 5 topics of the form game:<uuid>" },
        ]),
        400,
      );
    }
    const unique = [...new Set(topics)];

    // Every topic is checked before the stream opens.
    for (const topic of unique) {
      let game: Game;
      try {
        game = await rooms.get(gameIdOf(topic));
      } catch (error) {
        if (error instanceof RoomError && error.code === "not_found") {
          return c.json(errorBody("not_found", "Game not found"), 404);
        }
        throw error;
      }
      if (!isSeated(game, c.get("user").id)) {
        return c.json(errorBody("not_a_member", "You are not seated in this game"), 403);
      }
    }

    const lastEventId =
      unique.length === 1 ? parseLastEventId(c.req.header("last-event-id")) : null;
    const connection = await openConnection({
      bus,
      topics: unique,
      readTopic: (gameId) => readTopic(gameId, lastEventId),
    });

    c.header("X-Accel-Buffering", "no");
    c.header("Cache-Control", "no-cache");
    const response = streamSSE(c, async (stream) => {
      // One writer at a time keeps the frames in order.
      let tail: Promise<unknown> = Promise.resolve();
      const enqueue = (write: () => Promise<unknown>) => {
        tail = tail.then(write).catch(() => {});
      };
      const send = (message: StreamEnvelope) =>
        enqueue(() =>
          stream.writeSSE({
            event: message.type,
            data: JSON.stringify(message),
            id: sseEventId(message),
          }),
        );

      // A first comment makes the response start now, also when nothing else is due.
      enqueue(() => stream.write(": open\n\n"));
      for (const message of connection.initial) send(message);
      connection.start(send);
      const timer = setInterval(() => enqueue(() => stream.write(": heartbeat\n\n")), heartbeatMs);

      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(timer);
      connection.close();
    });
    // The library types only JSON bodies. The 200 response is declared for the document only.
    return response as never;
  });
}
