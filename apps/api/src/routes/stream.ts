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
import { writeChecked } from "../realtime/checked-write.ts";
import { openConnection } from "../realtime/connection.ts";
import {
  gameIdOf,
  presenceMessage,
  sseEventId,
  topicKind,
  userIdOf,
} from "../realtime/messages.ts";
import type { StreamEnvelope } from "../realtime/messages.ts";
import { readSeatPresence } from "../realtime/presence.ts";
import type { PresenceTracker } from "../realtime/presence.ts";
import { createTopicReader, lobbyStart, parseLastEventId, userStart } from "../realtime/resume.ts";
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
  summary: "Open the event stream of games, the lobby and the invites of the user",
  description:
    "Server-sent events. Topics: `game:<id>` (seated users only), `lobby` (any signed-in user) and `user:<id>` (only that user, else 403 `forbidden_topic`). Each message has `event:` set to its type (`snapshot`, `room.updated`, `room.cancelled`, `room.removed`, `game.actions`, `lobby.snapshot`, `lobby.updated`, `lobby.removed`, `invites.updated`, `presence.updated`) and `data:` set to the JSON envelope `{ topic, type, version, payload }`. `id:` is the engine version and is set only on `snapshot` of a started game and on `game.actions`; the lobby and user messages have no id. A comment line every 15 seconds keeps the stream open. After a reconnect with `Last-Event-ID` and exactly one game topic, the missed `game.actions` are replayed when the gap is 1 to 100 versions, and a `snapshot` is sent when the gap is larger, the id is not a valid version, or the game is not `active`. A new EventSource instance can supply the optional `lastEventId` query instead; the header takes precedence. Each connect to `lobby` or `user:<id>` gets the full list. Each connect to an `active` game also gets `presence.updated` (version 0, no id): the status of every seat whose controller the server knows, `online`, `reconnecting` or `away`. It is sent again on each change. A user with a stream open in any tab is `online`; the status is `reconnecting` when the last stream closes, and `away` 60 seconds later.",
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
  /** Counts the open streams of each controller of an `active` game. */
  presence: PresenceTracker;
  /** Aborted when the server shuts down: every open stream ends. */
  shutdownSignal?: AbortSignal;
  /** Interval of the heartbeat comment. Defaults to `HEARTBEAT_MS`. */
  heartbeatMs?: number;
  /** Largest version gap that is replayed. Defaults to `RESUME_MAX_GAP`. */
  resumeMaxGap?: number;
}

const isSeated = (game: Game, userId: string) =>
  game.seats.some((seat) => seat.userId === userId || seat.controllerUserId === userId);

export function streamRoutes(deps: StreamRoutesDeps) {
  const { rooms, loader, bus, db, presence } = deps;
  const heartbeatMs = deps.heartbeatMs ?? HEARTBEAT_MS;
  const readTopic = createTopicReader({
    db,
    loader,
    readGame: (gameId) => rooms.get(gameId),
    maxGap: deps.resumeMaxGap,
    log: deps.log,
  });
  const routes = new OpenAPIHono<AppEnv>();
  // `.use` returns a plain Hono type, so it stays out of the typed chain below.
  routes.use("/stream", requireSession(deps));

  return routes.openapi(streamRoute, async (c) => {
    const topics = parseStreamTopics(c.req.valid("query").topics);
    if (!topics) {
      return c.json(
        errorBody("validation_error", "Invalid topics", [
          {
            path: ["topics"],
            message: "Use 1 to 5 topics: game:<uuid>, lobby or user:<uuid>",
          },
        ]),
        400,
      );
    }
    const unique = [...new Set(topics)];
    const user = c.get("user");

    // Every topic is checked before the stream opens. The tracker counts the stream of every game,
    // and sends the seat map only for an `active` one.
    const gameIds: string[] = [];
    const activeGameIds = new Set<string>();
    for (const topic of unique) {
      const kind = topicKind(topic);
      // Any signed-in user can read the open games.
      if (kind === "lobby") continue;
      if (kind === "user") {
        if (userIdOf(topic) !== user.id) {
          return c.json(errorBody("forbidden_topic", "This topic belongs to another user"), 403);
        }
        continue;
      }
      let game: Game;
      try {
        game = await rooms.get(gameIdOf(topic));
      } catch (error) {
        if (error instanceof RoomError && error.code === "not_found") {
          return c.json(errorBody("not_found", "Game not found"), 404);
        }
        throw error;
      }
      if (!isSeated(game, user.id)) {
        return c.json(errorBody("not_a_member", "You are not seated in this game"), 403);
      }
      gameIds.push(game.id);
      if (game.status === "active") activeGameIds.add(game.id);
    }

    // Native retries supply the header; a new EventSource supplies the query fallback. Both are
    // engine versions, used only with exactly one game topic; `lobby` and `user:` have no ids.
    const gameTopics = unique.filter((topic) => topicKind(topic) === "game");
    const lastEventId =
      gameTopics.length === 1
        ? parseLastEventId(c.req.header("last-event-id") ?? c.req.valid("query").lastEventId)
        : null;
    const connection = await openConnection({
      bus,
      topics: unique,
      readTopic: async (topic) => {
        switch (topicKind(topic)) {
          case "lobby":
            return lobbyStart(await rooms.listOpen());
          case "user":
            return userStart(user.id, await rooms.listInvites(user));
          default:
            return readTopic(gameIdOf(topic), lastEventId);
        }
      },
    });

    // The user has a stream in each game from now on. The seat map of the connect goes after the
    // other first messages, also when a resume has nothing to send.
    const disconnects: (() => void)[] = [];
    const disconnect = () => {
      for (const close of disconnects.splice(0)) close();
    };
    const initial = [...connection.initial];
    try {
      for (const gameId of gameIds) {
        disconnects.push(presence.connect(gameId, user.id));
        if (!activeGameIds.has(gameId)) continue;
        initial.push(presenceMessage(gameId, await readSeatPresence(db, presence, gameId)));
      }
    } catch (error) {
      disconnect();
      connection.close();
      throw error;
    }

    const log = c.get("log");
    const openedAt = performance.now();
    log.info({ userId: user.id, topics: unique }, "stream open");
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
      for (const message of initial) send(message);
      connection.start(send);
      // A failed heartbeat write means the client is gone: close the stream, so the presence of
      // the user does not stay `online` for a stream that nobody reads.
      const timer = setInterval(
        () =>
          enqueue(async () => {
            if (!(await writeChecked(stream, ": heartbeat\n\n"))) stream.abort();
          }),
        heartbeatMs,
      );

      // A shutdown ends the stream like a client that left. The client reconnects to the next server.
      const onShutdown = () => stream.abort();
      if (deps.shutdownSignal?.aborted) onShutdown();
      else deps.shutdownSignal?.addEventListener("abort", onShutdown, { once: true });

      await new Promise<void>((resolve) => stream.onAbort(resolve));
      deps.shutdownSignal?.removeEventListener("abort", onShutdown);
      clearInterval(timer);
      connection.close();
      disconnect();
      log.info(
        { userId: user.id, topics: unique, durationMs: Math.round(performance.now() - openedAt) },
        "stream closed",
      );
    });
    // The library types only JSON bodies. The 200 response is declared for the document only.
    return response as never;
  });
}
