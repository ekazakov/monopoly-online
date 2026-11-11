import { audioGraph, onAudioUnlock } from "./engine.ts";
import type { AudioGraph } from "./engine.ts";
import { readSoundPreference, subscribeSoundPreference } from "./soundPreference.ts";

// The ambient music: a generative harbor pad made in Web Audio, with no file. Three soft voices
// move slowly through calm chords over filtered noise that swells like waves. It plays only on the
// game screen, only when the music volume is above 0, and it fades out while the tab is hidden.

/** Calm seventh chords round D major, as three notes in Hz. */
const CHORDS: readonly (readonly number[])[] = [
  [146.83, 220.0, 277.18], // Dmaj7 (D, A, C#)
  [123.47, 185.0, 293.66], // Bm7 (B, F#, D)
  [196.0, 246.94, 369.99], // Gmaj7 (G, B, F#)
  [164.81, 246.94, 293.66], // Em7 (E, B, D)
  [110.0, 220.0, 329.63], // A (A, A, E)
];

const CHORD_MS = 10_000;
const GLIDE_S = 3;
const FADE_IN_S = 2.5;
const FADE_OUT_S = 1.5;

interface Voice {
  stop: () => void;
}

function noiseBuffer(context: AudioContext): AudioBuffer {
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function createVoice({ context, music }: AudioGraph): Voice {
  const now = context.currentTime;
  const output = context.createGain();
  output.gain.setValueAtTime(0, now);
  output.gain.linearRampToValueAtTime(1, now + FADE_IN_S);
  output.connect(music);

  // The pad: two detuned oscillators per note, through a soft low-pass filter.
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.5;
  const padGain = context.createGain();
  padGain.gain.value = 0.06;
  filter.connect(padGain).connect(output);

  let chord = 0;
  const oscillators: OscillatorNode[] = [];
  const notes = CHORDS[chord]!.map((frequency) => {
    const pair = [-4, 4].map((detune, i) => {
      const oscillator = context.createOscillator();
      oscillator.type = i === 0 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = detune;
      oscillator.connect(filter);
      oscillator.start(now);
      oscillators.push(oscillator);
      return oscillator;
    });
    return pair;
  });

  // The waves: looped noise, low-pass filtered, with a slow swell from a low-frequency oscillator.
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer(context);
  noise.loop = true;
  const noiseFilter = context.createBiquadFilter();
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.value = 420;
  const swell = context.createGain();
  swell.gain.value = 0.025;
  const lfo = context.createOscillator();
  lfo.frequency.value = 0.09;
  const lfoDepth = context.createGain();
  lfoDepth.gain.value = 0.02;
  lfo.connect(lfoDepth).connect(swell.gain);
  noise.connect(noiseFilter).connect(swell).connect(output);
  noise.start(now);
  lfo.start(now);

  const timer = setInterval(() => {
    let next = Math.floor(Math.random() * (CHORDS.length - 1));
    if (next >= chord) next += 1;
    chord = next;
    const at = context.currentTime;
    CHORDS[chord]!.forEach((frequency, i) => {
      for (const oscillator of notes[i]!) {
        oscillator.frequency.setValueAtTime(oscillator.frequency.value, at);
        oscillator.frequency.exponentialRampToValueAtTime(frequency, at + GLIDE_S);
      }
    });
  }, CHORD_MS);

  return {
    stop() {
      clearInterval(timer);
      const at = context.currentTime;
      output.gain.cancelScheduledValues(at);
      output.gain.setValueAtTime(output.gain.value, at);
      output.gain.linearRampToValueAtTime(0, at + FADE_OUT_S);
      const end = at + FADE_OUT_S + 0.1;
      for (const oscillator of oscillators) oscillator.stop(end);
      noise.stop(end);
      lfo.stop(end);
      setTimeout(() => output.disconnect(), (FADE_OUT_S + 0.2) * 1000);
    },
  };
}

/** Plays the ambient music while the settings ask for it. Returns the stop function. */
export function startAmbientMusic(): () => void {
  let voice: Voice | null = null;
  const update = () => {
    const graph = audioGraph();
    const { enabled, music } = readSoundPreference();
    const wanted = graph !== null && enabled && music > 0 && !document.hidden;
    if (wanted && !voice) voice = createVoice(graph);
    else if (!wanted && voice) {
      voice.stop();
      voice = null;
    }
  };
  const stopPreference = subscribeSoundPreference(update);
  const stopUnlock = onAudioUnlock(update);
  document.addEventListener("visibilitychange", update);
  update();
  return () => {
    stopPreference();
    stopUnlock();
    document.removeEventListener("visibilitychange", update);
    voice?.stop();
    voice = null;
  };
}
