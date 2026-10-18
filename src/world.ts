// Building the pieces of a state: the parked ball, the obstacles, the paddles,
// the title-screen state, and the two transitions every menu shares, starting a
// match and returning to the title (`specs/ui.md`).

import { FIELD_CX, FIELD_CY, HOLD_TIME, OBSTACLE_CENTERS } from "./constants";
import type {
  BallState,
  CaromState,
  Mode,
  ObstacleState,
  PaddleState,
  View,
} from "./game";

/** A fresh serve sign, `1` and `-1` each equally likely. */
export function drawServeSign(random: () => number = Math.random): 1 | -1 {
  return random() < 0.5 ? 1 : -1;
}

/** The ball parked at its home point, waiting out a full hold. */
export function parkedBall(): BallState {
  return {
    x: FIELD_CX,
    y: FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: HOLD_TIME,
    serveSign: drawServeSign(),
    trail: [],
  };
}

/** Obstacle `index` at its fixed center. */
export function obstacleAt(index: number): ObstacleState {
  const center = OBSTACLE_CENTERS[index];
  if (center === undefined) {
    throw new Error(
      `Carom: there is no obstacle ${index}; obstacle indices are 0 to ${OBSTACLE_CENTERS.length - 1}`,
    );
  }
  return { index, cx: center.x, cy: center.y };
}

/** Every obstacle, in the order of `OBSTACLE_CENTERS`. */
export function allObstacles(): ObstacleState[] {
  return OBSTACLE_CENTERS.map((_, index) => obstacleAt(index));
}

/** A paddle at rest on the field's center line, played by its owner. */
export function restingPaddle(): PaddleState {
  return { cy: FIELD_CY, vy: 0, driven: false, drivenVy: 0 };
}

/** The state the game opens on (`specs/state.md`). */
export function titleState(muted: boolean): CaromState {
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: restingPaddle(), right: restingPaddle() },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(),
    obstacles: allObstacles(),
    simTime: 0,
    muted,
    press: null,
  };
}

/**
 * Returns to the title: every declared field back at its title-screen value,
 * except `titleIndex`, `simTime`, and `muted`, and with `menuIndex` restored
 * from `titleIndex`.
 */
export function returnToTitle(state: View): CaromState {
  return {
    ...titleState(state.muted),
    titleIndex: state.titleIndex,
    menuIndex: state.titleIndex,
    simTime: state.simTime,
  };
}

/** Starts a match in `mode`, the same way from every menu that offers one. */
export function startMatch(state: View, mode: Mode): CaromState {
  const { left, right } = state.paddles;
  return {
    ...state,
    mode,
    screen: "countdown",
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(),
    paddles: {
      left: { ...left, cy: FIELD_CY, vy: 0 },
      right: { ...right, cy: FIELD_CY, vy: 0 },
    },
    press: null,
  };
}
