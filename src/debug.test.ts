import { describe, expect, it } from "vitest";
import { boot } from "./test/harness";

describe("the debug surface", () => {
  it("reports its version", async () => {
    const h = await boot();
    expect(h.debug.version).toBe(1);
  });

  it("leaves the state it is handed as it was", async () => {
    const h = await boot();
    const before = h.state();
    const copy = JSON.parse(JSON.stringify(before));
    const after = h.debug.setScore(before, 3, 4);
    expect(after.score).toEqual({ p1: 3, p2: 4 });
    expect(JSON.parse(JSON.stringify(before))).toEqual(copy);
  });

  it("fails loudly on a ball that is not there", async () => {
    const h = await boot();
    h.pose((s) => h.debug.clearWorld(s));
    const s = h.state();
    expect(h.debug.snapshot(s).ball).toBeNull();
    expect(h.debug.snapshot(s).obstacles).toEqual([]);
    expect(() => h.debug.setBallPosition(s, 1, 2)).toThrow(/no ball/);
    expect(() => h.debug.setBallVelocity(s, 1, 2)).toThrow();
    expect(() => h.debug.setBallSpin(s, 1)).toThrow();
    expect(() => h.debug.setBallHeld(s, true)).toThrow();
    expect(() => h.debug.setBallHoldTimer(s, 1)).toThrow();
    expect(() => h.debug.setBallServeSign(s, 1)).toThrow();
    expect(() => h.debug.drawBallServeSign(s)).toThrow();
  });

  it("fails loudly on values outside a field's type", async () => {
    const h = await boot();
    const s = h.state();
    const bad = <T>(v: unknown) => v as T;
    expect(() => h.debug.spawnObstacle(s, 2)).toThrow(/obstacle/);
    expect(() => h.debug.spawnObstacle(s, 0.5)).toThrow();
    expect(() => h.debug.setScreen(s, bad("menu"))).toThrow();
    expect(() => h.debug.setMode(s, bad("duo"))).toThrow();
    expect(() => h.debug.setResumeScreen(s, bad("title"))).toThrow();
    expect(() => h.debug.setWinner(s, bad("up"))).toThrow();
    expect(() => h.debug.setReceiver(s, bad("up"))).toThrow();
    expect(() => h.debug.setPaddleCy(s, bad("middle"), 3)).toThrow();
    expect(() => h.debug.setPaddleCy(s, "left", NaN)).toThrow();
    expect(() => h.debug.setPaddleDriven(s, "left", bad(1))).toThrow();
    expect(() => h.debug.setBallServeSign(s, bad(0))).toThrow();
    expect(() => h.debug.setMenuIndex(s, 1.5)).toThrow();
    expect(() => h.debug.setScore(s, Infinity, 0)).toThrow();
  });

  it("poses each field and reads it back", async () => {
    const h = await boot();
    const d = h.debug;
    h.pose((s) => d.setScreen(s, "playing"));
    h.pose((s) => d.setMode(s, "versus"));
    h.pose((s) => d.setMenuIndex(s, 2));
    h.pose((s) => d.setTitleIndex(s, 1));
    h.pose((s) => d.setResumeScreen(s, "countdown"));
    h.pose((s) => d.setScore(s, 7, 9));
    h.pose((s) => d.setWinner(s, "right"));
    h.pose((s) => d.setWinner(s, null));
    h.pose((s) => d.setReceiver(s, "right"));
    h.pose((s) => d.setPaddleCy(s, "left", 20));
    h.pose((s) => d.setPaddleVy(s, "right", 99));
    h.pose((s) => d.setPaddleDriven(s, "right", true));
    h.pose((s) => d.setBallPosition(s, 100, 200));
    h.pose((s) => d.setBallVelocity(s, 30, 40));
    h.pose((s) => d.setBallSpin(s, -50));
    h.pose((s) => d.setBallHeld(s, false));
    h.pose((s) => d.setBallHoldTimer(s, 0.25));
    h.pose((s) => d.setBallServeSign(s, -1));
    h.pose((s) => d.setAiTracking(s, false));
    h.pose((s) => d.setAiMovement(s, false));
    h.pose((s) => d.setMuted(s, true));
    const snap = d.snapshot(h.state());
    expect(snap).toMatchObject({
      screen: "playing",
      mode: "versus",
      menuIndex: 2,
      titleIndex: 1,
      resumeScreen: "countdown",
      score: { p1: 7, p2: 9 },
      winner: null,
      receiver: "right",
      muted: true,
      ai: { tracking: false, movement: false },
      paddles: {
        left: { cy: 20, vy: 0, driven: false, drivenVy: 0 },
        right: { cy: 360, vy: 0, driven: true, drivenVy: 99 },
      },
      ball: {
        x: 100,
        y: 200,
        vx: 30,
        vy: 40,
        speed: 50,
        spin: -50,
        held: false,
        holdTimer: 0.25,
        serveSign: -1,
      },
    });
    const drawn = new Set<number>();
    for (let i = 0; i < 64; i++) {
      const s = d.drawBallServeSign(h.state());
      drawn.add(s.ball?.serveSign ?? 0);
      expect(s.ball?.x).toBe(100);
    }
    expect(drawn).toEqual(new Set([1, -1]));
  });

  it("reconciles to an equal state and resets to the title", async () => {
    const h = await boot();
    await h.advance(20);
    const s = h.state();
    expect(h.debug.reconcile(s)).toEqual(s);
    h.pose((st) => h.debug.setScore(st, 5, 5));
    h.pose((st) => h.debug.setPaddleDriven(st, "left", true));
    h.pose((st) => h.debug.setPaddleVy(st, "left", 10));
    h.pose((st) => h.debug.clearWorld(st));
    h.pose((st) => h.debug.reset(st));
    const snap = h.debug.snapshot(h.state());
    expect(snap.score).toEqual({ p1: 0, p2: 0 });
    expect(snap.simTime).toBe(0);
    expect(snap.paddles.left).toEqual({
      cy: 360,
      vy: 0,
      drivenVy: 0,
      driven: false,
    });
    expect(snap.obstacles).toHaveLength(2);
    expect(snap.ball?.held).toBe(true);
  });
});
