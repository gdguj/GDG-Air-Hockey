import { FOOTER_HEIGHT, HAND_RADIUS, HEADER_HEIGHT } from "../constants";
import type { GameBall, GamePoint } from "../types";

export function clampPointToPlayArea(
  point: GamePoint,
  canvasWidth: number,
  canvasHeight: number,
): GamePoint {
  return {
    x: Math.min(canvasWidth - HAND_RADIUS, Math.max(HAND_RADIUS, point.x)),
    y: Math.min(canvasHeight - FOOTER_HEIGHT - HAND_RADIUS, Math.max(HEADER_HEIGHT + HAND_RADIUS, point.y)),
  };
}

export function getPaddleCollisionNormal(
  ball: GameBall,
  point: GamePoint,
  side: "LEFT" | "RIGHT",
) {
  const dx = ball.x - point.x;
  const dy = ball.y - point.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance > 0.0001) {
    return {
      distance,
      nx: dx / distance,
      ny: dy / distance,
    };
  }

  const fallbackX = side === "LEFT" ? 1 : -1;
  let nx = Number.isFinite(ball.vx) && ball.vx !== 0 ? Math.sign(ball.vx) : fallbackX;
  let ny = Number.isFinite(ball.vy) && ball.vy !== 0 ? Math.sign(ball.vy) : 0.25;
  const fallbackLength = Math.sqrt(nx * nx + ny * ny) || 1;
  nx /= fallbackLength;
  ny /= fallbackLength;

  return { distance, nx, ny };
}

export function getSafePaddleVelocity(ball: GameBall, side: "LEFT" | "RIGHT") {
  let vx = ball.vx;
  let vy = ball.vy;

  if (!Number.isFinite(vx)) vx = side === "LEFT" ? ball.speed : -ball.speed;
  if (!Number.isFinite(vy)) vy = ball.speed * 0.25;
  if (Math.abs(vx) < 2) vx = vx < 0 ? -2 : 2;
  if (Math.abs(vy) < 2) vy = vy < 0 ? -2 : 2;

  return { vx, vy };
}
