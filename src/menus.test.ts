import { describe, expect, it } from "vitest";
import { MATCHOVER_ITEMS, PAUSE_ITEMS, TITLE_ITEMS } from "./constants";
import { boot, itemCenter } from "./test/harness";
import { itemAt, menuItemRect, menuItems } from "./menus";

describe("menu layout", () => {
  it("lists each screen's items and none where there is no menu", () => {
    expect(menuItems("title")).toEqual(TITLE_ITEMS);
    expect(menuItems("paused")).toEqual(PAUSE_ITEMS);
    expect(menuItems("matchover")).toEqual(MATCHOVER_ITEMS);
    expect(menuItems("howto")).toHaveLength(1);
    expect(menuItems("playing")).toEqual([]);
    expect(menuItems("countdown")).toEqual([]);
  });

  it("lays out disjoint regions and reports none past the last item", () => {
    const a = menuItemRect("title", 0);
    const b = menuItemRect("title", 1);
    expect(a && b && a.y + a.h <= b.y).toBe(true);
    expect(menuItemRect("title", 3)).toBeNull();
    expect(menuItemRect("title", -1)).toBeNull();
    expect(menuItemRect("title", 0.5)).toBeNull();
    expect(menuItemRect("playing", 0)).toBeNull();
    expect(itemAt("title", 0, 0)).toBeNull();
  });
});

describe("keyboard navigation", () => {
  it("wraps the title selection both ways", async () => {
    const h = await boot();
    h.tap("KeyW");
    await h.advance(1);
    expect(h.state().menuIndex).toBe(2);
    h.tap("ArrowDown");
    await h.advance(1);
    expect(h.state().menuIndex).toBe(0);
  });

  it("applies up before down and movement before confirm", async () => {
    const h = await boot();
    h.tap("KeyS");
    h.tap("ArrowUp");
    await h.advance(1);
    expect(h.state().menuIndex).toBe(2);
    h.tap("KeyS");
    h.tap("Enter");
    await h.advance(1);
    expect(h.state().screen).toBe("title");
    expect(h.state().menuIndex).toBe(0);
  });

  it("ignores back on the title", async () => {
    const h = await boot();
    h.tap("Escape");
    await h.advance(1);
    expect(h.state().screen).toBe("title");
  });

  it("opens how-to-play and returns from it with confirm or back", async () => {
    const h = await boot();
    h.pose((s) => h.debug.setMenuIndex(s, 2));
    h.tap("Enter");
    await h.advance(1);
    expect(h.state().screen).toBe("howto");
    expect(h.state().menuIndex).toBe(0);
    expect(h.state().titleIndex).toBe(2);
    h.tap("Escape");
    await h.advance(1);
    expect(h.state().screen).toBe("title");
    expect(h.state().menuIndex).toBe(2);
    h.tap("Enter");
    await h.advance(1);
    h.tap("Enter");
    await h.advance(1);
    expect(h.state().screen).toBe("title");
  });

  it("drives the match-over menu", async () => {
    const h = await boot();
    h.pose((s) => h.debug.setMode(s, "versus"));
    h.pose((s) => h.debug.setScreen(s, "matchover"));
    h.pose((s) => h.debug.setScore(s, 11, 4));
    h.pose((s) => h.debug.setWinner(s, "left"));
    h.tap("Enter");
    await h.advance(1);
    expect(h.state()).toMatchObject({
      screen: "countdown",
      mode: "versus",
      winner: null,
      score: { p1: 0, p2: 0 },
    });

    h.pose((s) => h.debug.setScreen(s, "matchover"));
    h.tap("KeyS");
    await h.advance(1);
    expect(h.state().menuIndex).toBe(1);
    h.tap("KeyS");
    await h.advance(1);
    expect(h.state().menuIndex).toBe(0);
    h.tap("ArrowUp");
    await h.advance(1);
    h.tap("Enter");
    await h.advance(1);
    expect(h.state().screen).toBe("title");

    h.pose((s) => h.debug.setScreen(s, "matchover"));
    h.tap("Escape");
    await h.advance(1);
    expect(h.state().screen).toBe("title");
    expect(h.state().mode).toBe("solo");
  });

  it("returns to the title restoring everything but the kept fields", async () => {
    const h = await boot();
    h.pose((s) => h.debug.setTitleIndex(s, 1));
    h.pose((s) => h.debug.setAiTracking(s, false));
    h.pose((s) => h.debug.setPaddleDriven(s, "left", true));
    h.pose((s) => h.debug.clearWorld(s));
    h.pose((s) => h.debug.setScreen(s, "matchover"));
    await h.advance(10);
    h.tap("Escape");
    await h.advance(1);
    const s = h.state();
    expect(s.menuIndex).toBe(1);
    expect(s.titleIndex).toBe(1);
    expect(s.ai.tracking).toBe(true);
    expect(s.paddles.left.driven).toBe(false);
    expect(s.obstacles).toHaveLength(2);
    expect(s.ball?.held).toBe(true);
    expect(s.simTime).toBeCloseTo(11 / 60);
  });

  it("moves over the pause menu with both players' keys", async () => {
    const h = await boot();
    h.pose((s) => h.debug.setScreen(s, "paused"));
    h.tap("ArrowUp");
    await h.advance(1);
    expect(h.state().menuIndex).toBe(2);
    h.tap("KeyS");
    await h.advance(1);
    expect(h.state().menuIndex).toBe(0);
  });
});

describe("pointer and touch", () => {
  it("highlights the item under a moving mouse", async () => {
    const h = await boot();
    const [x, y] = itemCenter(h, 2);
    h.pointer("pointermove", x, y);
    await h.advance(1);
    expect(h.state().menuIndex).toBe(2);
    expect(h.state().screen).toBe("title");
  });

  it("confirms a click whose press and release share an item", async () => {
    const h = await boot();
    const [x, y] = itemCenter(h, 1);
    h.pointer("pointerdown", x, y);
    await h.advance(1);
    expect(h.state().screen).toBe("title");
    h.pointer("pointerup", x + 5, y);
    await h.advance(1);
    expect(h.state().screen).toBe("countdown");
    expect(h.state().mode).toBe("versus");
    expect(h.state().titleIndex).toBe(1);
  });

  it("confirms a press and release that arrive on one frame", async () => {
    const h = await boot();
    const [x, y] = itemCenter(h, 2);
    h.pointer("pointerdown", x, y);
    h.pointer("pointerup", x, y);
    await h.advance(1);
    expect(h.state().screen).toBe("howto");
  });

  it("confirms nothing across two items or outside every item", async () => {
    const h = await boot();
    const [x0, y0] = itemCenter(h, 0);
    const [x1, y1] = itemCenter(h, 1);
    h.pointer("pointerdown", x0, y0);
    await h.advance(1);
    h.pointer("pointermove", x1, y1);
    h.pointer("pointerup", x1, y1);
    await h.advance(1);
    expect(h.state().screen).toBe("title");
    expect(h.state().menuIndex).toBe(1);

    h.pointer("pointerdown", 20, 20);
    h.pointer("pointermove", x1, y1);
    h.pointer("pointerup", x1, y1);
    await h.advance(1);
    expect(h.state().screen).toBe("title");
  });

  it("selects and confirms with a touch contact", async () => {
    const h = await boot();
    const [x0, y0] = itemCenter(h, 0);
    const [x2, y2] = itemCenter(h, 2);
    h.pointer("pointerdown", 20, 20, { device: "touch", id: 7 });
    h.pointer("pointermove", x2, y2, { device: "touch", id: 7 });
    await h.advance(1);
    expect(h.state().menuIndex).toBe(2);
    h.pointer("pointerup", x2, y2, { device: "touch", id: 7 });
    await h.advance(1);
    expect(h.state().screen).toBe("title");

    h.pointer("pointerdown", x0, y0, { device: "touch", id: 8 });
    await h.advance(1);
    h.pointer("pointerup", x0, y0, { device: "touch", id: 8 });
    await h.advance(1);
    expect(h.state().screen).toBe("countdown");
    expect(h.state().mode).toBe("solo");
  });

  it("lets the pointer's selection win over a keyboard move", async () => {
    const h = await boot();
    const [x, y] = itemCenter(h, 2);
    h.tap("KeyS");
    h.pointer("pointermove", x, y);
    await h.advance(1);
    expect(h.state().menuIndex).toBe(2);
  });

  it("lets a keyboard confirm win over a pointer confirm", async () => {
    const h = await boot();
    const [x, y] = itemCenter(h, 2);
    h.tap("Enter");
    h.pointer("pointerdown", x, y);
    h.pointer("pointerup", x, y);
    await h.advance(1);
    expect(h.state().screen).toBe("countdown");
    expect(h.state().titleIndex).toBe(0);
  });

  it("confirms on the pause and match-over menus", async () => {
    const h = await boot();
    h.pose((s) => h.debug.setScreen(s, "paused"));
    const [x, y] = itemCenter(h, 2);
    h.pointer("pointerdown", x, y);
    h.pointer("pointerup", x, y);
    await h.advance(1);
    expect(h.state().screen).toBe("title");

    h.pose((s) => h.debug.setScreen(s, "matchover"));
    const [mx, my] = itemCenter(h, 0);
    h.pointer("pointerdown", mx, my);
    h.pointer("pointerup", mx, my);
    await h.advance(1);
    expect(h.state().screen).toBe("countdown");
  });

  it("ignores the pointer during play", async () => {
    const h = await boot();
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pointer("pointerdown", 640, 400);
    h.pointer("pointerup", 640, 400);
    await h.advance(1);
    expect(h.state().screen).toBe("playing");
    expect(h.debug.menuItemRect(h.state(), 0)).toBeNull();
  });
});
