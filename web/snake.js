const GRID_SIZE = 20;
const GRID_WIDTH = 30;
const GRID_HEIGHT = 20;
const INITIAL_DELAY_MS = 140;
const MIN_DELAY_MS = 70;
const DELAY_STEP_MS = 4;

const COLORS = {
  background: "#101820",
  grid: "#1a2530",
  headFill: "#7bd389",
  headOutline: "#d9fbe2",
  bodyFill: "#32a852",
  bodyOutline: "#7bd389",
  foodFill: "#f95738",
  foodOutline: "#ffb5a7",
};

const LEADERBOARD_KEY = "smathur777-snake-leaderboard";
const LEADERBOARD_LIMIT = 10;
const SWIPE_THRESHOLD = 24;

function normalizeLeaderboard(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .filter((entry) => Number.isFinite(entry?.score) && entry.score > 0)
    .map((entry) => ({
      score: entry.score,
      time: typeof entry.time === "string" ? entry.time : new Date().toISOString(),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(b.time).getTime() - new Date(a.time).getTime(),
    )
    .slice(0, LEADERBOARD_LIMIT);
}

function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    return normalizeLeaderboard(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

function saveLeaderboard(entries) {
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
}

function formatTimestamp(value) {
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

class SnakeGame {
  constructor(canvas, scoreNode, messageNode, leaderboardNode) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.scoreNode = scoreNode;
    this.messageNode = messageNode;
    this.leaderboardNode = leaderboardNode;
    this.leaderboard = loadLeaderboard();
    saveLeaderboard(this.leaderboard);
    this.touchStart = null;

    this.directionMap = {
      ArrowUp: [0, -1],
      w: [0, -1],
      W: [0, -1],
      ArrowDown: [0, 1],
      s: [0, 1],
      S: [0, 1],
      ArrowLeft: [-1, 0],
      a: [-1, 0],
      A: [-1, 0],
      ArrowRight: [1, 0],
      d: [1, 0],
      D: [1, 0],
    };

    this.lastTimestamp = 0;
    this.accumulator = 0;
    this.animationFrame = null;

    window.addEventListener("keydown", (event) => this.handleKeydown(event));
    this.canvas.addEventListener("touchstart", (event) => this.handleTouchStart(event), { passive: false });
    this.canvas.addEventListener("touchend", (event) => this.handleTouchEnd(event), { passive: false });
    this.renderLeaderboard();
    this.reset();
  }

  reset() {
    const centerX = Math.floor(GRID_WIDTH / 2);
    const centerY = Math.floor(GRID_HEIGHT / 2);

    this.snake = [
      [centerX, centerY],
      [centerX - 1, centerY],
      [centerX - 2, centerY],
    ];
    this.occupied = new Set(this.snake.map(([x, y]) => `${x},${y}`));
    this.direction = [1, 0];
    this.nextDirection = [1, 0];
    this.delay = INITIAL_DELAY_MS;
    this.score = 0;
    this.gameOver = false;
    this.win = false;
    this.spawnFood();
    this.updateHud("arrow keys, wasd, swipe, or tap the arrows");

    this.lastTimestamp = 0;
    this.accumulator = 0;
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
    }
    this.draw();
    this.animationFrame = requestAnimationFrame((timestamp) => this.frame(timestamp));
  }

  spawnFood() {
    const freeCells = [];
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      for (let y = 0; y < GRID_HEIGHT; y += 1) {
        const key = `${x},${y}`;
        if (!this.occupied.has(key)) {
          freeCells.push([x, y]);
        }
      }
    }

    if (freeCells.length === 0) {
      this.food = null;
      this.win = true;
      this.gameOver = true;
      this.updateHud("you win. press restart to play again.");
      return;
    }

    this.food = freeCells[(Math.random() * freeCells.length) | 0];
  }

  updateHud(message) {
    this.scoreNode.textContent = `score: ${this.score}`;
    this.messageNode.textContent = message;
  }

  saveScore() {
    if (this.score <= 0) {
      return;
    }

    const entries = [...this.leaderboard];
    entries.push({
      score: this.score,
      time: new Date().toISOString(),
    });
    this.leaderboard = normalizeLeaderboard(entries);
    saveLeaderboard(this.leaderboard);
    this.renderLeaderboard();
  }

  renderLeaderboard() {
    this.leaderboardNode.innerHTML = "";

    if (this.leaderboard.length === 0) {
      const item = document.createElement("li");
      item.textContent = "no scores yet.";
      this.leaderboardNode.appendChild(item);
      return;
    }

    this.leaderboard.forEach((entry, index) => {
      const item = document.createElement("li");
      item.textContent = `#${index + 1} score ${entry.score} at ${formatTimestamp(entry.time)}`;
      this.leaderboardNode.appendChild(item);
    });
  }

  clearLeaderboard() {
    this.leaderboard = [];
    saveLeaderboard(this.leaderboard);
    this.renderLeaderboard();
    this.updateHud("leaderboard cleared.");
  }

  setDirection(proposed) {
    if (
      proposed[0] === -this.direction[0] &&
      proposed[1] === -this.direction[1]
    ) {
      return;
    }

    this.nextDirection = proposed;
  }

  handleKeydown(event) {
    if (event.key === " ") {
      if (this.gameOver) {
        this.reset();
      }
      event.preventDefault();
      return;
    }

    const proposed = this.directionMap[event.key];
    if (!proposed || this.gameOver) {
      return;
    }

    this.setDirection(proposed);
    event.preventDefault();
  }

  handleTouchStart(event) {
    if (event.changedTouches.length === 0) {
      return;
    }

    const touch = event.changedTouches[0];
    this.touchStart = { x: touch.clientX, y: touch.clientY };
    event.preventDefault();
  }

  handleTouchEnd(event) {
    if (!this.touchStart || event.changedTouches.length === 0) {
      return;
    }

    const touch = event.changedTouches[0];
    const dx = touch.clientX - this.touchStart.x;
    const dy = touch.clientY - this.touchStart.y;
    this.touchStart = null;

    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
      event.preventDefault();
      return;
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      this.setDirection(dx > 0 ? [1, 0] : [-1, 0]);
    } else {
      this.setDirection(dy > 0 ? [0, 1] : [0, -1]);
    }

    event.preventDefault();
  }

  frame(timestamp) {
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = timestamp;
    }

    const delta = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;
    this.accumulator += delta;

    while (!this.gameOver && this.accumulator >= this.delay) {
      this.accumulator -= this.delay;
      this.tick();
    }

    this.draw();
    this.animationFrame = requestAnimationFrame((nextTimestamp) => this.frame(nextTimestamp));
  }

  tick() {
    this.direction = this.nextDirection;
    const [headX, headY] = this.snake[0];
    const [dx, dy] = this.direction;
    const newHead = [headX + dx, headY + dy];
    const tail = this.snake[this.snake.length - 1];
    const growing =
      this.food !== null &&
      newHead[0] === this.food[0] &&
      newHead[1] === this.food[1];

    const hitWall =
      newHead[0] < 0 ||
      newHead[0] >= GRID_WIDTH ||
      newHead[1] < 0 ||
      newHead[1] >= GRID_HEIGHT;

    const newHeadKey = `${newHead[0]},${newHead[1]}`;
    const tailKey = `${tail[0]},${tail[1]}`;
    const hitSelf =
      this.occupied.has(newHeadKey) && (growing || newHeadKey !== tailKey);

    if (hitWall || hitSelf) {
      this.gameOver = true;
      this.saveScore();
      this.updateHud("game over. score saved for this attempt.");
      return;
    }

    this.snake.unshift(newHead);
    this.occupied.add(newHeadKey);

    if (growing) {
      this.score += 1;
      this.delay = Math.max(MIN_DELAY_MS, this.delay - DELAY_STEP_MS);
      this.spawnFood();
      if (!this.gameOver) {
        this.updateHud("nice.");
      }
      return;
    }

    const removed = this.snake.pop();
    this.occupied.delete(`${removed[0]},${removed[1]}`);
  }

  draw() {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= GRID_WIDTH; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * GRID_SIZE + 0.5, 0);
      ctx.lineTo(x * GRID_SIZE + 0.5, this.canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= GRID_HEIGHT; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * GRID_SIZE + 0.5);
      ctx.lineTo(this.canvas.width, y * GRID_SIZE + 0.5);
      ctx.stroke();
    }

    if (this.food) {
      this.drawCell(this.food, COLORS.foodFill, COLORS.foodOutline);
    }

    this.snake.forEach((segment, index) => {
      this.drawCell(
        segment,
        index === 0 ? COLORS.headFill : COLORS.bodyFill,
        index === 0 ? COLORS.headOutline : COLORS.bodyOutline,
      );
    });

    if (this.gameOver) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
      ctx.fillRect(80, 150, this.canvas.width - 160, this.canvas.height - 200);
      ctx.strokeStyle = "#ffffff";
      ctx.strokeRect(80, 150, this.canvas.width - 160, this.canvas.height - 200);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = "bold 24px Courier New";
      ctx.fillText(this.win ? "You Win" : "Game Over", this.canvas.width / 2, this.canvas.height / 2 - 10);
      ctx.font = "14px Courier New";
      ctx.fillText("Press restart or space", this.canvas.width / 2, this.canvas.height / 2 + 20);
    }
  }

  drawCell([x, y], fill, stroke) {
    const left = x * GRID_SIZE + 2;
    const top = y * GRID_SIZE + 2;
    const size = GRID_SIZE - 4;
    this.ctx.fillStyle = fill;
    this.ctx.strokeStyle = stroke;
    this.ctx.lineWidth = 2;
    this.ctx.fillRect(left, top, size, size);
    this.ctx.strokeRect(left, top, size, size);
  }
}

const canvas = document.getElementById("game");
const scoreNode = document.getElementById("score");
const messageNode = document.getElementById("message");
const restartButton = document.getElementById("restart");
const leaderboardNode = document.getElementById("leaderboard");
const resetLeaderboardButton = document.getElementById("reset-leaderboard");
const upButton = document.getElementById("up");
const downButton = document.getElementById("down");
const leftButton = document.getElementById("left");
const rightButton = document.getElementById("right");

const game = new SnakeGame(
  canvas,
  scoreNode,
  messageNode,
  leaderboardNode,
);
restartButton.addEventListener("click", () => game.reset());
resetLeaderboardButton.addEventListener("click", () => game.clearLeaderboard());
upButton.addEventListener("click", () => game.setDirection([0, -1]));
downButton.addEventListener("click", () => game.setDirection([0, 1]));
leftButton.addEventListener("click", () => game.setDirection([-1, 0]));
rightButton.addEventListener("click", () => game.setDirection([1, 0]));
