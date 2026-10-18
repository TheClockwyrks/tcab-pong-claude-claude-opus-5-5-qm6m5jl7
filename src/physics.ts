// The render-free simulation: paddle integration, the AI's rule, and the ball's
// sub-stepped flight with its collisions (`specs/playfield.md`,
// `specs/balls.md`, `specs/modes/single-player.md`). Everything here is a pure
// function of its arguments and the elapsed seconds it is handed.

import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
  BALL_R,
  FIELD_H,
  MAX_BOUNCE_ANGLE,
  MAX_SUBSTEP,
  OBSTACLE_HH,
  OBSTACLE_HW,
  P1_X0,
  P1_X1,
  P2_X0,
  P2_X1,
  PADDLE_HALF,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  SERVE_ANGLE,
  SERVE_SPEED,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
} from "./constants";
import type { Rect } from "./constants";
import type { AiState, BallState, PaddleState, Side, View } from "./game";

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

// ---- Paddles -------------------------------------------------------------

/**
 * Moves a paddle at `vy` for `dt` seconds, clamped to the field. The `vy` it
 * leaves is the velocity the paddle actually moved at, so a paddle pinned
 * against a bound carries `0`.
 */
export function integratePaddle(
  paddle: PaddleState,
  vy: number,
  dt: number,
): PaddleState {
  const unclamped = paddle.cy + vy * dt;
  const next = clamp(unclamped, PADDLE_MIN_CY, PADDLE_MAX_CY);
  const actualVy = next !== unclamped && dt > 0 ? (next - paddle.cy) / dt : vy;
  return { ...paddle, cy: next, vy: actualVy };
}

/** The ball as far as the AI can see it. */
export interface AiView {
  readonly playing: boolean;
  readonly ball: Pick<BallState, "y" | "vx" | "vy"> | null;
}

/** The velocity the AI's rule chooses for its paddle this frame. */
export function aiVelocity(
  ai: AiState,
  paddleCy: number,
  seen: AiView,
  dt: number,
): number {
  if (!ai.movement) return 0;
  let target = AI_HOME_Y;
  let deadzone = AI_HOME_DEADZONE;
  if (ai.tracking && seen.playing && seen.ball !== null && seen.ball.vx > 0) {
    target = seen.ball.y - seen.ball.vy * AI_REACT;
    deadzone = AI_DEADZONE;
  }
  const diff = target - paddleCy;
  if (Math.abs(diff) <= deadzone) return 0;
  return Math.sign(diff) * Math.min(AI_SPEED, Math.abs(diff) / dt);
}

// ---- Serving -------------------------------------------------------------

/** The ball leaving its home point toward `receiver`. */
export function serve(ball: BallState, receiver: Side): BallState {
  const dir = receiver === "left" ? -1 : 1;
  return {
    ...ball,
    holdTimer: 0,
    held: false,
    trail: [],
    vx: dir * SERVE_SPEED * Math.cos(SERVE_ANGLE),
    vy: ball.serveSign * SERVE_SPEED * Math.sin(SERVE_ANGLE),
  };
}

// ---- Collision -----------------------------------------------------------

export type Face = "left" | "right" | "top" | "bottom";

/** The moving part of a ball: what a sub-step reads and writes. */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

/**
 * Resolves the ball against an axis-aligned rectangle (`specs/balls.md`): if its
 * center is strictly inside the rectangle grown by `BALL_R`, it is placed
 * `BALL_R` off the face of least penetration and the normal component of its
 * velocity is reversed when it points into that face. Returns the struck face,
 * or `null` when there was no contact.
 */
export function resolveRect(body: Body, rect: Rect): Face | null {
  const ex0 = rect.x0 - BALL_R;
  const ex1 = rect.x1 + BALL_R;
  const ey0 = rect.y0 - BALL_R;
  const ey1 = rect.y1 + BALL_R;
  if (!(body.x > ex0 && body.x < ex1 && body.y > ey0 && body.y < ey1)) {
    return null;
  }
  const depths: readonly [Face, number][] = [
    ["left", body.x - ex0],
    ["right", ex1 - body.x],
    ["top", body.y - ey0],
    ["bottom", ey1 - body.y],
  ];
  let [face, least] = depths[0];
  for (const [candidate, depth] of depths) {
    if (depth < least) {
      face = candidate;
      least = depth;
    }
  }
  switch (face) {
    case "left":
      body.x = ex0;
      if (body.vx > 0) body.vx = -body.vx;
      break;
    case "right":
      body.x = ex1;
      if (body.vx < 0) body.vx = -body.vx;
      break;
    case "top":
      body.y = ey0;
      if (body.vy > 0) body.vy = -body.vy;
      break;
    case "bottom":
      body.y = ey1;
      if (body.vy < 0) body.vy = -body.vy;
      break;
  }
  return face;
}

/** The top and bottom walls. Returns whether the ball reflected off one. */
export function resolveWalls(body: Body): boolean {
  if (body.y - BALL_R < 0 && body.vy < 0) {
    body.y = BALL_R;
    body.vy = -body.vy;
    return true;
  }
  if (body.y + BALL_R > FIELD_H && body.vy > 0) {
    body.y = FIELD_H - BALL_R;
    body.vy = -body.vy;
    return true;
  }
  return false;
}

export function paddleRect(side: Side, cy: number): Rect {
  return side === "left"
    ? { x0: P1_X0, x1: P1_X1, y0: cy - PADDLE_HALF, y1: cy + PADDLE_HALF }
    : { x0: P2_X0, x1: P2_X1, y0: cy - PADDLE_HALF, y1: cy + PADDLE_HALF };
}

export function obstacleRect(cx: number, cy: number): Rect {
  return {
    x0: cx - OBSTACLE_HW,
    x1: cx + OBSTACLE_HW,
    y0: cy - OBSTACLE_HH,
    y1: cy + OBSTACLE_HH,
  };
}

/**
 * The paddle bounce: the outgoing angle from where the ball met the paddle, the
 * speed-up, the spin the paddle's motion adds, and the placement in front of
 * the paddle's face.
 */
export function paddleBounce(
  body: Body,
  side: Side,
  paddleCy: number,
  paddleVy: number,
): void {
  const offset = clamp((body.y - paddleCy) / PADDLE_HALF, -1, 1);
  const theta = offset * MAX_BOUNCE_ANGLE;
  const speed = Math.min(Math.hypot(body.vx, body.vy) * SPEED_MULT, SPEED_CAP);
  const dir = side === "left" ? 1 : -1;
  body.vx = dir * speed * Math.cos(theta);
  body.vy = speed * Math.sin(theta);
  body.spin = clamp(
    body.spin + paddleVy * SPIN_FROM_PADDLE,
    -SPIN_CLAMP,
    SPIN_CLAMP,
  );
  body.x = side === "left" ? P1_X1 + BALL_R : P2_X0 - BALL_R;
}

// ---- The ball's flight ---------------------------------------------------

/** What a frame's flight ran into, each raised at most once per frame. */
export interface FlightEvents {
  paddleHit: boolean;
  wallBounce: boolean;
  obstacleBounce: boolean;
}

export interface FlightWorld {
  readonly paddles: View["paddles"];
  readonly obstacles: View["obstacles"];
}

/** The number of sub-steps a frame of `dt` seconds is cut into. */
export function substepCount(speed: number, dt: number): number {
  return Math.max(1, Math.ceil((speed * dt) / MAX_SUBSTEP));
}

/**
 * Advances a flying ball by `dt` seconds through the sub-steps `specs/balls.md`
 * fixes: spin turns the velocity, spin decays, the ball moves, and collisions
 * resolve against the walls, the left paddle, the right paddle, and each
 * obstacle present, in that order.
 */
export function flyBall(
  ball: BallState,
  world: FlightWorld,
  dt: number,
): { ball: BallState; events: FlightEvents } {
  const body: Body = {
    x: ball.x,
    y: ball.y,
    vx: ball.vx,
    vy: ball.vy,
    spin: ball.spin,
  };
  const events: FlightEvents = {
    paddleHit: false,
    wallBounce: false,
    obstacleBounce: false,
  };
  const n = substepCount(Math.hypot(ball.vx, ball.vy), dt);
  const h = dt / n;
  const decay = Math.pow(0.5, h / SPIN_HALFLIFE);
  const sides: readonly Side[] = ["left", "right"];
  const obstacles = world.obstacles.map((o) => obstacleRect(o.cx, o.cy));

  for (let i = 0; i < n; i++) {
    const speed = Math.hypot(body.vx, body.vy);
    if (speed > 0) {
      const angle = (body.spin / speed) * h;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const vx = body.vx * cos - body.vy * sin;
      body.vy = body.vx * sin + body.vy * cos;
      body.vx = vx;
    }
    body.spin *= decay;
    body.x += body.vx * h;
    body.y += body.vy * h;

    if (resolveWalls(body)) events.wallBounce = true;
    for (const side of sides) {
      const paddle = world.paddles[side];
      // Resolve against a scratch copy first: a face hit is a paddle bounce,
      // which places and aims the ball itself; an end cap is a wall.
      const probe = { ...body };
      const face = resolveRect(probe, paddleRect(side, paddle.cy));
      if (face === "left" || face === "right") {
        paddleBounce(body, side, paddle.cy, paddle.vy);
        events.paddleHit = true;
      } else if (face !== null) {
        Object.assign(body, probe);
        events.wallBounce = true;
      }
    }
    for (const rect of obstacles) {
      if (resolveRect(body, rect) !== null) events.obstacleBounce = true;
    }
  }

  return { ball: { ...ball, ...body }, events };
}
