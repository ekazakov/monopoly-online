import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { GameActionsContext } from "../../../game/actions.ts";
import type { GameActions } from "../../../game/actions.ts";
import { actionsMessage, recordFixture, redact, snapshotMessage } from "../../../game/fixtures.ts";
import { GameStoreProvider } from "../../../game/GameStoreProvider.tsx";
import { createGameStore } from "../../../game/store.ts";
import { ROLL_MS } from "../../../scene/motion.ts";
import { TurnArea } from "../turn/index.ts";
import { MotionProvider } from "./MotionProvider.tsx";

const fx = recordFixture(3);
const rollStep = fx.steps.find((s) => s.events.some((e) => e.type === "DiceRolled"));
const actions: GameActions = { send: () => Promise.resolve(), pending: false, error: null };

function setup(playBeforeMount = false) {
  const store = createGameStore();
  store.applyStreamMessage(snapshotMessage(fx.game, redact(fx.start)));
  if (playBeforeMount) store.applyStreamMessage(actionsMessage(fx.game, rollStep!));
  render(
    <GameStoreProvider store={store}>
      <GameActionsContext value={actions}>
        <MotionProvider>
          <TurnArea userId={fx.ownerId} />
        </MotionProvider>
      </GameActionsContext>
    </GameStoreProvider>,
  );
  return store;
}

const rolling = () => screen.queryByRole("img", { name: "Rolling the dice" });

describe("dice roll animation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("a roll that arrives live shows tumbling dice and no buttons, then the phase view", () => {
    expect(rollStep).toBeDefined();
    const store = setup();
    expect(rolling()).toBeNull();
    expect(screen.getByRole("img", { name: "Dice: not rolled yet" })).toBeInTheDocument();

    act(() => store.applyStreamMessage(actionsMessage(fx.game, rollStep!)));
    expect(rolling()).toBeInTheDocument();
    expect(screen.getByText("Rolling…")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);

    act(() => void vi.advanceTimersByTime(ROLL_MS - 1));
    expect(rolling()).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(1));
    expect(rolling()).toBeNull();
    expect(screen.queryByText("Rolling…")).toBeNull();
    // the phase view is back: the roll led to a property, so the title deed shows
    expect(screen.getByText("Title deed")).toBeInTheDocument();
  });

  test("a roll that is already in the store at mount does not animate", () => {
    setup(true);
    expect(rolling()).toBeNull();
  });

  test("a snapshot at a newer version does not animate", () => {
    const store = setup();
    act(() => store.applyStreamMessage(snapshotMessage(fx.game, rollStep!.state)));
    expect(rolling()).toBeNull();
  });
});
