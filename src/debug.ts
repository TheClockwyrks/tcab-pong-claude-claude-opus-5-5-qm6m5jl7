// The debug and automation surface (`specs/instrumentation.md`). Every pose is a
// transition: it takes the current state and returns the next one, setting one
// field, placing one entity, or clearing the field. A pose with nothing to act
// on, or handed a value outside its field's type, throws.

import { CAROM_DEBUG_VERSION } from "./constants";
import type {
  BallState,
  CaromDebugApi,
  CaromSnapshot,
  CaromState,
  Mode,
  PaddleState,
  Screen,
  Side,
  View,
} from "./game";
import { menuItemRect } from "./menus";
import { drawServeSign, obstacleAt, parkedBall, titleState } from "./world";

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "countdown",
  "playing",
  "paused",
  "matchover",
];
const MODES: readonly Mode[] = ["solo", "versus"];
const SIDES: readonly Side[] = ["left", "right"];

function fail(message: string): never {
  throw new Error(`Carom debug: ${message}`);
}

function oneOf<T extends string>(
  what: string,
  value: T,
  allowed: readonly T[],
): T {
  if (!allowed.includes(value)) {
    fail(`${what} must be one of ${allowed.join(", ")}, got ${String(value)}`);
  }
  return value;
}

function finite(what: string, value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${what} must be a finite number, got ${String(value)}`);
  }
  return value;
}

function flag(what: string, value: boolean): boolean {
  if (typeof value !== "boolean") {
    fail(`${what} must be a boolean, got ${String(value)}`);
  }
  return value;
}

function index(what: string, value: number): number {
  if (!Number.isInteger(value)) {
    fail(`${what} must be a whole number, got ${String(value)}`);
  }
  return value;
}

/** A copy of the state with its ball changed, failing while there is none. */
function withBall(
  state: View,
  op: string,
  change: (ball: View["ball"] & object) => Partial<BallState>,
): CaromState {
  const ball = state.ball;
  if (ball === null) fail(`${op} has no ball to act on; spawnBall first`);
  return { ...state, ball: { ...ball, ...change(ball) } };
}

function withPaddle(
  state: View,
  side: Side,
  change: Partial<PaddleState>,
): CaromState {
  oneOf("side", side, SIDES);
  return {
    ...state,
    paddles: {
      ...state.paddles,
      [side]: { ...state.paddles[side], ...change },
    },
  };
}

/** The whole declared state as plain data, with the ball's derived speed. */
export function snapshot(state: View): CaromSnapshot {
  const paddle = (p: View["paddles"]["left"]) => ({
    cy: p.cy,
    vy: p.vy,
    drivenVy: p.drivenVy,
    driven: p.driven,
  });
  const ball = state.ball;
  return {
    version: CAROM_DEBUG_VERSION,
    screen: state.screen,
    mode: state.mode,
    menuIndex: state.menuIndex,
    titleIndex: state.titleIndex,
    resumeScreen: state.resumeScreen,
    score: { p1: state.score.p1, p2: state.score.p2 },
    winner: state.winner,
    muted: state.muted,
    paddles: {
      left: paddle(state.paddles.left),
      right: paddle(state.paddles.right),
    },
    ai: { tracking: state.ai.tracking, movement: state.ai.movement },
    receiver: state.receiver,
    ball:
      ball === null
        ? null
        : {
            x: ball.x,
            y: ball.y,
            vx: ball.vx,
            vy: ball.vy,
            speed: Math.hypot(ball.vx, ball.vy),
            spin: ball.spin,
            held: ball.held,
            holdTimer: ball.holdTimer,
            serveSign: ball.serveSign,
            trail: ball.trail.map((s) => ({ x: s.x, y: s.y, t: s.t })),
          },
    obstacles: state.obstacles.map((o) => ({
      index: o.index,
      cx: o.cx,
      cy: o.cy,
    })),
    simTime: state.simTime,
  };
}

export function createDebugApi(): CaromDebugApi {
  return {
    version: CAROM_DEBUG_VERSION,

    // ---- The world -------------------------------------------------------

    clearWorld: (s) => ({ ...s, ball: null, obstacles: [] }),

    spawnBall: (s) => ({ ...s, ball: parkedBall() }),

    spawnObstacle: (s, i) => {
      const placed = obstacleAt(index("obstacle index", i));
      const obstacles = [...s.obstacles.filter((o) => o.index !== i), placed];
      obstacles.sort((a, b) => a.index - b.index);
      return { ...s, obstacles };
    },

    reset: (s) => titleState(s.muted),

    // Speed is worked out at the read, so there is no stored copy to bring
    // into agreement: the state comes back as it was handed over.
    reconcile: (s) => ({ ...s }),

    // ---- Screens and menus -----------------------------------------------

    setScreen: (s, screen) => ({
      ...s,
      screen: oneOf("screen", screen, SCREENS),
      press: null,
    }),
    setMode: (s, mode) => ({ ...s, mode: oneOf("mode", mode, MODES) }),
    setMenuIndex: (s, i) => ({ ...s, menuIndex: index("menu index", i) }),
    setTitleIndex: (s, i) => ({ ...s, titleIndex: index("title index", i) }),
    setResumeScreen: (s, screen) => ({
      ...s,
      resumeScreen: oneOf("resume screen", screen, [
        "countdown",
        "playing",
      ] as const),
    }),

    // ---- Match state -----------------------------------------------------

    setScore: (s, p1, p2) => ({
      ...s,
      score: { p1: finite("p1", p1), p2: finite("p2", p2) },
    }),
    setWinner: (s, side) => ({
      ...s,
      winner: side === null ? null : oneOf("winner", side, SIDES),
    }),
    setReceiver: (s, side) => ({
      ...s,
      receiver: oneOf("receiver", side, SIDES),
    }),

    // ---- Paddles ---------------------------------------------------------

    setPaddleCy: (s, side, cy) => withPaddle(s, side, { cy: finite("cy", cy) }),
    setPaddleVy: (s, side, vy) =>
      withPaddle(s, side, { drivenVy: finite("vy", vy) }),
    setPaddleDriven: (s, side, driven) =>
      withPaddle(s, side, { driven: flag("driven", driven) }),

    // ---- The ball --------------------------------------------------------

    setBallPosition: (s, x, y) =>
      withBall(s, "setBallPosition", () => ({
        x: finite("x", x),
        y: finite("y", y),
      })),
    setBallVelocity: (s, vx, vy) =>
      withBall(s, "setBallVelocity", () => ({
        vx: finite("vx", vx),
        vy: finite("vy", vy),
      })),
    setBallSpin: (s, spin) =>
      withBall(s, "setBallSpin", () => ({ spin: finite("spin", spin) })),
    setBallHeld: (s, held) =>
      withBall(s, "setBallHeld", () => ({ held: flag("held", held) })),
    setBallHoldTimer: (s, seconds) =>
      withBall(s, "setBallHoldTimer", () => ({
        holdTimer: finite("seconds", seconds),
      })),
    setBallServeSign: (s, sign) =>
      withBall(s, "setBallServeSign", () => {
        if (sign !== 1 && sign !== -1) {
          fail(`serve sign must be 1 or -1, got ${String(sign)}`);
        }
        return { serveSign: sign };
      }),
    drawBallServeSign: (s) =>
      withBall(s, "drawBallServeSign", () => ({ serveSign: drawServeSign() })),

    // ---- The AI opponent -------------------------------------------------

    setAiTracking: (s, enabled) => ({
      ...s,
      ai: { ...s.ai, tracking: flag("tracking", enabled) },
    }),
    setAiMovement: (s, enabled) => ({
      ...s,
      ai: { ...s.ai, movement: flag("movement", enabled) },
    }),

    // ---- Audio -----------------------------------------------------------

    // The next update pushes this copy to the runtime's bit (see step.ts).
    setMuted: (s, muted) => ({ ...s, muted: flag("muted", muted) }),

    // ---- Readings --------------------------------------------------------

    snapshot,
    menuItemRect: (s, i) => menuItemRect(s.screen, i),
  };
}
