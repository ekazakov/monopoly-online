import { CUE_NAMES, cueUrl } from "./cues.ts";
import type { Cue, CueName } from "./cues.ts";
import { readSoundPreference, subscribeSoundPreference } from "./soundPreference.ts";

// The Web Audio graph of the app: one context, a master bus, and an effects bus and a music bus
// under it. A browser lets a page make sound only after a user gesture, so the context starts on
// the first pointer or key press. Without Web Audio every call here does nothing.

export interface AudioGraph {
  context: AudioContext;
  master: GainNode;
  effects: GainNode;
  music: GainNode;
}

/** Music sits under the effects, so a full music slider is still a soft background. */
const MUSIC_HEADROOM = 0.35;
/** Smooth volume changes, in seconds (time constant). */
const RAMP = 0.05;

let graph: AudioGraph | null = null;
const buffers = new Map<CueName, AudioBuffer>();
const loading = new Map<CueName, Promise<void>>();
const unlockListeners = new Set<() => void>();

function createGraph(): AudioGraph | null {
  const Context = globalThis.AudioContext as typeof AudioContext | undefined;
  if (!Context) return null;
  try {
    const context = new Context();
    const master = context.createGain();
    const effects = context.createGain();
    const music = context.createGain();
    effects.connect(master);
    music.connect(master);
    master.connect(context.destination);
    return { context, master, effects, music };
  } catch {
    return null;
  }
}

function applyVolumes() {
  if (!graph) return;
  const { enabled, effects, music } = readSoundPreference();
  const now = graph.context.currentTime;
  graph.master.gain.setTargetAtTime(enabled ? 1 : 0, now, RAMP);
  graph.effects.gain.setTargetAtTime(effects, now, RAMP);
  graph.music.gain.setTargetAtTime(music * MUSIC_HEADROOM, now, RAMP);
}

/** The graph, when the context runs. Null before the first gesture and without Web Audio. */
export function audioGraph(): AudioGraph | null {
  return graph?.context.state === "running" ? graph : null;
}

/** Calls `listener` each time the context starts to run. */
export function onAudioUnlock(listener: () => void): () => void {
  unlockListeners.add(listener);
  return () => {
    unlockListeners.delete(listener);
  };
}

function load(name: CueName): Promise<void> {
  const known = loading.get(name);
  if (known) return known;
  const context = graph?.context;
  if (!context) return Promise.resolve();
  const task = fetch(cueUrl(name))
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(response.status)))
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => {
      buffers.set(name, buffer);
    })
    .catch(() => {
      // A missing or bad file is a silent cue. Forget it, so a later unlock tries again.
      loading.delete(name);
    });
  loading.set(name, task);
  return task;
}

async function unlock() {
  graph ??= createGraph();
  if (!graph) return;
  applyVolumes();
  if (graph.context.state !== "running") {
    try {
      await graph.context.resume();
    } catch {
      return;
    }
  }
  if (graph.context.state !== "running") return;
  for (const name of CUE_NAMES) void load(name);
  for (const listener of unlockListeners) listener();
}

/**
 * Plays one cue `delay` seconds from now. Nothing plays when the sound is off, when the context
 * has not started, or when the file is not loaded yet: a late sound is worse than no sound.
 */
export function playCue(cue: Cue, delay = 0) {
  const ready = audioGraph();
  const preference = readSoundPreference();
  if (!ready || !preference.enabled || preference.effects === 0 || cue.gain <= 0) return;
  const buffer = buffers.get(cue.name);
  if (buffer) {
    start(ready, buffer, cue, delay);
    return;
  }
  // The click that starts the audio is often the click that rolls the dice, so the files can
  // still load. A cue that is only a little late still plays.
  const task = loading.get(cue.name);
  if (!task) return;
  const asked = performance.now();
  void task.then(() => {
    const late = (performance.now() - asked) / 1000;
    const loaded = buffers.get(cue.name);
    if (loaded && late <= MAX_LATE_S) start(ready, loaded, cue, delay - late);
  });
}

/** A cue that waits for its file plays only if it is this late or less, in seconds. */
const MAX_LATE_S = 0.25;

function start(ready: AudioGraph, buffer: AudioBuffer, cue: Cue, delay: number) {
  const { context, effects } = ready;
  const source = context.createBufferSource();
  source.buffer = buffer;
  // A small change of pitch, so repeated cues (the hops) do not sound like a machine.
  source.playbackRate.value = (cue.rate ?? 1) * (0.96 + Math.random() * 0.08);
  const gain = context.createGain();
  gain.gain.value = cue.gain;
  source.connect(gain).connect(effects);
  source.start(context.currentTime + Math.max(0, delay));
  source.addEventListener("ended", () => gain.disconnect());
}

/**
 * Starts the audio on the first user gesture, and keeps the volumes in step with the settings.
 * A suspended context (for example after the device sleeps) starts again on the next gesture.
 */
export function startAudio(): () => void {
  const onGesture = () => {
    if (graph?.context.state !== "running") void unlock();
  };
  window.addEventListener("pointerdown", onGesture, true);
  window.addEventListener("keydown", onGesture, true);
  const stopPreference = subscribeSoundPreference(applyVolumes);
  return () => {
    window.removeEventListener("pointerdown", onGesture, true);
    window.removeEventListener("keydown", onGesture, true);
    stopPreference();
  };
}
