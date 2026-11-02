import { createContext } from "react";
import type { GameStore } from "./store.ts";

export const GameStoreContext = createContext<GameStore | null>(null);
