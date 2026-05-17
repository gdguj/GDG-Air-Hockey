import cv2
import mediapipe as mp
import threading
import numpy as np
from collections import deque


class HandTracker:
    """Threaded hand tracker using MediaPipe Hands."""

    SMOOTH_FRAMES = 5

    def __init__(self, camera_index: int = 0):
        self._camera_index = camera_index
        self._running      = False
        self._lock         = threading.Lock()

        self._positions = {'left': None, 'right': None}

        self._history = {
            'left':  deque(maxlen=self.SMOOTH_FRAMES),
            'right': deque(maxlen=self.SMOOTH_FRAMES)
        }

        self._debug_frame = None

        self._mp_hands    = mp.solutions.hands
        self._mp_drawing  = mp.solutions.drawing_utils
        self._mp_styles   = mp.solutions.drawing_styles


    def run(self):
        self._running = True
        cap = cv2.VideoCapture(self._camera_index)

        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        cap.set(cv2.CAP_PROP_FPS, 30)

        with self._mp_hands.Hands(
            model_complexity=0,
            max_num_hands=2,
            min_detection_confidence=0.6,
            min_tracking_confidence=0.5,
        ) as hands:

            while self._running:
                ok, frame = cap.read()
                if not ok:
                    continue

                frame = cv2.flip(frame, 1)


                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                rgb.flags.writeable = False
                results = hands.process(rgb)
                rgb.flags.writeable = True

                new_pos = {'left': None, 'right': None}

                if results.multi_hand_landmarks and results.multi_handedness:

                    for lm, handedness in zip(
                        results.multi_hand_landmarks,
                        results.multi_handedness,
                    ):
                        tip = lm.landmark[8]

                        raw_x = tip.x
                        raw_y = tip.y


                        label = handedness.classification[0].label.lower()

                        # smoothing
                        self._history[label].append((raw_x, raw_y))

                        xs = [p[0] for p in self._history[label]]
                        ys = [p[1] for p in self._history[label]]

                        smooth_x = float(np.mean(xs))
                        smooth_y = float(np.mean(ys))

                        new_pos[label] = (smooth_x, smooth_y)


                        self._mp_drawing.draw_landmarks(
                            frame,
                            lm,
                            self._mp_hands.HAND_CONNECTIONS,
                            self._mp_styles.get_default_hand_landmarks_style(),
                            self._mp_styles.get_default_hand_connections_style(),
                        )

                        h, w = frame.shape[:2]
                        cx = int(raw_x * w)
                        cy = int(raw_y * h)

                        colour = (66, 133, 244) if label == 'left' else (234, 67, 53)

                        cv2.circle(frame, (cx, cy), 10, colour, -1)
                        cv2.circle(frame, (cx, cy), 12, (255, 255, 255), 2)

                with self._lock:
                    self._positions = new_pos
                    self._debug_frame = frame.copy()

        cap.release()


    def stop(self):
        self._running = False

    def get_positions(self):
        with self._lock:
            return dict(self._positions)

    def get_debug_frame(self):
        with self._lock:
            return self._debug_frame


def norm_to_game(norm_x: float, norm_y: float,
                 game_w: int, game_h: int,
                 side: str = 'left',
                 margin: int = 40) -> tuple[float, float]:

    if side == 'left':
        gx = norm_x * (game_w / 2 - margin * 2) + margin
    else:
        gx = game_w / 2 + norm_x * (game_w / 2 - margin * 2) + margin

    gy = norm_y * (game_h - margin * 2) + margin

    return float(gx), float(gy)