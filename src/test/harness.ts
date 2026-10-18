// A headless Carom for the unit tests: the real engine over an @napi-rs/canvas
// canvas, a surface of the test's own, and a clock that hands out fixed steps,
// so a test advances an exact number of frames and reads the state back.

import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine } from "@clockwyrks/simple-2d";
import { FIELD_H, FIELD_W, LAYOUT } from "../constants";
import { BACKGROUND, game } from "../game";
import type { CaromDebugApi, CaromState, View } from "../game";

export interface Harness {
  readonly engine: Engine<CaromState, CaromDebugApi>;
  readonly debug: CaromDebugApi;
  /** Every cue played since boot, in order. */
  readonly cues: string[];
  /** The gain of every cue played since boot, in order. */
  readonly gains: number[];
  readonly state: () => View;
  pose(transition: (state: View) => CaromState): View;
  advance(frames: number): Promise<void>;
  /** Advances whole frames until `seconds` of game time have passed. */
  advanceSeconds(seconds: number): Promise<void>;
  keyDown(code: string): void;
  keyUp(code: string): void;
  /** A key pressed and released between two frames: one press edge. */
  tap(code: string): void;
  pointer(
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    options?: { id?: number; device?: "mouse" | "touch"; primary?: boolean },
  ): void;
}

export async function boot(stepMs = 1000 / 60): Promise<Harness> {
  const canvas = createCanvas(FIELD_W, FIELD_H);
  const target = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: FIELD_W,
    height: FIELD_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(stepMs),
    surface: {
      cssWidth: () => FIELD_W,
      cssHeight: () => FIELD_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  await engine.initialize();

  const cues: string[] = [];
  const gains: number[] = [];
  engine.events.on("cue:played", (event) => {
    cues.push(event.cue);
    gains.push(event.gain);
  });

  const key = (type: string, code: string): void => {
    target.dispatchEvent(
      Object.assign(new Event(type), { code, repeat: false }),
    );
  };

  return {
    engine,
    debug: engine.debug,
    cues,
    gains,
    state: () => engine.state,
    pose: (transition) => engine.apply(transition),
    advance: (frames) => engine.advance(frames),
    advanceSeconds: (seconds) =>
      engine.advance(Math.round((seconds * 1000) / stepMs)),
    keyDown: (code) => key("keydown", code),
    keyUp: (code) => key("keyup", code),
    tap(code) {
      key("keydown", code);
      key("keyup", code);
    },
    pointer(type, x, y, options = {}) {
      const down = type === "pointerdown";
      const up = type === "pointerup";
      target.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId: options.id ?? 1,
          pointerType: options.device ?? "mouse",
          isPrimary: options.primary ?? true,
          button: down || up ? 0 : -1,
          buttons: up ? 0 : down || options.device === "touch" ? 1 : 0,
        }),
      );
    },
  };
}

/** The center of menu item `index` on the current screen. */
export function itemCenter(h: Harness, index: number): [number, number] {
  const r = h.debug.menuItemRect(h.state(), index);
  if (r === null) throw new Error(`no menu item ${index}`);
  return [r.x + r.w / 2, r.y + r.h / 2];
}
