// Shared setup of the trade flow tests: a store with a state that the test edits, and a fake
// `GameActionsContext`. Not part of the app.
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import type { RedactedGameState } from "@monopoly/shared";
import { vi } from "vite-plus/test";
import { GameActionsContext } from "../../../../game/actions.ts";
import type { GameActions } from "../../../../game/actions.ts";
import { recordFixture, redact, snapshotMessage } from "../../../../game/fixtures.ts";
import { GameStoreProvider } from "../../../../game/GameStoreProvider.tsx";
import { createGameStore } from "../../../../game/store.ts";

export const fx = recordFixture(3);
export const { a, b, c } = fx.seats;

type Player = RedactedGameState["players"][number];

export interface Setup {
  phase?: RedactedGameState["turn"]["phase"];
  /** The player on turn. */
  current?: "a" | "b" | "c";
  /** Per seat edits of the player. */
  players?: Partial<Record<"a" | "b" | "c", Partial<Player>>>;
  ownership?: RedactedGameState["ownership"];
  trade?: RedactedGameState["trade"];
}

export function stateFor({
  phase = "awaiting_roll",
  current = "a",
  players = {},
  ownership = {},
  trade = null,
}: Setup): RedactedGameState {
  const base = redact(fx.start);
  const seatOf = (id: string) => (["a", "b", "c"] as const).find((key) => fx.seats[key].id === id);
  return {
    ...base,
    version: 100,
    players: base.players.map((p) => {
      const key = seatOf(p.id);
      return { ...p, cash: 1500, ...(key ? players[key] : {}) };
    }),
    ownership,
    trade,
    turn: { currentPlayerId: fx.seats[current].id, phase, doubles: 0, dice: null },
  };
}

export function makeStore(setup: Setup) {
  const store = createGameStore();
  store.applyStreamMessage(snapshotMessage(fx.game, stateFor(setup)));
  return store;
}

export function fakeActions(over: Partial<GameActions> = {}) {
  const send = vi.fn<GameActions["send"]>(() => Promise.resolve());
  const actions: GameActions = { send, pending: false, error: null, ...over };
  return { send, actions };
}

export function renderWith(setup: Setup, element: ReactElement, over: Partial<GameActions> = {}) {
  const store = makeStore(setup);
  const fake = fakeActions(over);
  const tree = (actions: GameActions) => (
    <GameStoreProvider store={store}>
      <GameActionsContext value={actions}>{element}</GameActionsContext>
    </GameStoreProvider>
  );
  const view = render(tree(fake.actions));
  return {
    ...view,
    ...fake,
    store,
    update: (next: Partial<GameActions>) => view.rerender(tree({ ...fake.actions, ...next })),
  };
}
