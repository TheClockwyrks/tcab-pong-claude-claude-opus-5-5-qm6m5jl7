// Drawing a state. Everything is drawn in the field's logical 1280x720 units on
// the context the engine hands `render`, already cleared to BACKGROUND and
// carrying the letterbox transform. Nothing here reads or changes the state
// beyond what it is handed.

import {
  BALL_R,
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  NET_X,
  OBSTACLE_H,
  OBSTACLE_W,
  P1_X0,
  P2_X0,
  PADDLE_H,
  PADDLE_HALF,
  PADDLE_W,
  TITLE_TEXT,
} from "./constants";
import type { View } from "./game";
import { menuItemRect, menuItems } from "./menus";

/** The palette. The field background itself is `BACKGROUND` in game.ts. */
export const COLORS = {
  grid: "rgba(120, 150, 255, 0.05)",
  rail: "rgba(140, 170, 255, 0.35)",
  net: "rgba(200, 215, 255, 0.22)",
  left: "#33e0ff",
  right: "#ff4f9a",
  ball: "#fff6d6",
  obstacle: "#b48cff",
  text: "#e8ecff",
  dim: "rgba(232, 236, 255, 0.55)",
  accent: "#ffd166",
  shade: "rgba(6, 9, 18, 0.72)",
} as const;

const FONT = "'Trebuchet MS', 'Segoe UI', Helvetica, Arial, sans-serif";

type Ctx = CanvasRenderingContext2D;

function font(size: number, weight = 700): string {
  return `${weight} ${size}px ${FONT}`;
}

function roundRectPath(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function glowFill(ctx: Ctx, color: string, blur: number): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function text(
  ctx: Ctx,
  copy: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = "center",
  weight = 700,
): void {
  ctx.font = font(size, weight);
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(copy, x, y);
}

// ---- The field -----------------------------------------------------------

function drawBackdrop(ctx: Ctx): void {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 40; x < FIELD_W; x += 80) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, FIELD_H);
  }
  for (let y = 40; y < FIELD_H; y += 80) {
    ctx.moveTo(0, y);
    ctx.lineTo(FIELD_W, y);
  }
  ctx.stroke();

  // The two walls, as bright rails along the top and bottom edges.
  ctx.save();
  ctx.strokeStyle = COLORS.rail;
  ctx.shadowColor = COLORS.rail;
  ctx.shadowBlur = 12;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 1.5);
  ctx.lineTo(FIELD_W, 1.5);
  ctx.moveTo(0, FIELD_H - 1.5);
  ctx.lineTo(FIELD_W, FIELD_H - 1.5);
  ctx.stroke();
  ctx.restore();

  // The center circle around the ball's home point.
  ctx.strokeStyle = COLORS.net;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(FIELD_CX, FIELD_CY, 64, 0, Math.PI * 2);
  ctx.stroke();
}

function drawNet(ctx: Ctx): void {
  ctx.save();
  ctx.strokeStyle = COLORS.net;
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 16]);
  ctx.beginPath();
  ctx.moveTo(NET_X, 8);
  ctx.lineTo(NET_X, FIELD_H - 8);
  ctx.stroke();
  ctx.restore();
}

function drawPaddle(ctx: Ctx, x0: number, cy: number, color: string): void {
  roundRectPath(ctx, x0, cy - PADDLE_HALF, PADDLE_W, PADDLE_H, PADDLE_W / 2);
  glowFill(ctx, color, 22);
  // A bright core line down the paddle's face.
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.fillRect(
    x0 + PADDLE_W / 2 - 1.5,
    cy - PADDLE_HALF + 10,
    3,
    PADDLE_H - 20,
  );
}

function drawObstacles(ctx: Ctx, state: View): void {
  for (const o of state.obstacles) {
    const x = o.cx - OBSTACLE_W / 2;
    const y = o.cy - OBSTACLE_H / 2;
    roundRectPath(ctx, x, y, OBSTACLE_W, OBSTACLE_H, 7);
    glowFill(ctx, COLORS.obstacle, 18);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 2;
    roundRectPath(ctx, x + 4, y + 4, OBSTACLE_W - 8, OBSTACLE_H - 8, 4);
    ctx.stroke();
  }
}

function drawTrail(ctx: Ctx, state: View): void {
  const ball = state.ball;
  if (ball === null || ball.trail.length < 2) return;
  const trail = ball.trail;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Each segment grows wider and brighter toward the ball.
  for (let i = 1; i < trail.length; i++) {
    const k = i / (trail.length - 1);
    ctx.strokeStyle = `rgba(255, 214, 140, ${(0.05 + 0.5 * k).toFixed(3)})`;
    ctx.lineWidth = 2 + (BALL_R * 2 - 4) * k;
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBall(ctx: Ctx, state: View): void {
  const ball = state.ball;
  if (ball === null) return;
  drawTrail(ctx, state);
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  glowFill(ctx, COLORS.ball, 26);

  // Spin shows as an arc swept around the ball, its length the spin's strength
  // and its direction the way the flight is curving.
  const strength = Math.min(1, Math.abs(ball.spin) / 900);
  if (strength > 0.05) {
    const start = state.simTime * 14 * Math.sign(ball.spin);
    ctx.save();
    ctx.strokeStyle = COLORS.accent;
    ctx.globalAlpha = 0.4 + 0.6 * strength;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      ball.x,
      ball.y,
      BALL_R + 6,
      start,
      start + Math.PI * 1.6 * strength,
    );
    ctx.stroke();
    ctx.restore();
  }
}

function drawField(ctx: Ctx, state: View): void {
  drawBackdrop(ctx);
  drawNet(ctx);
  drawObstacles(ctx, state);
  drawPaddle(ctx, P1_X0, state.paddles.left.cy, COLORS.left);
  drawPaddle(ctx, P2_X0, state.paddles.right.cy, COLORS.right);
  drawBall(ctx, state);
}

function modeLabel(state: View): string {
  return state.mode === "solo" ? "SOLO  ·  VS CPU" : "VERSUS  ·  LOCAL";
}

function drawHud(ctx: Ctx, state: View): void {
  ctx.save();
  ctx.shadowBlur = 16;
  ctx.shadowColor = COLORS.left;
  text(ctx, String(state.score.p1), FIELD_CX - 90, 64, 64, COLORS.left);
  ctx.shadowColor = COLORS.right;
  text(ctx, String(state.score.p2), FIELD_CX + 90, 64, 64, COLORS.right);
  ctx.restore();
  text(ctx, modeLabel(state), FIELD_CX, FIELD_H - 26, 16, COLORS.dim);
  text(
    ctx,
    state.mode === "solo" ? "YOU" : "P1",
    FIELD_CX - 90,
    112,
    14,
    COLORS.dim,
  );
  text(
    ctx,
    state.mode === "solo" ? "CPU" : "P2",
    FIELD_CX + 90,
    112,
    14,
    COLORS.dim,
  );
  if (state.muted)
    text(ctx, "MUTED", FIELD_W - 24, 26, 14, COLORS.dim, "right");
}

function drawCountdown(ctx: Ctx, state: View): void {
  const ball = state.ball;
  if (ball === null) return;
  const left = Math.max(0, Math.min(1, ball.holdTimer / HOLD_TIME));
  ctx.save();
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(
    FIELD_CX,
    FIELD_CY,
    40,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * left,
  );
  ctx.stroke();
  ctx.restore();
  const toward = state.receiver === "left" ? "◀  SERVE" : "SERVE  ▶";
  text(ctx, toward, FIELD_CX, FIELD_CY + 76, 18, COLORS.accent);
}

// ---- Menus ---------------------------------------------------------------

function drawMenu(ctx: Ctx, state: View): void {
  const items = menuItems(state.screen);
  items.forEach((label, i) => {
    const r = menuItemRect(state.screen, i);
    if (r === null) return;
    const selected = i === state.menuIndex;
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 12);
    if (selected) {
      glowFill(ctx, COLORS.accent, 20);
      text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, 24, "#1a1206");
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      ctx.fill();
      ctx.strokeStyle = "rgba(232, 236, 255, 0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();
      text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, 22, COLORS.text);
    }
  });
}

function shade(ctx: Ctx): void {
  ctx.fillStyle = COLORS.shade;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

function drawTitle(ctx: Ctx, state: View): void {
  ctx.save();
  ctx.globalAlpha = 0.35;
  drawField(ctx, state);
  ctx.restore();
  shade(ctx);

  ctx.save();
  ctx.shadowColor = COLORS.left;
  ctx.shadowBlur = 30;
  text(ctx, TITLE_TEXT, FIELD_CX - 3, 210, 132, COLORS.left, "center", 800);
  ctx.shadowColor = COLORS.right;
  text(ctx, TITLE_TEXT, FIELD_CX + 3, 213, 132, COLORS.right, "center", 800);
  ctx.restore();
  text(ctx, TITLE_TEXT, FIELD_CX, 211, 132, COLORS.text, "center", 800);
  text(
    ctx,
    "A PADDLE DUEL OF SPIN AND BANK SHOTS",
    FIELD_CX,
    300,
    18,
    COLORS.dim,
  );
  drawMenu(ctx, state);
  text(
    ctx,
    "W / S  or  ↑ / ↓  to choose  ·  ENTER to play  ·  M to mute",
    FIELD_CX,
    FIELD_H - 30,
    15,
    COLORS.dim,
    "center",
    400,
  );
}

const HOWTO_LINES: readonly (readonly [string, string])[] = [
  ["MOVE", "Player one: W / S.   Player two: ↑ / ↓.   Solo: either pair."],
  ["SCORE", "Get the ball past the far edge behind your opponent's paddle."],
  [
    "ANGLE",
    "Hit off the paddle's center to go straight, off its ends to angle.",
  ],
  [
    "SPIN",
    "Move as you strike: the ball curves the way your paddle was going.",
  ],
  ["BANK", "The two pillars in mid-field deflect the ball. Use them."],
  ["WIN", "First to 11, and you must lead by 2."],
  ["KEYS", "P or Esc pauses.   M mutes.   Enter or Space confirms."],
];

function drawHowto(ctx: Ctx, state: View): void {
  ctx.save();
  ctx.globalAlpha = 0.2;
  drawField(ctx, state);
  ctx.restore();
  shade(ctx);
  text(ctx, "HOW TO PLAY", FIELD_CX, 90, 52, COLORS.text, "center", 800);
  HOWTO_LINES.forEach(([head, body], i) => {
    const y = 180 + i * 56;
    text(ctx, head, 300, y, 20, COLORS.accent, "right");
    text(ctx, body, 330, y, 20, COLORS.text, "left", 400);
  });
  drawMenu(ctx, state);
}

function drawPaused(ctx: Ctx, state: View): void {
  drawField(ctx, state);
  drawHud(ctx, state);
  shade(ctx);
  text(ctx, "PAUSED", FIELD_CX, 220, 64, COLORS.text, "center", 800);
  drawMenu(ctx, state);
}

function drawMatchover(ctx: Ctx, state: View): void {
  drawField(ctx, state);
  shade(ctx);
  const left = state.winner === "left";
  const color = left ? COLORS.left : COLORS.right;
  const headline =
    state.mode === "solo"
      ? left
        ? "YOU WIN"
        : "CPU WINS"
      : left
        ? "PLAYER ONE WINS"
        : "PLAYER TWO WINS";
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 28;
  text(ctx, headline, FIELD_CX, 200, 72, color, "center", 800);
  ctx.restore();
  text(
    ctx,
    `${state.score.p1}  –  ${state.score.p2}`,
    FIELD_CX,
    310,
    56,
    COLORS.text,
  );
  text(ctx, "FINAL SCORE", FIELD_CX, 360, 16, COLORS.dim);
  drawMenu(ctx, state);
}

/** Draws the screen `state` is on. */
export function renderGame(state: View, ctx: Ctx): void {
  switch (state.screen) {
    case "title":
      drawTitle(ctx, state);
      return;
    case "howto":
      drawHowto(ctx, state);
      return;
    case "countdown":
      drawField(ctx, state);
      drawHud(ctx, state);
      drawCountdown(ctx, state);
      return;
    case "playing":
      drawField(ctx, state);
      drawHud(ctx, state);
      return;
    case "paused":
      drawPaused(ctx, state);
      return;
    case "matchover":
      drawMatchover(ctx, state);
      return;
  }
}
