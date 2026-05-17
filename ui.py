
import pygame
import math
import time

# ── GDG Brand Colours 
BLUE    = (66,  133, 244)
RED     = (234,  67,  53)
YELLOW  = (251, 188,   5)
GREEN   = (52,  168,  83)
WHITE   = (255, 255, 255)
BG      = (  5,   5,   8)
PANEL   = ( 15,  15,  22)
DIM     = (180, 180, 200)

WIN_SCORE = 3


# Minimal button class 

class Button:
    """A glowing neon button with hover detection."""

    def __init__(self, rect: pygame.Rect, text: str,
                 colour=BLUE, text_colour=WHITE, action: str = ''):
        self.rect       = rect
        self.text       = text
        self.colour     = colour
        self.text_colour = text_colour
        self.action     = action
        self._hovered   = False

    def check_hover(self, pos):
        self._hovered = self.rect.collidepoint(pos)

    def draw(self, surface: pygame.Surface, font: pygame.font.Font):
        col  = self.colour
        glow = 30 if not self._hovered else 60

        # Glow layer
        glow_surf = pygame.Surface(
            (self.rect.w + glow*2, self.rect.h + glow*2), pygame.SRCALPHA
        )
        for i in range(glow, 0, -4):
            alpha = int(20 * (i / glow) ** 1.5)
            r     = i
            pygame.draw.rect(
                glow_surf, (*col, alpha),
                (glow - r, glow - r, self.rect.w + r*2, self.rect.h + r*2),
                border_radius=int(self.rect.h // 2)
            )
        surface.blit(
            glow_surf,
            (self.rect.x - glow, self.rect.y - glow),
            special_flags=pygame.BLEND_RGB_ADD
        )

        # Background fill
        alpha = 220 if self._hovered else 180
        fill  = (*col, alpha)
        btn_surf = pygame.Surface((self.rect.w, self.rect.h), pygame.SRCALPHA)
        pygame.draw.rect(btn_surf, fill,
                         (0, 0, self.rect.w, self.rect.h),
                         border_radius=self.rect.h // 2)
        surface.blit(btn_surf, self.rect.topleft)

        # Border
        pygame.draw.rect(surface, col, self.rect,
                         2, border_radius=self.rect.h // 2)

        # Label
        label = font.render(self.text, True, self.text_colour)
        surface.blit(
            label,
            (self.rect.centerx - label.get_width()  // 2,
             self.rect.centery - label.get_height() // 2)
        )

    def handle_click(self, event) -> str | None:
        if (event.type == pygame.MOUSEBUTTONDOWN and
                event.button == 1 and self.rect.collidepoint(event.pos)):
            return self.action
        return None


# Main UI class 

class UI:
    """Renders all UI states and dispatches button actions."""

    def __init__(self, w: int, h: int, screen: pygame.Surface):
        self.w = w
        self.h = h

        # Fonts
        pygame.font.init()
        try:
            self._font_lg = pygame.font.SysFont('Arial', 64, bold=True)
            self._font_md = pygame.font.SysFont('Arial', 32, bold=True)
            self._font_sm = pygame.font.SysFont('Arial', 18)
            self._font_xs = pygame.font.SysFont('Arial', 13)
        except Exception:
            self._font_lg = pygame.font.Font(None, 72)
            self._font_md = pygame.font.Font(None, 40)
            self._font_sm = pygame.font.Font(None, 24)
            self._font_xs = pygame.font.Font(None, 18)

        # Button layouts
        bw, bh = 260, 52
        cx = w // 2 - bw // 2

        self._menu_buttons = [
            Button(pygame.Rect(cx, h//2 + 20,  bw, bh), 'Play vs AI',    BLUE,  WHITE, 'start_ai'),
            Button(pygame.Rect(cx, h//2 + 150,  bw, bh), 'Two Players',   GREEN, WHITE, 'start_2p'),
        ]
        self._pause_buttons = [
            Button(pygame.Rect(cx, h//2-50,        bw, bh), 'Resume',        BLUE,  WHITE, 'resume'),
            Button(pygame.Rect(cx, h//2 + 120,   bw, bh), 'Main Menu',     RED,   WHITE, 'menu'),
        ]
        self._win_buttons = [
            Button(pygame.Rect(cx, h//2 ,   bw, bh), 'Play Again',    BLUE,  WHITE, 'restart'),
            Button(pygame.Rect(cx, h//2 + 120,  bw, bh), 'Main Menu',     RED,   WHITE, 'menu'),
        ]

        # Animated dots for the GDG logo
        self._t0 = time.time()

    # Event dispatch 

    def handle_event(self, event: pygame.event.Event, state: str) -> str | None:
        """Route events to the correct set of buttons. Returns action string."""
        if event.type == pygame.MOUSEMOTION:
            pos = event.pos
            for b in self._all_buttons(state):
                b.check_hover(pos)

        if event.type == pygame.MOUSEBUTTONDOWN:
            for b in self._all_buttons(state):
                action = b.handle_click(event)
                if action:
                    return action
        return None

    def _all_buttons(self, state: str):
        return {
            'menu':   self._menu_buttons,
            'paused': self._pause_buttons,
            'won':    self._win_buttons,
        }.get(state, [])

    # Draw calls

    def draw_menu(self, surface: pygame.Surface):
        """Full-screen semi-transparent main menu."""
        self._draw_overlay(surface, 200)
        self._draw_gdg_logo(surface, self.w // 2, self.h // 2 - 200)

        # Title
        title = self._font_lg.render('AIR HOCKEY', True, WHITE)
        surface.blit(title, (self.w // 2 - title.get_width() // 2,
                              self.h // 2 - 120))

        for b in self._menu_buttons:
            b.draw(surface, self._font_sm)

        # Controls hint
        hints = [
            ('P1', 'Hand Tracking / Mouse'),
            ('P2', 'Second Hand / WASD'),
            ('ESC / P', 'Pause'),
        ]
        for i, (key, val) in enumerate(hints):
            txt = self._font_xs.render(f'{key}  ·  {val}', True, (80, 80, 100))
            surface.blit(txt, (self.w // 2 - txt.get_width() // 2,
                                self.h - 80 + i * 18))

    def draw_hud(self, surface: pygame.Surface,
                 score1: int, score2: int, mode: str):
        """In-game HUD: scoreboard at the top."""
        # Score pill background
        pill_w, pill_h = 220, 52
        pill_x = self.w // 2 - pill_w // 2
        pill = pygame.Surface((pill_w, pill_h), pygame.SRCALPHA)
        pygame.draw.rect(pill, (255, 255, 255, 10),
                         (0, 0, pill_w, pill_h), border_radius=pill_h // 2)
        pygame.draw.rect(pill, (255, 255, 255, 20),
                         (0, 0, pill_w, pill_h), 1, border_radius=pill_h // 2)
        surface.blit(pill, (pill_x, 12))

        # Scores
        s1 = self._font_md.render(str(score1), True, BLUE)
        s2 = self._font_md.render(str(score2), True, RED)
        sep = self._font_md.render(' : ', True, (80, 80, 100))
        cx = self.w // 2
        sep_w = sep.get_width()
        surface.blit(s1,  (cx - sep_w//2 - s1.get_width() - 4, 18))
        surface.blit(sep, (cx - sep_w//2, 18))
        surface.blit(s2,  (cx + sep_w//2 + 4, 18))

        # Win target
        wt = self._font_xs.render(f'First to {WIN_SCORE}', True, (80, 80, 100))
        surface.blit(wt, (self.w // 2 - wt.get_width() // 2, 68))

        # Mode badge bottom
        mode_txt = 'With AI' if mode == 'ai' else '2 Players'
        mt = self._font_xs.render(mode_txt, True, (60, 60, 80))
        surface.blit(mt, (self.w // 2 - mt.get_width() // 2, self.h - 18))

        # ESC hint
        esc = self._font_xs.render('ESC · Pause', True, (50, 50, 70))
        surface.blit(esc, (self.w - esc.get_width() - 14, self.h - 18))

    def draw_pause(self, surface: pygame.Surface):
        """Pause overlay."""
        self._draw_overlay(surface, 180)

        title = self._font_lg.render('PAUSED', True, WHITE)
        surface.blit(title, (self.w//2 - title.get_width()//2,
                              self.h//2 - 200))

        for b in self._pause_buttons:
            b.draw(surface, self._font_sm)

    def draw_win(self, surface: pygame.Surface,
                 score1: int, score2: int, mode: str):
        """Win / game-over screen."""
        self._draw_overlay(surface, 200)

        winner = 'Player 1' if score1 >= WIN_SCORE else ('AI' if mode == 'ai' else 'Player 2')
        col    = BLUE if score1 >= WIN_SCORE else RED

        wt = self._font_lg.render(f'{winner} Wins!', True, col)
        surface.blit(wt, (self.w//2 - wt.get_width()//2, self.h//2 - 160))

        # Score display
        score_str = f'{score1}  —  {score2}'
        st = self._font_md.render(score_str, True, DIM)
        surface.blit(st, (self.w//2 - st.get_width()//2, self.h//2 -90))

        for b in self._win_buttons:
            b.draw(surface, self._font_sm)

    # Helpers 

    def _draw_overlay(self, surface: pygame.Surface, alpha: int = 180):
        overlay = pygame.Surface((self.w, self.h), pygame.SRCALPHA)
        overlay.fill((5, 5, 8, alpha))
        surface.blit(overlay, (0, 0))

    def _draw_gdg_logo(self, surface: pygame.Surface, cx: int, cy: int):
        """Animated pulsing GDG colour dots."""
        t = time.time() - self._t0
        colours = [BLUE, RED, YELLOW, GREEN]
        spacing = 22
        total_w = len(colours) * spacing - spacing
        x0 = cx - total_w // 2

        for i, col in enumerate(colours):
            pulse = math.sin(t * 3 + i * 0.8) * 0.3 + 0.7
            r     = int(8 * pulse)
            glow  = pygame.Surface((r*6, r*6), pygame.SRCALPHA)
            pygame.draw.circle(glow, (*col, 60), (r*3, r*3), r*3)
            surface.blit(glow, (x0 + i*spacing - r*3, cy - r*3),
                         special_flags=pygame.BLEND_RGB_ADD)
            pygame.draw.circle(surface, col, (x0 + i*spacing, cy), r)

        # "GDG ON CAMPUS" label
        lbl = self._font_xs.render('GDG ON CAMPUS  ·  UNIVERSITY OF JEDDAH',
                                    True, (80, 80, 100))
        surface.blit(lbl, (cx - lbl.get_width() // 2, cy + 20))
