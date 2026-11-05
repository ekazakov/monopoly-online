import type { Generated, Insertable, Selectable, Updateable } from "kysely";

// Same values as `gameStatusSchema` in `@monopoly/shared`.
export type GameStatus = "waiting" | "active" | "saved" | "finished";
export type SeatKind = "user" | "hotseat";
// Same values as `inviteStateSchema` in `@monopoly/shared`.
export type InviteState = "pending" | "accepted" | "declined" | "expired";
export type SeatToken = "dog" | "cat" | "penguin" | "car" | "horse" | "duck";

export interface UsersTable {
  id: string;
  name: string;
  // Lower-cased name, unique.
  name_key: string;
  created_at: Generated<string>;
}

export interface SessionsTable {
  // Hash of the session token. The token itself is never stored.
  token_hash: string;
  user_id: string;
  expires_at: string;
  last_used_at: string;
  created_at: Generated<string>;
}

export interface GamesTable {
  id: string;
  name: string;
  owner_id: string;
  status: Generated<GameStatus>;
  version: Generated<number>;
  created_at: Generated<string>;
}

export interface SeatsTable {
  // Also the engine player id.
  id: string;
  game_id: string;
  seat_order: number;
  name: string;
  name_key: string;
  kind: SeatKind;
  // Null for a hot-seat seat.
  user_id: string | null;
  controller_user_id: string;
  // Same values as `tokenSchema` in `@monopoly/shared`. Unique per game. Nullable only because
  // SQLite adds the column with `ALTER TABLE`; the migration fills it for every old row.
  token: SeatToken | null;
  created_at: Generated<string>;
}

export interface InvitesTable {
  id: string;
  game_id: string;
  invited_user_id: string;
  invited_by_user_id: string;
  state: Generated<InviteState>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface GameEventsTable {
  game_id: string;
  // Version 1 is the first action after start.
  version: number;
  client_action_id: string;
  seat_id: string;
  // JSON text.
  action: string;
  // JSON text.
  events: string;
  created_at: Generated<string>;
}

export interface GameSnapshotsTable {
  game_id: string;
  // Version 0 is written at start.
  version: number;
  // JSON text.
  state: string;
  // 0 or 1.
  turn_start: Generated<number>;
  created_at: Generated<string>;
}

export interface Database {
  users: UsersTable;
  sessions: SessionsTable;
  games: GamesTable;
  seats: SeatsTable;
  invites: InvitesTable;
  game_events: GameEventsTable;
  game_snapshots: GameSnapshotsTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

export type Session = Selectable<SessionsTable>;
export type NewSession = Insertable<SessionsTable>;
export type SessionUpdate = Updateable<SessionsTable>;

export type Game = Selectable<GamesTable>;
export type NewGame = Insertable<GamesTable>;
export type GameUpdate = Updateable<GamesTable>;

export type Seat = Selectable<SeatsTable>;
export type NewSeat = Insertable<SeatsTable>;
export type SeatUpdate = Updateable<SeatsTable>;

export type Invite = Selectable<InvitesTable>;
export type NewInvite = Insertable<InvitesTable>;
export type InviteUpdate = Updateable<InvitesTable>;

export type GameEventRow = Selectable<GameEventsTable>;
export type NewGameEventRow = Insertable<GameEventsTable>;
export type GameEventRowUpdate = Updateable<GameEventsTable>;

export type GameSnapshot = Selectable<GameSnapshotsTable>;
export type NewGameSnapshot = Insertable<GameSnapshotsTable>;
export type GameSnapshotUpdate = Updateable<GameSnapshotsTable>;
