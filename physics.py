import math


class Physics:
    """Collection of static physics helper methods."""

    @staticmethod
    def circle_overlap(ax: float, ay: float, ar: float,
                       bx: float, by: float, br: float) -> tuple[float, float, float]:
        """
        Check whether two circles overlap.

        Returns:
            (nx, ny, overlap) — the collision normal and penetration depth.
            If no overlap, overlap will be <= 0.
        """
        dx   = bx - ax
        dy   = by - ay
        dist = math.hypot(dx, dy)
        min_dist = ar + br

        if dist == 0:
            # Exactly coincident — choose an arbitrary normal
            return (1.0, 0.0, min_dist)

        nx = dx / dist
        ny = dy / dist
        overlap = min_dist - dist
        return (nx, ny, overlap)

    @staticmethod
    def reflect_velocity(vx: float, vy: float,
                         nx: float, ny: float,
                         restitution: float = 1.0) -> tuple[float, float]:
        """
        Reflect a velocity vector off a surface defined by its normal (nx, ny).

        Args:
            vx, vy       : Incoming velocity.
            nx, ny       : Surface normal (should be unit vector).
            restitution  : 1.0 = perfectly elastic, <1 = energy loss.

        Returns:
            (new_vx, new_vy)
        """
        dot = vx * nx + vy * ny
        return (
            vx - (1 + restitution) * dot * nx,
            vy - (1 + restitution) * dot * ny,
        )

    @staticmethod
    def elastic_impulse(avx: float, avy: float,
                        bvx: float, bvy: float,
                        nx: float, ny: float,
                        restitution: float = 1.05) -> tuple[float, float]:
        """
        Compute the post-impulse velocity change for object B (the puck)
        when A (the paddle) hits B.

        Only applies the impulse when the objects are moving towards each other
        (dot product of relative velocity and normal is negative).

        Returns:
            (dvx, dvy) — velocity delta to add to object B.
        """
        rel_vx = bvx - avx
        rel_vy = bvy - avy
        dot    = rel_vx * nx + rel_vy * ny

        if dot > 0:
            return (0.0, 0.0)   # Already separating

        impulse = -(1 + restitution) * dot / 2.0
        return (impulse * nx, impulse * ny)

    @staticmethod
    def clamp(value: float, lo: float, hi: float) -> float:
        """Clamp value to [lo, hi]."""
        return max(lo, min(hi, value))

    @staticmethod
    def lerp(a: float, b: float, t: float) -> float:
        """Linear interpolation between a and b."""
        return a + (b - a) * t

    @staticmethod
    def smooth_step(x: float) -> float:
        """Smooth-step easing function: maps [0,1] → [0,1] with S-curve."""
        x = Physics.clamp(x, 0.0, 1.0)
        return x * x * (3 - 2 * x)

    @staticmethod
    def limit_speed(vx: float, vy: float, max_speed: float) -> tuple[float, float]:
        """Scale velocity vector so its magnitude never exceeds max_speed."""
        spd = math.hypot(vx, vy)
        if spd > max_speed and spd > 0:
            factor = max_speed / spd
            return (vx * factor, vy * factor)
        return (vx, vy)

    @staticmethod
    def ensure_min_speed(vx: float, vy: float, min_speed: float) -> tuple[float, float]:
        """Scale velocity vector so its magnitude is at least min_speed."""
        spd = math.hypot(vx, vy)
        if 0 < spd < min_speed:
            factor = min_speed / spd
            return (vx * factor, vy * factor)
        if spd == 0:
            return (min_speed, 0.0)   # Arbitrary direction if stopped
        return (vx, vy)
