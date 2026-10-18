// Carom — the game.
//
// This module declares the state the game is written against (`specs/state.md`),
// the debug surface that poses and reads it (`specs/instrumentation.md`), and the
// three functions the engine drives. The work itself lives beside it:
//
//   world.ts    building and parking the pieces: the title state, a new match
//   physics.ts  paddles, the AI, and the ball's sub-stepped flight and collisions
//   menus.ts    the menu items, their hit regions, and keyboard/pointer navigation
//   step.ts     one frame's transition, composed from the three above
//   render.ts   drawing a state
//   debug.ts    the debug and automation surface
//   audio.ts    the cue definitions

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { ACTIONS, BINDINGS } from "./constants";
import { defineCues } from "./audio";
import { createDebugApi } from "./debug";
import { registerDiagnostics } from "./diagnostics";
import { renderGame } from "./render";
import { stepGame } from "./step";
import { titleState } from "./world";

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
}

/**
 * Where the primary pointer came into contact, kept until it lifts.
 *
 * A menu item is confirmed only when the press and its release both fall inside
 * that item's region (`specs/ui.md`), and the two edges may arrive frames apart,
 * so the press has to be carried from one frame to the next. It is input
 * bookkeeping rather than game state: it is never posed or reported, every reset
 * clears it, and it only ever names the screen it was taken on.
 */
export interface PointerPress {
  readonly id: number;
  readonly screen: Screen;
  /** The item the press landed on, or `null` when it landed outside every item. */
  readonly item: number | null;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];

  readonly simTime: number;
  readonly muted: boolean;

  /** The pending menu press, as {@link PointerPress} describes. */
  readonly press: PointerPress | null;
}

/** The read-only view every reader of the state is handed. */
export type View = DeepReadonly<CaromState>;

/** A ball as `snapshot` reports it: the state's ball plus its derived speed. */
export interface BallSnapshot {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly speed: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

/** What `snapshot` returns: the whole declared state as plain data. */
export interface CaromSnapshot {
  readonly version: number;
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";
  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;
  readonly muted: boolean;
  readonly paddles: {
    readonly left: PaddleSnapshot;
    readonly right: PaddleSnapshot;
  };
  readonly ai: AiState;
  readonly receiver: Side;
  readonly ball: BallSnapshot | null;
  readonly obstacles: readonly ObstacleState[];
  readonly simTime: number;
}

export interface PaddleSnapshot {
  readonly cy: number;
  readonly vy: number;
  readonly drivenVy: number;
  readonly driven: boolean;
}

/** A menu item's hit region, in logical units, `x`/`y` its top-left corner. */
export interface MenuRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * The debug and automation surface (`specs/instrumentation.md`).
 *
 * Every operation takes the current state first. A pose returns the next state
 * and leaves the one it was handed as it was; a reading returns what it read. A
 * pose with nothing to act on throws rather than refusing quietly.
 */
export interface CaromDebugApi {
  readonly version: number;

  // The world.
  clearWorld(state: View): CaromState;
  spawnBall(state: View): CaromState;
  spawnObstacle(state: View, index: number): CaromState;
  reset(state: View): CaromState;
  reconcile(state: View): CaromState;

  // Screens and menus.
  setScreen(state: View, screen: Screen): CaromState;
  setMode(state: View, mode: Mode): CaromState;
  setMenuIndex(state: View, index: number): CaromState;
  setTitleIndex(state: View, index: number): CaromState;
  setResumeScreen(state: View, screen: "countdown" | "playing"): CaromState;

  // Match state.
  setScore(state: View, p1: number, p2: number): CaromState;
  setWinner(state: View, side: Side | null): CaromState;
  setReceiver(state: View, side: Side): CaromState;

  // Paddles.
  setPaddleCy(state: View, side: Side, cy: number): CaromState;
  setPaddleVy(state: View, side: Side, vy: number): CaromState;
  setPaddleDriven(state: View, side: Side, driven: boolean): CaromState;

  // The ball.
  setBallPosition(state: View, x: number, y: number): CaromState;
  setBallVelocity(state: View, vx: number, vy: number): CaromState;
  setBallSpin(state: View, spin: number): CaromState;
  setBallHeld(state: View, held: boolean): CaromState;
  setBallHoldTimer(state: View, seconds: number): CaromState;
  setBallServeSign(state: View, sign: 1 | -1): CaromState;
  drawBallServeSign(state: View): CaromState;

  // The AI opponent.
  setAiTracking(state: View, enabled: boolean): CaromState;
  setAiMovement(state: View, enabled: boolean): CaromState;

  // Audio.
  setMuted(state: View, muted: boolean): CaromState;

  // Readings.
  snapshot(state: View): CaromSnapshot;
  menuItemRect(state: View, index: number): MenuRect | null;
}

/**
 * The field background. `src/main.ts` clears the canvas to it every frame, so
 * the letterbox bars match the field.
 */
export const BACKGROUND = "#0b0f1a";

/** The game the engine drives. */
export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api: InitApi<CaromState>): [CaromState, CaromDebugApi] {
    for (const name of ACTIONS) {
      api.input.register(name, { keys: [...BINDINGS[name]] });
    }
    defineCues(api.audio);
    registerDiagnostics(api.diagnostics);
    // The runtime's mute bit starts clear and InitApi offers no reading of it;
    // the first update mirrors whatever it holds by then.
    return [titleState(false), createDebugApi()];
  },

  update(state: View, api: UpdateApi, dt: number): CaromState {
    return stepGame(state, api, dt);
  },

  render(state: View, api: RenderApi): void {
    renderGame(state, api.ctx);
  },
};
