import { act, render } from "@testing-library/react";
import type { Phase, RedactedGameState } from "@monopoly/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { GameActionsContext } from "../../../game/actions.ts";
import type { GameActions } from "../../../game/actions.ts";
import { actionsMessage, recordFixture, redact, snapshotMessage } from "../../../game/fixtures.ts";
import type { Step } from "../../../game/fixtures.ts";
import { GameStoreProvider } from "../../../game/GameStoreProvider.tsx";
import { createGameStore } from "../../../game/store.ts";
import type { GameStore } from "../../../game/store.ts";
import { stepDuration, planMotion } from "../../../scene/motion.ts";
import { setMotionPreference } from "../../../styles/motionPreference.ts";
import { MotionProvider } from "../motion/index.ts";
import { setAutoEndTurn } from "./autoEndTurnPreference.ts";
import { AUTO_END_DELAY_MS, useAutoEndTurn } from "./useAutoEndTurn.ts";

const fx = recordFixture(60);
const { a, b } = fx.seats;
/** Owner controls seat a (a user seat) and seat c (hot seat). */
const ownerSeats = new Set([fx.seats.a.id, fx.seats.c.id]);

function stateIn(phase: Phase, currentPlayerId = a.id): RedactedGameState {
  const base = redact(fx.start);
  return { ...base, version: 100, turn: { ...base.turn, currentPlayerId, phase, doubles: 0 } };
}

function Harness({ debug, cardOpen }: { debug: boolean; cardOpen: boolean }) {
  useAutoEndTurn(fx.ownerId, debug, cardOpen);
  return null;
}

interface Options {
  debug?: boolean;
  cardOpen?: boolean;
  pending?: boolean;
}

function mount(
  store: GameStore,
  { debug = true, cardOpen = false, pending = false }: Options = {},
) {
  const send = vi.fn<GameActions["send"]>(() => Promise.resolve());
  const actions: GameActions = { send, pending, error: null };
  const tree = (props: Required<Options>) => (
    <GameStoreProvider store={store}>
      <GameActionsContext value={{ ...actions, pending: props.pending }}>
        <MotionProvider>
          <Harness debug={props.debug} cardOpen={props.cardOpen} />
        </MotionProvider>
      </GameActionsContext>
    </GameStoreProvider>
  );
  const view = render(tree({ debug, cardOpen, pending }));
  return {
    send,
    view,
    rerender: (next: Options) => view.rerender(tree({ debug, cardOpen, pending, ...next })),
    remount: () => {
      view.unmount();
      return render(tree({ debug, cardOpen, pending }));
    },
  };
}

function storeIn(state: RedactedGameState) {
  const store = createGameStore();
  store.applyStreamMessage(snapshotMessage(fx.game, redact(fx.start)));
  store.applyStateResponse({ version: state.version, state });
  return store;
}

const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("useAutoEndTurn", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setAutoEndTurn(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    setAutoEndTurn(false);
    setMotionPreference("system");
  });

  test("sends EndTurn once, after the pause, when nothing is left to do", () => {
    const { send } = mount(storeIn(stateIn("awaiting_end_turn")));
    wait(AUTO_END_DELAY_MS - 1);
    expect(send).not.toHaveBeenCalled();
    wait(1);
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: "EndTurn" }, { seatId: a.id });
    wait(10_000);
    expect(send).toHaveBeenCalledOnce();
  });

  test("a hot-seat player of this device is ended too", () => {
    const { send } = mount(storeIn(stateIn("awaiting_end_turn", fx.seats.c.id)));
    wait(AUTO_END_DELAY_MS);
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: "EndTurn" }, { seatId: fx.seats.c.id });
  });

  test("a remount (as in StrictMode) still sends, and only once", () => {
    const { send, remount } = mount(storeIn(stateIn("awaiting_end_turn")));
    wait(AUTO_END_DELAY_MS - 100);
    remount();
    wait(AUTO_END_DELAY_MS);
    expect(send).toHaveBeenCalledOnce();
  });

  test("does nothing when the switch is off", () => {
    setAutoEndTurn(false);
    const { send } = mount(storeIn(stateIn("awaiting_end_turn")));
    wait(10_000);
    expect(send).not.toHaveBeenCalled();
  });

  test("does nothing when debug mode is off on the server", () => {
    const { send } = mount(storeIn(stateIn("awaiting_end_turn")), { debug: false });
    wait(10_000);
    expect(send).not.toHaveBeenCalled();
  });

  test.each<Phase>([
    "awaiting_roll",
    "awaiting_buy_decision",
    "awaiting_bid",
    "awaiting_debt",
    "awaiting_jail_choice",
  ])("waits in %s", (phase) => {
    const { send } = mount(storeIn(stateIn(phase)));
    wait(10_000);
    expect(send).not.toHaveBeenCalled();
  });

  test("does nothing on the turn of a player of another device", () => {
    const { send } = mount(storeIn(stateIn("awaiting_end_turn", b.id)));
    wait(10_000);
    expect(send).not.toHaveBeenCalled();
  });

  test("waits for OK on the card", () => {
    const { send, rerender } = mount(storeIn(stateIn("awaiting_end_turn")), { cardOpen: true });
    wait(10_000);
    expect(send).not.toHaveBeenCalled();
    rerender({ cardOpen: false });
    wait(AUTO_END_DELAY_MS);
    expect(send).toHaveBeenCalledOnce();
  });

  test("waits while an action is in flight", () => {
    const { send, rerender } = mount(storeIn(stateIn("awaiting_end_turn")), { pending: true });
    wait(10_000);
    expect(send).not.toHaveBeenCalled();
    rerender({ pending: false });
    wait(AUTO_END_DELAY_MS);
    expect(send).toHaveBeenCalledOnce();
  });
});

describe("useAutoEndTurn and the token motion", () => {
  // A roll of a seat of this device that moves the token and leaves nothing to do.
  const index = fx.steps.findIndex(
    (step: Step) =>
      step.action.type === "RollDice" &&
      ownerSeats.has(step.action.playerId) &&
      step.state.turn.phase === "awaiting_end_turn" &&
      step.state.turn.currentPlayerId === step.action.playerId &&
      !step.events.some((e) => e.type === "CardDrawn") &&
      planMotion(step.events).length > 0,
  );
  const roll = fx.steps[index]!;

  function beforeRoll() {
    const store = createGameStore();
    store.applyStreamMessage(snapshotMessage(fx.game, redact(fx.start)));
    for (const step of fx.steps.slice(0, index)) {
      store.applyStreamMessage(actionsMessage(fx.game, step));
    }
    return store;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    setAutoEndTurn(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    setAutoEndTurn(false);
    setMotionPreference("system");
  });

  test("the fixture has such a roll", () => {
    expect(index).toBeGreaterThan(0);
  });

  test("ends the turn only after the dice and the token stop", () => {
    const store = beforeRoll();
    const { send } = mount(store);
    act(() => store.applyStreamMessage(actionsMessage(fx.game, roll)));
    const total = planMotion(roll.events).reduce((sum, step) => sum + stepDuration(step), 0);
    wait(total - 1);
    expect(send).not.toHaveBeenCalled();
    // The token stops here. The pause starts in the effect after this render.
    wait(1);
    expect(send).not.toHaveBeenCalled();
    wait(AUTO_END_DELAY_MS - 1);
    expect(send).not.toHaveBeenCalled();
    wait(1);
    expect(send).toHaveBeenCalledExactlyOnceWith(
      { type: "EndTurn" },
      { seatId: roll.action.playerId },
    );
  });

  test("under reduced motion it ends after the pause only", () => {
    setMotionPreference("reduce");
    const store = beforeRoll();
    const { send } = mount(store);
    act(() => store.applyStreamMessage(actionsMessage(fx.game, roll)));
    wait(AUTO_END_DELAY_MS);
    expect(send).toHaveBeenCalledOnce();
  });
});
