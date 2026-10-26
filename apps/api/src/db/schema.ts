import type { Generated, Insertable, Selectable } from "kysely";

export interface GamesTable {
  id: string;
  name: string;
  created_at: Generated<string>;
}

export interface Database {
  games: GamesTable;
}

export type Game = Selectable<GamesTable>;
export type NewGame = Insertable<GamesTable>;
