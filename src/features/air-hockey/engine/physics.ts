import {
  BALL_FRICTION,
  BALL_INITIAL_SPEED,
  BALL_RADIUS,
  FOOTER_HEIGHT,
  HEADER_HEIGHT,
  TARGET_FRAME_MS,
} from "../constants";
import type { GameBall } from "../types";

export function getFrameScale(now: number, previousFrameTime: number | null) {
  const resolvedPreviousFrameTime = previousFrameTime ?? now;
  const deltaMs = Math.min(50, Math.max(0, now - resolvedPreviousFrameTime));
  return deltaMs / TARGET_FRAME_MS || 1;
}

export function createCenteredBall(canvasWidth: number, canvasHeight: number): GameBall {
  return {
    x: canvasWidth / 2,
    y: (canvasHeight - HEADER_HEIGHT - FOOTER_HEIGHT) / 2 + HEADER_HEIGHT,
    vx: 0,
    vy: 0,
    speed: BALL_INITIAL_SPEED,
  };
}

export function createLaunchVelocity() {
  const angle =
    (Math.random() * Math.PI) / 2 -
    Math.PI / 4 +
    (Math.random() > 0.5 ? 0 : Math.PI);

  return {
    vx: Math.cos(angle) * BALL_INITIAL_SPEED,
    vy: Math.sin(angle) * BALL_INITIAL_SPEED,
  };
}

export function applyBallFrictionAndMovement(ball: GameBall, frameScale: number) {
  const friction = Math.pow(BALL_FRICTION, frameScale);
  ball.vx *= friction;
  ball.vy *= friction;
  ball.speed *= friction;
  ball.x += ball.vx * frameScale;
  ball.y += ball.vy * frameScale;
}

export function bounceBallOffHorizontalWalls(ball: GameBall, canvasHeight: number) {
  if (ball.y - BALL_RADIUS <= HEADER_HEIGHT) {
    ball.y = HEADER_HEIGHT + BALL_RADIUS;
    ball.vy = Math.abs(ball.vy);
  } else if (ball.y + BALL_RADIUS >= canvasHeight - FOOTER_HEIGHT) {
    ball.y = canvasHeight - FOOTER_HEIGHT - BALL_RADIUS;
    ball.vy = -Math.abs(ball.vy);
  }
}
