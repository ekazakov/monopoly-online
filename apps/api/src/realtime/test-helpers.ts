import { randomUUID } from "node:crypto";
import { createGame } from "@monopoly/game-engine";
import type { GameState } from "@monopoly/game-engine";
import { gameResponseSchema, startGameResponseSchema, streamMessageSchema } from "@monopoly/shared";
import type { Game, StreamMessage, User } from "@monopoly/shared";
import type { Step } from "../game/test-helpers.ts";
import { postJson, sendAs, signIn } from "../auth/test-helpers.ts";

type Requester = Parameters<typeof signIn>[0];

/** One message frame of an event stream. */
export interface SseFrame {
  event: string;
  /** The `id:` line, if any. */
  id?: string;
  /** The `data:` text parsed by `streamMessageSchema`. */
  message: StreamMessage;
}

export interface SseReader {
  /** Frames that were read and not taken yet. */
  readonly pending: readonly SseFrame[];
  /** `presence.updated` frames read and not taken yet. `next` and `pending` never hold them. */
  readonly presence: readonly SseFrame[];
  /** The next `presence.updated` frame, or an error after `timeoutMs`. */
  nextPresence(timeoutMs?: number): Promise<SseFrame>;
  /** Comment lines read so far, without the leading colon. */
  readonly comments: readonly string[];
  /** The next message frame, or an error after `timeoutMs`. */
  next(timeoutMs?: number): Promise<SseFrame>;
  /** The next `count` frames. */
  take(count: number, timeoutMs?: number): Promise<SseFrame[]>;
  /** Wait `ms`, then check that no frame arrived. Returns nothing. */
  expectQuiet(ms?: number): Promise<void>;
  /** Resolves when `count` comments were read. */
  waitForComments(count: number, timeoutMs?: number): Promise<void>;
  /** Cancel the response body, as a client that disconnects. */
  close(): Promise<void>;
}

/** Read the frames of an event-stream response in the background. */
export function readSse(res: Response): SseReader {
  if (!res.body) throw new Error("The response has no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const frames: SseFrame[] = [];
  const presenceFrames: SseFrame[] = [];
  const comments: string[] = [];
  let buffer = "";
  let ended = false;
  let wake: (() => void) | null = null;
  const notify = () => {
    wake?.();
    wake = null;
  };

  function parse(block: string) {
    let event = "message";
    let id: string | undefined;
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) comments.push(line.slice(1).trim());
      else if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("id:")) id = line.slice(3).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (data.length === 0) return;
    const frame = { event, id, message: streamMessageSchema.parse(JSON.parse(data.join("\n"))) };
    // Presence frames have their own queue, so the tests of the other messages stay as they are.
    (frame.message.type === "presence.updated" ? presenceFrames : frames).push(frame);
  }

  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
          parse(buffer.slice(0, end));
          buffer = buffer.slice(end + 2);
          notify();
        }
      }
    } catch {
      // The test cancelled the body.
    }
    ended = true;
    notify();
  })();

  const waitFor = async (ready: () => boolean, timeoutMs: number, what: string) => {
    const deadline = Date.now() + timeoutMs;
    while (!ready()) {
      const left = deadline - Date.now();
      if (left <= 0 || ended) throw new Error(`Timed out waiting for ${what}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
  };

  const api: SseReader = {
    get pending() {
      return frames;
    },
    get presence() {
      return presenceFrames;
    },
    async nextPresence(timeoutMs = 2000) {
      await waitFor(() => presenceFrames.length > 0, timeoutMs, "a presence frame");
      return presenceFrames.shift()!;
    },
    get comments() {
      return comments;
    },
    async next(timeoutMs = 2000) {
      await waitFor(() => frames.length > 0, timeoutMs, "a frame");
      return frames.shift()!;
    },
    async take(count, timeoutMs = 2000) {
      const taken: SseFrame[] = [];
      for (let i = 0; i < count; i++) taken.push(await api.next(timeoutMs));
      return taken;
    },
    async expectQuiet(ms = 100) {
      await new Promise((resolve) => setTimeout(resolve, ms));
      if (frames.length > 0) {
        throw new Error(`Unexpected frames: ${JSON.stringify(frames.map((f) => f.message))}`);
      }
    },
    async waitForComments(count, timeoutMs = 2000) {
      await waitFor(() => comments.length >= count, timeoutMs, `${count} comments`);
    },
    async close() {
      await reader.cancel().catch(() => {});
    },
  };
  return api;
}

export interface Player {
  cookie: string;
  user: User;
}

export interface StartedGame {
  game: Game;
  owner: Player;
  guest: Player;
  /** The full engine state at version 0, rebuilt with the seed. */
  initial: GameState;
  /** `Cookie` header value of the user who controls the seat. */
  cookieOfSeat(seatId: string): string;
}

/** Sign in two users, create a room, join, add one hot-seat seat for the owner and start. */
export async function startedGame(app: Requester, seed: number): Promise<StartedGame> {
  const owner = await signIn(app, "Alice");
  const guest = await signIn(app, "Bobby");
  const created = gameResponseSchema.parse(
    await (await postJson(app, "/api/games", owner.cookie, { name: "Harbor" })).json(),
  );
  const id = created.game.id;
  await sendAs(app, "POST", `/api/games/${id}/join`, guest.cookie);
  await postJson(app, `/api/games/${id}/seats`, owner.cookie, { name: "Carol" });
  const res = await sendAs(app, "POST", `/api/games/${id}/start`, owner.cookie);
  if (res.status !== 200) throw new Error(`start failed: ${res.status} ${await res.text()}`);
  const { game } = startGameResponseSchema.parse(await res.json());
  const cookies = new Map([
    [owner.user.id, owner.cookie],
    [guest.user.id, guest.cookie],
  ]);
  return {
    game,
    owner,
    guest,
    initial: createGame({
      seed,
      players: game.seats.map((seat) => ({ id: seat.id, name: seat.name })),
    }),
    cookieOfSeat(seatId) {
      const seat = game.seats.find((s) => s.id === seatId);
      const cookie = seat && cookies.get(seat.controllerUserId);
      if (!cookie) throw new Error(`No cookie for seat ${seatId}`);
      return cookie;
    },
  };
}

/** Submit one scripted step through the real action endpoint. */
export function submitStep(app: Requester, started: StartedGame, step: Step) {
  const { playerId, ...action } = step.action;
  return postJson(app, `/api/games/${started.game.id}/actions`, started.cookieOfSeat(playerId), {
    seatId: playerId,
    action,
    expectedVersion: step.state.version - 1,
    clientActionId: randomUUID(),
  });
}
