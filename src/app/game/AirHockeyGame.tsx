"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  HandLandmarker,
  FilesetResolver,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// Game Constants 
const WINNING_SCORE = 3;           // Changed from 5 → 3 goals to win
const BALL_INITIAL_SPEED = 28;     // Reduced from 34 — softer launch feel
const SPEED_INCREMENT = 0.3;       // Reduced from 0.4 — slower speed ramp
const MAX_SPEED = 38;              // Reduced from 44 — cap is gentler
const SMASH_SPEED = 46;            // Reduced from 52 — smash still powerful but not extreme
const BALL_FRICTION = 0.994;       // NEW: friction factor applied each frame (1.0 = no friction)
const HAND_RADIUS = 45;
const BALL_RADIUS = 35;

// Hand Tracking / Smoothing 
// Lower factor = more smoothing (more lag but less jitter)
// Higher factor = faster response (less lag but more jitter)
const SMOOTHING_FACTOR_LEFT = 0.45;   // Reduced from 0.55 — smoother left hand
const SMOOTHING_FACTOR_RIGHT = 0.50;  // Reduced from 0.65 — smoother right hand

const HEADER_HEIGHT = 54;
const FOOTER_HEIGHT = 24;

// GDG Brand Colors 
const GDG_BLUE = "#4285F4";
const GDG_RED = "#EA4335";
const GDG_YELLOW = "#F9AB00";
const GDG_GREEN = "#34A853";

type UIState = "LOADING" | "START" | "COUNTDOWN" | "PLAYING" | "END";

interface GamePoint {
  x: number;
  y: number;
}

interface GameStateRef {
  status: UIState;
  ball: { x: number; y: number; vx: number; vy: number; speed: number };
  scores: { left: number; right: number };
  leftPaddle: GamePoint | null;
  rightPaddle: GamePoint | null;
  lastBounceTime: number;
  lastTouchSide: "LEFT" | "RIGHT" | null;
  consecutiveTouches: number;
  isSmash: boolean;
}

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
  const [playerCount, setPlayerCount] = useState(0);
  const [smashFlash, setSmashFlash] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const lastVideoTimeRef = useRef(-1);

  // Smoothed previous positions for jitter-reduction filter
  const prevLeftPaddle = useRef<GamePoint | null>(null);
  const prevRightPaddle = useRef<GamePoint | null>(null);

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

  const resetBall = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    gameState.current.ball = {
      x: canvas.width / 2,
      y: (canvas.height - HEADER_HEIGHT - FOOTER_HEIGHT) / 2 + HEADER_HEIGHT,
      vx: 0,
      vy: 0,
      speed: BALL_INITIAL_SPEED,
    };
  }, []);

  const launchBall = useCallback(() => {
    const angle =
      (Math.random() * Math.PI) / 2 -
      Math.PI / 4 +
      (Math.random() > 0.5 ? 0 : Math.PI);
    gameState.current.ball.vx = Math.cos(angle) * BALL_INITIAL_SPEED;
    gameState.current.ball.vy = Math.sin(angle) * BALL_INITIAL_SPEED;
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
        setWinner("Red Player — Left Side");
        updateUiState("END");
      } else if (newScores.right >= WINNING_SCORE) {
        setWinner("Blue Player — Right Side");
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

      if (canvas && ctx && video && handLandmarkerRef.current && video.readyState >= 2) {
        const startTimeMs = performance.now();

        // Only run detection when video frame actually advances
        if (lastVideoTimeRef.current !== video.currentTime && !video.paused) {
          lastVideoTimeRef.current = video.currentTime;

          const results = handLandmarkerRef.current.detectForVideo(video, startTimeMs);

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

          // Exponential Moving Average smoothing — Left Hand 
          if (rawLeftTarget) {
            if (!prevLeftPaddle.current) prevLeftPaddle.current = rawLeftTarget;
            gameState.current.leftPaddle = {
              x: prevLeftPaddle.current.x + SMOOTHING_FACTOR_LEFT * ((rawLeftTarget as GamePoint).x - prevLeftPaddle.current.x),
              y: prevLeftPaddle.current.y + SMOOTHING_FACTOR_LEFT * ((rawLeftTarget as GamePoint).y - prevLeftPaddle.current.y),
            };
            prevLeftPaddle.current = gameState.current.leftPaddle;
          } else {
            gameState.current.leftPaddle = null;
            prevLeftPaddle.current = null;
          }

          // ── Exponential Moving Average smoothing — Right Hand ──
          if (rawRightTarget) {
            if (!prevRightPaddle.current) prevRightPaddle.current = rawRightTarget;
            gameState.current.rightPaddle = {
              x: prevRightPaddle.current.x + SMOOTHING_FACTOR_RIGHT * ((rawRightTarget as GamePoint).x - prevRightPaddle.current.x),
              y: prevRightPaddle.current.y + SMOOTHING_FACTOR_RIGHT * ((rawRightTarget as GamePoint).y - prevRightPaddle.current.y),
            };
            prevRightPaddle.current = gameState.current.rightPaddle;
          } else {
            gameState.current.rightPaddle = null;
            prevRightPaddle.current = null;
          }

          if (playerCount !== totalHands) setPlayerCount(totalHands);
        }

        const goalTop = canvas.height * 0.35;
        const goalBottom = canvas.height * 0.65;

        //Ball Physics
        if (gameState.current.status === "PLAYING") {
          const ball = gameState.current.ball;

          // Apply friction each frame — puck gradually decelerates
          ball.vx *= BALL_FRICTION;
          ball.vy *= BALL_FRICTION;
          // Also decay the stored speed so next bounce respects the deceleration
          ball.speed *= BALL_FRICTION;

          // Move ball
          ball.x += ball.vx;
          ball.y += ball.vy;

          // Top/bottom wall bounces
          if (ball.y - BALL_RADIUS <= HEADER_HEIGHT) {
            ball.y = HEADER_HEIGHT + BALL_RADIUS;
            ball.vy = Math.abs(ball.vy);
          } else if (ball.y + BALL_RADIUS >= canvas.height - FOOTER_HEIGHT) {
            ball.y = canvas.height - FOOTER_HEIGHT - BALL_RADIUS;
            ball.vy = -Math.abs(ball.vy);
          }

          // Left/right wall — goal or wall bounce
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

          // ── Paddle collision ──
          const now = performance.now();
          if (now - gameState.current.lastBounceTime > 150) {
            const targets = [
              { point: gameState.current.leftPaddle, side: "LEFT" as const },
              { point: gameState.current.rightPaddle, side: "RIGHT" as const },
            ];
            let bounced = false;
            targets.forEach(({ point, side }) => {
              if (bounced || !point) return;
              const dx = ball.x - point.x;
              const dy = ball.y - point.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              if (distance < BALL_RADIUS + HAND_RADIUS) {
                const nx = dx / distance;
                const ny = dy / distance;
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
                if (Math.abs(ball.vx) < 2) ball.vx = Math.sign(ball.vx) * 2;
                if (Math.abs(ball.vy) < 2) ball.vy = Math.sign(ball.vy) * 2;
                gameState.current.lastBounceTime = now;
                bounced = true;
              }
            });
          }
        }

        // RENDERING 
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw mirrored webcam feed
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
        ctx.restore();

        // Subtle dark overlay for contrast
        ctx.fillStyle = "rgba(0, 0, 15, 0.12)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Scanline effect
        for (let y = 0; y < canvas.height; y += 4) {
          ctx.fillStyle = "rgba(255,255,255,0.006)";
          ctx.fillRect(0, y, canvas.width, 1);
        }

        // Goal walls (non-goal areas painted as walls)
        const gateW = 20;
        ctx.fillStyle = "rgba(234, 67, 53, 0.45)";
        ctx.fillRect(0, HEADER_HEIGHT, gateW, goalTop - HEADER_HEIGHT);
        ctx.fillRect(0, goalBottom, gateW, canvas.height - FOOTER_HEIGHT - goalBottom);

        ctx.fillStyle = "rgba(66, 133, 244, 0.45)";
        ctx.fillRect(canvas.width - gateW, HEADER_HEIGHT, gateW, goalTop - HEADER_HEIGHT);
        ctx.fillRect(canvas.width - gateW, goalBottom, gateW, canvas.height - FOOTER_HEIGHT - goalBottom);

        // Goal mouth outlines
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

        // Center line gradient
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

        // Paddle rendering 
        const renderPaddleCircle = (pt: GamePoint | null, isLeft: boolean) => {
          if (!pt) return;
          const neonColor = isLeft ? GDG_RED : GDG_BLUE;
          const fillColor = isLeft ? "rgba(234,67,53,0.08)" : "rgba(66,133,244,0.08)";
          const outerGlowColor = isLeft ? "rgba(234,67,53,0.07)" : "rgba(66,133,244,0.07)";
          const label = isLeft ? "PLAYER A" : "PLAYER B";

          ctx.beginPath();
          ctx.arc(pt.x, pt.y, HAND_RADIUS + 8, 0, 2 * Math.PI);
          ctx.fillStyle = outerGlowColor;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(pt.x, pt.y, HAND_RADIUS, 0, 2 * Math.PI);
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
          ctx.moveTo(pt.x - HAND_RADIUS * 0.6, pt.y);
          ctx.lineTo(pt.x + HAND_RADIUS * 0.6, pt.y);
          ctx.moveTo(pt.x, pt.y - HAND_RADIUS * 0.6);
          ctx.lineTo(pt.x, pt.y + HAND_RADIUS * 0.6);
          ctx.stroke();

          ctx.shadowBlur = 12;
          ctx.shadowColor = neonColor;
          ctx.fillStyle = neonColor;
          ctx.font = "bold 13px 'Nunito', sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(label, pt.x, pt.y + HAND_RADIUS + 18);
          ctx.shadowBlur = 0;
        };

        renderPaddleCircle(gameState.current.leftPaddle, true);
        renderPaddleCircle(gameState.current.rightPaddle, false);

        // Ball rendering 
        const ball = gameState.current.ball;
        const isSmash = gameState.current.isSmash;
        const isCharging = gameState.current.consecutiveTouches === 1;

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

        // Specular highlight on ball
        ctx.beginPath();
        ctx.arc(ball.x - BALL_RADIUS * 0.3, ball.y - BALL_RADIUS * 0.35, BALL_RADIUS * 0.35, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.shadowBlur = 0;
        ctx.fill();
      }

      requestRef.current = requestAnimationFrame(loop);
    },
    [playerCount, handleGoal],
  );

  // INITIALIZATION
  useEffect(() => {
    let isComponentMounted = true;
    const initSetup = async () => {
      try {
        setStatusText("Optimizing Engine (GPU Hand Tracking)...");
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm",
        );

        handLandmarkerRef.current = await HandLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",  // GPU delegate for lower latency detection
          },
          runningMode: "VIDEO",
          numHands: 2,
        });

        if (!isComponentMounted) return;
        setStatusText("Opening webcam...");

        // Request high-quality 720p webcam feed
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 60, min: 30 }, // Request high frame rate for smoother tracking
            facingMode: "user",
          },
          audio: false,
        });

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.onloadedmetadata = () => {
            video.play();
            handleResize();
            updateUiState("START");
            setStatusText("System ready. Waiting for players.");
            document.title = "GDG Air Hockey Game";
          };
        }
      } catch (error: unknown) {
        console.error("Setup Error:", error);
        setStatusText("Camera or permission error occurred.");
      }
    };
    initSetup();
    window.addEventListener("resize", handleResize);
    return () => {
      isComponentMounted = false;
      window.removeEventListener("resize", handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (handLandmarkerRef.current) handLandmarkerRef.current.close();
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        {/* ── Header ── */}
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

        {/* ── Smash flash overlay ── */}
        {smashFlash && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div className="text-center animate-bounce">
              <div
                style={{
                  fontSize: "7rem", fontWeight: 900, lineHeight: 1, color: GDG_YELLOW,
                  textShadow: `0 0 60px ${GDG_YELLOW}, 0 0 100px ${GDG_RED}`,
                }}
              >
                ⚡ SMASH! ⚡
              </div>
            </div>
          </div>
        )}

        {/* ── Overlays (loading / countdown / end) ── */}
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
                    src="/icon.png"
                    alt="GDG Club Logo"
                    style={{ width: "68px", height: "auto", objectFit: "contain", filter: "drop-shadow(0px 4px 10px rgba(0,0,0,0.08))" }}
                  />
                </div>

                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.5em", color: GDG_GREEN, marginBottom: 6, fontWeight: 900 }}>
                    ⚡ GDG SPECIAL EDITION ONLINE ⚡
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
                      <span style={{ color: GDG_GREEN, fontWeight: 900 }}>→</span>
                      <span><span style={{ color: GDG_RED, fontWeight: 900 }}>Player A (Left Half)</span> Moves any hand on the left field.</span>
                    </li>
                    <li style={{ display: "flex", gap: 8, alignItems: "center", color: "#373636", whiteSpace: "nowrap" }}>
                      <span style={{ color: GDG_GREEN, fontWeight: 900 }}>→</span>
                      <span><span style={{ color: GDG_BLUE, fontWeight: 900 }}>Player B (Right Half)</span> Moves any hand on the right field.</span>
                    </li>
                    <li style={{ display: "flex", gap: 8, alignItems: "center", color: "#373636" }}>
                      <span style={{ color: GDG_YELLOW, fontWeight: 900 }}>★</span>
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
                  ⚔ START BATTLE ⚔
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
                ⚔ BATTLE COMPLETE ⚔
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
                {" — "}
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

        {/* ── Footer ── */}
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
