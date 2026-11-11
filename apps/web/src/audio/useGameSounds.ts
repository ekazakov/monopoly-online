import { useEffect, useState } from "react";
import type { GameEvent, RedactedGameState } from "@monopoly/shared";
import { mySeats, useGame } from "../game/index.ts";
import { HOP_MS, JUMP_MS, ROLL_MS, planMotion } from "../scene/motion.ts";
import type { MotionStep } from "../scene/motion.ts";
import type { MotionListener } from "../screens/game/motion/index.ts";
import { OTHER_GAIN, cashOf, cuesFor, moneyCues } from "./cues.ts";
import type { CashMap, Cue } from "./cues.ts";
import { playCue } from "./engine.ts";
import { startAmbientMusic } from "./music.ts";

/** Time between the result cues of one action, in seconds. */
export const RESULT_GAP_S = 0.12;
/** The dice stop a little before the roll step ends. */
const DICE_LAND_S = (ROLL_MS - 120) / 1000;

export type PlayCue = (cue: Cue, delay?: number) => void;

export interface SoundPlayer {
  listener: MotionListener;
  /** Sets the seats of this device. */
  setMe: (seats: ReadonlySet<string>) => void;
  /** Drops the result cues that wait. */
  clear: () => void;
}

/**
 * Turns the motion player news into sounds. The dice and token cues play with their steps. The
 * result cues (property, auction, trade, turn, then money) wait until the motion ends, so the rent
 * sound comes when the token lands. News that is not live drops them.
 *
 * The money cues compare the cash of each player with the cash before the action. `start` is the
 * state at mount. News that is not live only moves this baseline, with no sound.
 */
export function createSoundPlayer(
  seats: ReadonlySet<string>,
  play: PlayCue,
  start: RedactedGameState | null = null,
): SoundPlayer {
  let me = seats;
  let pending: Cue[] = [];
  let cash: CashMap = cashOf(start?.players ?? []);
  const rebase = (state: RedactedGameState | null) => {
    if (state) cash = cashOf(state.players);
  };
  const gainOf = (playerId: string) => (me.has(playerId) ? 1 : OTHER_GAIN);

  const onAction = (events: readonly GameEvent[], state: RedactedGameState | null) => {
    // A card that moves the token plays its sound with the hold step, so not again at the end.
    const held = new Set(
      planMotion(events).flatMap((step) => (step.kind === "hold" ? [step.eventIndex] : [])),
    );
    const after = state ? cashOf(state.players) : cash;
    pending = pending.concat(cuesFor(events, me, { skip: held }), moneyCues(cash, after, me));
    cash = after;
  };

  const onStep = (step: MotionStep) => {
    const gain = gainOf(step.playerId);
    switch (step.kind) {
      case "roll": {
        play({ name: "dice-shake", gain });
        play({ name: "dice-land", gain }, DICE_LAND_S);
        if (step.dice[0] === step.dice[1]) {
          play({ name: "dice-land", gain, rate: 1.15 }, DICE_LAND_S + 0.09);
        }
        break;
      }
      case "walk": {
        const hops = step.path.length;
        for (let i = 0; i < hops - 1; i++) {
          play({ name: "hop", gain: gain * 0.7 }, ((i + 1) * HOP_MS) / 1000);
        }
        play({ name: "land", gain }, (hops * HOP_MS) / 1000);
        break;
      }
      case "jump":
        play({ name: "whoosh", gain });
        play({ name: "land", gain }, JUMP_MS / 1000);
        break;
      case "hold":
        play({ name: "card", gain });
        break;
    }
  };

  const onIdle = () => {
    const cues = pending;
    pending = [];
    cues.forEach((cue, i) => play(cue, i * RESULT_GAP_S));
  };

  const clear = () => {
    pending = [];
  };

  return {
    listener: {
      onAction,
      onStep,
      onIdle,
      onSettle: (state) => {
        clear();
        rebase(state);
      },
    },
    setMe: (next) => {
      me = next;
    },
    clear,
  };
}

/**
 * The sounds of the game screen: a motion listener for the `MotionProvider`, and the ambient
 * music while the screen is open. `me` is every seat of this device, so on a shared device each
 * local turn gets the bell.
 */
export function useGameSounds(userId: string | null, play: PlayCue = playCue): MotionListener {
  const { game, state } = useGame(userId);
  const [player] = useState(() => createSoundPlayer(new Set(), play, state));
  useEffect(() => {
    player.setMe(new Set(mySeats(game, userId).map((seat) => seat.id)));
  }, [player, game, userId]);
  useEffect(() => () => player.clear(), [player]);
  useEffect(() => startAmbientMusic(), []);
  return player.listener;
}
