export type UIState = "LOADING" | "START" | "COUNTDOWN" | "PLAYING" | "END" | "ERROR";

export interface GamePoint {
  x: number;
  y: number;
}

export interface GameBall extends GamePoint {
  vx: number;
  vy: number;
  speed: number;
}

export interface GameStateRef {
  status: UIState;
  ball: GameBall;
  scores: { left: number; right: number };
  leftPaddle: GamePoint | null;
  rightPaddle: GamePoint | null;
  lastBounceTime: number;
  lastTouchSide: "LEFT" | "RIGHT" | null;
  consecutiveTouches: number;
  isSmash: boolean;
}

export interface PaddleTrackingRef {
  smoothed: GamePoint | null;
  previousRaw: GamePoint | null;
  velocity: GamePoint;
  lastSeenTime: number;
}
