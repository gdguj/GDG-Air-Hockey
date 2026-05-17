"""
sound_manager.py
────────────────
Procedural sound effects generated via NumPy + Pygame mixer.

No audio files required — all sounds are synthesised on the fly.
This makes the project fully self-contained.

Sounds:
  'hit'   — Short click (paddle hits puck)
  'wall'  — Lower thud (puck bounces off wall)
  'goal'  — Ascending chime (someone scores)
  'win'   — Fanfare (game over)
  'click' — UI button click
"""

import pygame
import numpy as np

# Audio settings
SAMPLE_RATE = 44100
CHANNELS    = 2
BUFFER_SIZE = 512


def _sine_wave(freq: float, duration: float,
               amplitude: float = 0.4, fade: float = 0.1) -> np.ndarray:
    """Generate a mono sine wave as a numpy float32 array [-1, 1]."""
    n     = int(SAMPLE_RATE * duration)
    t     = np.linspace(0, duration, n, endpoint=False)
    wave  = amplitude * np.sin(2 * np.pi * freq * t)

    # Exponential decay envelope
    decay = np.exp(-t / max(fade, 1e-6))
    wave  = wave * decay

    return wave.astype(np.float32)


def _mix(*waves) -> np.ndarray:
    """Mix multiple mono waves by summing (and clipping)."""
    max_len = max(len(w) for w in waves)
    out = np.zeros(max_len, dtype=np.float32)
    for w in waves:
        out[:len(w)] += w
    return np.clip(out, -1.0, 1.0)


def _to_stereo(mono: np.ndarray) -> np.ndarray:
    """Convert mono array to 2-channel int16 suitable for pygame.sndarray."""
    stereo = np.column_stack([mono, mono])
    return (stereo * 32767).astype(np.int16)


def _make_sound(mono: np.ndarray) -> pygame.mixer.Sound | None:
    """Create a pygame Sound from a mono float32 array."""
    try:
        stereo = _to_stereo(mono)
        return pygame.sndarray.make_sound(stereo)
    except Exception:
        return None


class SoundManager:
    """
    Loads (synthesises) and plays game sound effects.

    Usage:
        sm = SoundManager()
        sm.play('hit')
    """

    def __init__(self):
        # Initialise the mixer (won't crash if audio not available)
        try:
            pygame.mixer.pre_init(SAMPLE_RATE, -16, CHANNELS, BUFFER_SIZE)
            pygame.mixer.init()
            self._enabled = True
        except Exception:
            self._enabled = False
            return

        self._sounds: dict[str, pygame.mixer.Sound | None] = {}
        self._generate_all()

    # ── Sound synthesis ───────────────────────────────────────────────────────

    def _generate_all(self):
        """Pre-generate all sound effects."""
        # Paddle hit — short mid-freq click
        hit = _mix(
            _sine_wave(440, 0.07, 0.35, 0.03),
            _sine_wave(660, 0.05, 0.20, 0.02),
        )
        self._sounds['hit'] = _make_sound(hit)

        # Wall bounce — lower, softer thud
        wall = _mix(
            _sine_wave(220, 0.08, 0.30, 0.05),
            _sine_wave(180, 0.06, 0.15, 0.04),
        )
        self._sounds['wall'] = _make_sound(wall)

        # Goal — ascending chime sequence (mixed to one sound)
        freqs     = [523, 659, 784, 1047]
        durations = [0.20, 0.20, 0.20, 0.35]
        delays    = [0,    0.12, 0.24, 0.38]
        total_len = int(SAMPLE_RATE * 0.85)
        goal_buf  = np.zeros(total_len, dtype=np.float32)
        for f, d, delay in zip(freqs, durations, delays):
            tone   = _sine_wave(f, d, 0.5, 0.08)
            start  = int(delay * SAMPLE_RATE)
            end    = min(start + len(tone), total_len)
            goal_buf[start:end] += tone[:end-start]
        goal_buf = np.clip(goal_buf, -1.0, 1.0)
        self._sounds['goal'] = _make_sound(goal_buf)

        # Win — ascending fanfare
        win_freqs = [523, 659, 784, 880, 1047, 1175]
        win_buf   = np.zeros(int(SAMPLE_RATE * 1.6), dtype=np.float32)
        for i, f in enumerate(win_freqs):
            delay = i * 0.18
            tone  = _sine_wave(f, 0.35, 0.55, 0.12)
            start = int(delay * SAMPLE_RATE)
            end   = min(start + len(tone), len(win_buf))
            win_buf[start:end] += tone[:end-start]
        win_buf = np.clip(win_buf, -1.0, 1.0)
        self._sounds['win'] = _make_sound(win_buf)

        # UI click — short high beep
        click = _sine_wave(880, 0.06, 0.25, 0.025)
        self._sounds['click'] = _make_sound(click)

    # ── Public API ────────────────────────────────────────────────────────────

    def play(self, name: str, volume: float = 1.0):
        """Play a named sound effect (non-blocking)."""
        if not self._enabled:
            return
        sound = self._sounds.get(name)
        if sound:
            sound.set_volume(volume)
            sound.play()

    def stop_all(self):
        """Stop all currently playing sounds."""
        if self._enabled:
            pygame.mixer.stop()
