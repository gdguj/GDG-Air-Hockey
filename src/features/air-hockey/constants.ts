// Game Constants
export const WINNING_SCORE = 3;           // Changed from 5 to 3 goals to win
export const BALL_INITIAL_SPEED = 28;     // Reduced from 34 for a softer launch feel
export const SPEED_INCREMENT = 0.3;       // Reduced from 0.4 for a slower speed ramp
export const MAX_SPEED = 38;              // Reduced from 44 for a gentler cap
export const SMASH_SPEED = 46;            // Reduced from 52; smash is still powerful but not extreme
export const BALL_FRICTION = 0.994;       // NEW: friction factor applied each frame (1.0 = no friction)
export const HAND_RADIUS = 45;
export const BALL_RADIUS = 35;
export const TARGET_FRAME_MS = 1000 / 60;
export const DETECTION_INTERVAL_MS = 1000 / 45;
export const TRACKING_GRACE_MS = 120;

// Hand Tracking / Smoothing
// Lower factor = more smoothing (more lag but less jitter)
// Higher factor = faster response (less lag but more jitter)
export const SMOOTHING_FACTOR_LEFT = 0.45;   // Reduced from 0.55 for smoother left hand
export const SMOOTHING_FACTOR_RIGHT = 0.50;  // Reduced from 0.65 for smoother right hand
export const MIN_HAND_SMOOTHING = 0.28;
export const MAX_HAND_SMOOTHING = 0.62;
export const FAST_HAND_SPEED = 85;
export const HAND_PREDICTION_FACTOR = 0.20;

export const HEADER_HEIGHT = 54;
export const FOOTER_HEIGHT = 24;

// GDG Brand Colors
export const GDG_BLUE = "#4285F4";
export const GDG_RED = "#EA4335";
export const GDG_YELLOW = "#F9AB00";
export const GDG_GREEN = "#34A853";
