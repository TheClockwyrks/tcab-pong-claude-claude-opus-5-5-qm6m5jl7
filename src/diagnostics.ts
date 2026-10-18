// The values Carom shows on the engine's debug overlay
// (`specs/instrumentation.md`, "Diagnostics"). Every source is a pure read of
// the state it is handed.

import type { InitApi } from "@clockwyrks/simple-2d";
import type { CaromState, PaddleState, View } from "./game";

const NONE = "none";

function fmt(value: number): string {
  return value.toFixed(1);
}

function paddleLine(paddle: PaddleState): string {
  const driven = paddle.driven ? " (driven)" : "";
  return `cy ${fmt(paddle.cy)} vy ${fmt(paddle.vy)}${driven}`;
}

/** Every diagnostic source, by the name the overlay draws it under. */
export const DIAGNOSTIC_SOURCES: readonly [
  string,
  (state: View) => string | number | boolean,
][] = [
  ["screen", (s) => s.screen],
  ["mode", (s) => s.mode],
  ["score", (s) => `${s.score.p1} - ${s.score.p2}`],
  ["ball pos", (s) => (s.ball ? `${fmt(s.ball.x)}, ${fmt(s.ball.y)}` : NONE)],
  ["ball vel", (s) => (s.ball ? `${fmt(s.ball.vx)}, ${fmt(s.ball.vy)}` : NONE)],
  [
    "ball speed",
    (s) => (s.ball ? fmt(Math.hypot(s.ball.vx, s.ball.vy)) : NONE),
  ],
  ["ball spin", (s) => (s.ball ? fmt(s.ball.spin) : NONE)],
  ["paddle L", (s) => paddleLine(s.paddles.left)],
  ["paddle R", (s) => paddleLine(s.paddles.right)],
];

export function registerDiagnostics(
  diagnostics: InitApi<CaromState>["diagnostics"],
): void {
  for (const [name, source] of DIAGNOSTIC_SOURCES) {
    diagnostics.register(name, source);
  }
}
