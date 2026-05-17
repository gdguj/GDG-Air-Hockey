import pygame
import sys
import cv2
import threading
from game import Game
from ui import UI
from hand_tracking import HandTracker
from effects import EffectSystem
import sound_manager

WINDOW_W = 1280
WINDOW_H = 720
FPS      = 60
TITLE    = "GDG Air Hockey"


def main():
    pygame.init()
    pygame.display.set_caption(TITLE)

    screen = pygame.display.set_mode((WINDOW_W, WINDOW_H), pygame.RESIZABLE)
    clock  = pygame.time.Clock()

    sound   = sound_manager.SoundManager()
    effects = EffectSystem(WINDOW_W, WINDOW_H)
    game    = Game(WINDOW_W, WINDOW_H, sound, effects)
    ui      = UI(WINDOW_W, WINDOW_H, screen)

    tracker = HandTracker()
    threading.Thread(target=tracker.run, daemon=True).start()

    app_state = 'menu'
    game_mode  = 'ai'

    running = True
    while running:

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

            elif event.type == pygame.KEYDOWN:
                if event.key in (pygame.K_ESCAPE, pygame.K_p):
                    if app_state == 'playing':
                        app_state = 'paused'
                    elif app_state == 'paused':
                        app_state = 'playing'

                if event.key == pygame.K_q:
                    running = False

            action = ui.handle_event(event, app_state)
            if action == 'start_ai':
                game_mode = 'ai'
                game.start(game_mode)
                app_state = 'playing'

            elif action == 'start_2p':
                game_mode = '2p'
                game.start(game_mode)
                app_state = 'playing'

            elif action == 'resume':
                app_state = 'playing'

            elif action == 'menu':
                app_state = 'menu'

            elif action == 'restart':
                game.start(game_mode)
                app_state = 'playing'

        # ── UPDATE ──
        if app_state == 'playing':
            hands = tracker.get_positions()

            left = hands.get('left')
            right = hands.get('right')

            # Player 1 (LEFT hand or mouse fallback)
            if left is not None:
                game.move_player1_hand(left[0], left[1])
            else:
                game.move_player1_mouse(pygame.mouse.get_pos())

            # Player 2 ONLY in 2P mode
            if game_mode == '2p' and right is not None:
                game.move_player2_hand(right[0], right[1])

            result = game.update(game_mode)
            if result == 'won':
                app_state = 'won'

        effects.update()

        # ── DRAW ──
        screen.fill((5, 5, 8))

        if app_state == 'playing':
            game.draw(screen)
            effects.draw(screen)
            ui.draw_hud(screen, game.score1, game.score2, game_mode)

        elif app_state == 'menu':
            game.draw(screen)
            ui.draw_menu(screen)

        elif app_state == 'paused':
            game.draw(screen)
            ui.draw_pause(screen)

        elif app_state == 'won':
            game.draw(screen)
            ui.draw_win(screen, game.score1, game.score2, game_mode)

        # webcam preview
        thumb = tracker.get_debug_frame()
        if thumb is not None:
            small = cv2.resize(thumb, (220, 140))
            small = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
            surf  = pygame.surfarray.make_surface(small.swapaxes(0, 1))
            screen.blit(surf, (WINDOW_W - 228, WINDOW_H - 148))
            pygame.draw.rect(screen, (66, 133, 244),
                             (WINDOW_W-228, WINDOW_H-148, 220, 140), 2)

        pygame.display.flip()
        clock.tick(FPS)

    tracker.stop()
    pygame.quit()
    sys.exit()


if __name__ == '__main__':
    main()