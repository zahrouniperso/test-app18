"use strict";

/* =========================================================================
   FINDING SHANTANU — game.js
   A small 2D side-scrolling platformer POC. Vanilla JS + Canvas, no build
   step. Organized top-to-bottom as:

     1. CONFIG            — tunable constants (Logic/Middleware layer)
     2. LEVEL DATA         — obstacles/platforms/gaps/power-ups (Data layer)
     3. CANVAS / DPI SETUP  — (Client/UI layer)
     4. INPUT               — keyboard + touch (Client/UI -> Logic)
     5. GAME STATE          — player, camera, timers (Logic/Middleware)
     6. COLLISION HELPERS   — (Logic/Middleware)
     7. UPDATE              — physics + obstacle/power-up logic (Logic)
     8. BACKGROUND          — parallax silhouettes (Client/UI)
     9. RENDER              — draw everything (Client/UI)
    10. MAIN LOOP            — requestAnimationFrame driver

   The LEVEL DATA section is the one you'll edit most: add/move obstacles,
   platforms, gaps and power-ups by editing the arrays, no engine changes
   needed. In a full build this config would likely be fetched from a
   static JSON file (the "Data Layer" per the hackathon's 3-tier model);
   it's kept as an inline JS array here since the task called for a plain,
   easy-to-edit config block.
   ========================================================================= */

/* ------------------------------------------------------------------ */
/* 1. CONFIG                                                            */
/* ------------------------------------------------------------------ */
const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;

const GROUND_Y = 460;       // y-position of the top of the ground platform
const GROUND_HEIGHT = 80;

const GRAVITY = 1900;             // px/s^2
const MOVE_SPEED = 230;           // px/s
const JUMP_VELOCITY = -680;       // px/s (negative = up)
const FRICTION_GROUND = 0.82;     // velocity damping per frame when no input

const COFFEE_BOOST_MULTIPLIER = 1.7;
const COFFEE_BOOST_DURATION = 4.5; // seconds

const PLAYER_WIDTH = 28;
const PLAYER_HEIGHT = 52;

const CAMERA_LOOKAHEAD = 120; // px the camera leads the player horizontally

/* ------------------------------------------------------------------ */
/* 2. LEVEL DATA (Data Layer)                                          */
/*    Edit these arrays to add/move content. Positions are in level-   */
/*    space pixels (not screen space). The engine below reads them     */
/*    generically, so new entries "just work" without touching update  */
/*    or render code, as long as the `type` is one handled in the      */
/*    OBSTACLE_HANDLERS / POWERUP_HANDLERS sections.                   */
/* ------------------------------------------------------------------ */

const LEVEL_WIDTH = 4200;
const PLAYER_START = { x: 80, y: GROUND_Y - PLAYER_HEIGHT };

// Floating platforms (player can stand on top of these).
const PLATFORMS = [
  { x: 1900, y: 330, width: 260, height: 24 }, // hosts a patrol obstacle
  { x: 3100, y: 300, width: 220, height: 24 },
];

// Gaps in the ground floor — no ground is drawn/collidable in this x-range.
// Falling through resets the player (handled the same as an obstacle hit).
const GAPS = [
  { x: 700, width: 110 },
  { x: 1500, width: 130 },
  { x: 2650, width: 150 },
];

// Obstacles: placeholder types that prove out the collision system.
//   'block'  — static rectangle the player must jump over
//   'patrol' — moves back and forth between rangeStart/rangeEnd on a fixed y
const OBSTACLES = [
  { type: "block", x: 420, width: 36, height: 60 },
  { type: "block", x: 1050, width: 36, height: 60 },
  { type: "patrol", x: 1950, y: 330 - 34, width: 34, height: 34, rangeStart: 1910, rangeEnd: 2120, speed: 90 },
  { type: "block", x: 2350, width: 36, height: 60 },
  { type: "patrol", x: 3150, y: 300 - 34, width: 34, height: 34, rangeStart: 3120, rangeEnd: 3280, speed: 110 },
  { type: "block", x: 3700, width: 36, height: 60 },
];

// Power-ups: placeholder type proving the pickup system.
//   'coffee' — temporary speed boost
const POWERUPS = [
  { type: "coffee", x: 950, y: GROUND_Y - 90, radius: 16, collected: false },
  { type: "coffee", x: 2050, y: 330 - 60, radius: 16, collected: false },
  { type: "coffee", x: 3400, y: GROUND_Y - 90, radius: 16, collected: false },
];

/* ------------------------------------------------------------------ */
/* 3. CANVAS / DPI SETUP (Client/UI layer)                             */
/* ------------------------------------------------------------------ */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

function resizeCanvasForDPI() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = GAME_WIDTH * dpr;
  canvas.height = GAME_HEIGHT * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeCanvasForDPI();
window.addEventListener("resize", resizeCanvasForDPI);
window.addEventListener("orientationchange", resizeCanvasForDPI);

/* ------------------------------------------------------------------ */
/* 4. INPUT (Client/UI -> Logic/Middleware)                             */
/* ------------------------------------------------------------------ */
const input = { left: false, right: false, jump: false };

window.addEventListener("keydown", (e) => {
  if (e.code === "ArrowLeft" || e.code === "KeyA") input.left = true;
  if (e.code === "ArrowRight" || e.code === "KeyD") input.right = true;
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
    input.jump = true;
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "ArrowLeft" || e.code === "KeyA") input.left = false;
  if (e.code === "ArrowRight" || e.code === "KeyD") input.right = false;
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") input.jump = false;
});

function bindTouchButton(id, onDown, onUp) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = (e) => { e.preventDefault(); onDown(); };
  const end = (e) => { e.preventDefault(); onUp(); };
  el.addEventListener("touchstart", start, { passive: false });
  el.addEventListener("touchend", end, { passive: false });
  el.addEventListener("touchcancel", end, { passive: false });
  el.addEventListener("mousedown", start);
  el.addEventListener("mouseup", end);
  el.addEventListener("mouseleave", end);
}
bindTouchButton("btnLeft", () => (input.left = true), () => (input.left = false));
bindTouchButton("btnRight", () => (input.right = true), () => (input.right = false));
bindTouchButton("btnJump", () => (input.jump = true), () => (input.jump = false));

/* ------------------------------------------------------------------ */
/* 5. GAME STATE (Logic/Middleware)                                     */
/* ------------------------------------------------------------------ */
const player = {
  x: PLAYER_START.x,
  y: PLAYER_START.y,
  vx: 0,
  vy: 0,
  width: PLAYER_WIDTH,
  height: PLAYER_HEIGHT,
  onGround: false,
  facing: 1, // 1 = right, -1 = left
  boostTimer: 0, // seconds remaining of coffee boost
};

let checkpoint = { x: PLAYER_START.x, y: PLAYER_START.y };

const camera = { x: 0 };

let elapsedTime = 0;
let boostsCollected = 0;
let endMessageTimer = 0; // seconds remaining to show "End of test level"

/* ------------------------------------------------------------------ */
/* 6. COLLISION HELPERS (Logic/Middleware)                              */
/* ------------------------------------------------------------------ */
function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function isOverGap(x) {
  return GAPS.some((g) => x >= g.x && x <= g.x + g.width);
}

function resetPlayer() {
  player.x = checkpoint.x;
  player.y = checkpoint.y;
  player.vx = 0;
  player.vy = 0;
  player.boostTimer = 0;
}

/* ------------------------------------------------------------------ */
/* 7. UPDATE (Logic/Middleware)                                         */
/* ------------------------------------------------------------------ */
function updatePlayer(dt) {
  const speed = MOVE_SPEED * (player.boostTimer > 0 ? COFFEE_BOOST_MULTIPLIER : 1);

  if (input.left) {
    player.vx = -speed;
    player.facing = -1;
  } else if (input.right) {
    player.vx = speed;
    player.facing = 1;
  } else if (player.onGround) {
    player.vx *= FRICTION_GROUND;
  }

  if (input.jump && player.onGround) {
    player.vy = JUMP_VELOCITY;
    player.onGround = false;
  }

  // Gravity
  player.vy += GRAVITY * dt;

  // Integrate position
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // Clamp to level start (don't let the player walk off the left edge)
  if (player.x < 0) player.x = 0;

  // Ground / platform collision (only when falling or standing)
  player.onGround = false;
  const feetX = player.x + player.width / 2;

  if (player.vy >= 0) {
    // Ground collision, skipped where a gap exists
    if (!isOverGap(feetX) && player.y + player.height >= GROUND_Y && player.y + player.height - player.vy * dt <= GROUND_Y + 1) {
      player.y = GROUND_Y - player.height;
      player.vy = 0;
      player.onGround = true;
    }

    // Floating platform collision
    for (const p of PLATFORMS) {
      const withinX = player.x + player.width > p.x && player.x < p.x + p.width;
      if (withinX && player.y + player.height >= p.y && player.y + player.height - player.vy * dt <= p.y + 1) {
        player.y = p.y - player.height;
        player.vy = 0;
        player.onGround = true;
      }
    }
  }

  // Fell into a gap / off the bottom of the world -> reset
  if (player.y > GAME_HEIGHT + 100) {
    resetPlayer();
    return;
  }

  // Tick boost timer
  if (player.boostTimer > 0) {
    player.boostTimer = Math.max(0, player.boostTimer - dt);
  }

  // Reached the end of the level -> loop back to start with a brief message
  if (player.x > LEVEL_WIDTH) {
    endMessageTimer = 2.5;
    resetPlayer();
  }
}

function updateObstacles(dt) {
  for (const o of OBSTACLES) {
    if (o.type === "patrol") {
      o.x += o.speed * dt * (o.dir || 1);
      if (o.x <= o.rangeStart) {
        o.x = o.rangeStart;
        o.dir = 1;
      } else if (o.x >= o.rangeEnd) {
        o.x = o.rangeEnd;
        o.dir = -1;
      } else if (!o.dir) {
        o.dir = 1;
      }
    }

    const box = { x: o.x, y: o.type === "block" ? GROUND_Y - o.height : o.y, width: o.width, height: o.height };
    if (rectsOverlap(player, box)) {
      resetPlayer();
    }
  }
}

function updatePowerups() {
  for (const p of POWERUPS) {
    if (p.collected) continue;
    const box = { x: p.x - p.radius, y: p.y - p.radius, width: p.radius * 2, height: p.radius * 2 };
    if (rectsOverlap(player, box)) {
      p.collected = true;
      if (p.type === "coffee") {
        player.boostTimer = COFFEE_BOOST_DURATION;
        boostsCollected += 1;
      }
    }
  }
}

function updateCamera() {
  const lookahead = CAMERA_LOOKAHEAD * player.facing;
  const target = player.x + PLAYER_WIDTH / 2 - GAME_WIDTH / 2 + lookahead;
  camera.x += (target - camera.x) * 0.12;
  camera.x = Math.max(0, Math.min(camera.x, LEVEL_WIDTH - GAME_WIDTH));
}

function update(dt) {
  if (endMessageTimer > 0) {
    endMessageTimer -= dt;
  }
  updatePlayer(dt);
  updateObstacles(dt);
  updatePowerups();
  updateCamera();
  elapsedTime += dt;
}

/* ------------------------------------------------------------------ */
/* 8. BACKGROUND — parallax "office" silhouettes (Client/UI)           */
/* ------------------------------------------------------------------ */
// Pre-generate deterministic layer content so shapes don't jitter frame
// to frame. Each layer scrolls at its own factor relative to the camera.
function buildParallaxLayer(spacing, seed, colorPick) {
  const items = [];
  let x = 40;
  let i = 0;
  while (x < LEVEL_WIDTH + 200) {
    const t = (i * seed) % 3;
    items.push({ x, kind: t, color: colorPick(t) });
    x += spacing + ((i * 37) % 60);
    i++;
  }
  return items;
}

const LAYER_FAR = buildParallaxLayer(260, 13, () => "#1b2030");
const LAYER_MID = buildParallaxLayer(180, 7, () => "#232a3f");
const LAYER_NEAR = buildParallaxLayer(140, 5, () => "#2c3550");

function drawSilhouette(item, baseY) {
  ctx.fillStyle = item.color;
  if (item.kind === 0) {
    // "desk" block
    ctx.fillRect(item.x, baseY - 40, 70, 40);
  } else if (item.kind === 1) {
    // "monitor" block
    ctx.fillRect(item.x, baseY - 70, 34, 46);
    ctx.fillRect(item.x + 10, baseY - 26, 14, 8);
  } else {
    // "plant" block
    ctx.beginPath();
    ctx.roundRect(item.x, baseY - 30, 18, 30, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(item.x + 9, baseY - 36, 14, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParallaxLayer(items, factor, baseY) {
  const offset = camera.x * factor;
  for (const item of items) {
    const screenX = item.x - offset;
    if (screenX < -100 || screenX > GAME_WIDTH + 100) continue;
    drawSilhouette({ ...item, x: screenX }, baseY);
  }
}

/* ------------------------------------------------------------------ */
/* 9. RENDER (Client/UI)                                                */
/* ------------------------------------------------------------------ */
function worldToScreenX(x) {
  return x - camera.x;
}

function drawGround() {
  ctx.fillStyle = "#3a4560";
  const startX = Math.floor(camera.x);
  const endX = Math.ceil(camera.x + GAME_WIDTH);

  // Draw ground as segments, skipping gaps
  let segStart = startX;
  for (let x = startX; x <= endX; x++) {
    if (isOverGap(x)) {
      if (x > segStart) {
        ctx.fillRect(worldToScreenX(segStart), GROUND_Y, x - segStart, GROUND_HEIGHT);
      }
      segStart = x + 1;
    }
  }
  if (endX > segStart) {
    ctx.fillRect(worldToScreenX(segStart), GROUND_Y, endX - segStart, GROUND_HEIGHT);
  }
}

function drawPlatforms() {
  ctx.fillStyle = "#4d5b82";
  for (const p of PLATFORMS) {
    ctx.fillRect(worldToScreenX(p.x), p.y, p.width, p.height);
  }
}

function drawObstacles() {
  ctx.fillStyle = "#d94f4f";
  for (const o of OBSTACLES) {
    const y = o.type === "block" ? GROUND_Y - o.height : o.y;
    ctx.fillRect(worldToScreenX(o.x), y, o.width, o.height);
  }
}

function drawPowerups() {
  for (const p of POWERUPS) {
    if (p.collected) continue;
    ctx.fillStyle = "#ffcc66";
    ctx.beginPath();
    ctx.arc(worldToScreenX(p.x), p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a2a10";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("C", worldToScreenX(p.x), p.y + 5);
  }
}

function drawPlayer() {
  const sx = worldToScreenX(player.x);
  ctx.fillStyle = player.boostTimer > 0 ? "#ffcc66" : "#5fd0ff";
  ctx.beginPath();
  ctx.roundRect(sx, player.y, player.width, player.height, player.width / 2);
  ctx.fill();

  // Simple facing indicator (a small "eye")
  ctx.fillStyle = "#0b0c10";
  const eyeX = player.facing > 0 ? sx + player.width - 8 : sx + 4;
  ctx.beginPath();
  ctx.arc(eyeX, player.y + 14, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawHUD() {
  ctx.fillStyle = "#f2f2f2";
  ctx.font = "16px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Time: ${elapsedTime.toFixed(1)}s`, 16, 26);
  ctx.fillText(`Coffee boosts: ${boostsCollected}`, 16, 46);
  if (player.boostTimer > 0) {
    ctx.fillStyle = "#ffcc66";
    ctx.fillText(`Boost: ${player.boostTimer.toFixed(1)}s`, 16, 66);
  }

  if (endMessageTimer > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, GAME_HEIGHT / 2 - 30, GAME_WIDTH, 60);
    ctx.fillStyle = "#ffffff";
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("End of test level — looping back to start", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10);
  }
}

function render() {
  // Sky background
  ctx.fillStyle = "#10131c";
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  drawParallaxLayer(LAYER_FAR, 0.2, GROUND_Y - 10);
  drawParallaxLayer(LAYER_MID, 0.45, GROUND_Y);
  drawParallaxLayer(LAYER_NEAR, 0.7, GROUND_Y + 4);

  drawGround();
  drawPlatforms();
  drawPowerups();
  drawObstacles();
  drawPlayer();
  drawHUD();
}

/* ------------------------------------------------------------------ */
/* 10. MAIN LOOP                                                        */
/* ------------------------------------------------------------------ */
let lastTime = performance.now();

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000); // clamp for tab-switch stalls
  lastTime = now;

  update(dt);
  render();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
