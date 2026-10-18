import { describe, expect, it } from "vitest";
import {
  AI_SPEED,
  BALL_R,
  FIELD_H,
  MAX_BOUNCE_ANGLE,
  P1_X1,
  P2_X0,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  SERVE_SPEED,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
} from "./constants";
import type { BallState } from "./game";
import {
  aiVelocity,
  flyBall,
  integratePaddle,
  paddleBounce,
  resolveRect,
  resolveWalls,
  substepCount,
} from "./physics";
import type { Body } from "./physics";
import { allObstacles, parkedBall, restingPaddle } from "./world";

const ai = { tracking: true, movement: true };

function flying(over: Partial<BallState>): BallState {
  return { ...parkedBall(), held: false, holdTimer: 0, ...over };
}

const emptyWorld = {
  paddles: { left: restingPaddle(), right: restingPaddle() },
  obstacles: [],
};

describe("paddle integration", () => {
  it("moves at the velocity it is given", () => {
    const p = integratePaddle(restingPaddle(), 720, 0.1);
    expect(p.cy).toBeCloseTo(432);
    expect(p.vy).toBe(720);
  });

  it("clamps to the field and reports the velocity it actually moved at", () => {
    const near = { ...restingPaddle(), cy: PADDLE_MAX_CY - 6 };
    const p = integratePaddle(near, 720, 0.1);
    expect(p.cy).toBe(PADDLE_MAX_CY);
    expect(p.vy).toBeCloseTo(60);
    const pinned = integratePaddle(p, 720, 0.1);
    expect(pinned.vy).toBe(0);
    const top = integratePaddle(
      { ...restingPaddle(), cy: PADDLE_MIN_CY },
      -720,
      0.016,
    );
    expect(top.cy).toBe(PADDLE_MIN_CY);
    expect(top.vy).toBe(0);
  });

  it("keeps the velocity when the step is zero", () => {
    const p = integratePaddle({ ...restingPaddle(), cy: 900 }, 50, 0);
    expect(p.cy).toBe(PADDLE_MAX_CY);
    expect(p.vy).toBe(50);
  });
});

describe("the AI", () => {
  const ball = { y: 200, vx: 300, vy: 100 };

  it("tracks the ball, leading it by its reaction lag", () => {
    const vy = aiVelocity(ai, 360, { playing: true, ball }, 1 / 60);
    expect(vy).toBe(-AI_SPEED);
  });

  it("moves no further than the distance left this frame", () => {
    // Target 200 - 100 * 0.12 = 188; 20 units away at 1/60 s is 1200/s.
    const vy = aiVelocity(ai, 168, { playing: true, ball }, 1);
    expect(vy).toBeCloseTo(20);
  });

  it("stops inside its dead zone", () => {
    expect(aiVelocity(ai, 192, { playing: true, ball }, 1 / 60)).toBe(0);
    expect(aiVelocity(ai, 375, { playing: false, ball }, 1 / 60)).toBe(0);
  });

  it("returns home when the ball travels away, outside play, or untracked", () => {
    const away = { ...ball, vx: -300 };
    expect(aiVelocity(ai, 100, { playing: true, ball: away }, 1 / 60)).toBe(
      AI_SPEED,
    );
    expect(aiVelocity(ai, 100, { playing: false, ball }, 1 / 60)).toBe(
      AI_SPEED,
    );
    expect(aiVelocity(ai, 100, { playing: true, ball: null }, 1 / 60)).toBe(
      AI_SPEED,
    );
    const blind = { tracking: false, movement: true };
    expect(aiVelocity(blind, 100, { playing: true, ball }, 1 / 60)).toBe(
      AI_SPEED,
    );
  });

  it("holds still with movement off", () => {
    const frozen = { tracking: true, movement: false };
    expect(aiVelocity(frozen, 100, { playing: true, ball }, 1 / 60)).toBe(0);
  });
});

describe("collision against a rectangle", () => {
  const rect = { x0: 100, y0: 100, x1: 120, y1: 240 };

  it("misses a ball outside the grown rectangle", () => {
    const body: Body = { x: 100 - BALL_R, y: 150, vx: 5, vy: 0, spin: 0 };
    expect(resolveRect(body, rect)).toBeNull();
    expect(body.x).toBe(100 - BALL_R);
  });

  it("places the ball off the face of least penetration and reflects", () => {
    const left: Body = { x: 92, y: 150, vx: 5, vy: 1, spin: 3 };
    expect(resolveRect(left, rect)).toBe("left");
    expect(left).toEqual({ x: 89, y: 150, vx: -5, vy: 1, spin: 3 });

    const right: Body = { x: 128, y: 150, vx: -5, vy: 0, spin: 0 };
    expect(resolveRect(right, rect)).toBe("right");
    expect(right.x).toBe(131);
    expect(right.vx).toBe(5);

    const top: Body = { x: 110, y: 92, vx: 0, vy: 5, spin: 0 };
    expect(resolveRect(top, rect)).toBe("top");
    expect(top.y).toBe(89);
    expect(top.vy).toBe(-5);

    const bottom: Body = { x: 110, y: 248, vx: 0, vy: -5, spin: 0 };
    expect(resolveRect(bottom, rect)).toBe("bottom");
    expect(bottom.y).toBe(251);
    expect(bottom.vy).toBe(5);
  });

  it("leaves a velocity already leaving the face alone", () => {
    const body: Body = { x: 92, y: 150, vx: -5, vy: 0, spin: 0 };
    expect(resolveRect(body, rect)).toBe("left");
    expect(body.vx).toBe(-5);
  });

  it("breaks a tie in the order left, right, top, bottom", () => {
    // A corner equidistant from the left and top faces.
    const body: Body = { x: 90, y: 90, vx: 1, vy: 1, spin: 0 };
    expect(resolveRect(body, rect)).toBe("left");
  });
});

describe("walls", () => {
  it("reflects off the top and bottom", () => {
    const top: Body = { x: 0, y: 5, vx: 1, vy: -10, spin: 0 };
    expect(resolveWalls(top)).toBe(true);
    expect(top.y).toBe(BALL_R);
    expect(top.vy).toBe(10);
    const bottom: Body = { x: 0, y: FIELD_H - 2, vx: 1, vy: 10, spin: 0 };
    expect(resolveWalls(bottom)).toBe(true);
    expect(bottom.y).toBe(FIELD_H - BALL_R);
    expect(bottom.vy).toBe(-10);
    const leaving: Body = { x: 0, y: 5, vx: 1, vy: 10, spin: 0 };
    expect(resolveWalls(leaving)).toBe(false);
  });
});

describe("paddle bounce", () => {
  it("angles by contact point, speeds up, and adds spin from the paddle", () => {
    const body: Body = { x: 70, y: 360 + 55, vx: -500, vy: 0, spin: 100 };
    paddleBounce(body, "left", 360, 400);
    const speed = 500 * SPEED_MULT;
    expect(body.vx).toBeCloseTo(speed * Math.cos(MAX_BOUNCE_ANGLE));
    expect(body.vy).toBeCloseTo(speed * Math.sin(MAX_BOUNCE_ANGLE));
    expect(body.spin).toBeCloseTo(100 + 400 * SPIN_FROM_PADDLE);
    expect(body.x).toBe(P1_X1 + BALL_R);
  });

  it("sends a centre hit straight back off the right paddle", () => {
    const body: Body = { x: 1200, y: 300, vx: 600, vy: 50, spin: 0 };
    paddleBounce(body, "right", 300, 0);
    expect(body.vx).toBeCloseTo(-Math.hypot(600, 50) * SPEED_MULT);
    expect(body.vy).toBeCloseTo(0);
    expect(body.spin).toBe(0);
    expect(body.x).toBe(P2_X0 - BALL_R);
  });

  it("caps speed and spin", () => {
    const body: Body = { x: 70, y: 360, vx: -975, vy: 0, spin: 800 };
    paddleBounce(body, "left", 360, 720);
    expect(Math.hypot(body.vx, body.vy)).toBeCloseTo(SPEED_CAP);
    expect(body.spin).toBe(SPIN_CLAMP);
  });
});

describe("the ball's flight", () => {
  it("cuts a frame into sub-steps of at most MAX_SUBSTEP units", () => {
    expect(substepCount(0, 1 / 60)).toBe(1);
    expect(substepCount(SERVE_SPEED, 1 / 60)).toBe(3);
    expect(substepCount(980, 0.1)).toBe(25);
  });

  it("flies straight without spin", () => {
    const { ball } = flyBall(flying({ vx: 300, vy: 0 }), emptyWorld, 0.5);
    expect(ball.x).toBeCloseTo(790);
    expect(ball.y).toBeCloseTo(360);
  });

  it("curves clockwise under positive spin without changing speed", () => {
    const { ball } = flyBall(
      flying({ vx: 500, vy: 0, spin: 600 }),
      emptyWorld,
      0.25,
    );
    expect(ball.vy).toBeGreaterThan(0);
    expect(Math.hypot(ball.vx, ball.vy)).toBeCloseTo(500);
    expect(ball.spin).toBeLessThan(600);
    expect(ball.spin).toBeCloseTo(600 * Math.pow(0.5, 0.25 / 0.8));
  });

  it("raises each event once however many sub-steps hit", () => {
    const world = { ...emptyWorld, obstacles: allObstacles() };
    const { ball, events } = flyBall(
      flying({ x: 470, y: 220, vx: 300, vy: 0 }),
      world,
      0.02,
    );
    expect(events.obstacleBounce).toBe(true);
    expect(ball.vx).toBe(-300);
    expect(ball.x).toBeLessThanOrEqual(480 - BALL_R);
  });

  it("treats a paddle's end cap as a wall", () => {
    const { ball, events } = flyBall(
      flying({ x: 56, y: 360 - 55 - BALL_R - 2, vx: 0, vy: 300 }),
      emptyWorld,
      0.02,
    );
    expect(events.wallBounce).toBe(true);
    expect(events.paddleHit).toBe(false);
    expect(ball.vy).toBe(-300);
  });

  it("never tunnels through a paddle at the speed cap", () => {
    const { ball, events } = flyBall(
      flying({ x: 200, y: 360, vx: -SPEED_CAP, vy: 0 }),
      emptyWorld,
      0.2,
    );
    expect(events.paddleHit).toBe(true);
    expect(ball.vx).toBeGreaterThan(0);
    expect(ball.x).toBeGreaterThan(P1_X1 + BALL_R);
  });
});
