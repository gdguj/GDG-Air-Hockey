import {
  BALL_RADIUS,
  FOOTER_HEIGHT,
  GDG_BLUE,
  GDG_GREEN,
  GDG_RED,
  GDG_YELLOW,
  HAND_RADIUS,
  HEADER_HEIGHT,
} from "../constants";
import type { GameBall, GamePoint } from "../types";

export function drawCameraBackground(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
  ctx.restore();

  ctx.fillStyle = "rgba(0, 0, 15, 0.12)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.006)";
  for (let y = 0; y < canvas.height; y += 8) {
    ctx.fillRect(0, y, canvas.width, 1);
  }
}

export function drawRink(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  goalTop: number,
  goalBottom: number,
) {
  const gateW = 20;
  ctx.fillStyle = "rgba(234, 67, 53, 0.45)";
  ctx.fillRect(0, HEADER_HEIGHT, gateW, goalTop - HEADER_HEIGHT);
  ctx.fillRect(0, goalBottom, gateW, canvas.height - FOOTER_HEIGHT - goalBottom);

  ctx.fillStyle = "rgba(66, 133, 244, 0.45)";
  ctx.fillRect(canvas.width - gateW, HEADER_HEIGHT, gateW, goalTop - HEADER_HEIGHT);
  ctx.fillRect(canvas.width - gateW, goalBottom, gateW, canvas.height - FOOTER_HEIGHT - goalBottom);

  ctx.shadowBlur = 18;
  ctx.shadowColor = GDG_GREEN;
  ctx.strokeStyle = GDG_GREEN;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(gateW, goalTop);
  ctx.lineTo(0, goalTop);
  ctx.lineTo(0, goalBottom);
  ctx.lineTo(gateW, goalBottom);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(canvas.width - gateW, goalTop);
  ctx.lineTo(canvas.width, goalTop);
  ctx.lineTo(canvas.width, goalBottom);
  ctx.lineTo(canvas.width - gateW, goalBottom);
  ctx.stroke();
  ctx.shadowBlur = 0;

  const midGrad = ctx.createLinearGradient(canvas.width / 2 - 2, 0, canvas.width / 2 + 2, 0);
  midGrad.addColorStop(0, "rgba(255,255,255,0)");
  midGrad.addColorStop(0.5, "rgba(255,255,255,0.25)");
  midGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = midGrad;
  ctx.fillRect(canvas.width / 2 - 2, HEADER_HEIGHT, 4, canvas.height - HEADER_HEIGHT - FOOTER_HEIGHT);

  ctx.save();
  ctx.setLineDash([18, 12]);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, HEADER_HEIGHT);
  ctx.lineTo(canvas.width / 2, canvas.height - FOOTER_HEIGHT);
  ctx.stroke();
  ctx.restore();
}

export function drawPaddleCircle(
  ctx: CanvasRenderingContext2D,
  point: GamePoint | null,
  isLeft: boolean,
) {
  if (!point) return;
  const neonColor = isLeft ? GDG_RED : GDG_BLUE;
  const fillColor = isLeft ? "rgba(234,67,53,0.08)" : "rgba(66,133,244,0.08)";
  const outerGlowColor = isLeft ? "rgba(234,67,53,0.07)" : "rgba(66,133,244,0.07)";
  const label = isLeft ? "PLAYER A" : "PLAYER B";

  ctx.beginPath();
  ctx.arc(point.x, point.y, HAND_RADIUS + 8, 0, 2 * Math.PI);
  ctx.fillStyle = outerGlowColor;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(point.x, point.y, HAND_RADIUS, 0, 2 * Math.PI);
  ctx.fillStyle = fillColor;
  ctx.fill();

  ctx.shadowBlur = 22;
  ctx.shadowColor = neonColor;
  ctx.lineWidth = 3;
  ctx.strokeStyle = neonColor;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = `${neonColor}99`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(point.x - HAND_RADIUS * 0.6, point.y);
  ctx.lineTo(point.x + HAND_RADIUS * 0.6, point.y);
  ctx.moveTo(point.x, point.y - HAND_RADIUS * 0.6);
  ctx.lineTo(point.x, point.y + HAND_RADIUS * 0.6);
  ctx.stroke();

  ctx.shadowBlur = 12;
  ctx.shadowColor = neonColor;
  ctx.fillStyle = neonColor;
  ctx.font = "bold 13px 'Nunito', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, point.x, point.y + HAND_RADIUS + 18);
  ctx.shadowBlur = 0;
}

export function drawBall(
  ctx: CanvasRenderingContext2D,
  ball: GameBall,
  isSmash: boolean,
  isCharging: boolean,
) {
  const coreColor = isSmash ? "#FF1010" : isCharging ? "#FF8000" : "#FFE000";
  const glowColor = isSmash ? "#FF0000" : isCharging ? "#FF6000" : GDG_YELLOW;
  const auraRadius = isSmash ? BALL_RADIUS * 4 : isCharging ? BALL_RADIUS * 3.5 : BALL_RADIUS * 3;
  const auraAlpha = isSmash ? 0.75 : 0.6;
  const auraAlpha2 = isSmash ? 0.35 : 0.2;

  const ballGrad = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, auraRadius);
  ballGrad.addColorStop(0, `rgba(${isSmash ? "255,30,30" : isCharging ? "255,120,0" : "255,235,50"},${auraAlpha})`);
  ballGrad.addColorStop(0.4, `rgba(${isSmash ? "255,0,0" : isCharging ? "255,80,0" : "255,120,0"},${auraAlpha2})`);
  ballGrad.addColorStop(1, "rgba(255,0,0,0)");
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, auraRadius, 0, 2 * Math.PI);
  ctx.fillStyle = ballGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, 2 * Math.PI);
  ctx.shadowBlur = isSmash ? 40 : 25;
  ctx.shadowColor = glowColor;
  ctx.fillStyle = coreColor;
  ctx.fill();

  if (isSmash) {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_RADIUS + 8, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(255,50,50,0.6)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(ball.x - BALL_RADIUS * 0.3, ball.y - BALL_RADIUS * 0.35, BALL_RADIUS * 0.35, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.shadowBlur = 0;
  ctx.fill();
}
