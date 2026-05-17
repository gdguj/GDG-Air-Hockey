import pygame
import math
import random
import numpy as np
from physics import Physics
from effects import EffectSystem
from hand_tracking import norm_to_game

# GDG Brand Colours 
BLUE    = (66,  133, 244)
RED     = (234,  67,  53)
YELLOW  = (251, 188,   5)
GREEN   = (52,  168,  83)
WHITE   = (255, 255, 255)
BG      = (  5,   5,   8)
DIM     = ( 20,  20,  30)

WIN_SCORE = 3      # First player to this score wins
GOAL_PAUSE = 90       # Frames to pause after a goal
FPS        = 60


class Paddle:
    """A glowing neon paddle controlled by a player or the AI."""

    def __init__(self, x, y, radius, colour, glow_colour):
        self.x      = float(x)
        self.y      = float(y)
        self.radius = radius
        self.colour = colour
        self.glow   = glow_colour

        self.vx = 0.0   # Velocity (used when colliding with puck)
        self.vy = 0.0

        self._px = x    # Previous position (for velocity calculation)
        self._py = y

    def set_position(self, x: float, y: float):
        """Move the paddle and record velocity for physics."""
        self.vx = x - self.x
        self.vy = y - self.y
        self._px = self.x
        self._py = self.y
        self.x = x
        self.y = y

    def draw(self, surface: pygame.Surface):
        """Render a layered glow paddle."""
        # Outer glow (additive blend)
        glow_surf = pygame.Surface(
            (self.radius * 6, self.radius * 6), pygame.SRCALPHA
        )
        for i in range(6, 0, -1):
            alpha = int(30 * (i / 6) ** 2)
            r     = int(self.radius * (1 + i * 0.35))
            pygame.draw.circle(
                glow_surf, (*self.glow, alpha),
                (self.radius * 3, self.radius * 3), r
            )
        surface.blit(
            glow_surf,
            (int(self.x) - self.radius * 3, int(self.y) - self.radius * 3),
            special_flags=pygame.BLEND_RGB_ADD
        )

        # White outer ring
        pygame.draw.circle(surface, WHITE,
                           (int(self.x), int(self.y)), self.radius, 4)
        # Coloured ring
        pygame.draw.circle(surface, self.colour,
                           (int(self.x), int(self.y)), self.radius - 5, 3)
        # Centre dot
        pygame.draw.circle(surface, self.colour,
                           (int(self.x), int(self.y)),
                           int(self.radius * 0.38))


class Puck:
    """The glowing air hockey puck with a motion trail."""

    MAX_SPEED  = 18.0
    MIN_SPEED  = 4.0
    TRAIL_LEN  = 20

    def __init__(self, x, y, radius):
        self.x      = float(x)
        self.y      = float(y)
        self.radius = radius
        self.vx     = 5.0
        self.vy     = 3.0
        self.trail  = []     # List of (x, y) past positions

    def reset(self, cx, cy, direction: int = 1):
        """Re-launch the puck from centre."""
        self.x = float(cx)
        self.y = float(cy)
        angle  = random.uniform(-math.pi/4, math.pi/4)
        speed  = 6.0
        self.vx = math.cos(angle) * speed * direction
        self.vy = math.sin(angle) * speed
        self.trail = []

    def update(self):
        """Move the puck and record trail."""
        self.trail.append((self.x, self.y))
        if len(self.trail) > self.TRAIL_LEN:
            self.trail.pop(0)

        self.x += self.vx
        self.y += self.vy

        # Speed cap
        spd = math.hypot(self.vx, self.vy)
        if spd > self.MAX_SPEED:
            self.vx = self.vx / spd * self.MAX_SPEED
            self.vy = self.vy / spd * self.MAX_SPEED

        # Minimum speed to prevent stalling
        if spd < self.MIN_SPEED and spd > 0:
            factor = self.MIN_SPEED / spd
            self.vx *= factor
            self.vy *= factor

    def draw(self, surface: pygame.Surface):
        """Draw trail then puck body."""
        n = len(self.trail)
        for i, (tx, ty) in enumerate(self.trail):
            prog  = i / max(n, 1)
            alpha = int(200 * prog * prog)    # Quadratic fade
            r     = int(self.radius * prog * 0.65)
            if r < 1:
                continue
            trail_surf = pygame.Surface((r * 2 + 2, r * 2 + 2), pygame.SRCALPHA)
            pygame.draw.circle(trail_surf, (*YELLOW, alpha), (r+1, r+1), r)
            surface.blit(
                trail_surf, (int(tx) - r - 1, int(ty) - r - 1),
                special_flags=pygame.BLEND_RGBA_ADD
            )

        # Glow halo
        g = pygame.Surface((self.radius*5, self.radius*5), pygame.SRCALPHA)
        for layer in range(5, 0, -1):
            a = int(40 * (layer/5)**2)
            r = int(self.radius * (0.8 + layer * 0.4))
            pygame.draw.circle(g, (*YELLOW, a),
                               (self.radius*5//2, self.radius*5//2), r)
        surface.blit(
            g, (int(self.x) - self.radius*5//2, int(self.y) - self.radius*5//2),
            special_flags=pygame.BLEND_RGB_ADD
        )

        # White body
        pygame.draw.circle(surface, WHITE,
                           (int(self.x), int(self.y)), self.radius)
        pygame.draw.circle(surface, YELLOW,
                           (int(self.x), int(self.y)), self.radius, 3)


class AI:
    """
    Simple AI opponent with puck-tracking and a bit of 'randomness'
    to make it beatable.
    """

    def __init__(self, speed: float = 6.0, reaction: float = 0.4):
        self.speed    = speed       # Max pixels/frame
        self.reaction = reaction    # 0.0 (slow) → 1.0 (instant)

    def compute_target(self, puck: Puck, goal_x: float, field_h: int) -> tuple[float, float]:
        """
        Predict where the puck will be and return the ideal paddle position.
        """
        # Simple extrapolation: follow the puck if it's heading towards AI's goal
        px, py  = puck.x, puck.y
        pvx, pvy = puck.vx, puck.vy

        # Look ahead 25 frames
        for _ in range(25):
            px += pvx
            py += pvy
            if py < 30 or py > field_h - 30:
                pvy *= -1

        target_x = goal_x + random.uniform(-20, 20)   # Small imperfection
        target_y = min(max(py, 60), field_h - 60)
        return (target_x, target_y)

    def move(self, paddle: Paddle, target_x: float, target_y: float):
        """Move the paddle towards the target at self.speed."""
        dx = target_x - paddle.x
        dy = target_y - paddle.y
        dist = math.hypot(dx, dy)
        if dist > 1:
            step = min(self.speed, dist)
            paddle.set_position(
                paddle.x + dx / dist * step,
                paddle.y + dy / dist * step,
            )


class Game:
    """Top-level game manager."""

    PADDLE_R    = 36
    PUCK_R      = 20
    GOAL_H      = 160     # Goal mouth height in pixels
    GOAL_WALL_W = 14      # Width of the goal wall indicator

    def __init__(self, w: int, h: int, sound, effects: EffectSystem):
        self.w       = w
        self.h       = h
        self.sound   = sound
        self.effects = effects

        self.score1 = 0
        self.score2 = 0

        self._pause_timer  = 0    # Countdown after goal
        self._goal_flash   = {'active': False, 'side': 0, 'timer': 0}

        # Goal mouth Y range
        self._goal_y1 = h // 2 - self.GOAL_H // 2
        self._goal_y2 = h // 2 + self.GOAL_H // 2

        # Objects
        self.player1 = Paddle(w * 0.18, h // 2, self.PADDLE_R, BLUE,  BLUE)
        self.player2 = Paddle(w * 0.82, h // 2, self.PADDLE_R, RED,   RED)
        self.puck    = Puck(w // 2, h // 2, self.PUCK_R)

        self.ai = AI(speed=6.5, reaction=0.4)
        self._mode = 'ai'

        # Field surface (drawn once, cached)
        self._field_surf = None
        self._build_field()

    # ── Public ────────────────────────────────────────────────────────────────

    def start(self, mode: str = 'ai'):
        """Reset the game and begin play."""
        self._mode  = mode
        self.score1 = 0
        self.score2 = 0
        self._reset_round(direction=1)

    def move_player1_hand(self, norm_x: float, norm_y: float):
        """Move P1 from normalised hand coordinates."""
        gx, gy = norm_to_game(norm_x, norm_y, self.w, self.h,
                               side='left', margin=self.PADDLE_R + 8)
        gx = max(self.PADDLE_R + 8, min(self.w // 2 - self.PADDLE_R - 4, gx))
        gy = max(self.PADDLE_R + 8, min(self.h - self.PADDLE_R - 8, gy))
        self.player1.set_position(gx, gy)

    def move_player1_mouse(self, mouse_pos: tuple):
        """Fallback: move P1 from mouse coordinates."""
        mx, my = mouse_pos
        # Scale if window is resized
        gx = max(self.PADDLE_R + 8, min(self.w // 2 - self.PADDLE_R - 4, mx))
        gy = max(self.PADDLE_R + 8, min(self.h - self.PADDLE_R - 8, my))
        self.player1.set_position(gx, gy)

    def move_player2_hand(self, norm_x: float, norm_y: float):
        """Move P2 from hand coordinates (2P mode)."""
        gx, gy = norm_to_game(norm_x, norm_y, self.w, self.h,
                               side='right', margin=self.PADDLE_R + 8)
        gx = max(self.w // 2 + self.PADDLE_R + 4, min(self.w - self.PADDLE_R - 8, gx))
        gy = max(self.PADDLE_R + 8, min(self.h - self.PADDLE_R - 8, gy))
        self.player2.set_position(gx, gy)

    def update(self, mode: str) -> str | None:
        """
        Run one frame of simulation.
        Returns 'won' if someone hit WIN_SCORE, else None.
        """
        self._mode = mode

        # Wait after a goal before resuming
        if self._pause_timer > 0:
            self._pause_timer -= 1
            if self._pause_timer == 0:
                direction = 1 if self._goal_flash['side'] == 2 else -1
                self._reset_round(direction)
            return None

        # AI control
        if mode == 'ai':
            tx, ty = self.ai.compute_target(
                self.puck, self.w * 0.82, self.h
            )
            tx = max(self.w // 2 + self.PADDLE_R + 4,
                     min(self.w - self.PADDLE_R - 8, tx))
            ty = max(self.PADDLE_R + 8, min(self.h - self.PADDLE_R - 8, ty))
            self.ai.move(self.player2, tx, ty)

        # Physics
        self.puck.update()
        self._collide_walls()
        self._collide_paddle(self.player1)
        self._collide_paddle(self.player2)

        # Goal flash countdown
        if self._goal_flash['active']:
            self._goal_flash['timer'] -= 1
            if self._goal_flash['timer'] <= 0:
                self._goal_flash['active'] = False

        # Win condition
        if self.score1 >= WIN_SCORE or self.score2 >= WIN_SCORE:
            return 'won'

        return None

    def draw(self, surface: pygame.Surface):
        """Render the entire game scene."""
        # Field (cached surface)
        surface.blit(self._field_surf, (0, 0))

        # Goal flash highlight
        if self._goal_flash['active']:
            alpha = int(60 * self._goal_flash['timer'] / 60)
            flash = pygame.Surface((self.w // 2, self.h), pygame.SRCALPHA)
            colour = BLUE if self._goal_flash['side'] == 1 else RED
            flash.fill((*colour, alpha))
            x_off = 0 if self._goal_flash['side'] == 1 else self.w // 2
            surface.blit(flash, (x_off, 0))

        # Game objects
        self.puck.draw(surface)
        self.player1.draw(surface)
        self.player2.draw(surface)

    # Private helpers 

    def _reset_round(self, direction: int = 1):
        """Re-centre the puck."""
        self.puck.reset(self.w // 2, self.h // 2, direction)

    def _collide_walls(self):
        """Bounce puck off top/bottom walls and detect goals."""
        p = self.puck
        r = p.radius

        # Top / bottom
        if p.y - r < 0:
            p.y = r
            p.vy = abs(p.vy)
            self.sound.play('wall')
            self.effects.spawn_particles(p.x, 0, YELLOW, 8)

        if p.y + r > self.h:
            p.y = self.h - r
            p.vy = -abs(p.vy)
            self.sound.play('wall')
            self.effects.spawn_particles(p.x, self.h, YELLOW, 8)

        # Left wall / goal
        if p.x - r < 0:
            if self._goal_y1 <= p.y <= self._goal_y2:
                # P2 scored
                self.score2 += 1
                self.sound.play('goal')
                self._goal_flash = {'active': True, 'side': 2, 'timer': 60}
                self.effects.spawn_particles(0, p.y, RED, 24)
                self._pause_timer = GOAL_PAUSE
            else:
                p.x  = r
                p.vx = abs(p.vx)
                self.sound.play('wall')

        # Right wall / goal
        if p.x + r > self.w:
            if self._goal_y1 <= p.y <= self._goal_y2:
                # P1 scored
                self.score1 += 1
                self.sound.play('goal')
                self._goal_flash = {'active': True, 'side': 1, 'timer': 60}
                self.effects.spawn_particles(self.w, p.y, BLUE, 24)
                self._pause_timer = GOAL_PAUSE
            else:
                p.x  = self.w - r
                p.vx = -abs(p.vx)
                self.sound.play('wall')

    def _collide_paddle(self, paddle: Paddle):
        """Elastic collision between the puck and a paddle."""
        p  = self.puck
        dx = p.x - paddle.x
        dy = p.y - paddle.y
        dist = math.hypot(dx, dy)
        min_dist = p.radius + paddle.radius

        if dist < min_dist and dist > 0:
            # Normal vector
            nx = dx / dist
            ny = dy / dist

            # Separate objects
            overlap = min_dist - dist
            p.x += nx * overlap
            p.y += ny * overlap

            # Transfer momentum from paddle velocity
            puck_speed = math.hypot(p.vx, p.vy)
            paddle_spd = math.hypot(paddle.vx, paddle.vy)

            relative_vx = p.vx - paddle.vx
            relative_vy = p.vy - paddle.vy
            dot = relative_vx * nx + relative_vy * ny

            if dot < 0:
                restitution = 1.1     # Slightly elastic for satisfying hits
                impulse = -(1 + restitution) * dot / 2.0
                p.vx  += impulse * nx
                p.vy  += impulse * ny

            # Add a fraction of the paddle's own velocity for "flick" effect
            p.vx += paddle.vx * 0.45
            p.vy += paddle.vy * 0.45

            self.sound.play('hit')
            colour = BLUE if paddle is self.player1 else RED
            self.effects.spawn_particles(p.x, p.y, colour, 14)

    def _build_field(self):
        """Pre-render the static field to a surface for performance."""
        surf = pygame.Surface((self.w, self.h))
        surf.fill(BG)

        # Subtle grid
        for x in range(0, self.w, 72):
            pygame.draw.line(surf, (18, 18, 28), (x, 0), (x, self.h), 1)
        for y in range(0, self.h, 72):
            pygame.draw.line(surf, (18, 18, 28), (0, y), (self.w, y), 1)

        # Centre circle
        pygame.draw.circle(surf, (25, 25, 40), (self.w//2, self.h//2), 100, 2)
        pygame.draw.line(surf, (25, 25, 40), (self.w//2, 0), (self.w//2, self.h), 1)
        pygame.draw.circle(surf, (30, 30, 50), (self.w//2, self.h//2), 6)

        # Neon border — Blue (P1 left), Red (P2 right)
        def neon_line(s, x1, y1, x2, y2, col, w=3):
            pygame.draw.line(s, col, (x1, y1), (x2, y2), w)
            # Bright white core
            pygame.draw.line(s, WHITE, (x1, y1), (x2, y2), max(1, w-2))

        gy1, gy2 = self._goal_y1, self._goal_y2
        # Top edge
        neon_line(surf, 0, 0, self.w//2, 0, BLUE)
        neon_line(surf, self.w//2, 0, self.w, 0, RED)
        # Bottom edge
        neon_line(surf, 0, self.h-1, self.w//2, self.h-1, BLUE)
        neon_line(surf, self.w//2, self.h-1, self.w, self.h-1, RED)
        # Left wall (outside goal)
        neon_line(surf, 0, 0, 0, gy1, BLUE)
        neon_line(surf, 0, gy2, 0, self.h, BLUE)
        # Right wall (outside goal)
        neon_line(surf, self.w-1, 0, self.w-1, gy1, RED)
        neon_line(surf, self.w-1, gy2, self.w-1, self.h, RED)

        # Goal posts (Yellow)
        goal_post_len = 40
        for y in (gy1, gy2):
            neon_line(surf, 0, y, goal_post_len, y, YELLOW, 4)
            neon_line(surf, self.w, y, self.w - goal_post_len, y, YELLOW, 4)

        # Goal net texture
        net_col = (40, 35, 10)
        for yy in range(gy1, gy2, 18):
            pygame.draw.line(surf, net_col, (0, yy), (50, yy), 1)
            pygame.draw.line(surf, net_col, (self.w, yy), (self.w-50, yy), 1)
        for xx in range(0, 51, 14):
            pygame.draw.line(surf, net_col, (xx, gy1), (xx, gy2), 1)
            pygame.draw.line(surf, net_col, (self.w-xx, gy1), (self.w-xx, gy2), 1)

        # Corner dots (GDG colour accent)
        for (cx, cy, col) in [
            (20, 20, BLUE), (self.w-20, 20, RED),
            (20, self.h-20, GREEN), (self.w-20, self.h-20, YELLOW)
        ]:
            pygame.draw.circle(surf, col, (cx, cy), 10, 2)

        self._field_surf = surf
