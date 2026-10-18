import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  BALL_R,
  CUES,
  FIELD_CX,
  FIELD_CY,
  HOLD_TIME,
  OBSTACLE_CENTERS,
  PADDLE_SPEED,
  SERVE_ANGLE,
  SERVE_SPEED,
  TRAIL_TIME,
} from "./constants";
import { boot } from "./test/harness";
import type { Harness } from "./test/harness";

const DT = 1 / 60;

/** Boots and starts a match from the title with the keyboard. */
async function match(mode: "solo" | "versus"): Promise<Harness> {
  const h = await boot();
  if (mode === "versus") h.tap("KeyS");
  await h.advance(1);
  h.tap("Enter");
  await h.advance(1);
  return h;
}

/** Poses a flying ball on the playing screen with the hold over. */
function fly(h: Harness, x: number, y: number, vx: number, vy: number): void {
  h.pose((s) => h.debug.setScreen(s, "playing"));
  h.pose((s) => h.debug.setBallHeld(s, false));
  h.pose((s) => h.debug.setBallPosition(s, x, y));
  h.pose((s) => h.debug.setBallVelocity(s, vx, vy));
}

describe("the opening state", () => {
  it("opens on the title with every field at its title value", async () => {
    const h = await boot();
    const snap = h.debug.snapshot(h.state());
    expect(snap).toMatchObject({
      version: 1,
      screen: "title",
      mode: "solo",
      menuIndex: 0,
      titleIndex: 0,
      resumeScreen: "playing",
      score: { p1: 0, p2: 0 },
      winner: null,
      muted: false,
      receiver: "left",
      ai: { tracking: true, movement: true },
      paddles: {
        left: { cy: FIELD_CY, vy: 0, drivenVy: 0, driven: false },
        right: { cy: FIELD_CY, vy: 0, drivenVy: 0, driven: false },
      },
      simTime: 0,
    });
    expect(snap.ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      vx: 0,
      vy: 0,
      speed: 0,
      spin: 0,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
    expect([1, -1]).toContain(snap.ball?.serveSign);
    expect(snap.obstacles).toEqual(
      OBSTACLE_CENTERS.map((c, index) => ({ index, cx: c.x, cy: c.y })),
    );
  });

  it("registers its diagnostics as pure reads", async () => {
    const h = await boot();
    const names = h.engine.diagnostics().map((d) => d.name);
    expect(names).toEqual([
      "screen",
      "mode",
      "score",
      "ball pos",
      "ball vel",
      "ball speed",
      "ball spin",
      "paddle L",
      "paddle R",
    ]);
    h.pose((s) => h.debug.setPaddleDriven(s, "left", true));
    h.pose((s) => h.debug.clearWorld(s));
    const values = Object.fromEntries(
      h.engine.diagnostics().map((d) => [d.name, d.value]),
    );
    expect(values["ball pos"]).toBe("none");
    expect(values["ball speed"]).toBe("none");
    expect(values["paddle L"]).toContain("driven");
  });

  it("registers exactly the layout's actions", () => {
    expect(ACTIONS).toHaveLength(8);
  });

  it("accumulates simTime on every screen", async () => {
    const h = await boot();
    await h.advance(30);
    expect(h.state().simTime).toBeCloseTo(0.5);
  });
});

describe("serving", () => {
  it("holds the ball for HOLD_TIME, then serves toward the receiver", async () => {
    const h = await match("solo");
    expect(h.state().screen).toBe("countdown");
    h.pose((s) => h.debug.setBallServeSign(s, -1));
    // The frame that started the match already counted the hold down once.
    await h.advanceSeconds(HOLD_TIME - 3 * DT);
    expect(h.state().screen).toBe("countdown");
    expect(h.state().ball?.held).toBe(true);
    while (h.state().screen === "countdown") await h.advance(1);
    expect(h.state().simTime).toBeCloseTo(HOLD_TIME + DT, 1);
    const ball = h.state().ball;
    expect(h.state().screen).toBe("playing");
    expect(ball?.held).toBe(false);
    expect(ball?.holdTimer).toBe(0);
    expect(ball?.x).toBe(FIELD_CX);
    expect(ball?.vx).toBeCloseTo(-SERVE_SPEED * Math.cos(SERVE_ANGLE));
    expect(ball?.vy).toBeCloseTo(-SERVE_SPEED * Math.sin(SERVE_ANGLE));
    expect(ball?.serveSign).toBe(-1);
  });

  it("serves on the next frame once the hold timer is posed to zero", async () => {
    const h = await match("solo");
    h.pose((s) => h.debug.setReceiver(s, "right"));
    h.pose((s) => h.debug.setBallServeSign(s, 1));
    h.pose((s) => h.debug.setBallHoldTimer(s, 0));
    await h.advance(1);
    expect(h.state().screen).toBe("playing");
    expect(h.state().ball?.vx).toBeGreaterThan(0);
    expect(h.state().ball?.vy).toBeGreaterThan(0);
  });

  it("draws serve signs both ways over many parkings", async () => {
    const h = await boot();
    const signs = new Set<number>();
    for (let i = 0; i < 64; i++) {
      h.pose((s) => h.debug.spawnBall(s));
      signs.add(h.state().ball?.serveSign ?? 0);
    }
    expect(signs).toEqual(new Set([1, -1]));
  });

  it("moves the paddles during the countdown", async () => {
    const h = await match("versus");
    h.keyDown("KeyS");
    h.keyDown("ArrowUp");
    await h.advance(6);
    const { left, right } = h.state().paddles;
    expect(left.cy).toBeCloseTo(FIELD_CY + 6 * DT * PADDLE_SPEED);
    expect(left.vy).toBe(PADDLE_SPEED);
    expect(right.cy).toBeCloseTo(FIELD_CY - 6 * DT * PADDLE_SPEED);
    expect(right.vy).toBe(-PADDLE_SPEED);
  });

  it("drives the left paddle from either key pair in solo", async () => {
    const h = await match("solo");
    h.keyDown("ArrowDown");
    await h.advance(3);
    expect(h.state().paddles.left.vy).toBe(PADDLE_SPEED);
    h.keyUp("ArrowDown");
    h.keyDown("KeyW");
    h.keyDown("ArrowDown");
    await h.advance(1);
    expect(h.state().paddles.left.vy).toBe(0);
  });
});

describe("the trail", () => {
  it("keeps the last TRAIL_TIME seconds of samples, oldest first", async () => {
    const h = await match("versus");
    fly(h, 300, 360, 500, 0);
    await h.advance(30);
    const trail = h.state().ball?.trail ?? [];
    const now = h.state().simTime;
    expect(trail.length).toBeGreaterThan(5);
    expect(trail.every((s) => now - s.t <= TRAIL_TIME + 1e-9)).toBe(true);
    expect(trail[trail.length - 1].x).toBe(h.state().ball?.x);
    for (let i = 1; i < trail.length; i++) {
      expect(trail[i].x).toBeGreaterThan(trail[i - 1].x);
    }
  });
});

describe("play", () => {
  it("bounces off a paddle with spin from its motion and plays one cue", async () => {
    const h = await match("versus");
    h.pose((s) => h.debug.setPaddleDriven(s, "left", true));
    h.pose((s) => h.debug.setPaddleVy(s, "left", 300));
    h.pose((s) => h.debug.setPaddleCy(s, "left", 300));
    fly(h, 120, 360, -520, 0);
    await h.advanceSeconds(0.2);
    const ball = h.state().ball;
    expect(ball?.vx).toBeGreaterThan(0);
    expect(ball?.spin).not.toBe(0);
    expect(h.cues.filter((c) => c === CUES.paddleHit)).toHaveLength(1);
    expect(h.state().paddles.left.vy).toBe(300);
  });

  it("bounces off the walls and the obstacles with their own cues", async () => {
    const h = await match("versus");
    fly(h, 300, 30, 0, -400);
    await h.advance(10);
    expect(h.state().ball?.vy).toBeGreaterThan(0);
    expect(h.cues).toContain(CUES.wallBounce);
    fly(h, 440, 220, 500, 0);
    await h.advance(10);
    expect(h.state().ball?.vx).toBeLessThan(0);
    expect(h.cues).toContain(CUES.obstacleBounce);
  });

  it("lets a ball through where an obstacle was cleared", async () => {
    const h = await match("versus");
    h.pose((s) => h.debug.clearWorld(s));
    h.pose((s) => h.debug.spawnBall(s));
    fly(h, 440, 220, 500, 0);
    await h.advance(10);
    expect(h.state().ball?.vx).toBe(500);
    h.pose((s) => h.debug.spawnObstacle(s, 1));
    h.pose((s) => h.debug.spawnObstacle(s, 0));
    h.pose((s) => h.debug.spawnObstacle(s, 0));
    expect(h.state().obstacles.map((o) => o.index)).toEqual([0, 1]);
  });

  it("scores a point and sets up the next serve toward the scored-on side", async () => {
    const h = await match("versus");
    fly(h, 1270, 600, 600, 0);
    await h.advance(3);
    const s = h.state();
    expect(s.score).toEqual({ p1: 1, p2: 0 });
    expect(s.screen).toBe("countdown");
    expect(s.receiver).toBe("right");
    expect(s.ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      held: true,
      holdTimer: HOLD_TIME,
    });
    expect(h.cues).toContain(CUES.score);
    fly(h, 10, 600, -600, 0);
    await h.advance(3);
    expect(h.state().score).toEqual({ p1: 1, p2: 1 });
    expect(h.state().receiver).toBe("left");
  });

  it("ends the match on the win rule and plays on at deuce", async () => {
    const h = await match("versus");
    h.pose((s) => h.debug.setScore(s, 10, 10));
    fly(h, 1270, 600, 600, 0);
    await h.advance(3);
    expect(h.state().score).toEqual({ p1: 11, p2: 10 });
    expect(h.state().screen).toBe("countdown");
    fly(h, 1270, 600, 600, 0);
    await h.advance(3);
    const s = h.state();
    expect(s.screen).toBe("matchover");
    expect(s.winner).toBe("left");
    expect(s.menuIndex).toBe(0);
    expect(s.ball?.held).toBe(false);
  });

  it("gives the right side the match when it wins", async () => {
    const h = await match("versus");
    h.pose((s) => h.debug.setScore(s, 3, 10));
    fly(h, 10, 600, -600, 0);
    await h.advance(3);
    expect(h.state().winner).toBe("right");
  });

  it("runs the AI in solo, gated by its faculties", async () => {
    const h = await match("solo");
    fly(h, 800, 150, 300, 0);
    await h.advance(10);
    expect(h.state().paddles.right.cy).toBeLessThan(FIELD_CY);
    h.pose((s) => h.debug.setAiMovement(s, false));
    const cy = h.state().paddles.right.cy;
    await h.advance(5);
    expect(h.state().paddles.right.cy).toBe(cy);
    expect(h.state().paddles.right.vy).toBe(0);
  });

  it("drives a paddle at drivenVy and leaves the other alone", async () => {
    const h = await match("solo");
    h.pose((s) => h.debug.setPaddleVy(s, "right", -240));
    expect(h.state().paddles.right.vy).toBe(0);
    h.pose((s) => h.debug.setPaddleDriven(s, "right", true));
    await h.advance(1);
    expect(h.state().paddles.right.vy).toBe(-240);
    expect(h.state().paddles.left.driven).toBe(false);
  });

  it("ignores an absent ball", async () => {
    const h = await match("versus");
    h.pose((s) => h.debug.clearWorld(s));
    h.pose((s) => h.debug.setScreen(s, "playing"));
    await h.advance(10);
    expect(h.state().ball).toBeNull();
    expect(h.state().score).toEqual({ p1: 0, p2: 0 });
  });
});

describe("pausing", () => {
  it("opens with one Escape and resumes with the next", async () => {
    const h = await match("solo");
    await h.advance(5);
    h.tap("Escape");
    await h.advance(1);
    expect(h.state().screen).toBe("paused");
    expect(h.state().resumeScreen).toBe("countdown");
    const frozen = h.state().ball?.holdTimer;
    await h.advance(30);
    expect(h.state().screen).toBe("paused");
    expect(h.state().ball?.holdTimer).toBe(frozen);
    h.tap("Escape");
    await h.advance(1);
    expect(h.state().screen).toBe("countdown");
  });

  it("offers resume, restart, and quit", async () => {
    const h = await match("versus");
    h.pose((s) => h.debug.setScore(s, 4, 2));
    h.tap("KeyP");
    await h.advance(1);
    h.tap("ArrowDown");
    await h.advance(1);
    expect(h.state().menuIndex).toBe(1);
    h.tap("Enter");
    await h.advance(1);
    expect(h.state().screen).toBe("countdown");
    expect(h.state().mode).toBe("versus");
    expect(h.state().score).toEqual({ p1: 0, p2: 0 });

    h.tap("KeyP");
    await h.advance(1);
    h.tap("KeyW");
    await h.advance(1);
    expect(h.state().menuIndex).toBe(2);
    h.tap("Space");
    await h.advance(1);
    expect(h.state().screen).toBe("title");
    expect(h.state().menuIndex).toBe(1);
    expect(h.state().titleIndex).toBe(1);

    h.pose((s) => h.debug.setScreen(s, "paused"));
    h.pose((s) => h.debug.setMenuIndex(s, 0));
    h.pose((s) => h.debug.setResumeScreen(s, "playing"));
    h.tap("Enter");
    await h.advance(1);
    expect(h.state().screen).toBe("playing");
  });
});

describe("muting", () => {
  it("toggles the runtime's bit with M and mirrors it", async () => {
    const h = await boot();
    h.tap("KeyM");
    await h.advance(1);
    expect(h.state().muted).toBe(true);
    h.tap("KeyM");
    await h.advance(1);
    expect(h.state().muted).toBe(false);
  });

  it("takes a posed bit to the runtime, silencing the cues", async () => {
    const h = await match("versus");
    h.pose((s) => h.debug.setMuted(s, true));
    expect(h.debug.snapshot(h.state()).muted).toBe(true);
    fly(h, 300, 30, 0, -400);
    await h.advance(10);
    expect(h.gains.length).toBeGreaterThan(0);
    expect(h.gains.every((g) => g === 0)).toBe(true);
    h.pose((s) => h.debug.reset(s));
    expect(h.state().muted).toBe(true);
  });
});

describe("frame-rate independence", () => {
  async function rally(stepMs: number) {
    const h = await boot(stepMs);
    h.pose((s) => h.debug.setMode(s, "versus"));
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setBallHeld(s, false));
    h.pose((s) => h.debug.setBallPosition(s, 640, 360));
    h.pose((s) => h.debug.setBallVelocity(s, -500, 200));
    h.pose((s) => h.debug.setBallSpin(s, 300));
    h.pose((s) => h.debug.setPaddleDriven(s, "left", true));
    h.pose((s) => h.debug.setPaddleDriven(s, "right", true));
    let frames = 0;
    while (h.state().score.p1 + h.state().score.p2 === 0 && frames < 100000) {
      await h.advance(1);
      frames++;
    }
    return { state: h.state(), cues: h.cues };
  }

  it("plays the same rally at 2 ms and at 16 ms steps", async () => {
    const fine = await rally(2);
    const coarse = await rally(16);
    expect(coarse.state.score).toEqual(fine.state.score);
    expect(coarse.cues).toEqual(fine.cues);
    const t = fine.state.simTime;
    expect(Math.abs(coarse.state.simTime - t) / t).toBeLessThan(0.08);
  });
});

describe("rendering", () => {
  it("draws every screen", async () => {
    const h = await match("solo");
    fly(h, 400, 300, 600, 100);
    h.pose((s) => h.debug.setBallSpin(s, 800));
    await h.advance(5);
    h.pose((s) => h.debug.setMuted(s, true));
    for (const screen of [
      "title",
      "howto",
      "countdown",
      "playing",
      "paused",
      "matchover",
    ] as const) {
      h.pose((s) => h.debug.setScreen(s, screen));
      for (const winner of ["left", "right"] as const) {
        h.pose((s) => h.debug.setWinner(s, winner));
        await expect(h.advance(1)).resolves.toBeUndefined();
      }
      h.pose((s) => h.debug.setMode(s, "versus"));
      await h.advance(1);
    }
    h.pose((s) => h.debug.setScreen(s, "countdown"));
    h.pose((s) => h.debug.clearWorld(s));
    await expect(h.advance(1)).resolves.toBeUndefined();
  });

  it("keeps the ball off a paddle it is driven into", async () => {
    const h = await match("versus");
    h.pose((s) => h.debug.setPaddleDriven(s, "left", true));
    h.pose((s) => h.debug.setPaddleVy(s, "left", -720));
    fly(h, 56, 360 - 55 - BALL_R - 1, 0, 50);
    await h.advance(1);
    const ball = h.state().ball;
    expect(ball?.vy).toBeLessThan(0);
  });
});
