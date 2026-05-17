import pygame
import math
import random


class Particle:

    def __init__(self, x: float, y: float, colour: tuple,
                 vx: float, vy: float,
                 life: float = 1.0,
                 radius: float = 4.0,
                 gravity: float = 0.1):
        self.x      = x
        self.y      = y
        self.colour = colour
        self.vx     = vx
        self.vy     = vy
        self.life   = life    
        self.decay  = random.uniform(0.025, 0.06)
        self.radius = radius
        self.gravity = gravity

    @property
    def alive(self) -> bool:
        return self.life > 0

    def update(self):
        """Move and age the particle."""
        self.x  += self.vx
        self.y  += self.vy
        self.vy += self.gravity      # Slight downward drift
        self.vx *= 0.90              # Air resistance
        self.vy *= 0.90
        self.life -= self.decay

    def draw(self, surface: pygame.Surface):
        """Render as a glowing dot with additive blending."""
        if not self.alive:
            return
        r     = max(1, int(self.radius * self.life))
        alpha = int(220 * self.life)

        # Outer soft glow
        glow = pygame.Surface((r*4, r*4), pygame.SRCALPHA)
        pygame.draw.circle(glow, (*self.colour, alpha // 3), (r*2, r*2), r*2)
        surface.blit(
            glow,
            (int(self.x) - r*2, int(self.y) - r*2),
            special_flags=pygame.BLEND_RGB_ADD,
        )

        # Bright core
        core = pygame.Surface((r*2, r*2), pygame.SRCALPHA)
        pygame.draw.circle(core, (*self.colour, alpha), (r, r), r)
        surface.blit(core, (int(self.x) - r, int(self.y) - r),
                     special_flags=pygame.BLEND_RGBA_ADD)


class Confetti(Particle):
    """A rectangular confetti piece for the win celebration."""

    def __init__(self, x, y, colour):
        angle = random.uniform(0, math.pi * 2)
        speed = random.uniform(2, 8)
        super().__init__(
            x, y, colour,
            vx=math.cos(angle) * speed,
            vy=math.sin(angle) * speed - 5,   # Burst upward
            life=1.0, radius=5, gravity=0.25
        )
        self.decay  = random.uniform(0.008, 0.018)   # Slower fade
        self.width  = random.randint(4, 10)
        self.height = random.randint(2, 5)
        self.angle  = random.uniform(0, 360)
        self.spin   = random.uniform(-5, 5)

    def draw(self, surface: pygame.Surface):
        if not self.alive:
            return
        self.angle += self.spin
        alpha = int(255 * self.life)
        s = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        s.fill((*self.colour, alpha))
        rotated = pygame.transform.rotate(s, self.angle)
        surface.blit(rotated, (int(self.x), int(self.y)))


class ScreenFlash:
    """Brief full-screen colour flash."""

    def __init__(self, w: int, h: int):
        self.w      = w
        self.h      = h
        self._alpha = 0
        self._colour = (255, 255, 255)
        self._decay  = 8

    def trigger(self, colour: tuple, intensity: int = 120):
        self._colour = colour
        self._alpha  = intensity

    def update(self):
        self._alpha = max(0, self._alpha - self._decay)

    def draw(self, surface: pygame.Surface):
        if self._alpha <= 0:
            return
        flash = pygame.Surface((self.w, self.h), pygame.SRCALPHA)
        flash.fill((*self._colour, int(self._alpha)))
        surface.blit(flash, (0, 0))


class EffectSystem:

    GDG_COLOURS = [
        (66, 133, 244),    # Blue
        (234,  67,  53),   # Red
        (251, 188,   5),   # Yellow
        ( 52, 168,  83),   # Green
    ]

    def __init__(self, w: int, h: int):
        self.w = w
        self.h = h

        self._particles: list[Particle] = []
        self._flash = ScreenFlash(w, h)

        # Particle cap (for performance)
        self._MAX_PARTICLES = 400

    # Public API 

    def spawn_particles(self, x: float, y: float, colour: tuple,
                        count: int = 12, speed_range=(2, 7),
                        gravity: float = 0.08):
        """Emit a burst of spark particles from (x, y)."""
        remaining = self._MAX_PARTICLES - len(self._particles)
        count = min(count, remaining)
        for _ in range(count):
            angle = random.uniform(0, math.pi * 2)
            speed = random.uniform(*speed_range)
            r     = random.uniform(2, 5)
            self._particles.append(
                Particle(
                    x, y, colour,
                    vx=math.cos(angle) * speed,
                    vy=math.sin(angle) * speed,
                    life=1.0, radius=r, gravity=gravity,
                )
            )

    def flash(self, colour: tuple, intensity: int = 100):
        """Trigger a brief screen flash."""
        self._flash.trigger(colour, intensity)

    def celebrate(self):
        """Spawn a confetti burst for the win screen."""
        for _ in range(min(120, self._MAX_PARTICLES - len(self._particles))):
            colour = random.choice(self.GDG_COLOURS)
            x = random.randint(0, self.w)
            y = random.randint(-50, self.h // 3)
            self._particles.append(Confetti(x, y, colour))

    def clear(self):
        """Remove all active particles."""
        self._particles.clear()

    # Game loop methods 

    def update(self):
        """Advance all effects by one frame."""
        self._flash.update()
        for p in self._particles:
            p.update()
        # Prune dead particles
        self._particles = [p for p in self._particles if p.alive]

    def draw(self, surface: pygame.Surface):
        """Render all active effects onto surface."""
        for p in self._particles:
            p.draw(surface)
        self._flash.draw(surface)
