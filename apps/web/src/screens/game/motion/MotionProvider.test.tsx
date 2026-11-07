import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { GameActionsContext } from "../../../game/actions.ts";
import type { GameActions } from "../../../game/actions.ts";
import { actionsMessage, recordFixture, redact, snapshotMessage } from "../../../game/fixtures.ts";
import { GameStoreProvider } from "../../../game/GameStoreProvider.tsx";
import { createGameStore } from "../../../game/store.ts";
import { ROLL_MS, planMotion, stepDuration } from "../../../scene/motion.ts";
import { setMotionPreference } from "../../../styles/motionPreference.ts";
import { TurnArea } from "../turn/index.ts";
import { MotionProvider } from "./MotionProvider.tsx";
import { REPLAY_WINDOW_MS } from "./useMotionPlayer.ts";

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
    setMotionPreference("system");
  });

  test("a roll that arrives live shows tumbling dice and no buttons, then the move, then the phase view", () => {
    expect(rollStep).toBeDefined();
    const total = planMotion(rollStep!.events).reduce((sum, step) => sum + stepDuration(step), 0);
    const store = setup();
    expect(rolling()).toBeNull();
    expect(screen.getByRole("img", { name: "Dice: not rolled yet" })).toBeInTheDocument();

    act(() => store.applyStreamMessage(actionsMessage(fx.game, rollStep!)));
    expect(rolling()).toBeInTheDocument();
    expect(screen.getByText("Rolling…")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);

    act(() => void vi.advanceTimersByTime(ROLL_MS - 1));
    expect(rolling()).toBeInTheDocument();

    // the roll ends and the token walks: still no buttons
    act(() => void vi.advanceTimersByTime(1));
    expect(rolling()).toBeNull();
    expect(screen.getByText("Moving…")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);

    act(() => void vi.advanceTimersByTime(total - ROLL_MS));
    expect(screen.queryByText("Moving…")).toBeNull();
    // the phase view is back: the roll led to a property, so the title deed shows
    expect(screen.getByText("Title deed")).toBeInTheDocument();
  });

  test("under reduced motion a live roll shows its result at once, with no roll and no move", () => {
    setMotionPreference("reduce");
    const store = setup();
    act(() => store.applyStreamMessage(actionsMessage(fx.game, rollStep!)));
    expect(rolling()).toBeNull();
    expect(screen.queryByText("Rolling…")).toBeNull();
    expect(screen.queryByText("Moving…")).toBeNull();
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

describe("settling instead of animating", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const nextWithRoll = () => fx.steps.find((s) => s.events.some((e) => e.type === "DiceRolled"))!;

  test("a snapshot while a roll plays stops the animation and drops the steps that wait", () => {
    const store = setup();
    act(() => store.applyStreamMessage(actionsMessage(fx.game, nextWithRoll())));
    expect(rolling()).toBeInTheDocument();

    act(() => store.applyStreamMessage(snapshotMessage(fx.game, fx.steps.at(-1)!.state)));
    expect(rolling()).toBeNull();
    expect(screen.queryByText("Moving…")).toBeNull();
    // the timer is gone too: nothing starts again later
    act(() => void vi.advanceTimersByTime(60_000));
    expect(rolling()).toBeNull();
    expect(screen.queryByText("Moving…")).toBeNull();
  });

  test("an action right after a reconnect is a replay and does not animate", () => {
    const store = setup();
    act(() => {
      store.setConnection("open");
      store.setConnection("reconnecting");
      store.setConnection("open");
    });
    act(() => store.applyStreamMessage(actionsMessage(fx.game, nextWithRoll())));
    expect(rolling()).toBeNull();
    expect(screen.queryByText("Moving…")).toBeNull();
  });

  test("an action that comes while the connection is down does not animate", () => {
    const store = setup();
    act(() => {
      store.setConnection("open");
      store.setConnection("reconnecting");
    });
    act(() => store.applyStreamMessage(actionsMessage(fx.game, nextWithRoll())));
    expect(rolling()).toBeNull();
  });

  test("an action after the replay window animates again", () => {
    const store = setup();
    act(() => {
      store.setConnection("open");
      store.setConnection("reconnecting");
      store.setConnection("open");
    });
    act(() => void vi.advanceTimersByTime(REPLAY_WINDOW_MS + 1));
    act(() => store.applyStreamMessage(actionsMessage(fx.game, nextWithRoll())));
    expect(rolling()).toBeInTheDocument();
  });

  test("an action that comes while the tab is hidden does not animate", () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const store = setup();
    act(() => store.applyStreamMessage(actionsMessage(fx.game, nextWithRoll())));
    expect(rolling()).toBeNull();
  });
});
