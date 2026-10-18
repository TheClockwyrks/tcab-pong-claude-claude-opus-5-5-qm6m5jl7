// The four cues (`specs/audio.md`), each a short synthesized blip with its own
// waveform and pitch contour so the events are told apart by ear.

import type { CueSpec, InitApi } from "@clockwyrks/simple-2d";
import { CUES } from "./constants";
import type { CueName } from "./constants";

export const CUE_SPECS: Readonly<Record<CueName, CueSpec>> = {
  [CUES.paddleHit]: {
    wave: "square",
    freq: 520,
    freqTo: 780,
    gain: 0.14,
    durationMs: 70,
  },
  [CUES.wallBounce]: {
    wave: "triangle",
    freq: 300,
    freqTo: 240,
    gain: 0.22,
    durationMs: 50,
  },
  [CUES.obstacleBounce]: {
    wave: "sine",
    freq: 980,
    freqTo: 620,
    gain: 0.24,
    durationMs: 90,
  },
  [CUES.score]: {
    wave: "sawtooth",
    freq: 220,
    freqTo: 660,
    gain: 0.12,
    durationMs: 260,
  },
};

export function defineCues(audio: InitApi["audio"]): void {
  for (const [cue, spec] of Object.entries(CUE_SPECS)) {
    audio.define(cue, spec);
  }
}
