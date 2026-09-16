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

const STARTING_LIVES = 3;

// Reachability limits derived from the physics above — used to sanity-check
// the level data below. With JUMP_VELOCITY=-680 and GRAVITY=1900:
//   max jump height   = JUMP_VELOCITY^2 / (2*GRAVITY)      ≈ 122px
//   max jump distance = MOVE_SPEED * 2*(-JUMP_VELOCITY/GRAVITY) ≈ 165px
// Keep gaps under ~140px and platform heights under ~100px above the
// ground so every jump in LEVEL DATA stays comfortably reachable.
const MAX_JUMP_HEIGHT = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);
const MAX_JUMP_DISTANCE = MOVE_SPEED * (2 * (-JUMP_VELOCITY / GRAVITY));

/* ------------------------------------------------------------------ */
/* 2. LEVEL DATA (Data Layer)                                          */
/*    Edit LEVELS to add/move content or add more cities. Positions    */
/*    are in level-space pixels (not screen space). The engine below   */
/*    reads them generically, so new entries "just work" without       */
/*    touching update/render code, as long as the `type` is one        */
/*    handled by the obstacle/power-up update+draw functions.          */
/*                                                                      */
/*    Floating-platform heights are kept under MAX_JUMP_HEIGHT (~122px */
/*    above ground) and gap widths under MAX_JUMP_DISTANCE (~165px),   */
/*    both defined in CONFIG above, so every jump stays reachable.     */
/* ------------------------------------------------------------------ */
const PLATFORM_1_Y = GROUND_Y - 90;  // 90px above ground
const PLATFORM_2_Y = GROUND_Y - 100; // 100px above ground

const LEVELS = [
  {
    name: "Dublin",
    greeting: "Howya",
    levelWidth: 3200,
    playerStart: { x: 80, y: GROUND_Y - PLAYER_HEIGHT },
    palette: { sky: "#0d1f18", ground: "#2f5c46", platform: "#3f7d5c", far: "#12281f", mid: "#1a3a2c", near: "#245039" },
    platforms: [
      { x: 1700, y: PLATFORM_1_Y, width: 240, height: 24 }, // hosts a patrol obstacle
    ],
    gaps: [
      { x: 650, width: 100 },
      { x: 1950, width: 110 },
    ],
    obstacles: [
      { type: "block", x: 400, width: 36, height: 60 },
      { type: "patrol", x: 1750, y: PLATFORM_1_Y - 34, width: 34, height: 34, rangeStart: 1710, rangeEnd: 1900, speed: 90 },
      { type: "block", x: 2450, width: 36, height: 60 },
    ],
    powerups: [
      { type: "coffee", x: 900, y: GROUND_Y - 90, radius: 16, collected: false },
      { type: "coffee", x: 2750, y: GROUND_Y - 90, radius: 16, collected: false },
    ],
  },
  {
    name: "Berlin",
    greeting: "Hallo",
    levelWidth: 3600,
    playerStart: { x: 80, y: GROUND_Y - PLAYER_HEIGHT },
    palette: { sky: "#10131c", ground: "#3a4560", platform: "#4d5b82", far: "#1b2030", mid: "#232a3f", near: "#2c3550" },
    platforms: [
      { x: 1900, y: PLATFORM_1_Y, width: 260, height: 24 }, // hosts a patrol obstacle
      { x: 3100, y: PLATFORM_2_Y, width: 220, height: 24 },
    ],
    gaps: [
      { x: 700, width: 100 },
      { x: 1500, width: 120 },
      { x: 2650, width: 130 },
    ],
    obstacles: [
      { type: "block", x: 420, width: 36, height: 60 },
      { type: "block", x: 1050, width: 36, height: 60 },
      { type: "patrol", x: 1950, y: PLATFORM_1_Y - 34, width: 34, height: 34, rangeStart: 1910, rangeEnd: 2120, speed: 90 },
      { type: "block", x: 2350, width: 36, height: 60 },
      { type: "patrol", x: 3150, y: PLATFORM_2_Y - 34, width: 34, height: 34, rangeStart: 3120, rangeEnd: 3280, speed: 110 },
    ],
    powerups: [
      { type: "coffee", x: 950, y: GROUND_Y - 90, radius: 16, collected: false },
      { type: "coffee", x: 2050, y: PLATFORM_1_Y - 60, radius: 16, collected: false },
      { type: "coffee", x: 3400, y: GROUND_Y - 90, radius: 16, collected: false },
    ],
  },
  {
    name: "Munich",
    greeting: "Servus",
    levelWidth: 4200,
    playerStart: { x: 80, y: GROUND_Y - PLAYER_HEIGHT },
    palette: { sky: "#0d1730", ground: "#22406a", platform: "#2f5a8f", far: "#0f1d3a", mid: "#16294d", near: "#1e3766" },
    platforms: [
      { x: 1200, y: PLATFORM_1_Y, width: 200, height: 24 }, // hosts a patrol obstacle
      { x: 2200, y: PLATFORM_2_Y, width: 200, height: 24 }, // hosts a patrol obstacle
      { x: 3300, y: PLATFORM_1_Y, width: 220, height: 24 },
    ],
    gaps: [
      { x: 600, width: 110 },
      { x: 1500, width: 130 },
      { x: 2600, width: 120 },
      { x: 3600, width: 100 },
    ],
    obstacles: [
      { type: "block", x: 380, width: 36, height: 60 },
      { type: "patrol", x: 1220, y: PLATFORM_1_Y - 34, width: 34, height: 34, rangeStart: 1210, rangeEnd: 1380, speed: 90 },
      { type: "block", x: 1750, width: 36, height: 60 },
      { type: "patrol", x: 2220, y: PLATFORM_2_Y - 34, width: 34, height: 34, rangeStart: 2210, rangeEnd: 2380, speed: 110 },
      { type: "block", x: 2850, width: 36, height: 60 },
      { type: "block", x: 3900, width: 36, height: 60 },
    ],
    powerups: [
      { type: "coffee", x: 900, y: GROUND_Y - 90, radius: 16, collected: false },
      { type: "coffee", x: 2300, y: PLATFORM_2_Y - 60, radius: 16, collected: false },
      { type: "coffee", x: 3450, y: GROUND_Y - 90, radius: 16, collected: false },
    ],
    // Final city: the level ends with Shantanu instead of just looping.
    goal: { x: 4080, y: GROUND_Y },
  },
];

// Runtime level state — populated by loadLevel() below. Kept as top-level
// `let`s (rather than always indexing through LEVELS[currentLevelIndex])
// so the rest of the engine reads/mutates them exactly as before.
let currentLevelIndex = 0;
let LEVEL_WIDTH, PLAYER_START, PALETTE, PLATFORMS, GAPS, OBSTACLES, POWERUPS, GOAL;
let LAYER_FAR, LAYER_MID, LAYER_NEAR;

function loadLevel(index) {
  const level = LEVELS[index];
  currentLevelIndex = index;
  LEVEL_WIDTH = level.levelWidth;
  PLAYER_START = level.playerStart;
  PALETTE = level.palette;
  GOAL = level.goal || null;

  // Deep-clone so mutable runtime fields (obstacle patrol direction,
  // power-up collected flags) never leak back into the LEVELS templates.
  PLATFORMS = level.platforms.map((p) => ({ ...p }));
  GAPS = level.gaps.map((g) => ({ ...g }));
  OBSTACLES = level.obstacles.map((o) => ({ ...o }));
  POWERUPS = level.powerups.map((p) => ({ ...p }));

  LAYER_FAR = buildParallaxLayer(260, 13, LEVEL_WIDTH, () => PALETTE.far);
  LAYER_MID = buildParallaxLayer(180, 7, LEVEL_WIDTH, () => PALETTE.mid);
  LAYER_NEAR = buildParallaxLayer(140, 5, LEVEL_WIDTH, () => PALETTE.near);
}

// Load Dublin (level 1) immediately so top-level state below (player,
// checkpoint, ...) has real PLAYER_START/LEVEL_WIDTH values to read.
loadLevel(0);

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
  // Resizing the canvas resets all context state, so re-disable smoothing
  // every time — keeps pixel-art sprites/backgrounds crisp when scaled.
  ctx.imageSmoothingEnabled = false;
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

// State-transition input: starting from the title screen, pausing/resuming,
// and restarting after game over. Click/tap anywhere on the canvas, or
// press Enter, to advance the title/name-entry/story/game-over/win
// screens; P or Escape toggles pause during play.
canvas.addEventListener("click", handlePrimaryAction);
window.addEventListener("keydown", (e) => {
  // Let the name-entry <input> handle its own keys (see below) instead of
  // triggering game shortcuts like Space=jump or P=pause while typing.
  if (document.activeElement === nameInput) return;
  if (e.code === "Enter") handlePrimaryAction();
  if (e.code === "KeyP" || e.code === "Escape") togglePause();
});

const pauseBtn = document.getElementById("pauseBtn");
if (pauseBtn) pauseBtn.addEventListener("click", togglePause);

const nameEntryPanel = document.getElementById("nameEntryPanel");
const nameInput = document.getElementById("nameInput");
const nameSubmitBtn = document.getElementById("nameSubmitBtn");
const characterSelectPanel = document.getElementById("characterSelectPanel");
const chooseMaleBtn = document.getElementById("chooseMale");
const chooseFemaleBtn = document.getElementById("chooseFemale");
const touchControlsEl = document.getElementById("touchControls");

// Single place that owns which HTML overlay (if any) is visible for a given
// game state, so nameEntry/characterSelect/touch-controls/pause-button can
// never end up shown on top of each other — every state transition in the
// file goes through this instead of assigning `gameState` directly.
const OVERLAY_PANELS = [nameEntryPanel, characterSelectPanel];

function setGameState(newState) {
  gameState = newState;

  for (const panel of OVERLAY_PANELS) panel.classList.add("ui-hidden");
  if (newState === "nameEntry") nameEntryPanel.classList.remove("ui-hidden");
  if (newState === "characterSelect") characterSelectPanel.classList.remove("ui-hidden");

  // The pause button and on-screen touch controls only make sense while
  // actually playing/paused — keep them out of the way during every menu
  // screen so they can't visually or click-wise overlap menu buttons.
  const inGameplay = newState === "playing" || newState === "paused";
  pauseBtn.classList.toggle("ui-hidden", !inGameplay);
  touchControlsEl.classList.toggle("ui-hidden", !inGameplay);
}

function showNameEntry() {
  setGameState("nameEntry");
  nameInput.value = "";
  nameInput.focus();
}

function submitName() {
  const trimmed = nameInput.value.trim();
  playerName = trimmed || "Player";
  setGameState("characterSelect");
}

function chooseCharacter(character) {
  playerCharacter = character;
  setGameState("story");
}

nameSubmitBtn.addEventListener("click", submitName);
nameInput.addEventListener("keydown", (e) => {
  e.stopPropagation(); // don't let Space/Enter/P reach the game shortcuts above
  if (e.key === "Enter") {
    e.preventDefault();
    submitName();
  }
});

chooseMaleBtn.addEventListener("click", () => chooseCharacter("male"));
chooseFemaleBtn.addEventListener("click", () => chooseCharacter("female"));

function handlePrimaryAction() {
  if (gameState === "title") {
    showNameEntry();
  } else if (gameState === "story" || gameState === "gameover" || gameState === "win") {
    restartGame();
  }
}

function togglePause() {
  if (gameState === "playing") {
    setGameState("paused");
  } else if (gameState === "paused") {
    setGameState("playing");
  }
}

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
  hurtTimer: 0, // seconds remaining to show the "fallingDown" animation
  anim: "idle",
  frame: 0,
  animTimer: 0,
};

// Player spritesheets — one per selectable character, each packed from its
// assets/images/sprite-sources/*.png raw sheet into a uniform grid (see
// assets/images/player-sheet*.png). Every cell is cellW x cellH with the
// character anchored to the bottom-center of the cell, so frames line up
// regardless of their original trimmed size. Cell sizes/frame counts differ
// slightly between characters, so each is looked up via CHARACTERS[key].
const SPRITE_ROWS = ["idle", "runLeft", "runRight", "jumpFall", "fallingDown"];

// Displayed sprite height (independent of the physics hitbox above, which
// stays small/simple for collision purposes — the sprite is drawn larger
// and centered/foot-aligned on that hitbox). Width is derived per-character
// from its own cell aspect ratio.
const SPRITE_DRAW_HEIGHT = 76;

const CHARACTERS = {
  male: {
    cellW: 166,
    cellH: 204,
    frameCounts: { idle: 4, runLeft: 6, runRight: 6, jumpFall: 3, fallingDown: 6 },
    // The source sheet's runLeft/runRight rows are correctly mirrored art.
    runIsMirrored: true,
    image: new Image(),
    loaded: false,
  },
  female: {
    cellW: 131,
    cellH: 145,
    frameCounts: { idle: 4, runLeft: 6, runRight: 6, jumpFall: 3, fallingDown: 5 },
    // The source sheet's "runRight" row is actually a duplicate of runLeft
    // (both face left) — not mirrored art. Use runLeft as the one canonical
    // run pose and flip it in code when facing right instead.
    runIsMirrored: false,
    image: new Image(),
    loaded: false,
  },
};
CHARACTERS.male.image.onload = () => { CHARACTERS.male.loaded = true; };
CHARACTERS.male.image.src = "assets/images/player-sheet.png";
CHARACTERS.female.image.onload = () => { CHARACTERS.female.loaded = true; };
CHARACTERS.female.image.src = "assets/images/player-sheet-female.png";

let playerCharacter = "male"; // chosen on the character-select screen

let checkpoint = { x: PLAYER_START.x, y: PLAYER_START.y };

const camera = { x: 0 };

let furthestX = 0; // furthest level-x reached in the CURRENT level
let scoreBase = 0; // score banked from levels already completed
let boostsCollected = 0;
let lives = STARTING_LIVES;
let cityBannerTimer = 0; // seconds remaining to show the "Welcome to <city>" card
let playerName = "Player"; // set once via the name-entry screen, kept across replays

const SCORE_PER_PIXEL = 0.1; // distance-based score
const SCORE_PER_BOOST = 50;

function getScore() {
  return Math.floor(scoreBase + furthestX * SCORE_PER_PIXEL) + boostsCollected * SCORE_PER_BOOST;
}

// gameState: 'title' | 'nameEntry' | 'characterSelect' | 'story' | 'playing'
//          | 'paused' | 'gameover' | 'win'
let gameState = "title";
setGameState("title"); // sync overlay/pause/touch-control visibility with the initial state

// Title screen image — swap in the real artwork by saving it as
// assets/images/title-screen.png. Falls back to a drawn placeholder
// (see drawTitleScreen) until that file exists.
const titleImage = new Image();
let titleImageLoaded = false;
titleImage.onload = () => { titleImageLoaded = true; };
titleImage.src = "assets/images/title-screen.png";

// Shantanu's portrait for the win screen (cropped from the title art).
const shantanuImage = new Image();
let shantanuImageLoaded = false;
shantanuImage.onload = () => { shantanuImageLoaded = true; };
shantanuImage.src = "assets/images/shantanu-portrait.png";

// Dublin-only background art, replacing the procedural far/mid/near layers
// for that level only — Berlin/Munich are untouched (no matching art yet).
// Draw order back to front: bg_dublin.png -> office band 0/1/2 -> foreground.
const bgDublinImage = new Image();
let bgDublinLoaded = false;
bgDublinImage.onload = () => { bgDublinLoaded = true; };
bgDublinImage.src = "assets/images/bg_dublin.png";

// background_office.png is a sprite sheet of 3 stacked horizontal bands
// (far/mid/near, top to bottom), NOT a single flat backdrop. The bands are
// NOT equal thirds of the image height — there's transparent padding above,
// below, and between them — so they're measured directly from the asset
// (see the console.log on load) rather than computed as height/3. If this
// asset is ever regenerated, check that log against OFFICE_BANDS below and
// update the sy/sh values if the layout shifted.
const bgOfficeImage = new Image();
let bgOfficeLoaded = false;
let OFFICE_BANDS = null;
bgOfficeImage.onload = () => {
  bgOfficeLoaded = true;
  const w = bgOfficeImage.naturalWidth;
  const h = bgOfficeImage.naturalHeight;
  console.log(`background_office.png loaded: ${w}x${h} (equal-thirds would be ${(h / 3).toFixed(1)}px per band — the real bands below are NOT that, by design)`);
  OFFICE_BANDS = [
    { sy: 219, sh: 195 }, // band 0: far (top, darkest)
    { sy: 465, sh: 231 }, // band 1: mid
    { sy: 751, sh: 219 }, // band 2: near (bottom, lightest)
  ];
};
bgOfficeImage.src = "assets/images/background_office.png";

function enterLevel(index) {
  loadLevel(index);
  furthestX = 0;
  for (const p of POWERUPS) p.collected = false;
  for (const o of OBSTACLES) if (o.type === "patrol") o.dir = 1;
  checkpoint = { x: PLAYER_START.x, y: PLAYER_START.y };
  resetPlayer();
  camera.x = 0;
  cityBannerTimer = 2.5;
}

function restartGame() {
  lives = STARTING_LIVES;
  scoreBase = 0;
  boostsCollected = 0;
  enterLevel(0);
  setGameState("playing");
}

// Reached the end of a level: advance to the next city, or (on the last
// level) trigger the win screen instead of loading anything further.
function completeLevel() {
  scoreBase += LEVEL_WIDTH * SCORE_PER_PIXEL;
  if (currentLevelIndex >= LEVELS.length - 1) {
    setGameState("win");
    return;
  }
  enterLevel(currentLevelIndex + 1);
}

function loseLife() {
  lives -= 1;
  if (lives <= 0) {
    setGameState("gameover");
    return;
  }
  resetPlayer();
  player.hurtTimer = 0.5; // brief "fallingDown" flash on respawn
}

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
  player.hurtTimer = 0;
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

  // Fell into a gap / off the bottom of the world -> lose a life
  if (player.y > GAME_HEIGHT + 100) {
    loseLife();
    return;
  }

  // Tick boost / hurt timers
  if (player.boostTimer > 0) {
    player.boostTimer = Math.max(0, player.boostTimer - dt);
  }
  if (player.hurtTimer > 0) {
    player.hurtTimer = Math.max(0, player.hurtTimer - dt);
  }

  // Reached the end of the level -> advance to the next city (or win, on
  // the last one). GOAL (Shantanu, Munich only) sits a bit before the
  // level's right edge so the player visibly walks up to him first.
  const endTrigger = GOAL ? GOAL.x : LEVEL_WIDTH;
  if (player.x > endTrigger) {
    completeLevel();
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
      loseLife();
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

// Picks the current animation row/frame for the player sprite based on
// physics state: hurt flash > airborne (jump/fall) > running > idle.
function updateAnimation(dt) {
  let targetAnim;
  if (player.hurtTimer > 0) {
    targetAnim = "fallingDown";
  } else if (!player.onGround) {
    targetAnim = "jumpFall";
  } else if (Math.abs(player.vx) > 10) {
    // Mirrored-art characters pick the matching row; others always use the
    // one canonical (left-facing) run row and get flipped in drawPlayer.
    targetAnim = CHARACTERS[playerCharacter].runIsMirrored
      ? (player.facing > 0 ? "runRight" : "runLeft")
      : "runLeft";
  } else {
    targetAnim = "idle";
  }

  if (targetAnim !== player.anim) {
    player.anim = targetAnim;
    player.frame = 0;
    player.animTimer = 0;
  }

  if (targetAnim === "jumpFall") {
    // Driven by vertical velocity rather than looping by time: rising,
    // near apex, or falling.
    if (player.vy < -80) player.frame = 0;
    else if (player.vy > 80) player.frame = 2;
    else player.frame = 1;
    return;
  }

  const frameDuration = targetAnim.startsWith("run") ? 0.09 : targetAnim === "fallingDown" ? 0.08 : 0.15;
  player.animTimer += dt;
  if (player.animTimer >= frameDuration) {
    player.animTimer -= frameDuration;
    player.frame = (player.frame + 1) % CHARACTERS[playerCharacter].frameCounts[player.anim];
  }
}

function updateCamera() {
  const lookahead = CAMERA_LOOKAHEAD * player.facing;
  const target = player.x + PLAYER_WIDTH / 2 - GAME_WIDTH / 2 + lookahead;
  camera.x += (target - camera.x) * 0.12;
  camera.x = Math.max(0, Math.min(camera.x, LEVEL_WIDTH - GAME_WIDTH));
}

function update(dt) {
  if (gameState !== "playing") return;

  if (cityBannerTimer > 0) {
    cityBannerTimer -= dt;
  }
  updatePlayer(dt);
  if (gameState !== "playing") return; // a fall/obstacle hit may have ended the game this frame
  updateAnimation(dt);
  updateObstacles(dt);
  updatePowerups();
  updateCamera();
  furthestX = Math.max(furthestX, player.x);
}

/* ------------------------------------------------------------------ */
/* 8. BACKGROUND — parallax "office" silhouettes (Client/UI)           */
/* ------------------------------------------------------------------ */
// Pre-generate deterministic layer content so shapes don't jitter frame
// to frame. Each layer scrolls at its own factor relative to the camera.
function buildParallaxLayer(spacing, seed, levelWidth, colorPick) {
  const items = [];
  let x = 40;
  let i = 0;
  while (x < levelWidth + 200) {
    const t = (i * seed) % 3;
    items.push({ x, kind: t, color: colorPick(t) });
    x += spacing + ((i * 37) % 60);
    i++;
  }
  return items;
}

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

// Draws a real image as a horizontally-repeating parallax layer: the same
// camera-offset modulo approach as drawParallaxLayer above, just aimed at
// a photo/illustration instead of procedural shapes. `displayHeight` sets
// how tall the image is drawn (its width is derived from the image's own
// natural aspect ratio — never hardcode a pixel width, since exported art
// doesn't always come back at the exact size requested). bg_dublin.png is
// wide relative to a small `scrollFactor`, so it naturally reads as "one
// continuous backdrop that repeats only every so often" rather than a
// tight tile.
function drawTiledImageLayer(img, loaded, scrollFactor, displayHeight, y) {
  if (!loaded || !img.naturalWidth) return;
  const displayWidth = displayHeight * (img.naturalWidth / img.naturalHeight);
  const offset = ((camera.x * scrollFactor) % displayWidth + displayWidth) % displayWidth;
  for (let x = -offset; x < GAME_WIDTH; x += displayWidth) {
    ctx.drawImage(img, x, y, displayWidth, displayHeight);
  }
}

// Draws one horizontal band cut out of background_office.png (see
// OFFICE_BANDS above), tiled at native pixel size — its own full width is
// the tile period, per band, so unlike drawTiledImageLayer there's no
// height-driven rescale.
function drawOfficeBand(bandIndex, scrollFactor, destY) {
  if (!bgOfficeLoaded || !OFFICE_BANDS) return;
  const band = OFFICE_BANDS[bandIndex];
  const tileWidth = bgOfficeImage.naturalWidth;
  const offset = ((camera.x * scrollFactor) % tileWidth + tileWidth) % tileWidth;
  for (let x = -offset; x < GAME_WIDTH; x += tileWidth) {
    ctx.drawImage(bgOfficeImage, 0, band.sy, tileWidth, band.sh, x, destY, tileWidth, band.sh);
  }
}

/* ------------------------------------------------------------------ */
/* 9. RENDER (Client/UI)                                                */
/* ------------------------------------------------------------------ */
function worldToScreenX(x) {
  return x - camera.x;
}

function drawGround() {
  ctx.fillStyle = PALETTE.ground;
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
  ctx.fillStyle = PALETTE.platform;
  for (const p of PLATFORMS) {
    ctx.fillRect(worldToScreenX(p.x), p.y, p.width, p.height);
  }
}

// Shantanu, waiting at the end of the final level (Munich only).
function drawGoal() {
  if (!GOAL) return;
  const sx = worldToScreenX(GOAL.x);
  if (sx < -120 || sx > GAME_WIDTH + 120) return;

  const h = 96;
  const w = shantanuImageLoaded ? (shantanuImage.width / shantanuImage.height) * h : 80;
  const y = GOAL.y - h;

  if (shantanuImageLoaded) {
    ctx.drawImage(shantanuImage, sx, y, w, h);
  } else {
    ctx.fillStyle = "#ffcc66";
    ctx.fillRect(sx, y, w, h);
  }
  ctx.fillStyle = "#f2f2f2";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("SHANTANU", sx + w / 2, y - 8);
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
  const character = CHARACTERS[playerCharacter];

  if (!character.loaded) {
    // Fallback shape until the spritesheet finishes loading
    ctx.fillStyle = player.boostTimer > 0 ? "#ffcc66" : "#5fd0ff";
    ctx.beginPath();
    ctx.roundRect(sx, player.y, player.width, player.height, player.width / 2);
    ctx.fill();
    return;
  }

  const drawWidth = (character.cellW / character.cellH) * SPRITE_DRAW_HEIGHT;
  const rowIndex = SPRITE_ROWS.indexOf(player.anim);
  const sourceX = player.frame * character.cellW;
  const sourceY = rowIndex * character.cellH;

  // Draw larger than the (small, simple) physics hitbox: centered
  // horizontally on it, feet aligned to its bottom.
  const drawX = sx + player.width / 2 - drawWidth / 2;
  const drawY = player.y + player.height - SPRITE_DRAW_HEIGHT;

  // Idle/jumpFall/fallingDown are single-direction art (canonically facing
  // right) that we flip when facing left. Running is per-character: a
  // mirrored-art character (male) always has the correct row already
  // selected in updateAnimation, so it's never flipped here; an
  // unmirrored one (female) always renders the one canonical (left-facing)
  // row and gets flipped when facing right instead.
  const isRunAnim = player.anim === "runLeft" || player.anim === "runRight";
  const needsFlip = isRunAnim
    ? !character.runIsMirrored && player.facing > 0
    : player.facing < 0;

  ctx.save();
  if (needsFlip) {
    ctx.translate(drawX + drawWidth, drawY);
    ctx.scale(-1, 1);
    ctx.drawImage(character.image, sourceX, sourceY, character.cellW, character.cellH, 0, 0, drawWidth, SPRITE_DRAW_HEIGHT);
  } else {
    ctx.drawImage(character.image, sourceX, sourceY, character.cellW, character.cellH, drawX, drawY, drawWidth, SPRITE_DRAW_HEIGHT);
  }
  ctx.restore();
}

// Lives shown as heart icons rather than a bare number: filled for
// remaining lives, hollow for lives already lost.
function drawHearts(x, y) {
  const spacing = 22;
  ctx.font = "20px sans-serif";
  ctx.textAlign = "left";
  for (let i = 0; i < STARTING_LIVES; i++) {
    ctx.fillStyle = i < lives ? "#e0455f" : "#4a5270";
    ctx.fillText(i < lives ? "♥" : "♡", x + i * spacing, y);
  }
}

function drawHUD() {
  ctx.fillStyle = "#f2f2f2";
  ctx.font = "16px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(LEVELS[currentLevelIndex].name, 16, 26);
  drawHearts(16, 50);
  ctx.fillStyle = "#f2f2f2";
  ctx.font = "16px sans-serif";
  ctx.fillText(`Score: ${getScore()}`, 16, 76);
  ctx.fillText(`Coffee boosts: ${boostsCollected}`, 16, 96);
  if (player.boostTimer > 0) {
    ctx.fillStyle = "#ffcc66";
    ctx.fillText(`Boost: ${player.boostTimer.toFixed(1)}s`, 16, 116);
  }

  if (cityBannerTimer > 0) {
    const level = LEVELS[currentLevelIndex];
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, GAME_HEIGHT / 2 - 30, GAME_WIDTH, 60);
    ctx.fillStyle = "#ffffff";
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${level.greeting}, ${playerName}! Welcome to ${level.name}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10);
  }
}

// Placeholder title screen, used until assets/images/title-screen.png
// exists. Once that file is in place, drawTitleScreen switches to it
// automatically (see the titleImage loader above).
function drawTitleScreen() {
  if (titleImageLoaded) {
    ctx.drawImage(titleImage, 0, 0, GAME_WIDTH, GAME_HEIGHT);
    return;
  }

  ctx.fillStyle = "#10131c";
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  ctx.fillStyle = "#ffcc66";
  ctx.font = "bold 48px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("THE SHANTANU SIGN-OFF", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40);
  ctx.fillStyle = "#f2f2f2";
  ctx.font = "20px sans-serif";
  ctx.fillText("(drop title-screen.png into assets/images/ to use your art)", GAME_WIDTH / 2, GAME_HEIGHT / 2);

  drawStartPrompt();
}

// Dimmed backdrop shown behind the real HTML name-entry <input> overlay.
function drawNameEntryBackground() {
  if (titleImageLoaded) {
    ctx.drawImage(titleImage, 0, 0, GAME_WIDTH, GAME_HEIGHT);
  } else {
    ctx.fillStyle = "#10131c";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }
  ctx.fillStyle = "rgba(10, 12, 18, 0.55)";
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
}

// Breaks `text` into lines no wider than maxWidth and draws them centered,
// starting at (x, y) with the given line height.
function drawWrappedText(text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
  return y;
}

function drawStoryScreen() {
  ctx.fillStyle = "#10131c";
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = "#ffcc66";
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("THE SHANTANU SIGN-OFF", GAME_WIDTH / 2, 90);

  ctx.fillStyle = "#f2f2f2";
  ctx.font = "18px sans-serif";
  let y = 150;
  y = drawWrappedText(
    `Three cities stand between you and The Sign-Off, ${playerName}: Dublin, Berlin, and Munich.`,
    GAME_WIDTH / 2, y, 720, 28
  );
  y = drawWrappedText(
    "Run and jump past desks, printers, and patrolling coworkers. Watch out for gaps in the floor.",
    GAME_WIDTH / 2, y + 36, 720, 28
  );
  y = drawWrappedText(
    "Grab coffee cups for a temporary speed boost. You have 3 lives, shown as hearts, top-left.",
    GAME_WIDTH / 2, y + 36, 720, 28
  );
  y = drawWrappedText(
    "Reach the end of Munich to finally track down Shantanu and win the game!",
    GAME_WIDTH / 2, y + 36, 720, 28
  );

  ctx.fillStyle = "#9aa4c0";
  ctx.font = "15px sans-serif";
  ctx.fillText("Arrows/WASD to move, Space/Up to jump, P or Esc to pause", GAME_WIDTH / 2, y + 60);

  drawStartPromptText("CLICK OR PRESS ENTER TO BEGIN", GAME_HEIGHT - 50);
}

function drawStartPrompt() {
  const boxW = 260;
  const boxH = 56;
  const boxX = GAME_WIDTH / 2 - boxW / 2;
  const boxY = GAME_HEIGHT - 120;
  const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 300);

  ctx.fillStyle = `rgba(255, 204, 102, ${pulse.toFixed(2)})`;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 10);
  ctx.fill();
  ctx.fillStyle = "#10131c";
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PRESS START", GAME_WIDTH / 2, boxY + boxH / 2 + 8);
}

function drawPauseOverlay() {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PAUSED", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 10);
  ctx.font = "18px sans-serif";
  ctx.fillText("Press P / Esc, or tap the pause button, to resume", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 26);
}

function drawGameOverScreen() {
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  ctx.fillStyle = "#d94f4f";
  ctx.font = "bold 44px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("GAME OVER", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40);
  ctx.fillStyle = "#f2f2f2";
  ctx.font = "18px sans-serif";
  ctx.fillText(`Score: ${getScore()} — ${boostsCollected} coffee boosts collected`, GAME_WIDTH / 2, GAME_HEIGHT / 2);

  drawStartPromptText("CLICK OR PRESS ENTER TO RESTART", GAME_HEIGHT / 2 + 60);
}

function drawWinScreen() {
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  if (shantanuImageLoaded) {
    const h = 200;
    const w = (shantanuImage.width / shantanuImage.height) * h;
    ctx.drawImage(shantanuImage, GAME_WIDTH / 2 - w / 2, 70, w, h);
  }

  ctx.fillStyle = "#ffcc66";
  ctx.font = "bold 40px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("You found Shantanu!", GAME_WIDTH / 2, GAME_HEIGHT - 130);
  ctx.fillStyle = "#f2f2f2";
  ctx.font = "18px sans-serif";
  ctx.fillText(`Final score: ${getScore()} — ${boostsCollected} coffee boosts collected`, GAME_WIDTH / 2, GAME_HEIGHT - 100);

  drawStartPromptText("CLICK OR PRESS ENTER TO PLAY AGAIN", GAME_HEIGHT - 60);
}

function drawStartPromptText(text, y) {
  const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 300);
  ctx.fillStyle = `rgba(255, 204, 102, ${pulse.toFixed(2)})`;
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, GAME_WIDTH / 2, y);
}

function render() {
  if (gameState === "title") {
    drawTitleScreen();
    return;
  }
  if (gameState === "nameEntry" || gameState === "characterSelect") {
    drawNameEntryBackground();
    return;
  }
  if (gameState === "story") {
    drawStoryScreen();
    return;
  }

  // Sky background
  ctx.fillStyle = PALETTE.sky;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  if (currentLevelIndex === 0) {
    // Dublin: real art for all three depth layers. Back to front: the wide
    // skyline backdrop (slowest, ~10%), then the three office-interior
    // bands cut out of background_office.png, each faster than the last.
    drawTiledImageLayer(bgDublinImage, bgDublinLoaded, 0.1, GROUND_Y, 0);
    drawOfficeBand(0, 0.2, GROUND_Y - 10 - 195); // far band, bottom-anchored near GROUND_Y-10
    drawOfficeBand(1, 0.4, GROUND_Y - 231);      // mid band, bottom-anchored at GROUND_Y
    drawOfficeBand(2, 0.6, GROUND_Y + 4 - 219);  // near band, bottom-anchored near GROUND_Y+4
  } else {
    // Berlin/Munich: no matching art yet — keep the procedural silhouettes.
    drawParallaxLayer(LAYER_FAR, 0.2, GROUND_Y - 10);
    drawParallaxLayer(LAYER_MID, 0.45, GROUND_Y);
    drawParallaxLayer(LAYER_NEAR, 0.7, GROUND_Y + 4);
  }

  drawGround();
  drawPlatforms();
  drawGoal();
  drawPowerups();
  drawObstacles();
  drawPlayer();
  drawHUD();

  if (gameState === "paused") drawPauseOverlay();
  if (gameState === "gameover") drawGameOverScreen();
  if (gameState === "win") drawWinScreen();
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
