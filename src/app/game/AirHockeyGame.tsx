"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import type {
  HandLandmarker,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import {
  BALL_INITIAL_SPEED,
  BALL_RADIUS,
  DETECTION_INTERVAL_MS,
  FAST_HAND_SPEED,
  FOOTER_HEIGHT,
  GDG_BLUE,
  GDG_GREEN,
  GDG_RED,
  GDG_YELLOW,
  HAND_PREDICTION_FACTOR,
  HAND_RADIUS,
  HEADER_HEIGHT,
  MAX_HAND_SMOOTHING,
  MAX_SPEED,
  MIN_HAND_SMOOTHING,
  SMASH_SPEED,
  SMOOTHING_FACTOR_LEFT,
  SMOOTHING_FACTOR_RIGHT,
  SPEED_INCREMENT,
  TRACKING_GRACE_MS,
  WINNING_SCORE,
} from "@/features/air-hockey/constants";
import {
  clampPointToPlayArea as clampPointToPlayAreaHelper,
  getPaddleCollisionNormal,
  getSafePaddleVelocity,
} from "@/features/air-hockey/engine/collision";
import {
  applyBallFrictionAndMovement,
  bounceBallOffHorizontalWalls,
  createCenteredBall,
  createLaunchVelocity,
  getFrameScale,
} from "@/features/air-hockey/engine/physics";
import {
  drawBall,
  drawCameraBackground,
  drawPaddleCircle,
  drawRink,
} from "@/features/air-hockey/renderer/canvas";
import { createHandLandmarker } from "@/features/air-hockey/services/mediapipe";
import type { GamePoint, GameStateRef, PaddleTrackingRef, UIState } from "@/features/air-hockey/types";
import logoImg from "@/app/icon.png";

function GDGTitle({ text }: { text: string }) {
  const colors = [GDG_BLUE, GDG_RED, GDG_YELLOW, GDG_GREEN];
  return (
    <>
      {text.split("").map((ch, i) => (
        <span key={i} style={{ color: ch === " " ? "transparent" : colors[i % colors.length] }}>
          {ch}
        </span>
      ))}
    </>
  );
}

export default function AirHockeyGame() {
  const [uiState, setUiState] = useState<UIState>("LOADING");
  const [scores, setScores] = useState({ left: 0, right: 0 });
  const [countdown, setCountdown] = useState<number | string>(3);
  const [winner, setWinner] = useState("");
  const [statusText, setStatusText] = useState("Loading AI Hand Engine...");
  const [errorMessage, setErrorMessage] = useState("");
  const [playerCount, setPlayerCount] = useState(0);
  const [smashFlash, setSmashFlash] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastDetectionTimeRef = useRef(0);
  const lastFrameTimeRef = useRef<number | null>(null);

  const leftTrackingRef = useRef<PaddleTrackingRef>({
    smoothed: null,
    previousRaw: null,
    velocity: { x: 0, y: 0 },
    lastSeenTime: 0,
  });
  const rightTrackingRef = useRef<PaddleTrackingRef>({
    smoothed: null,
    previousRaw: null,
    velocity: { x: 0, y: 0 },
    lastSeenTime: 0,
  });

  const gameState = useRef<GameStateRef>({
    status: "LOADING",
    ball: {
      x: typeof window !== "undefined" ? window.innerWidth / 2 : 640,
      y: typeof window !== "undefined" ? window.innerHeight / 2 : 360,
      vx: 0,
      vy: 0,
      speed: BALL_INITIAL_SPEED,
    },
    scores: { left: 0, right: 0 },
    leftPaddle: null,
    rightPaddle: null,
    lastBounceTime: 0,
    lastTouchSide: null,
    consecutiveTouches: 0,
    isSmash: false,
  });

  const updateUiState = useCallback((newState: UIState) => {
    gameState.current.status = newState;
    setUiState(newState);
  }, []);

  const updateScores = useCallback((left: number, right: number) => {
    gameState.current.scores = { left, right };
    setScores({ left, right });
  }, []);

  const handleResize = useCallback(() => {
    if (canvasRef.current) {
      canvasRef.current.width = window.innerWidth;
      canvasRef.current.height = window.innerHeight;
    }
  }, []);

  const clampPointToPlayArea = useCallback((point: GamePoint, canvas: HTMLCanvasElement): GamePoint => ({
    ...clampPointToPlayAreaHelper(point, canvas.width, canvas.height),
  }), []);

  const updateTrackedPaddle = useCallback((
    tracker: React.MutableRefObject<PaddleTrackingRef>,
    rawTarget: GamePoint | null,
    canvas: HTMLCanvasElement,
    now: number,
    baseSmoothing: number,
  ) => {
    const state = tracker.current;

    if (rawTarget) {
      const clampedRaw = clampPointToPlayArea(rawTarget, canvas);
      const velocity = state.previousRaw
        ? {
          x: clampedRaw.x - state.previousRaw.x,
          y: clampedRaw.y - state.previousRaw.y,
        }
        : { x: 0, y: 0 };
      const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
      const adaptiveAmount = Math.min(1, speed / FAST_HAND_SPEED);
      const smoothing = Math.min(
        MAX_HAND_SMOOTHING,
        Math.max(
          MIN_HAND_SMOOTHING,
          MIN_HAND_SMOOTHING + adaptiveAmount * (MAX_HAND_SMOOTHING - MIN_HAND_SMOOTHING),
          baseSmoothing * 0.8,
        ),
      );
      const predicted = clampPointToPlayArea({
        x: clampedRaw.x + velocity.x * HAND_PREDICTION_FACTOR,
        y: clampedRaw.y + velocity.y * HAND_PREDICTION_FACTOR,
      }, canvas);

      state.smoothed = state.smoothed
        ? {
          x: state.smoothed.x + smoothing * (predicted.x - state.smoothed.x),
          y: state.smoothed.y + smoothing * (predicted.y - state.smoothed.y),
        }
        : predicted;
      state.smoothed = clampPointToPlayArea(state.smoothed, canvas);
      state.previousRaw = clampedRaw;
      state.velocity = velocity;
      state.lastSeenTime = now;
      return state.smoothed;
    }

    if (state.smoothed && now - state.lastSeenTime <= TRACKING_GRACE_MS) {
      state.smoothed = clampPointToPlayArea({
        x: state.smoothed.x + state.velocity.x * 0.15,
        y: state.smoothed.y + state.velocity.y * 0.15,
      }, canvas);
      return state.smoothed;
    }

    state.smoothed = null;
    state.previousRaw = null;
    state.velocity = { x: 0, y: 0 };
    return null;
  }, [clampPointToPlayArea]);

  const resetBall = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    gameState.current.ball = createCenteredBall(canvas.width, canvas.height);
  }, []);

  const launchBall = useCallback(() => {
    const velocity = createLaunchVelocity();
    gameState.current.ball.vx = velocity.vx;
    gameState.current.ball.vy = velocity.vy;
  }, []);

  const startRound = useCallback(() => {
    updateUiState("COUNTDOWN");
    resetBall();
    let count = 3;
    setCountdown(count);
    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
      } else if (count === 0) {
        setCountdown("GO!");
      } else {
        clearInterval(interval);
        launchBall();
        updateUiState("PLAYING");
      }
    }, 1000);
  }, [updateUiState, resetBall, launchBall]);

  const startGame = useCallback(() => {
    updateScores(0, 0);
    startRound();
  }, [updateScores, startRound]);

  const handleGoal = useCallback(
    (side: "left" | "right") => {
      const currentScores = gameState.current.scores;
      const newScores = { ...currentScores };
      newScores[side] += 1;
      gameState.current.isSmash = false;
      gameState.current.lastTouchSide = null;
      gameState.current.consecutiveTouches = 0;
      updateScores(newScores.left, newScores.right);
      if (newScores.left >= WINNING_SCORE) {
        setWinner("Red Player - Left Side");
        updateUiState("END");
      } else if (newScores.right >= WINNING_SCORE) {
        setWinner("Blue Player - Right Side");
        updateUiState("END");
      } else {
        startRound();
      }
    },
    [updateScores, updateUiState, startRound],
  );

  // GAME LOOP
  const gameLoop = useCallback(
    function loop() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const video = videoRef.current;
      const now = performance.now();
      const frameScale = getFrameScale(now, lastFrameTimeRef.current);
      lastFrameTimeRef.current = now;

      if (canvas && ctx && video && handLandmarkerRef.current && video.readyState >= 2) {
        const shouldDetect =
          now - lastDetectionTimeRef.current >= DETECTION_INTERVAL_MS &&
          lastVideoTimeRef.current !== video.currentTime &&
          !video.paused;

        if (shouldDetect) {
          lastDetectionTimeRef.current = now;
          lastVideoTimeRef.current = video.currentTime;

          const results = handLandmarkerRef.current.detectForVideo(video, now);

          let rawLeftTarget: GamePoint | null = null;
          let rawRightTarget: GamePoint | null = null;
          let totalHands = 0;

          if (results.landmarks && results.landmarks.length > 0) {
            totalHands = results.landmarks.length;

            results.landmarks.forEach((landmarks: NormalizedLandmark[]) => {
              // Use 4 palm landmarks for a stable average position
              const n9 = landmarks[9];   // middle finger base
              const n0 = landmarks[0];   // wrist
              const n5 = landmarks[5];   // index finger base
              const n13 = landmarks[13]; // ring finger base
              if (!n9 || !n0 || !n5 || !n13) return;

              // Mirror X (1 - x) because video is flipped
              const ptX = ((1 - n9.x) + (1 - n0.x) + (1 - n5.x) + (1 - n13.x)) / 4 * canvas.width;
              const ptY = (n9.y + n0.y + n5.y + n13.y) / 4 * canvas.height;

              if (ptX < canvas.width * 0.5) {
                rawLeftTarget = { x: ptX, y: ptY };
              } else {
                rawRightTarget = { x: ptX, y: ptY };
              }
            });
          }

          gameState.current.leftPaddle = updateTrackedPaddle(
            leftTrackingRef,
            rawLeftTarget,
            canvas,
            now,
            SMOOTHING_FACTOR_LEFT,
          );
          gameState.current.rightPaddle = updateTrackedPaddle(
            rightTrackingRef,
            rawRightTarget,
            canvas,
            now,
            SMOOTHING_FACTOR_RIGHT,
          );

          setPlayerCount((currentCount) => currentCount === totalHands ? currentCount : totalHands);
        } else {
          gameState.current.leftPaddle = updateTrackedPaddle(
            leftTrackingRef,
            null,
            canvas,
            now,
            SMOOTHING_FACTOR_LEFT,
          );
          gameState.current.rightPaddle = updateTrackedPaddle(
            rightTrackingRef,
            null,
            canvas,
            now,
            SMOOTHING_FACTOR_RIGHT,
          );
        }

        const goalTop = canvas.height * 0.35;
        const goalBottom = canvas.height * 0.65;

        //Ball Physics
        if (gameState.current.status === "PLAYING") {
          const ball = gameState.current.ball;

          applyBallFrictionAndMovement(ball, frameScale);

          // Top/bottom wall bounces
          bounceBallOffHorizontalWalls(ball, canvas.height);

          // Left/right wall - goal or wall bounce
          if (ball.x - BALL_RADIUS < 0) {
            if (ball.y >= goalTop && ball.y <= goalBottom) handleGoal("right");
            else {
              ball.x = BALL_RADIUS;
              ball.vx = Math.abs(ball.vx);
            }
          } else if (ball.x + BALL_RADIUS > canvas.width) {
            if (ball.y >= goalTop && ball.y <= goalBottom) handleGoal("left");
            else {
              ball.x = canvas.width - BALL_RADIUS;
              ball.vx = -Math.abs(ball.vx);
            }
          }

          // Paddle collision
          if (now - gameState.current.lastBounceTime > 150) {
            const targets = [
              { point: gameState.current.leftPaddle, side: "LEFT" as const },
              { point: gameState.current.rightPaddle, side: "RIGHT" as const },
            ];
            let bounced = false;
            targets.forEach(({ point, side }) => {
              if (bounced || !point) return;
              const { distance, nx, ny } = getPaddleCollisionNormal(ball, point, side);
              if (distance < BALL_RADIUS + HAND_RADIUS) {
                const gs = gameState.current;

                if (gs.lastTouchSide === side) {
                  gs.consecutiveTouches += 1;
                  if (gs.consecutiveTouches >= 2) {
                    gs.isSmash = true;
                    gs.consecutiveTouches = 0;
                    ball.speed = SMASH_SPEED;
                    setSmashFlash(true);
                    setTimeout(() => setSmashFlash(false), 1000);
                  } else {
                    ball.speed = Math.min(ball.speed + SPEED_INCREMENT, MAX_SPEED);
                  }
                } else {
                  gs.isSmash = false;
                  gs.consecutiveTouches = 1;
                  ball.speed = Math.min(ball.speed + SPEED_INCREMENT, MAX_SPEED);
                }
                gs.lastTouchSide = side;
                ball.vx = nx * ball.speed;
                ball.vy = ny * ball.speed;
                // Ensure ball never gets completely stuck in a straight horizontal line
                const safeVelocity = getSafePaddleVelocity(ball, side);
                ball.vx = safeVelocity.vx;
                ball.vy = safeVelocity.vy;
                gameState.current.lastBounceTime = now;
                bounced = true;
              }
            });
          }
        }

        drawCameraBackground(ctx, canvas, video);
        drawRink(ctx, canvas, goalTop, goalBottom);
        drawPaddleCircle(ctx, gameState.current.leftPaddle, true);
        drawPaddleCircle(ctx, gameState.current.rightPaddle, false);

        const ball = gameState.current.ball;
        const isSmash = gameState.current.isSmash;
        const isCharging = gameState.current.consecutiveTouches === 1;
        drawBall(ctx, ball, isSmash, isCharging);
      }

      requestRef.current = requestAnimationFrame(loop);
    },
    [handleGoal, updateTrackedPaddle],
  );

  const stopCameraStream = useCallback(() => {
    const video = videoRef.current;
    if (video?.srcObject) {
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
  }, []);

  const initializeGame = useCallback(async () => {
    try {
      updateUiState("LOADING");
      setErrorMessage("");
      setPlayerCount(0);
      lastVideoTimeRef.current = -1;
      lastDetectionTimeRef.current = 0;
      lastFrameTimeRef.current = null;
      leftTrackingRef.current = {
        smoothed: null,
        previousRaw: null,
        velocity: { x: 0, y: 0 },
        lastSeenTime: 0,
      };
      rightTrackingRef.current = {
        smoothed: null,
        previousRaw: null,
        velocity: { x: 0, y: 0 },
        lastSeenTime: 0,
      };
      stopCameraStream();
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
        handLandmarkerRef.current = null;
      }

      setStatusText("Optimizing Engine (GPU Hand Tracking)...");
      try {
        handLandmarkerRef.current = await createHandLandmarker("GPU");
      } catch (gpuError) {
        console.warn("GPU hand tracking failed, retrying with CPU.", gpuError);
        setStatusText("GPU unavailable. Starting CPU Hand Tracking...");
        handLandmarkerRef.current = await createHandLandmarker("CPU");
      }

      setStatusText("Opening webcam...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 960 },
          height: { ideal: 540 },
          frameRate: { ideal: 60, min: 30 },
          facingMode: "user",
        },
        audio: false,
      });

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("Video element is not available.");
      }

      video.srcObject = stream;
      video.onloadedmetadata = () => {
        void video.play();
        handleResize();
        updateUiState("START");
        setStatusText("System ready. Waiting for players.");
        document.title = "GDG Air Hockey Game";
      };
    } catch (error: unknown) {
      console.error("Setup Error:", error);
      stopCameraStream();
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
        handLandmarkerRef.current = null;
      }
      const message =
        error instanceof Error
          ? error.message
          : "Camera permission or hand tracking setup failed.";
      setErrorMessage(message);
      setStatusText("Camera or hand tracking setup failed.");
      updateUiState("ERROR");
    }
  }, [handleResize, stopCameraStream, updateUiState]);

  // INITIALIZATION
  useEffect(() => {
    void initializeGame();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (handLandmarkerRef.current) handLandmarkerRef.current.close();
      stopCameraStream();
    };
  }, [handleResize, initializeGame, stopCameraStream]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameLoop]);

  return (
    <div
      className="relative w-full h-screen overflow-hidden bg-black select-none"
      style={{ fontFamily: "'Nunito', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;900&display=swap');
        @keyframes floatDot { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-5px)} }
        @keyframes statusPulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .status-dot-live { animation: statusPulse 1.5s ease-in-out infinite; }
      `}</style>

      <video ref={videoRef} className="hidden" playsInline autoPlay muted />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block z-0" />

      <div className="absolute inset-0 pointer-events-none z-10 flex flex-col">

        {/* Header */}
        <header
          style={{
            height: `${HEADER_HEIGHT}px`,
            flexShrink: 0,
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(12px)",
            borderBottom: "2px solid rgba(255,255,255,0.9)",
          }}
        >
          <div
            style={{
              maxWidth: "100%",
              padding: "4px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {/* Left: dots + Player A score */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 120 }}>
              <div style={{ display: "flex", gap: 5 }}>
                {([GDG_BLUE, GDG_RED, GDG_YELLOW, GDG_GREEN] as string[]).map((c, i) => (
                  <div
                    key={i}
                    style={{
                      width: 10, height: 10, borderRadius: "50%", background: c,
                      animation: `floatDot ${1.2 + i * 0.2}s ease-in-out infinite`,
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
              </div>
              {(uiState === "PLAYING" || uiState === "COUNTDOWN") && (
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "rgba(234,67,53,0.1)", borderRadius: 12,
                    padding: "2px 12px", border: `2px solid ${GDG_RED}`,
                  }}
                >
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: GDG_RED }} />
                  <span style={{ fontSize: 11, fontWeight: 900, color: GDG_RED, letterSpacing: 2 }}>PLAYER A</span>
                  <span style={{ fontSize: 26, fontWeight: 900, color: GDG_RED, lineHeight: 1 }}>{scores.left}</span>
                </div>
              )}
            </div>

            {/* Center: title */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 26, fontWeight: 900, color: "transparent", WebkitTextStroke: `2px ${GDG_RED}` }}>&lt;</span>
                <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0, letterSpacing: -0.5 }}>
                  <GDGTitle text="GDG Air - Hockey" />
                </h1>
                <span style={{ fontSize: 26, fontWeight: 900, color: "transparent", WebkitTextStroke: `2px ${GDG_GREEN}` }}>&gt;</span>
              </div>
            </div>

            {/* Right: Player B score + dots */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 120, justifyContent: "flex-end" }}>
              {(uiState === "PLAYING" || uiState === "COUNTDOWN") && (
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "rgba(66,133,244,0.1)", borderRadius: 12,
                    padding: "2px 12px", border: `2px solid ${GDG_BLUE}`,
                  }}
                >
                  <span style={{ fontSize: 26, fontWeight: 900, color: GDG_BLUE, lineHeight: 1 }}>{scores.right}</span>
                  <span style={{ fontSize: 11, fontWeight: 900, color: GDG_BLUE, letterSpacing: 2 }}>PLAYER B</span>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: GDG_BLUE }} />
                </div>
              )}
              <div style={{ display: "flex", gap: 5 }}>
                {([GDG_GREEN, GDG_YELLOW, GDG_RED, GDG_BLUE] as string[]).map((c, i) => (
                  <div
                    key={i}
                    style={{
                      width: 10, height: 10, borderRadius: "50%", background: c,
                      animation: `floatDot ${1.2 + i * 0.2}s ease-in-out infinite`,
                      animationDelay: `${(3 - i) * 0.15}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Rainbow bar */}
          <div style={{ display: "flex", gap: 3, padding: "0 24px" }}>
            {([GDG_BLUE, GDG_RED, GDG_YELLOW, GDG_GREEN] as string[]).map((c, i) => (
              <div key={i} style={{ height: 4, borderRadius: 999, background: c, flex: 1 }} />
            ))}
          </div>
        </header>

        {/* Smash flash overlay */}
        {smashFlash && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div className="text-center animate-bounce">
              <div
                style={{
                  fontSize: "7rem", fontWeight: 900, lineHeight: 1, color: GDG_YELLOW,
                  textShadow: `0 0 60px ${GDG_YELLOW}, 0 0 100px ${GDG_RED}`,
                }}
              >
                SMASH!
              </div>
            </div>
          </div>
        )}

        {/* Overlays (loading / countdown / end) */}
        <div className="flex-grow flex flex-col justify-center items-center">

          {/* Loading screen */}
          {uiState === "LOADING" && (
            <div
              style={{
                background: "rgba(255,255,255,0.93)", borderRadius: 20,
                padding: "32px 40px", border: "2px solid rgba(255,255,255,0.95)",
                boxShadow: "0 10px 40px rgba(0,0,0,0.18)", textAlign: "center",
                backdropFilter: "blur(12px)",
              }}
              className="pointer-events-auto"
            >
              <div style={{ fontSize: 10, letterSpacing: "0.5em", color: GDG_BLUE, marginBottom: 12, fontWeight: 900 }}>
                SYSTEM BOOT
              </div>
              <h1 style={{ fontSize: 40, fontWeight: 900, margin: "0 0 6px", letterSpacing: -1 }}>
                <GDGTitle text="GDG Air - Hockey" />
              </h1>
              <p style={{ fontSize: 12, color: "#5F6368", letterSpacing: "0.3em", marginBottom: 20, fontWeight: 700 }}>
                COMBAT VISION ENGINE
              </p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                <div
                  style={{
                    width: 28, height: 28, border: `3px solid ${GDG_BLUE}`,
                    borderTopColor: "transparent", borderRadius: "50%",
                  }}
                  className="animate-spin"
                />
                <span style={{ color: "#373636", fontSize: 13, fontWeight: 700 }}>{statusText}</span>
              </div>
            </div>
          )}

          {/* Error screen */}
          {uiState === "ERROR" && (
            <div
              style={{
                background: "rgba(255,255,255,0.95)", borderRadius: 20,
                padding: "28px 36px", border: "2px solid rgba(255,255,255,0.95)",
                boxShadow: "0 10px 40px rgba(0,0,0,0.18)", textAlign: "center",
                backdropFilter: "blur(12px)", maxWidth: 460, width: "100%", margin: "0 16px",
              }}
              className="pointer-events-auto"
            >
              <div style={{ fontSize: 10, letterSpacing: "0.4em", color: GDG_RED, marginBottom: 12, fontWeight: 900 }}>
                SETUP ERROR
              </div>
              <h1 style={{ fontSize: 34, fontWeight: 900, margin: "0 0 10px", color: "#373636" }}>
                Camera Not Ready
              </h1>
              <p style={{ fontSize: 14, color: "#5F6368", lineHeight: 1.5, margin: "0 0 8px" }}>
                Allow camera access and make sure the hand tracking model can load, then try again.
              </p>
              {errorMessage && (
                <p style={{ fontSize: 12, color: GDG_RED, lineHeight: 1.4, margin: "0 0 18px" }}>
                  {errorMessage}
                </p>
              )}
              <button
                onClick={() => void initializeGame()}
                style={{
                  width: "100%", padding: "12px 0", borderRadius: 12,
                  fontWeight: 900, fontSize: 15, letterSpacing: "0.2em",
                  textTransform: "uppercase", border: "none", cursor: "pointer",
                  background: `linear-gradient(135deg, ${GDG_BLUE}, ${GDG_GREEN})`,
                  color: "white", boxShadow: "0 4px 20px rgba(66,133,244,0.35)",
                }}
              >
                RETRY CAMERA
              </button>
            </div>
          )}

          {/* Start screen */}
          {uiState === "START" && (
            <div className="pointer-events-auto" style={{ maxWidth: 480, width: "100%", margin: "0 16px" }}>
              <div
                style={{
                  background: "rgba(255,255,255,0.93)", borderRadius: 20,
                  padding: "24px 32px", border: "2px solid rgba(255,255,255,0.95)",
                  boxShadow: "0 10px 40px rgba(0,0,0,0.15)", backdropFilter: "blur(12px)",
                  display: "flex", flexDirection: "column",
                }}
              >
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: 12 }}>
                  <img
                    src={logoImg.src}
                    alt="GDG Club Logo"
                    style={{ width: "68px", height: "auto", objectFit: "contain", filter: "drop-shadow(0px 4px 10px rgba(0,0,0,0.08))" }}
                  />
                </div>

                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.5em", color: GDG_GREEN, marginBottom: 6, fontWeight: 900 }}>
                    GDG SPECIAL EDITION ONLINE
                  </div>
                  <h1 style={{ fontSize: 44, fontWeight: 900, margin: 0, letterSpacing: -1 }}>
                    <GDGTitle text="GDG Air - Hockey" />
                  </h1>
                </div>

                <div
                  style={{
                    background: "rgba(0,0,0,0.04)", borderRadius: 12,
                    padding: "14px 18px", marginBottom: 16,
                    border: "1.5px solid rgba(0,0,0,0.07)", fontSize: 13,
                  }}
                >
                  <div style={{ fontSize: 9, letterSpacing: "0.4em", color: GDG_BLUE, marginBottom: 10, fontWeight: 900, borderBottom: "1px solid rgba(0,0,0,0.08)", paddingBottom: 6 }}>
                    COMBAT MANUAL
                  </div>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    <li style={{ color: "#373636" }}>Center yourself completely in front of the lens.</li>
                    <li style={{ display: "flex", gap: 8, alignItems: "center", color: "#373636" }}>
                      <span style={{ color: GDG_GREEN, fontWeight: 900 }}>-</span>
                      <span><span style={{ color: GDG_RED, fontWeight: 900 }}>Player A (Left Half)</span> Moves any hand on the left field.</span>
                    </li>
                    <li style={{ display: "flex", gap: 8, alignItems: "center", color: "#373636", whiteSpace: "nowrap" }}>
                      <span style={{ color: GDG_GREEN, fontWeight: 900 }}>-</span>
                      <span><span style={{ color: GDG_BLUE, fontWeight: 900 }}>Player B (Right Half)</span> Moves any hand on the right field.</span>
                    </li>
                    <li style={{ display: "flex", gap: 8, alignItems: "center", color: "#373636" }}>
                      <span style={{ color: GDG_YELLOW, fontWeight: 900 }}>*</span>
                      <span>First to score <strong>3 goals</strong> wins the match.</span>
                    </li>
                  </ul>
                </div>

                <button
                  onClick={startGame}
                  style={{
                    width: "100%", padding: "12px 0", borderRadius: 12,
                    fontWeight: 900, fontSize: 16, letterSpacing: "0.2em",
                    textTransform: "uppercase", border: "none", cursor: "pointer",
                    background: `linear-gradient(135deg, ${GDG_BLUE}, ${GDG_GREEN})`,
                    color: "white", boxShadow: "0 4px 20px rgba(66,133,244,0.35)",
                  }}
                >
                  START BATTLE
                </button>
              </div>
            </div>
          )}

          {/* Countdown */}
          {uiState === "COUNTDOWN" && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, letterSpacing: "0.4em", color: "white", marginBottom: 8, fontWeight: 900, opacity: 0.8 }}>
                COMBAT BEGINS IN
              </div>
              <div
                style={{
                  fontSize: "11rem", fontWeight: 900, lineHeight: 1, color: GDG_YELLOW,
                  textShadow: `0 0 60px ${GDG_YELLOW}, 0 0 100px ${GDG_RED}`,
                }}
              >
                {countdown}
              </div>
            </div>
          )}

          {/* Victory screen */}
          {uiState === "END" && (
            <div
              className="pointer-events-auto"
              style={{
                textAlign: "center", maxWidth: 400, width: "100%", margin: "0 16px",
                background: "rgba(255,255,255,0.95)", borderRadius: 20,
                padding: "24px 32px", border: "2px solid rgba(255,255,255,0.95)",
                boxShadow: "0 10px 40px rgba(0,0,0,0.18)", backdropFilter: "blur(12px)",
              }}
            >
              <div style={{ fontSize: 9, letterSpacing: "0.4em", color: GDG_YELLOW, marginBottom: 8, fontWeight: 900 }}>
                BATTLE COMPLETE
              </div>
              <h2 style={{ fontSize: 46, fontWeight: 900, margin: "0 0 4px", color: GDG_YELLOW }}>VICTORY!</h2>
              <p style={{ color: "#5F6368", fontSize: 12, letterSpacing: "0.3em", marginBottom: 4, fontWeight: 700 }}>
                CHAMPION
              </p>
              <p
                style={{
                  fontSize: 20, fontWeight: 900, color: "#373636", marginBottom: 16,
                  padding: "8px 0", borderRadius: 10,
                  background: "rgba(0,0,0,0.04)", border: "1.5px solid rgba(0,0,0,0.07)",
                }}
              >
                {winner}
              </p>
              <div style={{ fontSize: 13, color: "#5F6368", marginBottom: 16 }}>
                Final Score: <span style={{ color: GDG_RED, fontWeight: 900 }}>{scores.left}</span>
                {" - "}
                <span style={{ color: GDG_BLUE, fontWeight: 900 }}>{scores.right}</span>
              </div>
              <button
                onClick={startGame}
                style={{
                  width: "100%", padding: "10px 0", borderRadius: 12,
                  fontWeight: 900, fontSize: 15, letterSpacing: "0.2em",
                  textTransform: "uppercase", cursor: "pointer",
                  background: "white", color: GDG_BLUE, border: `2px solid ${GDG_BLUE}`,
                }}
              >
                REMATCH
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer
          style={{
            height: `${FOOTER_HEIGHT}px`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "2px 20px",
            background: "rgba(255,255,255,0.88)", backdropFilter: "blur(8px)",
            borderTop: "2px solid rgba(255,255,255,0.9)",
            fontSize: 10, fontWeight: 900, letterSpacing: "0.2em",
          }}
          className="pointer-events-auto"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              className={uiState !== "LOADING" ? "status-dot-live" : ""}
              style={{
                width: 8, height: 8, borderRadius: "50%",
                background: uiState === "LOADING" ? GDG_YELLOW : GDG_GREEN,
                boxShadow: `0 0 0 3px ${uiState === "LOADING" ? "rgba(249,171,0,0.2)" : "rgba(52,168,83,0.2)"}`,
              }}
            />
            <span style={{ color: "#373636" }}>{statusText}</span>
          </div>
          <div style={{ color: "#5F6368" }}>
            HANDS ON SCREEN: <span style={{ color: GDG_BLUE, fontWeight: 900 }}>{playerCount}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
