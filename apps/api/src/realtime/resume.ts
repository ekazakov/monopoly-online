// What a new stream sends first, per topic. The rules (E3):
//
// - `waiting` (no state yet): a `snapshot` with `state: null` and no SSE id. `Last-Event-ID` is
//   ignored.
// - `finished` (or any status other than `active`): a `snapshot` of the final state, whatever
//   `Last-Event-ID` says.
// - `active`, with gap = current version - `Last-Event-ID`:
//   - the id is missing, not a non-negative integer, or above the current version: `snapshot`.
//   - gap 0: nothing. The client is up to date and resumes silently.
//   - gap 1 to `RESUME_MAX_GAP`: replay the missed `game.actions` in order, one per action, each
//     with its events and the redacted state after that action.
//   - larger gap: `snapshot`.
// - The browser sends one `Last-Event-ID` for the whole stream, and ids of different games do not
//   compare. So it is used only when the stream has exactly one topic; with more topics every
//   topic gets a `snapshot`.
import { applyAction } from "@monopoly/game-engine";
import type { Action } from "@monopoly/game-engine";
import { LOBBY_TOPIC, RESUME_MAX_GAP } from "@monopoly/shared";
import type { Game, GameEvent, Invite, LobbyGame, RedactedGameState } from "@monopoly/shared";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { deserializeState } from "../game/loader.ts";
import type { GameStateLoader } from "../game/loader.ts";
import { redactState } from "../game/redact.ts";
import { gameTopic, userTopic } from "./messages.ts";
import type { StreamEnvelope } from "./messages.ts";

export type ResumePlan = { kind: "snapshot" } | { kind: "none" } | { kind: "replay" };

/** The `Last-Event-ID` header as a version, or null when it is missing or not a version. */
export function parseLastEventId(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d{1,15}$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

export function planResume(input: {
  status: Game["status"];
  currentVersion: number;
  lastEventId: number | null;
  maxGap?: number;
}): ResumePlan {
  const { status, currentVersion, lastEventId } = input;
  if (status !== "active" || lastEventId === null || lastEventId > currentVersion) {
    return { kind: "snapshot" };
  }
  const gap = currentVersion - lastEventId;
  if (gap === 0) return { kind: "none" };
  return gap <= (input.maxGap ?? RESUME_MAX_GAP) ? { kind: "replay" } : { kind: "snapshot" };
}

export function snapshotMessage(game: Game, state: RedactedGameState | null): StreamEnvelope {
  return {
    topic: gameTopic(game.id),
    type: "snapshot",
    version: state?.version ?? 0,
    // The room row can be a commit ahead of the state that was read. The pair must agree.
    payload: { game: state ? { ...game, version: state.version } : game, state },
  };
}

/**
 * The `game.actions` messages for the versions after `fromVersion` up to `toVersion`. The state
 * after each action is rebuilt: replay from the latest stored snapshot at or before `fromVersion`,
 * keeping the messages after `fromVersion`. The cost is at most one snapshot interval plus the gap.
 * Throws when the log has a hole or does not replay, so the caller can send a `snapshot` instead.
 */
/**
 * The log has no rows between the two versions. A rollback (Save or Finish) deletes the rows of
 * the discarded turn, so this is the normal way to a snapshot and is not logged.
 */
export class LogHoleError extends Error {}

export async function replayActions(
  db: Kysely<Database>,
  gameId: string,
  fromVersion: number,
  toVersion: number,
): Promise<StreamEnvelope[]> {
  const snapshot = await db
    .selectFrom("game_snapshots")
    .select(["version", "state"])
    .where("game_id", "=", gameId)
    .where("version", "<=", fromVersion)
    .orderBy("version", "desc")
    .limit(1)
    .executeTakeFirst();
  if (!snapshot) throw new Error(`Game ${gameId} has no snapshot at or before ${fromVersion}`);

  const rows = await db
    .selectFrom("game_events")
    .select(["version", "action", "events"])
    .where("game_id", "=", gameId)
    .where("version", ">", snapshot.version)
    .where("version", "<=", toVersion)
    .orderBy("version", "asc")
    .execute();

  let state = deserializeState(snapshot.state);
  const topic = gameTopic(gameId);
  const messages: StreamEnvelope[] = [];
  for (const row of rows) {
    const result = applyAction(state, JSON.parse(row.action) as Action);
    if (!result.ok || result.state.version !== row.version) {
      throw new Error(`Game ${gameId} log does not replay at version ${row.version}`);
    }
    state = result.state;
    if (row.version <= fromVersion) continue;
    messages.push({
      topic,
      type: "game.actions",
      version: row.version,
      payload: { events: JSON.parse(row.events) as GameEvent[], state: redactState(state) },
    });
  }
  if (messages.length !== toVersion - fromVersion) {
    throw new LogHoleError(`Game ${gameId} log has a hole between ${fromVersion} and ${toVersion}`);
  }
  return messages;
}

/** What one topic sends first, and the highest version the client then has. */
export interface TopicStart {
  messages: StreamEnvelope[];
  /** Live `snapshot` and `game.actions` with a version up to this one are already covered. */
  covered: number;
}

export interface TopicReaderOptions {
  db: Kysely<Database>;
  loader: GameStateLoader;
  readGame: (gameId: string) => Promise<Game>;
  maxGap?: number;
}

export function createTopicReader(options: TopicReaderOptions) {
  const { db, loader, readGame } = options;
  return async function readTopic(gameId: string, lastEventId: number | null): Promise<TopicStart> {
    const game = await readGame(gameId);
    // A waiting game has no state. Live messages from version 0 on are all new.
    if (game.status === "waiting") return { messages: [snapshotMessage(game, null)], covered: -1 };

    const full = await loader.load(gameId);
    if (!full) throw new Error(`Game ${gameId} is ${game.status} but has no state`);
    const current = full.version;
    const plan = planResume({
      status: game.status,
      currentVersion: current,
      lastEventId,
      maxGap: options.maxGap,
    });
    if (plan.kind === "none") return { messages: [], covered: current };
    if (plan.kind === "replay" && lastEventId !== null) {
      try {
        return {
          messages: await replayActions(db, gameId, lastEventId, current),
          covered: current,
        };
      } catch (error) {
        if (!(error instanceof LogHoleError)) {
          console.error("Stream resume failed, sending a snapshot", error);
        }
      }
    }
    return { messages: [snapshotMessage(game, redactState(full))], covered: current };
  };
}

// The `lobby` and `user:<id>` topics have no engine version, so there is nothing to resume.
// Each connect gets the full list, and `Last-Event-ID` does not matter. Their live messages are
// not versioned either: nothing is covered.

/** What a new connect to `lobby` sends first. */
export function lobbyStart(games: LobbyGame[]): TopicStart {
  return {
    messages: [{ topic: LOBBY_TOPIC, type: "lobby.snapshot", version: 0, payload: { games } }],
    covered: -1,
  };
}

/** What a new connect to `user:<id>` sends first: the pending invites of that user. */
export function userStart(userId: string, invites: Invite[]): TopicStart {
  return {
    messages: [
      { topic: userTopic(userId), type: "invites.updated", version: 0, payload: { invites } },
    ],
    covered: -1,
  };
}
