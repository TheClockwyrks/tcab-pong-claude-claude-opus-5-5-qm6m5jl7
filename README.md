# Carom

Carom is a top-down paddle duel that runs entirely in the browser. Two paddles
face each other across a dark field while a ball ricochets between them, off the
top and bottom walls, and off two pillars standing in mid-field. Score by getting
the ball past the far edge behind your opponent's paddle. First to 11 wins, by a
lead of at least 2.

Its defining mechanic is **spin**: the way your paddle is moving when it strikes
the ball curves the ball's flight afterward, and the spin carries through wall and
pillar bounces as it fades. Where the ball meets the paddle sets its outgoing
angle, and every paddle hit speeds it up.

- **Solo** — you play the left paddle against a CPU opponent.
- **Versus** — two players share one keyboard.

Everything is drawn in code on a canvas; the build ships no art or audio files
and needs no server or credentials. It is built on the Simple 2D engine
(documented under `engine/`), with TypeScript, Vite, and Vitest.

## Install

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Then open the URL Vite prints (by default <http://localhost:5173/>).

## Production build

```sh
npm run build
```

This type-checks and writes the complete static site into `dist/`, with
`dist/index.html` as its entry point. Serve that directory as-is from any static
file server, or preview it locally with `npm run preview`.

## Controls

| Action | Keys |
| --- | --- |
| Player one up / down | `W` / `S` |
| Player two up / down | `↑` / `↓` |
| Confirm a menu item | `Enter` or `Space` |
| Pause / resume | `P` or `Esc` |
| Back (menus) | `Esc` |
| Mute / unmute | `M` |
| Debug overlay | `` ` `` (backtick) |

In Solo, either key pair moves your (left) paddle. Menus also take the mouse and
touch: point at an item to highlight it, click or tap it to choose it. On a
touchscreen, sliders along each edge move the paddles.

**Spin:** move your paddle up or down as you hit the ball to curve its flight.
**Angle:** hit with the paddle's center to send the ball straight, with an end
to send it steeply.

## Development

| Command | Does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier, in check mode |
| `npm test` | The unit tests under `src/**/*.test.ts`, with coverage |

The game lives in `src/`: `game.ts` declares the state and the debug surface and
wires the engine's three functions; `step.ts` is one frame's transition;
`physics.ts` the paddles, AI, and ball; `menus.ts` the menus; `render.ts` the
drawing; `debug.ts` the automation surface. `src/constants.ts` holds every figure
the specification (under `specs/`) fixes.

The store-page media in `showcase/` are captured from the running game with
`node scripts/capture-showcase.mjs`.
