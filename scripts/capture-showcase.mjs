// Captures the showcase media (`specs/showcase.md`) from the running game.
//
//   node scripts/capture-showcase.mjs
//
// Serves the project with Vite's dev server, opens it in headless Chromium, and
// builds a second engine over an offscreen canvas in the page, bound to the same
// `game`. It poses each scene through the debug surface, steps it with a
// constant clock, and writes what the game drew into `showcase/`: PNG
// screenshots, and a gzipped draw-command recording of a rally made with the
// engine's recorder. Nothing here is part of the shipped build.

// Node globals here, and `document` inside the page function.
/* global Buffer, URL, console, document, fetch */

import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";
import { createServer } from "vite";

const OUT = new URL("../showcase/", import.meta.url);

const server = await createServer({
  server: { port: 5199, strictPort: true },
  logLevel: "error",
});
await server.listen();

const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  await page.goto("http://localhost:5199/");

  // Where the dev server serves the engine from, read off the entry point it
  // has already rewritten.
  const main = await (await fetch("http://localhost:5199/src/main.ts")).text();
  const engineUrl = /from\s+"([^"]*simple-2d[^"]*)"/.exec(main)?.[1];
  if (!engineUrl) throw new Error("could not locate the engine module");

  const media = await page.evaluate(async (engineUrl) => {
    const { createEngine, ConstantClock } = await import(engineUrl);
    const { game, BACKGROUND } = await import("/src/game.ts");

    const canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:fixed;left:0;top:0;width:1280px;height:720px;z-index:9";
    document.body.appendChild(canvas);
    const engine = createEngine({
      canvas,
      width: 1280,
      height: 720,
      game,
      background: BACKGROUND,
      layout: "dual-vertical",
      clock: new ConstantClock(1000 / 60),
    });
    await engine.initialize();
    const d = engine.debug;
    const pose = (f) => engine.apply(f);
    const shot = () => canvas.toDataURL("image/png");
    const out = {};

    // The title screen.
    await engine.advance(1);
    out["title.png"] = shot();

    // A Versus rally, both paddles steered from here: each tracks the ball,
    // aiming a little off-centre for an angle and still moving as it strikes,
    // so the returns carry spin.
    pose((s) => d.setMode(s, "versus"));
    pose((s) => d.setScreen(s, "countdown"));
    pose((s) => d.setReceiver(s, "right"));
    pose((s) => d.setBallServeSign(s, -1));
    pose((s) => d.setBallHoldTimer(s, 0.35));
    pose((s) => d.setPaddleDriven(s, "left", true));
    pose((s) => d.setPaddleDriven(s, "right", true));
    const steer = (frame) => {
      const s = engine.state;
      const ball = s.ball;
      for (const side of ["left", "right"]) {
        const paddle = s.paddles[side];
        const coming = ball && (side === "left" ? ball.vx < 0 : ball.vx > 0);
        const aim = side === "left" ? 34 : -30;
        const wobble = Math.sin(frame / 37 + (side === "left" ? 0 : 2)) * 22;
        const target = coming ? ball.y + aim + wobble : 360 + wobble;
        const vy = Math.max(-720, Math.min(720, (target - paddle.cy) * 9));
        pose((st) => d.setPaddleVy(st, side, vy));
      }
    };
    for (let f = 0; f < 30; f++) {
      steer(f);
      await engine.advance(1);
    }
    engine.startRecording();
    let best = { score: -1, png: "" };
    for (let f = 30; f < 390; f++) {
      steer(f);
      await engine.advance(1);
      const s = engine.state;
      // Keep the frame that best shows a curving ball with its trail, clear of
      // the paddles.
      if (s.ball && s.screen === "playing" && f % 3 === 0) {
        const curve = Math.abs(s.ball.spin);
        const centred = 1 - Math.abs(s.ball.x - 640) / 640;
        const score = curve * centred + s.ball.trail.length;
        if (score > best.score) best = { score, png: shot() };
      }
    }
    out["rally.json"] = JSON.stringify(engine.stopRecording());
    out["rally.png"] = best.png;

    // A finished Solo match.
    pose((s) => d.setMode(s, "solo"));
    pose((s) => d.setScore(s, 11, 8));
    pose((s) => d.setWinner(s, "left"));
    pose((s) => d.setScreen(s, "matchover"));
    pose((s) => d.setMenuIndex(s, 0));
    await engine.advance(1);
    out["matchover.png"] = shot();
    return out;
  }, engineUrl);

  await mkdir(OUT, { recursive: true });
  for (const [name, value] of Object.entries(media)) {
    if (name.endsWith(".png")) {
      const bytes = Buffer.from(value.split(",")[1], "base64");
      await writeFile(new URL(name, OUT), bytes);
      console.log(`${name}: ${bytes.length} bytes`);
    } else {
      const bytes = gzipSync(value, { level: 9 });
      await writeFile(new URL(`${name}.gz`, OUT), bytes);
      console.log(`${name}.gz: ${bytes.length} bytes`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
