// One frame's transition (`specs/ui.md`, "What advances on each screen"): the
// clock and the mute bit, then the input the screen the frame began on reads,
// then the advance of the screen that input left it on.

import type { UpdateApi } from "@clockwyrks/simple-2d";
import {
  BALL_R,
  CUES,
  FIELD_W,
  PADDLE_SPEED,
  TRAIL_TIME,
  WIN_LEAD,
  WIN_SCORE,
} from "./constants";
import type {
  BallState,
  CaromState,
  PaddleState,
  Side,
  TrailSample,
  View,
} from "./game";
import { menuKeyboard, menuPointer } from "./menus";
import { aiVelocity, flyBall, integratePaddle, serve } from "./physics";
import { parkedBall } from "./world";

type Input = UpdateApi["input"];
type Audio = UpdateApi["audio"];

/**
 * Brings the runtime's mute bit and the state's copy of it together, then
 * applies a `mute` press. A copy that differs from the runtime was posed through
 * the debug surface, so it is pushed to the runtime rather than overwritten.
 */
function syncMute(state: View, input: Input, audio: Audio): boolean {
  if (state.muted !== audio.muted()) audio.setMuted(state.muted);
  if (input.pressed("mute")) audio.setMuted(!audio.muted());
  return audio.muted();
}

/** The input the screen the frame began on reads, and where it leaves the game. */
export function readInput(state: View, api: UpdateApi): CaromState {
  const input = api.input;
  switch (state.screen) {
    case "countdown":
    case "playing":
      if (input.pressed("pause")) {
        return {
          ...state,
          resumeScreen: state.screen,
          screen: "paused",
          menuIndex: 0,
          press: null,
        };
      }
      return { ...state, press: null };
    case "paused": {
      const pause = input.pressed("pause");
      const back = input.pressed("back");
      if (pause || back) {
        return { ...state, screen: state.resumeScreen, press: null };
      }
      return readMenu(state, input);
    }
    case "title":
    case "howto":
    case "matchover":
      return readMenu(state, input);
  }
}

function readMenu(state: View, input: Input): CaromState {
  const keyed = menuKeyboard(state, input);
  if (keyed.confirmed) return { ...keyed.state, press: null };
  return menuPointer(keyed.state, input.pointerSamples());
}

function movementAxis(input: Input, side: Side, solo: boolean): number {
  const held = (name: string): number => (input.value(name) > 0 ? 1 : 0);
  if (solo) {
    const up = Math.max(held("p1-up"), held("p2-up"));
    const down = Math.max(held("p1-down"), held("p2-down"));
    return down - up;
  }
  return side === "left"
    ? held("p1-down") - held("p1-up")
    : held("p2-down") - held("p2-up");
}

/**
 * Moves both paddles for a `countdown` or `playing` frame: a driven paddle at
 * its `drivenVy`, the AI's paddle in Solo by the AI's rule, and every other
 * paddle from the movement actions.
 */
export function movePaddles(
  state: View,
  input: Input,
  dt: number,
): CaromState["paddles"] {
  const solo = state.mode === "solo";
  const move = (side: Side, paddle: PaddleState): PaddleState => {
    let vy: number;
    if (paddle.driven) {
      vy = paddle.drivenVy;
    } else if (solo && side === "right") {
      const seen = { playing: state.screen === "playing", ball: state.ball };
      vy = aiVelocity(state.ai, paddle.cy, seen, dt);
    } else {
      vy = movementAxis(input, side, solo) * PADDLE_SPEED;
    }
    return integratePaddle(paddle, vy, dt);
  };
  return {
    left: move("left", state.paddles.left),
    right: move("right", state.paddles.right),
  };
}

/** Appends the ball's current position and drops samples past `TRAIL_TIME`. */
export function recordTrail(ball: BallState, simTime: number): BallState {
  const sample: TrailSample = { x: ball.x, y: ball.y, t: simTime };
  const trail = [...ball.trail, sample].filter(
    (s) => simTime - s.t <= TRAIL_TIME,
  );
  return { ...ball, trail };
}

/** Whether the win rule holds for `score`, and for which side. */
export function matchWinner(score: View["score"]): Side | null {
  if (score.p1 >= WIN_SCORE && score.p1 - score.p2 >= WIN_LEAD) return "left";
  if (score.p2 >= WIN_SCORE && score.p2 - score.p1 >= WIN_LEAD) return "right";
  return null;
}

/** The side that scores off a ball at `x`, or `null` while it is in the field. */
export function scorer(x: number): Side | null {
  if (x - BALL_R > FIELD_W) return "left";
  if (x + BALL_R < 0) return "right";
  return null;
}

/** Scores a point for `side`: the match ends, or the next serve is set up. */
export function scorePoint(state: CaromState, side: Side): CaromState {
  const score =
    side === "left"
      ? { p1: state.score.p1 + 1, p2: state.score.p2 }
      : { p1: state.score.p1, p2: state.score.p2 + 1 };
  const winner = matchWinner(score);
  if (winner !== null) {
    return { ...state, score, winner, screen: "matchover", menuIndex: 0 };
  }
  return {
    ...state,
    score,
    ball: parkedBall(),
    receiver: side === "left" ? "right" : "left",
    screen: "countdown",
  };
}

/**
 * Advances a `countdown` or `playing` frame: the paddles, then the ball's hold
 * or its flight, then its trail, then scoring. Every other screen advances
 * nothing.
 */
export function advance(state: View, api: UpdateApi, dt: number): CaromState {
  if (state.screen !== "countdown" && state.screen !== "playing") {
    return { ...state };
  }
  const next: CaromState = {
    ...state,
    paddles: movePaddles(state, api.input, dt),
  };
  if (next.ball === null) return next;

  let ball: BallState = next.ball;
  let screen = next.screen;
  if (screen === "countdown" || ball.held) {
    const holdTimer = ball.holdTimer - dt;
    if (holdTimer <= 0) {
      ball = serve(ball, next.receiver);
      screen = "playing";
    } else {
      ball = { ...ball, holdTimer };
    }
    return { ...next, screen, ball: recordTrail(ball, next.simTime) };
  }

  const flight = flyBall(ball, next, dt);
  if (flight.events.paddleHit) api.audio.play(CUES.paddleHit);
  if (flight.events.wallBounce) api.audio.play(CUES.wallBounce);
  if (flight.events.obstacleBounce) api.audio.play(CUES.obstacleBounce);
  ball = recordTrail(flight.ball, next.simTime);

  const side = scorer(ball.x);
  if (side === null) return { ...next, ball };
  api.audio.play(CUES.score);
  return scorePoint({ ...next, ball }, side);
}

/** One frame of Carom. */
export function stepGame(state: View, api: UpdateApi, dt: number): CaromState {
  const muted = syncMute(state, api.input, api.audio);
  const timed: CaromState = { ...state, simTime: state.simTime + dt, muted };
  const read = readInput(timed, api);
  return advance(read, api, dt);
}
