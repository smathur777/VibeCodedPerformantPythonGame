from collections import deque
import random
import tkinter as tk


GRID_SIZE = 20
GRID_WIDTH = 30
GRID_HEIGHT = 20
INITIAL_DELAY_MS = 140
MIN_DELAY_MS = 70
DELAY_STEP_MS = 4

BOARD_WIDTH = GRID_WIDTH * GRID_SIZE
BOARD_HEIGHT = GRID_HEIGHT * GRID_SIZE
CELL_PADDING = 2

BACKGROUND_COLOR = "#101820"
GRID_COLOR = "#1a2530"
HEAD_FILL = "#7bd389"
HEAD_OUTLINE = "#d9fbe2"
BODY_FILL = "#32a852"
BODY_OUTLINE = "#7bd389"
FOOD_FILL = "#f95738"
FOOD_OUTLINE = "#ffb5a7"


class SnakeGame:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Snake")
        self.root.resizable(False, False)

        self.score_var = tk.StringVar()
        self.message_var = tk.StringVar(value="Use arrow keys or WASD to move")

        info_frame = tk.Frame(root, padx=10, pady=10)
        info_frame.pack(fill="x")

        tk.Label(
            info_frame,
            textvariable=self.score_var,
            font=("Helvetica", 14, "bold"),
        ).pack(anchor="w")
        tk.Label(
            info_frame,
            textvariable=self.message_var,
            font=("Helvetica", 10),
        ).pack(anchor="w", pady=(4, 0))

        self.canvas = tk.Canvas(
            root,
            width=BOARD_WIDTH,
            height=BOARD_HEIGHT,
            bg=BACKGROUND_COLOR,
            highlightthickness=0,
        )
        self.canvas.pack(padx=10, pady=(0, 10))

        self.root.bind("<KeyPress>", self.on_key_press)

        self.after_id: str | None = None
        self.segment_ids: list[int] = []
        self.food_id: int | None = None
        self.overlay_ids: list[int] = []

        self.draw_static_grid()
        self.reset_game()

    def reset_game(self) -> None:
        if self.after_id is not None:
            self.root.after_cancel(self.after_id)
            self.after_id = None

        self.clear_overlay()
        self.message_var.set("Use arrow keys or WASD to move")

        center_x = GRID_WIDTH // 2
        center_y = GRID_HEIGHT // 2
        self.snake = deque(
            [
                (center_x, center_y),
                (center_x - 1, center_y),
                (center_x - 2, center_y),
            ]
        )
        self.snake_cells = set(self.snake)
        self.free_cells = {
            (x, y) for x in range(GRID_WIDTH) for y in range(GRID_HEIGHT)
        } - self.snake_cells
        self.direction = (1, 0)
        self.next_direction = self.direction
        self.score = 0
        self.delay = INITIAL_DELAY_MS
        self.game_over = False

        self.ensure_segment_pool(len(self.snake))
        self.spawn_food()
        self.update_labels()
        self.render_full_state()
        self.schedule_next_tick()

    def draw_static_grid(self) -> None:
        for x in range(0, BOARD_WIDTH, GRID_SIZE):
            self.canvas.create_line(x, 0, x, BOARD_HEIGHT, fill=GRID_COLOR)
        for y in range(0, BOARD_HEIGHT, GRID_SIZE):
            self.canvas.create_line(0, y, BOARD_WIDTH, y, fill=GRID_COLOR)

    def ensure_segment_pool(self, required: int) -> None:
        while len(self.segment_ids) < required:
            item_id = self.canvas.create_rectangle(
                0,
                0,
                0,
                0,
                state="hidden",
                width=2,
            )
            self.segment_ids.append(item_id)

    def spawn_food(self) -> None:
        self.food = random.choice(tuple(self.free_cells)) if self.free_cells else None

    def update_labels(self) -> None:
        self.score_var.set(f"Score: {self.score}")
        if self.game_over and self.food is not None:
            self.message_var.set("Game over. Press Space to restart.")

    def on_key_press(self, event: tk.Event) -> None:
        key = event.keysym.lower()
        directions = {
            "up": (0, -1),
            "w": (0, -1),
            "down": (0, 1),
            "s": (0, 1),
            "left": (-1, 0),
            "a": (-1, 0),
            "right": (1, 0),
            "d": (1, 0),
        }

        if key == "space" and self.game_over:
            self.reset_game()
            return

        if key not in directions or self.game_over:
            return

        proposed = directions[key]
        if proposed == (-self.direction[0], -self.direction[1]):
            return

        self.next_direction = proposed

    def schedule_next_tick(self) -> None:
        self.after_id = self.root.after(self.delay, self.tick)

    def tick(self) -> None:
        if self.game_over:
            return

        self.direction = self.next_direction
        head_x, head_y = self.snake[0]
        dx, dy = self.direction
        new_head = (head_x + dx, head_y + dy)
        tail = self.snake[-1]
        will_grow = new_head == self.food

        hit_wall = not (0 <= new_head[0] < GRID_WIDTH and 0 <= new_head[1] < GRID_HEIGHT)
        hit_self = new_head in self.snake_cells and (will_grow or new_head != tail)
        if hit_wall or hit_self:
            self.finish_game("Game over. Press Space to restart.")
            return

        self.snake.appendleft(new_head)
        self.snake_cells.add(new_head)

        if will_grow:
            self.free_cells.remove(new_head)
            self.score += 1
            self.delay = max(MIN_DELAY_MS, self.delay - DELAY_STEP_MS)
            self.ensure_segment_pool(len(self.snake))
            self.spawn_food()
            if self.food is None:
                self.finish_game("You win. Press Space to play again.")
                return
        else:
            removed_tail = self.snake.pop()
            self.snake_cells.remove(removed_tail)
            self.free_cells.add(removed_tail)
            self.free_cells.remove(new_head)

        self.update_labels()
        self.render_dynamic_state()
        self.schedule_next_tick()

    def finish_game(self, message: str) -> None:
        self.game_over = True
        self.message_var.set(message)
        self.update_labels()
        self.render_dynamic_state()
        self.draw_overlay("You win" if self.food is None else "Game Over")

    def render_full_state(self) -> None:
        self.render_dynamic_state()
        self.clear_overlay()

    def render_dynamic_state(self) -> None:
        snake_list = list(self.snake)
        self.ensure_segment_pool(len(snake_list))

        for index, position in enumerate(snake_list):
            fill = HEAD_FILL if index == 0 else BODY_FILL
            outline = HEAD_OUTLINE if index == 0 else BODY_OUTLINE
            self.update_cell(self.segment_ids[index], position, fill, outline)

        for index in range(len(snake_list), len(self.segment_ids)):
            self.canvas.itemconfigure(self.segment_ids[index], state="hidden")

        if self.food is None:
            if self.food_id is not None:
                self.canvas.itemconfigure(self.food_id, state="hidden")
        else:
            if self.food_id is None:
                self.food_id = self.canvas.create_rectangle(0, 0, 0, 0, width=2)
            self.update_cell(self.food_id, self.food, FOOD_FILL, FOOD_OUTLINE)

    def update_cell(
        self,
        item_id: int,
        position: tuple[int, int],
        fill: str,
        outline: str,
    ) -> None:
        x, y = position
        x1 = x * GRID_SIZE + CELL_PADDING
        y1 = y * GRID_SIZE + CELL_PADDING
        x2 = x1 + GRID_SIZE - (CELL_PADDING * 2)
        y2 = y1 + GRID_SIZE - (CELL_PADDING * 2)
        self.canvas.coords(item_id, x1, y1, x2, y2)
        self.canvas.itemconfigure(
            item_id,
            fill=fill,
            outline=outline,
            state="normal",
        )

    def clear_overlay(self) -> None:
        for item_id in self.overlay_ids:
            self.canvas.delete(item_id)
        self.overlay_ids.clear()

    def draw_overlay(self, title: str) -> None:
        self.clear_overlay()
        self.overlay_ids.extend(
            [
                self.canvas.create_rectangle(
                    80,
                    150,
                    BOARD_WIDTH - 80,
                    BOARD_HEIGHT - 150,
                    fill="#000000",
                    outline="#ffffff",
                    width=2,
                    stipple="gray50",
                ),
                self.canvas.create_text(
                    BOARD_WIDTH // 2,
                    BOARD_HEIGHT // 2 - 10,
                    text=title,
                    fill="white",
                    font=("Helvetica", 24, "bold"),
                ),
                self.canvas.create_text(
                    BOARD_WIDTH // 2,
                    BOARD_HEIGHT // 2 + 24,
                    text="Press Space to restart",
                    fill="white",
                    font=("Helvetica", 12),
                ),
            ]
        )


def main() -> None:
    root = tk.Tk()
    SnakeGame(root)
    root.mainloop()


if __name__ == "__main__":
    main()
