import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { GameEvent, RedactedGameState } from "@monopoly/shared";
import { actionsMessage, recordFixture, redact, snapshotMessage } from "../game/fixtures.ts";
import { GameStoreProvider } from "../game/GameStoreProvider.tsx";
import { createGameStore } from "../game/store.ts";
import { HOP_MS, planMotion, stepDuration } from "../scene/motion.ts";
import { MotionProvider } from "../screens/game/motion/index.ts";
import { setMotionPreference } from "../styles/motionPreference.ts";
import type { Cue } from "./cues.ts";
import { RESULT_GAP_S, createSoundPlayer } from "./useGameSounds.ts";

type Played = { name: Cue["name"]; delay: number };

function recorder() {
  const played: Played[] = [];
  const play = (cue: Cue, delay = 0) => void played.push({ name: cue.name, delay });
  return { played, play };
}

const me = new Set(["p1"]);

/** A state with only the cash of each player, which is all the sound player reads. */
const withCash = (entries: Record<string, number>) =>
  ({
    players: Object.entries(entries).map(([id, cash]) => ({ id, cash })),
  }) as unknown as RedactedGameState;

describe("createSoundPlayer", () => {
  test("a roll plays the shake and the landing dice, and doubles land two times", () => {
    const { played, play } = recorder();
    const { listener } = createSoundPlayer(me, play);
    listener.onStep!({ kind: "roll", playerId: "p1", dice: [3, 3] });
    expect(played.map((p) => p.name)).toEqual(["dice-shake", "dice-land", "dice-land"]);
  });

  test("a walk ticks on each square and thuds on the last one", () => {
    const { played, play } = recorder();
    const { listener } = createSoundPlayer(me, play);
    listener.onStep!({ kind: "walk", playerId: "p1", from: 0, fromJail: false, path: [1, 2, 3] });
    expect(played).toEqual([
      { name: "hop", delay: HOP_MS / 1000 },
      { name: "hop", delay: (2 * HOP_MS) / 1000 },
      { name: "land", delay: (3 * HOP_MS) / 1000 },
    ]);
  });

  test("result cues wait for the end of the motion and play one after the other", () => {
    const { played, play } = recorder();
    const { listener } = createSoundPlayer(me, play, withCash({ p1: 1500 }));
    const events: GameEvent[] = [{ type: "PropertyBought", playerId: "p1", square: 1, price: 60 }];
    listener.onAction!(events, withCash({ p1: 1440 }));
    expect(played).toEqual([]);
    listener.onIdle!();
    // the event cue first, then the money cue
    expect(played).toEqual([
      { name: "stamp", delay: 0 },
      { name: "coin-out", delay: RESULT_GAP_S },
    ]);
    listener.onIdle!();
    expect(played).toHaveLength(2);
  });

  test("news that is not live drops the waiting cues and moves the cash baseline", () => {
    const { played, play } = recorder();
    const { listener } = createSoundPlayer(me, play, withCash({ p1: 1500 }));
    listener.onAction!(
      [{ type: "TaxPaid", playerId: "p1", square: 4, amount: 200 }],
      withCash({ p1: 1300 }),
    );
    listener.onSettle!(withCash({ p1: 2000 }));
    listener.onIdle!();
    expect(played).toEqual([]);
    // the next live action compares with the settled cash, not with the old one
    listener.onAction!([], withCash({ p1: 1900 }));
    listener.onIdle!();
    expect(played.map((p) => p.name)).toEqual(["coin-out"]);
  });

  test("a card that moves the token plays with its hold step, not again at the end", () => {
    const { played, play } = recorder();
    const { listener } = createSoundPlayer(me, play, withCash({ p1: 1500 }));
    const events: GameEvent[] = [
      { type: "CardDrawn", playerId: "p1", deck: "chance", cardIndex: 0 },
      { type: "PlayerMoved", playerId: "p1", from: 7, to: 0 },
      { type: "PassedGo", playerId: "p1", amount: 200 },
    ];
    listener.onAction!(events, withCash({ p1: 1700 }));
    listener.onStep!({ kind: "hold", playerId: "p1", eventIndex: 0 });
    listener.onIdle!();
    expect(played.map((p) => p.name)).toEqual(["card", "coin-in"]);
  });
});

describe("sounds with the motion player", () => {
  const fx = recordFixture(3);
  const rollStep = fx.steps.find((s) => s.events.some((e) => e.type === "DiceRolled"))!;

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    setMotionPreference("system");
  });

  function setup(playBeforeMount = false) {
    const store = createGameStore();
    store.applyStreamMessage(snapshotMessage(fx.game, redact(fx.start)));
    if (playBeforeMount) store.applyStreamMessage(actionsMessage(fx.game, rollStep));
    const sound = recorder();
    const onIdle = vi.fn<() => void>();
    const player = createSoundPlayer(new Set([fx.ownerId]), sound.play);
    const listener = {
      ...player.listener,
      onIdle: () => {
        onIdle();
        player.listener.onIdle!();
      },
    };
    render(
      <GameStoreProvider store={store}>
        <MotionProvider listener={listener}>
          <div />
        </MotionProvider>
      </GameStoreProvider>,
    );
    return { store, played: sound.played, onIdle };
  }

  test("a live roll plays the dice at once and reports the end after the last step", () => {
    const total = planMotion(rollStep.events).reduce((sum, step) => sum + stepDuration(step), 0);
    const { store, played, onIdle } = setup();
    act(() => store.applyStreamMessage(actionsMessage(fx.game, rollStep)));
    expect(played[0]?.name).toBe("dice-shake");
    expect(onIdle).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(total));
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(played.some((p) => p.name === "land")).toBe(true);
  });

  test("an action that was there before the mount plays no sound", () => {
    const { played } = setup(true);
    act(() => void vi.advanceTimersByTime(5000));
    expect(played).toEqual([]);
  });

  test("under reduced motion a live roll plays no dice or token cue", () => {
    setMotionPreference("reduce");
    const { store, played, onIdle } = setup();
    act(() => store.applyStreamMessage(actionsMessage(fx.game, rollStep)));
    expect(played.filter((p) => ["dice-shake", "hop", "land"].includes(p.name))).toEqual([]);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });
});
