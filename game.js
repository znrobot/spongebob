const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const startButton = document.getElementById("startButton");
const rulesButton = document.getElementById("rulesButton");
const rulesOverlay = document.getElementById("rulesOverlay");
const closeRules = document.getElementById("closeRules");
const durationInput = document.getElementById("durationInput");
const initialHpInput = document.getElementById("initialHpInput");
const levelIndicator = document.getElementById("levelIndicator");
const levelDesc = document.getElementById("levelDesc");
const spongeScore = document.getElementById("spongeScore");
const patrickScore = document.getElementById("patrickScore");
const spongeHp = document.getElementById("spongeHp");
const patrickHp = document.getElementById("patrickHp");
const timerText = document.getElementById("timer");
const statusText = document.getElementById("statusText");
const touchCatchButton = document.getElementById("touchCatchButton");
const multiplayerPanel = document.getElementById("multiplayerPanel");
const createRoomButton = document.getElementById("createRoomButton");
const joinRoomButton = document.getElementById("joinRoomButton");
const copyRoomButton = document.getElementById("copyRoomButton");
const readyButton = document.getElementById("readyButton");
const roomCodeInput = document.getElementById("roomCodeInput");
const networkStatus = document.getElementById("networkStatus");
const levelSelectButton = document.getElementById("levelSelectButton");
const levelSelectOverlay = document.getElementById("levelSelectOverlay");
const closeLevelSelect = document.getElementById("closeLevelSelect");
const levelCards = document.getElementById("levelCards");
const levelSelectTitle = document.getElementById("levelSelectTitle");
const freePlayConfig = document.getElementById("freePlayConfig");
const freeOpponentBonus = document.getElementById("freeOpponentBonus");
const freeGiantJelly = document.getElementById("freeGiantJelly");
const freeBossMode = document.getElementById("freeBossMode");
const startFreePlayBtn = document.getElementById("startFreePlay");
const backToLevelCardsBtn = document.getElementById("backToLevelCards");
const freeplayAdvanceControls = document.getElementById("freeplayAdvanceControls");
const startFreePlayAdvance = document.getElementById("startFreePlayAdvance");
const pauseButton = document.getElementById("pauseButton");

const completedLevels = new Set();
let level5LockClicks = 0;

const keys = new Set();
const touchMoves = new Set();
let touchCatchHeld = false;
let animationId = 0;
let loopRunning = false;
let lastTime = 0;
let state = null;
let lastNetworkSync = 0;
const SEAWEED_HEIGHT = 78;
const SEAWEED_SAFE_SECONDS = 5;

const LEVELS = [
  { level: 1, desc: "普通水母", opponentBonus: false, giantJelly: false, bossMode: false },
  { level: 2, desc: "玩家互助", opponentBonus: true, giantJelly: false, bossMode: false },
  { level: 3, desc: "巨大水母", opponentBonus: false, giantJelly: true, bossMode: false },
  { level: 4, desc: "Boss", opponentBonus: false, giantJelly: true, bossMode: true },
  { level: 5, desc: "全部叠加", opponentBonus: true, giantJelly: true, bossMode: true },
  { level: 6, desc: "自由关卡", opponentBonus: false, giantJelly: false, bossMode: false, freePlay: true },
];

const multiplayer = {
  mode: "single",
  peer: null,
  conn: null,
  role: null,
  localReady: false,
  remoteReady: false,
  remoteInput: { left: false, right: false, up: false, down: false, catch: false },
  roomId: "",
  joinTimer: null,
};

const characters = {
  spongebob: {
    id: "spongebob",
    name: "海绵宝宝",
    color: "#ffe85c",
    accent: "#7a4e2a",
    x: 180,
    y: 280,
  },
  patrick: {
    id: "patrick",
    name: "派大星",
    color: "#ff8fa7",
    accent: "#63b45f",
    x: 760,
    y: 280,
  },
  karen: {
    id: "karen",
    name: "凯伦",
    color: "#7ec8e3",
    accent: "#2c5f8a",
    x: 180,
    y: 280,
  },
  plankton: {
    id: "plankton",
    name: "皮老板",
    color: "#4caf50",
    accent: "#1b5e20",
    x: 760,
    y: 280,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getOpponent(player) {
  return state.players.find((candidate) => candidate.id !== player.id);
}

function createPlayer(base, controlledByHuman, initialHp) {
  return {
    ...base,
    vx: 0,
    vy: 0,
    radius: 26,
    hp: initialHp,
    score: 0,
    invincible: 0,
    catchCooldown: 0,
    catchBonusCooldown: 0,
    inSeaweed: false,
    seaweedSafeTime: 0,
    controlledByHuman,
    remoteControlled: false,
    caughtFlash: 0,
    bonusFlash: 0,
  };
}

function isDoubleMode() {
  return document.querySelector("input[name='gameMode']:checked")?.value === "double";
}

function isNetworkHost() {
  return multiplayer.mode === "double" && multiplayer.role === "host";
}

function isNetworkGuest() {
  return multiplayer.mode === "double" && multiplayer.role === "guest";
}

function canSimulateGame() {
  return multiplayer.mode !== "double" || isNetworkHost();
}

function spawnJellyfish() {
  return {
    x: 90 + Math.random() * (canvas.width - 180),
    y: 90 + Math.random() * (canvas.height - 160),
    radius: 18 + Math.random() * 8,
    speed: 34 + Math.random() * 34,
    angle: Math.random() * Math.PI * 2,
    turnTimer: 0.5 + Math.random() * 1.8,
    shootTimer: 0.8 + Math.random() * 1.9,
    pulse: Math.random() * Math.PI * 2,
  };
}

function spawnGiantJellyfish(options = {}) {
  const radius = options.radius ?? 58;
  return {
    x: options.x ?? canvas.width / 2,
    y: options.y ?? 130,
    radius,
    vx: options.vx ?? (Math.random() < 0.5 ? -1 : 1) * (72 + Math.random() * 58),
    vy: options.vy ?? (Math.random() < 0.5 ? -1 : 1) * (48 + Math.random() * 48),
    pulse: 0,
    hits: 0,
    maxHits: options.maxHits ?? 10,
    points: options.points ?? 100,
    boss: Boolean(options.boss),
    contactCooldown: 0,
    shootTimer: 0.45,
    explodeFlash: 0,
  };
}

function resetGame() {
  freeplayAdvanceControls.hidden = true;
  multiplayer.mode = isDoubleMode() ? "double" : "single";
  if (multiplayer.mode === "double" && !isNetworkHost()) {
    statusText.textContent = "双人联机由房主开始游戏，请等待房主同步画面";
    return;
  }

  const selected = document.querySelector("input[name='player']:checked").value;
  const duration = clamp(Number(durationInput.value) || 60, 20, 300);
  const initialHp = clamp(Number(initialHpInput.value) || 10, 1, 99);
  durationInput.value = duration;
  initialHpInput.value = initialHp;

  const config = LEVELS[0];
  const spongePlayer = createPlayer(characters.spongebob, multiplayer.mode === "double" || selected === "spongebob", initialHp);
  const patrickPlayer = createPlayer(characters.patrick, selected === "patrick" && multiplayer.mode !== "double", initialHp);
  if (multiplayer.mode === "double") {
    patrickPlayer.remoteControlled = true;
  }

  state = {
    playerChoice: selected,
    players: [spongePlayer, patrickPlayer],
    jellyfish: Array.from({ length: 7 }, spawnJellyfish),
    bullets: [],
    remaining: duration,
    duration,
    initialHp,
    currentLevel: 1,
    gameMode: "jellyfish",
    opponentBonusEnabled: config.opponentBonus,
    giantJellyEnabled: config.giantJelly,
    bossModeEnabled: config.bossMode,
    bossActive: false,
    bossJellies: [],
    bossSpawnTimer: 0,
    bossDefeated: 0,
    giantJelly: null,
    giantJellyAwarded: false,
    running: true,
    paused: false,
    waitingForNextLevel: false,
    winner: "",
  };

  startButton.textContent = "重新开始";
  pauseButton.textContent = "⏸";
  pauseButton.classList.remove("is-paused");
  updateLevelHud();
  statusText.textContent = `第 1 关 — ${LEVELS[0].desc}！${buildStartHint()}`;
  startLoop();
  sendNetworkMessage({ type: "start" });
  sendSnapshot(true);
}

function buildStartHint() {
  const targets = state.opponentBonusEnabled ? "水母或对方角色" : "水母";
  if (state.bossModeEnabled) {
    return `方向键或 WASD 移动，空格抓${targets}；打爆巨大水母后进入 Boss 关卡`;
  }
  return state.giantJellyEnabled
    ? `方向键或 WASD 移动，空格抓${targets}；最后 10 秒会出现巨大水母`
    : `方向键或 WASD 移动，空格抓${targets}`;
}

function showLevelComplete() {
  state.waitingForNextLevel = true;
  state.running = false;
  const nextLevel = state.currentLevel + 1;
  const nextConfig = LEVELS.find(function (l) { return l.level === nextLevel; });
  if (nextConfig && nextConfig.freePlay) {
    state.advancingToFreePlay = true;
    freeplayAdvanceControls.hidden = false;
    freeOpponentBonus.checked = false;
    freeGiantJelly.checked = false;
    freeBossMode.checked = false;
    startFreePlayAdvance.hidden = false;
  }
}

function confirmLevelComplete() {
  if (!state || !state.waitingForNextLevel) return;

  completedLevels.add(state.currentLevel);

  if (state.currentLevel >= LEVELS.length) {
    state.waitingForNextLevel = false;
    finishGame(false);
    return;
  }

  state.waitingForNextLevel = false;
  advanceToNextLevel();
}

function advanceToNextLevel() {
  freeplayAdvanceControls.hidden = true;
  const nextLevel = state.currentLevel + 1;

  const nextConfig = LEVELS.find(function (l) { return l.level === nextLevel; });
  if (!nextConfig) {
    finishGame(false);
    return;
  }

  if (!isLevelUnlocked(nextLevel)) {
    finishGame(false);
    statusText.textContent = state.winner + "（下一关未解锁，请到关卡选择页面查看）";
    return;
  }

  if (nextConfig.freePlay) {
    state.advancingToFreePlay = false;
    state.currentLevel = nextLevel;
    state.opponentBonusEnabled = freeOpponentBonus.checked;
    state.giantJellyEnabled = freeGiantJelly.checked;
    state.bossModeEnabled = freeBossMode.checked;
    state.remaining = state.duration;
    state.running = true;
    state.paused = false;
    state.gameMode = "jellyfish";
    state.bossActive = false;
    state.bossJellies = [];
    state.bossSpawnTimer = 0;
    state.giantJelly = null;
    state.giantJellyAwarded = false;
    state.bullets = [];
    for (const player of state.players) {
      player.hp = state.initialHp;
      player.invincible = 0;
      player.catchCooldown = 0;
      player.catchBonusCooldown = 0;
    }
    updateLevelHud();
    var descParts2 = [];
    if (freeOpponentBonus.checked) descParts2.push("对手加分");
    if (freeGiantJelly.checked) descParts2.push("巨大水母");
    if (freeBossMode.checked) descParts2.push("Boss");
    var desc2 = descParts2.length > 0 ? descParts2.join("+") : "无额外机制";
    levelIndicator.textContent = "可选";
    levelDesc.textContent = desc2;
    statusText.textContent = "第 6 关 — " + desc2 + "！" + buildStartHint();
    return;
  }

  state.currentLevel = nextLevel;
  const config = nextConfig;
  state.opponentBonusEnabled = config.opponentBonus;
  state.giantJellyEnabled = config.giantJelly;
  state.bossModeEnabled = config.bossMode;
  state.remaining = state.duration;
  state.running = true;
  state.paused = false;
  state.gameMode = "jellyfish";
  state.bossActive = false;
  state.bossJellies = [];
  state.bossSpawnTimer = 0;
  state.giantJelly = null;
  state.giantJellyAwarded = false;
  state.bullets = [];
  for (const player of state.players) {
    player.hp = state.initialHp;
    player.invincible = 0;
    player.catchCooldown = 0;
    player.catchBonusCooldown = 0;
  }
  updateLevelHud();
  statusText.textContent = `第 ${state.currentLevel} 关 — ${config.desc}！${buildStartHint()}`;
}

function handleHuman(player, dt) {
  let dx = 0;
  let dy = 0;
  if (keys.has("ArrowLeft") || keys.has("a")) dx -= 1;
  if (keys.has("ArrowRight") || keys.has("d")) dx += 1;
  if (keys.has("ArrowUp") || keys.has("w")) dy -= 1;
  if (keys.has("ArrowDown") || keys.has("s")) dy += 1;
  if (touchMoves.has("left")) dx -= 1;
  if (touchMoves.has("right")) dx += 1;
  if (touchMoves.has("up")) dy -= 1;
  if (touchMoves.has("down")) dy += 1;

  const length = Math.hypot(dx, dy) || 1;
  player.vx = (dx / length) * 220;
  player.vy = (dy / length) * 220;

  if ((keys.has(" ") || keys.has("Enter") || touchCatchHeld) && player.catchCooldown <= 0) {
    tryCatch(player);
  }

  movePlayer(player, dt);
}

function handleRemotePlayer(player, dt) {
  if (player.hp <= 0) return;

  let dx = 0;
  let dy = 0;
  if (multiplayer.remoteInput.left) dx -= 1;
  if (multiplayer.remoteInput.right) dx += 1;
  if (multiplayer.remoteInput.up) dy -= 1;
  if (multiplayer.remoteInput.down) dy += 1;

  const length = Math.hypot(dx, dy) || 1;
  player.vx = (dx / length) * 220;
  player.vy = (dy / length) * 220;

  if (multiplayer.remoteInput.catch && player.catchCooldown <= 0) {
    tryCatch(player);
  }

  movePlayer(player, dt);
}

function getLocalInput() {
  return {
    left: keys.has("ArrowLeft") || keys.has("a") || touchMoves.has("left"),
    right: keys.has("ArrowRight") || keys.has("d") || touchMoves.has("right"),
    up: keys.has("ArrowUp") || keys.has("w") || touchMoves.has("up"),
    down: keys.has("ArrowDown") || keys.has("s") || touchMoves.has("down"),
    catch: keys.has(" ") || keys.has("Enter") || touchCatchHeld,
  };
}

function sendLocalInput() {
  if (!isNetworkGuest()) return;
  sendNetworkMessage({ type: "input", input: getLocalInput() });
}

function handleAi(player, dt) {
  if (player.hp <= 0) return;

  const opponent = getOpponent(player);
  let target = state.jellyfish
    .slice()
    .sort((a, b) => distance(player, a) - distance(player, b))[0];

  if (state.opponentBonusEnabled && opponent && opponent.hp > 0 && opponent.catchBonusCooldown <= 0) {
    const opponentDistance = distance(player, opponent);
    const jellyDistance = target ? distance(player, target) : Infinity;
    if (opponentDistance < Math.max(220, jellyDistance)) {
      target = opponent;
    }
  }

  let avoidX = 0;
  let avoidY = 0;
  for (const bullet of state.bullets) {
    const d = distance(player, bullet);
    if (d < 96) {
      avoidX += (player.x - bullet.x) / Math.max(d, 1);
      avoidY += (player.y - bullet.y) / Math.max(d, 1);
    }
  }

  if (target) {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const d = Math.hypot(dx, dy) || 1;
    const ax = dx / d + avoidX * 1.6;
    const ay = dy / d + avoidY * 1.6;
    const al = Math.hypot(ax, ay) || 1;
    player.vx = (ax / al) * 178;
    player.vy = (ay / al) * 178;

    if (d < player.radius + target.radius + 22 && player.catchCooldown <= 0) {
      tryCatch(player);
    }
  }

  movePlayer(player, dt);
}

function movePlayer(player, dt) {
  if (player.hp <= 0) {
    player.vx = 0;
    player.vy = 0;
    return;
  }
  player.x = clamp(player.x + player.vx * dt, player.radius, canvas.width - player.radius);
  player.y = clamp(player.y + player.vy * dt, player.radius + 18, canvas.height - player.radius);
}

function isInSeaweed(player) {
  return player.y + player.radius * 0.5 >= canvas.height - SEAWEED_HEIGHT;
}

function updateSeaweedProtection(player, dt) {
  const nowInSeaweed = isInSeaweed(player);
  if (nowInSeaweed && !player.inSeaweed) {
    player.seaweedSafeTime = SEAWEED_SAFE_SECONDS;
  }
  if (!nowInSeaweed) {
    player.seaweedSafeTime = 0;
  }

  player.inSeaweed = nowInSeaweed;
  if (player.inSeaweed && player.seaweedSafeTime > 0) {
    player.seaweedSafeTime = Math.max(0, player.seaweedSafeTime - dt);
  }
}

function hasSeaweedProtection(player) {
  return player.inSeaweed && player.seaweedSafeTime > 0;
}

function tryCatch(player) {
  player.catchCooldown = 0.42;
  const catchRange = player.radius + 34;

  if (tryHitGiantJelly(player, catchRange)) {
    return;
  }

  if (tryCatchOpponentBonus(player, catchRange)) {
    return;
  }

  const index = state.jellyfish.findIndex((jelly) => distance(player, jelly) < catchRange + jelly.radius);
  if (index >= 0) {
    player.score += 1;
    player.hp += 1;
    player.caughtFlash = 0.28;
    state.jellyfish.splice(index, 1, spawnJellyfish());
  }
}

function tryCatchOpponentBonus(player, catchRange) {
  if (!state.opponentBonusEnabled) {
    return false;
  }

  const opponent = getOpponent(player);
  if (!opponent || opponent.hp <= 0 || opponent.catchBonusCooldown > 0) {
    return false;
  }

  if (distance(player, opponent) < catchRange + opponent.radius) {
    player.score += 10;
    player.caughtFlash = 0.35;
    player.bonusFlash = 0.7;
    opponent.catchBonusCooldown = 1.05;
    statusText.textContent = `${player.name}抓到${opponent.name}，获得 10 分`;
    return true;
  }

  return false;
}

function tryHitGiantJelly(player, catchRange) {
  const giants = [state.giantJelly, ...state.bossJellies].filter(Boolean);
  const giant = giants.find(
    (candidate) =>
      candidate.contactCooldown <= 0 &&
      candidate.explodeFlash <= 0 &&
      distance(player, candidate) < catchRange + candidate.radius,
  );
  if (!giant) {
    return false;
  }

  hitGiantJelly(player, giant);
  return true;
}

function hitGiantJelly(player, giant) {
  if (!giant || giant.contactCooldown > 0 || giant.explodeFlash > 0) return;

  giant.hits += 1;
  giant.contactCooldown = 0.35;
  player.caughtFlash = 0.25;

  if (giant.hits >= giant.maxHits) {
    player.score += giant.points;
    player.bonusFlash = 1;
    giant.explodeFlash = 0.5;
    if (giant.boss) {
      state.bossDefeated += 1;
    } else {
      state.giantJellyAwarded = true;
    }
    var isEmp = giant.maxHits === 100;
    statusText.textContent = player.name + (isEmp ? "打爆皇帝水母" : "打爆巨大水母") + "，获得 " + giant.points + " 分";
  } else {
    var isEmp2 = giant.maxHits === 100;
    statusText.textContent = (isEmp2 ? "皇帝水母 " : "巨大水母 ") + giant.hits + "/" + giant.maxHits;
  }
}

function updateJellyfish(dt) {
  for (const jelly of state.jellyfish) {
    jelly.turnTimer -= dt;
    jelly.shootTimer -= dt;
    jelly.pulse += dt * 6;

    if (jelly.turnTimer <= 0) {
      jelly.angle += -1.1 + Math.random() * 2.2;
      jelly.turnTimer = 0.6 + Math.random() * 1.6;
    }

    jelly.x += Math.cos(jelly.angle) * jelly.speed * dt;
    jelly.y += Math.sin(jelly.angle) * jelly.speed * dt;

    if (jelly.x < 36 || jelly.x > canvas.width - 36) jelly.angle = Math.PI - jelly.angle;
    if (jelly.y < 54 || jelly.y > canvas.height - 42) jelly.angle = -jelly.angle;
    jelly.x = clamp(jelly.x, 36, canvas.width - 36);
    jelly.y = clamp(jelly.y, 54, canvas.height - 42);

    if (jelly.shootTimer <= 0) {
      shootFrom(jelly);
      jelly.shootTimer = 1.2 + Math.random() * 2.1;
    }
  }
}

function updateGiantJelly(dt) {
  if (!state.giantJellyEnabled && !state.bossActive) return;

  if (!state.bossActive && !state.giantJelly && !state.giantJellyAwarded && state.remaining <= 10) {
    state.giantJelly = spawnGiantJellyfish({ x: canvas.width / 2, y: 130, vx: 92, vy: 58 });
    statusText.textContent = "巨大水母出现了，接触 10 下可获得 100 分";
  }

  const giant = state.giantJelly;
  if (giant) {
    updateOneGiantJelly(giant, dt);
    if (giant.explodeFlash <= 0 && state.giantJellyAwarded) {
      state.giantJelly = null;
      if (state.bossModeEnabled && !state.bossActive) {
        startBossStage();
      }
    }
  }

  if (state.bossActive) {
    updateBossStage(dt);
  }
}

function updateOneGiantJelly(giant, dt) {
  giant.pulse += dt * 5;
  giant.contactCooldown = Math.max(0, giant.contactCooldown - dt);

  if (giant.explodeFlash > 0) {
    giant.explodeFlash = Math.max(0, giant.explodeFlash - dt);
    return;
  }

  giant.shootTimer -= dt;
  if (giant.shootTimer <= 0) {
    var isEmperor = giant.maxHits === 100;
    shootFrom(giant, isEmperor ? 4 : 2);
    giant.shootTimer = giant.boss ? 0.45 + Math.random() * 0.55 : 0.6 + Math.random() * 1.05;
    if (isEmperor) giant.shootTimer *= 0.6;
  }

  giant.x += giant.vx * dt;
  giant.y += giant.vy * dt;
  if (giant.x < giant.radius + 20 || giant.x > canvas.width - giant.radius - 20) giant.vx *= -1;
  if (giant.y < giant.radius + 36 || giant.y > canvas.height - giant.radius - 34) giant.vy *= -1;
  giant.x = clamp(giant.x, giant.radius + 20, canvas.width - giant.radius - 20);
  giant.y = clamp(giant.y, giant.radius + 36, canvas.height - giant.radius - 34);

  for (const player of state.players) {
    if (player.hp > 0 && distance(player, giant) < player.radius + giant.radius) {
      hitGiantJelly(player, giant);
      break;
    }
  }
}

function startBossStage() {
  state.bossActive = true;
  state.remaining = 120;
  state.duration = 120;
  state.bullets = [];
  state.bossSpawnTimer = 0;
  state.bossJellies = Array.from({ length: 5 }, (_, index) =>
    spawnGiantJellyfish({
      boss: true,
      x: 160 + index * 155,
      y: 96 + (index % 2) * 118,
      radius: 46 + Math.random() * 12,
      maxHits: 10,
      points: 100,
    }),
  );
  statusText.textContent = "Boss 关卡开始：2 分钟内会出现超多巨大水母，派大星也在";
}

function updateBossStage(dt) {
  state.bossSpawnTimer -= dt;
  if (state.bossSpawnTimer <= 0 && state.bossJellies.length < 9) {
    state.bossJellies.push(
      spawnGiantJellyfish({
        boss: true,
        x: 100 + Math.random() * (canvas.width - 200),
        y: 80 + Math.random() * 230,
        radius: 44 + Math.random() * 16,
        maxHits: 10,
        points: 100,
      }),
    );
    state.bossSpawnTimer = 4.5 + Math.random() * 3;
  }

  for (const giant of state.bossJellies) {
    updateOneGiantJelly(giant, dt);
  }
  state.bossJellies = state.bossJellies.filter((giant) => giant.explodeFlash > 0 || giant.hits < giant.maxHits);
}

function shootFrom(jelly, attackMultiplier = 1) {
  const livePlayers = state.players.filter((player) => player.hp > 0);
  if (!livePlayers.length) return;
  const target = livePlayers.sort((a, b) => distance(jelly, a) - distance(jelly, b))[0];
  const dx = target.x - jelly.x;
  const dy = target.y - jelly.y;
  const length = Math.hypot(dx, dy) || 1;
  state.bullets.push({
    x: jelly.x,
    y: jelly.y,
    vx: (dx / length) * 235 * attackMultiplier,
    vy: (dy / length) * 235 * attackMultiplier,
    radius: 7 * attackMultiplier,
    life: 2.4,
    power: attackMultiplier,
  });
}

function updateBullets(dt) {
  for (const bullet of state.bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    for (const player of state.players) {
      if (player.hp > 0 && player.invincible <= 0 && distance(player, bullet) < player.radius + bullet.radius) {
        if (hasSeaweedProtection(player)) {
          bullet.life = 0;
          player.caughtFlash = 0.16;
          continue;
        }
        player.hp = Math.max(0, player.hp - (bullet.power || 1));
        player.invincible = 1.1;
        bullet.life = 0;
      }
    }
  }
  state.bullets = state.bullets.filter(
    (bullet) =>
      bullet.life > 0 &&
      bullet.x > -20 &&
      bullet.x < canvas.width + 20 &&
      bullet.y > -20 &&
      bullet.y < canvas.height + 20,
  );
}

function update(dt) {
  if (state.paused) return;
  if (state.gameMode === "redlight") {
    updateRedLight(dt);
    return;
  }

  state.remaining = Math.max(0, state.remaining - dt);

  for (const player of state.players) {
    player.invincible = Math.max(0, player.invincible - dt);
    player.catchCooldown = Math.max(0, player.catchCooldown - dt);
    player.catchBonusCooldown = Math.max(0, player.catchBonusCooldown - dt);
    player.caughtFlash = Math.max(0, player.caughtFlash - dt);
    player.bonusFlash = Math.max(0, player.bonusFlash - dt);
    if (player.remoteControlled && isNetworkHost()) handleRemotePlayer(player, dt);
    else if (player.controlledByHuman) handleHuman(player, dt);
    else handleAi(player, dt);
    updateSeaweedProtection(player, dt);
  }

  updateJellyfish(dt);
  updateGiantJelly(dt);
  updateBullets(dt);
  updateHud();

  const allDown = state.players.every((player) => player.hp <= 0);
  if (allDown) {
    finishGame(true);
    return;
  }
  if (state.remaining <= 0) {
    showLevelComplete();
  }
}

function finishGame(allDown) {
  state.running = false;
  const [sponge, patrick] = state.players;
  if (sponge.score === patrick.score) state.winner = "平局";
  else state.winner = sponge.score > patrick.score ? "海绵宝宝获胜" : "派大星获胜";
  const levelText = `到达第 ${state.currentLevel} 关`;
  statusText.textContent = allDown ? `双方生命耗尽，${state.winner}（${levelText}）` : `${state.winner}（${levelText}）`;
}

function updateLevelHud() {
  const config = LEVELS.find(function (l) { return l.level === state.currentLevel; }) || LEVELS[0];
  levelIndicator.textContent = state.currentLevel + " / " + LEVELS.length;
  levelDesc.textContent = config.desc;
}

function updateHud() {
  const [sponge, patrick] = state.players;
  spongeScore.textContent = sponge.score;
  patrickScore.textContent = patrick.score;
  spongeHp.textContent = `生命 ${sponge.hp}`;
  patrickHp.textContent = `生命 ${patrick.hp}`;
  timerText.textContent = `${Math.ceil(state.remaining)} | 第${state.currentLevel}关`;
  if (state.bossActive) {
    timerText.textContent = `${Math.ceil(state.remaining)} | Boss ${state.bossJellies.length}`;
    return;
  }
  if (state.giantJelly && state.giantJelly.explodeFlash <= 0) {
    var isEmp = state.giantJelly.maxHits === 100;
    timerText.textContent = Math.ceil(state.remaining) + " | " + (isEmp ? "皇帝 " : "巨大 ") + state.giantJelly.hits + "/" + state.giantJelly.maxHits;
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#7ce6ee");
  gradient.addColorStop(1, "#1785a6");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.22)";
  for (let i = 0; i < 18; i += 1) {
    const x = (i * 83 + 37) % canvas.width;
    const y = (i * 137 + performance.now() * 0.018) % canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, 6 + (i % 4) * 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#e7c96f";
  ctx.fillRect(0, canvas.height - 28, canvas.width, 28);
  ctx.fillStyle = "rgba(18,49,63,0.14)";
  for (let x = 0; x < canvas.width; x += 38) {
    ctx.beginPath();
    ctx.arc(x, canvas.height - 16, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  drawSeaweed();
}

function drawSeaweed() {
  const baseY = canvas.height - SEAWEED_HEIGHT;
  const now = performance.now() * 0.003;
  ctx.fillStyle = "rgba(32, 137, 86, 0.24)";
  ctx.fillRect(0, baseY, canvas.width, SEAWEED_HEIGHT);

  for (let x = -8; x < canvas.width + 16; x += 18) {
    const height = 44 + ((x * 13) % 28);
    const sway = Math.sin(now + x * 0.05) * 7;
    ctx.strokeStyle = x % 36 === 0 ? "rgba(31, 122, 72, 0.88)" : "rgba(45, 156, 94, 0.8)";
    ctx.lineWidth = x % 36 === 0 ? 5 : 3;
    ctx.beginPath();
    ctx.moveTo(x, canvas.height - 24);
    ctx.quadraticCurveTo(x + sway, canvas.height - height * 0.55, x + sway * 0.4, canvas.height - height);
    ctx.stroke();
  }
}

function drawJellyfish(jelly) {
  ctx.save();
  ctx.translate(jelly.x, jelly.y);
  const bob = Math.sin(jelly.pulse) * 3;
  ctx.fillStyle = "#d889ff";
  ctx.strokeStyle = "#8a45bd";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, bob, jelly.radius, Math.PI, 0);
  ctx.quadraticCurveTo(jelly.radius * 0.8, jelly.radius * 0.9, 0, jelly.radius * 0.82 + bob);
  ctx.quadraticCurveTo(-jelly.radius * 0.8, jelly.radius * 0.9, -jelly.radius, bob);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(104, 38, 150, 0.78)";
  ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 7, jelly.radius * 0.72 + bob);
    ctx.quadraticCurveTo(i * 10, jelly.radius * 1.35 + bob, i * 4, jelly.radius * 1.85 + bob);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGiantJellyfish(giant) {
  if (!giant) return;

  var isEmperor = giant.maxHits === 100;
  ctx.save();
  ctx.translate(giant.x, giant.y);
  var scale = 1 + Math.sin(giant.pulse) * 0.05;
  var radius = giant.radius * scale;

  if (giant.explodeFlash > 0) {
    ctx.fillStyle = "rgba(255, 244, 93, " + Math.max(0, giant.explodeFlash * 1.8) + ")";
    ctx.beginPath();
    ctx.arc(0, 0, radius + (0.5 - giant.explodeFlash) * 180, 0, Math.PI * 2);
    ctx.fill();
  }

  if (isEmperor) {
    // Golden emperor jellyfish body
    ctx.fillStyle = "#ffd700";
    ctx.strokeStyle = "#8b6914";
  } else {
    ctx.fillStyle = "#b05cff";
    ctx.strokeStyle = "#4c167c";
  }
  ctx.lineWidth = isEmperor ? 7 : 5;
  ctx.shadowColor = "rgba(255,255,255,0.65)";
  ctx.shadowBlur = isEmperor ? 30 : 20;
  ctx.beginPath();
  ctx.arc(0, -4, radius, Math.PI, 0);
  ctx.quadraticCurveTo(radius * 0.9, radius * 0.9, 0, radius * 0.78);
  ctx.quadraticCurveTo(-radius * 0.9, radius * 0.9, -radius, -4);
  ctx.fill();
  ctx.stroke();

  // Draw crown for emperor
  if (isEmperor) {
    ctx.shadowColor = "rgba(255, 200, 20, 0.7)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#ffd700";
    ctx.strokeStyle = "#8b6914";
    ctx.lineWidth = 4;
    ctx.beginPath();
    var crownY = -radius - 12;
    var crownW = radius * 0.55;
    ctx.moveTo(-crownW, crownY + 22);
    ctx.lineTo(-crownW, crownY);
    ctx.lineTo(-crownW * 0.6, crownY - 16);
    ctx.lineTo(-crownW * 0.15, crownY - 4);
    ctx.lineTo(0, crownY - 24);
    ctx.lineTo(crownW * 0.15, crownY - 4);
    ctx.lineTo(crownW * 0.6, crownY - 16);
    ctx.lineTo(crownW, crownY);
    ctx.lineTo(crownW, crownY + 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Jewels on crown
    ctx.fillStyle = "#e83030";
    ctx.strokeStyle = "#6b1010";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-crownW * 0.6, crownY - 10, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#3070e8";
    ctx.beginPath();
    ctx.arc(0, crownY - 16, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e83030";
    ctx.beginPath();
    ctx.arc(crownW * 0.6, crownY - 10, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.strokeStyle = isEmperor ? "rgba(120, 80, 20, 0.82)" : "rgba(72, 22, 124, 0.82)";
  ctx.lineWidth = isEmperor ? 5 : 4;
  for (var i = -4; i <= 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 13, radius * 0.62);
    ctx.quadraticCurveTo(i * 17, radius * 1.15, i * 7, radius * 1.7);
    ctx.stroke();
  }

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#12313f";
  ctx.lineWidth = isEmperor ? 5 : 4;
  ctx.font = "800 " + (isEmperor ? 26 : 24) + "px Microsoft YaHei, Arial";
  ctx.textAlign = "center";
  var hitText = giant.hits + "/" + giant.maxHits;
  ctx.strokeText(hitText, 0, 6);
  ctx.fillText(hitText, 0, 6);
  ctx.restore();
}

function drawBullet(bullet) {
  ctx.save();
  ctx.translate(bullet.x, bullet.y);
  ctx.strokeStyle = bullet.power > 1 ? "#ff7b3d" : "#fff45d";
  ctx.lineWidth = bullet.power > 1 ? 7 : 4;
  ctx.shadowColor = "#fff45d";
  ctx.shadowBlur = bullet.power > 1 ? 20 : 12;
  ctx.beginPath();
  ctx.moveTo(-8, -4);
  ctx.lineTo(-1, 1);
  ctx.lineTo(-6, 7);
  ctx.lineTo(9, -2);
  ctx.stroke();
  ctx.restore();
}

function drawPlayer(player) {
  ctx.save();
  ctx.translate(player.x, player.y);
  const flashing = player.invincible > 0 && Math.floor(player.invincible * 12) % 2 === 0;
  ctx.globalAlpha = flashing ? 0.45 : 1;

  if (player.id === "spongebob") drawSponge(player);
  else if (player.id === "patrick") drawPatrick(player);
  else if (player.id === "karen") drawKarenPlayer(player);
  else if (player.id === "plankton") drawPlanktonPlayer(player);

  if (player.catchCooldown > 0.18) {
    ctx.strokeStyle = player.controlledByHuman ? "#ffffff" : "rgba(18,49,63,0.65)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(22, -12, player.radius + 30, -0.8, 0.95);
    ctx.stroke();
  }

  if (player.caughtFlash > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.beginPath();
    ctx.arc(0, -42, 12 + player.caughtFlash * 30, 0, Math.PI * 2);
    ctx.fill();
  }

  if (player.bonusFlash > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#12313f";
    ctx.lineWidth = 4;
    ctx.font = "800 24px Microsoft YaHei, Arial";
    ctx.textAlign = "center";
    ctx.strokeText("+10", 0, -54);
    ctx.fillText("+10", 0, -54);
  }

  if (player.inSeaweed) {
    const active = hasSeaweedProtection(player);
    ctx.fillStyle = active ? "#ffffff" : "#ffe0df";
    ctx.strokeStyle = active ? "#176f45" : "#9c2e2a";
    ctx.lineWidth = 3;
    ctx.font = "800 16px Microsoft YaHei, Arial";
    ctx.textAlign = "center";
    const label = active ? `草 ${Math.ceil(player.seaweedSafeTime)}` : "草 0";
    ctx.strokeText(label, 0, -72);
    ctx.fillText(label, 0, -72);
  }

  ctx.restore();
}

function drawSponge(player) {
  ctx.fillStyle = player.color;
  ctx.strokeStyle = "#6e5d21";
  ctx.lineWidth = 3;
  ctx.fillRect(-22, -29, 44, 48);
  ctx.strokeRect(-22, -29, 44, 48);
  ctx.fillStyle = "#fff";
  ctx.fillRect(-20, 19, 40, 12);
  ctx.fillStyle = player.accent;
  ctx.fillRect(-20, 31, 40, 12);
  drawEyes();
  ctx.fillStyle = "#246c89";
  ctx.fillRect(-12, 43, 8, 12);
  ctx.fillRect(5, 43, 8, 12);
}

function drawPatrick(player) {
  ctx.fillStyle = player.color;
  ctx.strokeStyle = "#9e5365";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -36);
  ctx.lineTo(25, 22);
  ctx.lineTo(10, 52);
  ctx.lineTo(0, 35);
  ctx.lineTo(-12, 52);
  ctx.lineTo(-25, 22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = player.accent;
  ctx.fillRect(-20, 22, 40, 16);
  drawEyes();
}

function drawKarenPlayer(player) {
  // Antenna
  ctx.strokeStyle = "#4a6a7a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -32);
  ctx.lineTo(3, -46);
  ctx.stroke();
  ctx.fillStyle = "#ff6b6b";
  ctx.beginPath();
  ctx.arc(3, -48, 3, 0, Math.PI * 2);
  ctx.fill();

  // Screen body — outer bezel
  var grad = ctx.createLinearGradient(-24, -32, 24, -32);
  grad.addColorStop(0, "#8ab8d0");
  grad.addColorStop(0.5, "#c8e4f0");
  grad.addColorStop(1, "#6a9ab8");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "#2c5f8a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-24, -32, 48, 54, 4);
  ctx.fill();
  ctx.stroke();

  // Inner screen
  ctx.fillStyle = "#0d2530";
  ctx.strokeStyle = "#1a4458";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-18, -26, 36, 32, 2);
  ctx.fill();
  ctx.stroke();

  // Green waveform face
  ctx.strokeStyle = "#4caf50";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "#7fff7f";
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(-14, -2);
  ctx.lineTo(-8, -18);
  ctx.lineTo(-1, -6);
  ctx.lineTo(6, -20);
  ctx.lineTo(14, -6);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Green "eye" dot
  ctx.fillStyle = "#7fff7f";
  ctx.shadowColor = "#7fff7f";
  ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.arc(0, -14, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Control panel below screen
  ctx.fillStyle = "#5a7a8a";
  ctx.fillRect(-18, 8, 36, 10);
  ctx.strokeStyle = "#3d5563";
  ctx.lineWidth = 1;
  ctx.strokeRect(-18, 8, 36, 10);
  // Buttons
  ctx.fillStyle = "#ff6b6b";
  ctx.beginPath();
  ctx.arc(-8, 13, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7fff7f";
  ctx.beginPath();
  ctx.arc(0, 13, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffe85c";
  ctx.beginPath();
  ctx.arc(8, 13, 3, 0, Math.PI * 2);
  ctx.fill();

  // Base bar
  ctx.fillStyle = "#4a6270";
  ctx.strokeStyle = "#2c404d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-20, 20, 40, 8, 2);
  ctx.fill();
  ctx.stroke();

  // Wheels with hubs
  function drawWheel(cx, cy_r) {
    ctx.fillStyle = "#2c2c2c";
    ctx.beginPath();
    ctx.arc(cx, cy_r, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy_r, 7, 0, Math.PI * 2);
    ctx.stroke();
    // Hub
    ctx.fillStyle = "#888";
    ctx.beginPath();
    ctx.arc(cx, cy_r, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Spokes
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 1;
    for (var a = 0; a < 4; a++) {
      var angle = a * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * 2.5, cy_r + Math.sin(angle) * 2.5);
      ctx.lineTo(cx + Math.cos(angle) * 6, cy_r + Math.sin(angle) * 6);
      ctx.stroke();
    }
  }
  drawWheel(-14, 34);
  drawWheel(14, 34);

  // Screen glare
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(-14, -24);
  ctx.lineTo(-4, -24);
  ctx.lineTo(-14, -6);
  ctx.closePath();
  ctx.fill();
}

function drawPlanktonPlayer(player) {
  // Antennae with segments
  ctx.strokeStyle = "#2d5a1e";
  ctx.lineWidth = 2;
  // Left antenna
  ctx.beginPath();
  ctx.moveTo(-4, -24);
  ctx.lineTo(-10, -38);
  ctx.lineTo(-8, -44);
  ctx.stroke();
  // Right antenna
  ctx.beginPath();
  ctx.moveTo(4, -24);
  ctx.lineTo(10, -38);
  ctx.lineTo(8, -44);
  ctx.stroke();
  // Antenna balls
  ctx.fillStyle = "#e53935";
  ctx.beginPath();
  ctx.arc(-8, -46, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#b71c1c";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(-8, -46, 3.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#e53935";
  ctx.beginPath();
  ctx.arc(8, -46, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#b71c1c";
  ctx.beginPath();
  ctx.arc(8, -46, 3.5, 0, Math.PI * 2);
  ctx.stroke();

  // Body — pear-shaped using bezier curves
  ctx.fillStyle = player.color;
  ctx.strokeStyle = player.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.bezierCurveTo(-14, -22, -20, -4, -16, 12);
  ctx.bezierCurveTo(-10, 14, 10, 14, 16, 12);
  ctx.bezierCurveTo(20, -4, 14, -22, 0, -28);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Body spots / texture
  ctx.fillStyle = "#388e3c";
  ctx.beginPath();
  ctx.arc(-5, 0, 2.5, 0, Math.PI * 2);
  ctx.arc(6, 4, 2, 0, Math.PI * 2);
  ctx.arc(-9, 8, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Single large eye — white sclera
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#12313f";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, -14, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Red iris/pupil
  var eyeGrad = ctx.createRadialGradient(0, -15, 1, 0, -14, 6);
  eyeGrad.addColorStop(0, "#ff1744");
  eyeGrad.addColorStop(0.7, "#c62828");
  eyeGrad.addColorStop(1, "#880e0e");
  ctx.fillStyle = eyeGrad;
  ctx.beginPath();
  ctx.arc(0, -14, 5.5, 0, Math.PI * 2);
  ctx.fill();
  // Pupil highlight
  ctx.fillStyle = "#ff8a80";
  ctx.beginPath();
  ctx.arc(-1, -16, 2, 0, Math.PI * 2);
  ctx.fill();
  // Eye highlight dot
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(-2, -17, 1, 0, Math.PI * 2);
  ctx.fill();

  // Angry thick eyebrows
  ctx.strokeStyle = "#1b5e20";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-11, -26);
  ctx.lineTo(-3, -22);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(11, -26);
  ctx.lineTo(3, -22);
  ctx.stroke();

  // Mouth — evil grin
  ctx.strokeStyle = "#1b5e20";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-5, 4);
  ctx.quadraticCurveTo(0, 10, 5, 4);
  ctx.stroke();
  // Teeth
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-3, 4, 2, 3);
  ctx.fillRect(1, 4, 2, 3);

  // Arms with bends
  ctx.strokeStyle = "#2d5a1e";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-14, -2);
  ctx.lineTo(-20, -6);
  ctx.lineTo(-24, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(14, -2);
  ctx.lineTo(20, -6);
  ctx.lineTo(24, 4);
  ctx.stroke();
  ctx.lineCap = "butt";

  // Legs with small feet
  ctx.beginPath();
  ctx.moveTo(-5, 12);
  ctx.lineTo(-7, 20);
  ctx.lineTo(-11, 21);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(5, 12);
  ctx.lineTo(7, 20);
  ctx.lineTo(11, 21);
  ctx.stroke();
}

function drawEyes() {
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-8, -10, 7, 0, Math.PI * 2);
  ctx.arc(8, -10, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#12313f";
  ctx.beginPath();
  ctx.arc(-6, -9, 3, 0, Math.PI * 2);
  ctx.arc(10, -9, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#12313f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 5, 9, 0.1, Math.PI - 0.1);
  ctx.stroke();
}

function drawPauseOverlay() {
  if (!state || !state.paused) return;
  ctx.save();
  ctx.fillStyle = "rgba(18,49,63,0.55)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "700 44px Microsoft YaHei, Arial";
  ctx.fillText("⏸ 已暂停", canvas.width / 2, canvas.height / 2 - 8);
  ctx.font = "700 20px Microsoft YaHei, Arial";
  ctx.fillText("按 P 键继续游戏", canvas.width / 2, canvas.height / 2 + 34);
  ctx.restore();
}

function drawEndMessage() {
  if (!state || state.running) return;
  ctx.save();
  ctx.fillStyle = "rgba(18,49,63,0.62)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "700 44px Microsoft YaHei, Arial";
  ctx.fillText(state.winner, canvas.width / 2, canvas.height / 2 - 12);
  ctx.font = "700 22px Microsoft YaHei, Arial";
  ctx.fillText("点击重新开始再来一局", canvas.width / 2, canvas.height / 2 + 34);
  ctx.restore();
}

function draw() {
  if (state && state.gameMode === "redlight") {
    drawRedLight();
    return;
  }

  drawBackground();
  if (!state) {
    ctx.fillStyle = "rgba(18,49,63,0.72)";
    ctx.textAlign = "center";
    ctx.font = "700 34px Microsoft YaHei, Arial";
    ctx.fillText("准备好下海抓水母", canvas.width / 2, canvas.height / 2 - 8);
    ctx.font = "700 20px Microsoft YaHei, Arial";
    ctx.fillText("选择角色和时间后开始", canvas.width / 2, canvas.height / 2 + 34);
    return;
  }
  state.jellyfish.forEach(drawJellyfish);
  drawGiantJellyfish(state.giantJelly);
  state.bossJellies.forEach(drawGiantJellyfish);
  state.bullets.forEach(drawBullet);
  state.players.forEach(drawPlayer);
  drawEndMessage();
  drawLevelCompleteMessage();
  drawPauseOverlay();
}

function drawLevelCompleteMessage() {
  if (!state || !state.waitingForNextLevel) return;
  ctx.save();
  ctx.fillStyle = "rgba(18,49,63,0.52)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "700 40px Microsoft YaHei, Arial";
  const isLast = state.currentLevel >= LEVELS.length;
  if (state.currentLevel === 8) {
    ctx.fillText("第八关完成！", canvas.width / 2, canvas.height / 2 - 12);
    ctx.font = "700 20px Microsoft YaHei, Arial";
    ctx.fillText("按空格或点击画面返回第五关 Boss", canvas.width / 2, canvas.height / 2 + 34);
  } else {
    ctx.fillText(isLast ? "全部通关！" : "第 " + state.currentLevel + " 关完成！", canvas.width / 2, canvas.height / 2 - 12);
    ctx.font = "700 20px Microsoft YaHei, Arial";
    ctx.fillText(isLast ? "按空格或点击画面查看结果" : "按空格或点击画面进入下一关", canvas.width / 2, canvas.height / 2 + 34);
  }
  ctx.restore();
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;

  sendLocalInput();
  if (state?.running && canSimulateGame()) {
    update(dt);
    sendSnapshot(false);
  }
  draw();

  animationId = requestAnimationFrame(loop);
}

function startLoop() {
  lastTime = performance.now();
  if (!loopRunning) {
    loopRunning = true;
    animationId = requestAnimationFrame(loop);
  }
}

function peerIdFromCode(code) {
  return `spongebob-${code.trim().toLowerCase()}`;
}

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function setNetworkStatus(text) {
  networkStatus.textContent = text;
}

function updateMultiplayerUi() {
  multiplayer.mode = isDoubleMode() ? "double" : "single";
  multiplayerPanel.hidden = multiplayer.mode !== "double";

  if (multiplayer.mode !== "double") {
    startButton.disabled = false;
    startButton.textContent = "开始游戏";
    return;
  }

  const connected = Boolean(multiplayer.conn?.open);
  joinRoomButton.disabled = isNetworkHost();
  readyButton.disabled = !connected;
  if (!multiplayer.role) {
    startButton.disabled = true;
    startButton.textContent = "等待联机";
  } else if (isNetworkGuest()) {
    startButton.disabled = true;
    startButton.textContent = "等待房主";
  } else {
    startButton.disabled = !(connected && multiplayer.localReady && multiplayer.remoteReady);
    startButton.textContent = startButton.disabled ? "等待双方准备" : "开始游戏";
  }
  readyButton.textContent = multiplayer.localReady ? "已准备" : "我准备好了";
}

function formatPeerError(error) {
  const type = error?.type || "";
  if (type === "peer-unavailable") {
    return "找不到这个房间。请确认房主已经创建成功，并完整复制房间码。";
  }
  if (type === "unavailable-id") {
    return "这个房间码已被占用，请重新创建房间。";
  }
  if (type === "network" || type === "server-error" || type === "socket-error") {
    return "联机服务器暂时连不上，请换个网络或稍后重试。";
  }
  if (type === "browser-incompatible") {
    return "当前浏览器不支持 WebRTC 联机，请换 Chrome、Safari 或 Edge。";
  }
  return error?.message || type || "未知联机错误";
}

function ensurePeer(peerId) {
  if (!window.Peer) {
    setNetworkStatus("联机模块未加载，请检查网络后刷新页面。");
    return null;
  }
  if (multiplayer.peer && !multiplayer.peer.destroyed) {
    multiplayer.peer.destroy();
  }
  multiplayer.peer = peerId ? new Peer(peerId) : new Peer(undefined);
  multiplayer.peer.on("error", (error) => {
    setNetworkStatus(`连接错误：${formatPeerError(error)}`);
    if (isNetworkHost() && error?.type === "unavailable-id") {
      setNetworkStatus("这个房间号刚好被占用，请再点一次创建房间。");
      multiplayer.role = null;
      multiplayer.roomId = "";
      roomCodeInput.value = "";
      updateMultiplayerUi();
    }
  });
  return multiplayer.peer;
}

function attachConnection(conn) {
  multiplayer.conn = conn;
  conn.on("open", () => {
    clearTimeout(multiplayer.joinTimer);
    setNetworkStatus(isNetworkHost() ? `玩家 2 已加入房间 ${multiplayer.roomId}，双方点击准备后开始。` : "已加入房间，点击准备等待房主开始。");
    sendNetworkMessage({ type: "hello", role: multiplayer.role });
    updateMultiplayerUi();
  });
  conn.on("data", handleNetworkMessage);
  conn.on("close", () => {
    clearTimeout(multiplayer.joinTimer);
    setNetworkStatus("联机已断开，请重新创建或加入房间。");
    multiplayer.conn = null;
    multiplayer.remoteReady = false;
    updateMultiplayerUi();
  });
}

function createRoom() {
  multiplayer.mode = "double";
  multiplayer.role = "host";
  multiplayer.localReady = false;
  multiplayer.remoteReady = false;
  multiplayer.roomId = makeRoomCode();
  roomCodeInput.value = multiplayer.roomId;
  const peer = ensurePeer(peerIdFromCode(multiplayer.roomId));
  if (!peer) return;
  peer.on("open", () => {
    setNetworkStatus(`房间已创建：${multiplayer.roomId}。房主已在房间里，不要再点加入；让第二个玩家输入这个房间码。`);
    updateMultiplayerUi();
  });
  peer.on("connection", (conn) => {
    if (multiplayer.conn?.open) {
      conn.close();
      return;
    }
    attachConnection(conn);
  });
  updateMultiplayerUi();
}

function joinRoom() {
  if (isNetworkHost()) {
    setNetworkStatus("你已经是房主并在房间里了，请等待另一个玩家加入。");
    return;
  }

  const code = roomCodeInput.value.trim().toUpperCase();
  if (!code) {
    setNetworkStatus("请输入房间码。");
    return;
  }

  multiplayer.mode = "double";
  multiplayer.role = "guest";
  multiplayer.localReady = false;
  multiplayer.remoteReady = false;
  multiplayer.roomId = code;
  const peer = ensurePeer();
  if (!peer) return;
  peer.on("open", () => {
    attachConnection(peer.connect(peerIdFromCode(code), { reliable: true }));
    clearTimeout(multiplayer.joinTimer);
    multiplayer.joinTimer = setTimeout(() => {
      if (!multiplayer.conn?.open) {
        setNetworkStatus("还没有连上房间。请确认房主页面保持打开，并且输入的是最新 6 位房间码。");
      }
    }, 7000);
    setNetworkStatus("正在加入房间...");
  });
  updateMultiplayerUi();
}

async function copyRoomCode() {
  const code = roomCodeInput.value.trim();
  if (!code) {
    setNetworkStatus("还没有房间码可复制。");
    return;
  }

  try {
    await navigator.clipboard.writeText(code);
    setNetworkStatus("房间码已复制，可以发给另一个玩家。");
  } catch {
    roomCodeInput.select();
    setNetworkStatus("已选中房间码，请手动复制。");
  }
}

function setReady() {
  if (!multiplayer.conn?.open) return;
  multiplayer.localReady = true;
  sendNetworkMessage({ type: "ready", ready: true });
  setNetworkStatus(isNetworkHost() ? "你已准备，等待玩家 2 准备。" : "你已准备，等待房主开始。");
  updateMultiplayerUi();
}

function sendNetworkMessage(message) {
  if (multiplayer.conn?.open) {
    multiplayer.conn.send(message);
  }
}

function handleNetworkMessage(message) {
  if (!message || typeof message !== "object") return;

  if (message.type === "ready") {
    multiplayer.remoteReady = Boolean(message.ready);
    if (isNetworkHost() && multiplayer.localReady && multiplayer.remoteReady) {
      setNetworkStatus("双方已准备，可以开始游戏。");
    } else {
      setNetworkStatus("对方已准备。");
    }
    updateMultiplayerUi();
    return;
  }

  if (message.type === "input" && isNetworkHost()) {
    multiplayer.remoteInput = {
      left: Boolean(message.input?.left),
      right: Boolean(message.input?.right),
      up: Boolean(message.input?.up),
      down: Boolean(message.input?.down),
      catch: Boolean(message.input?.catch),
    };
    return;
  }

  if (message.type === "start" && isNetworkGuest()) {
    setNetworkStatus("房主已开始游戏。");
    startLoop();
    return;
  }

  if (message.type === "snapshot" && isNetworkGuest()) {
    state = message.state;
    if (state?.running) {
      startLoop();
    }
    draw();
    return;
  }
}

function sendSnapshot(force) {
  if (!isNetworkHost() || !state) return;
  const now = performance.now();
  if (!force && now - lastNetworkSync < 50) return;
  lastNetworkSync = now;
  sendNetworkMessage({ type: "snapshot", state });
}

function isLevelUnlocked(levelNum) {
  if (levelNum === 1) return true;
  if (levelNum === 5) return completedLevels.has(4) && level5LockClicks >= 5;
  if (levelNum === 6) return completedLevels.has(5);
  return completedLevels.has(levelNum - 1);
}

function renderLevelCards() {
  levelCards.innerHTML = "";
  for (let li = 0; li < LEVELS.length; li += 1) {
    const config = LEVELS[li];
    const lv = config.level;
    const unlocked = isLevelUnlocked(lv);
    const beaten = completedLevels.has(lv);
    const secretLock = lv === 5 && completedLevels.has(4) && !unlocked;

    const card = document.createElement("div");
    card.className = "level-card" + (unlocked ? "" : " locked");

    let lockHtml = "";
    if (!unlocked) {
      lockHtml = secretLock
        ? '<span class="lock-icon secret-lock" title="点击锁 5 次解锁">🔒</span>'
        : '<span class="lock-icon">🔒</span>';
    }

    card.innerHTML =
      lockHtml +
      '<span class="level-num">第 ' + lv + ' 关</span>' +
      '<span class="level-desc">' + config.desc + '</span>' +
      (beaten ? '<span class="level-badge">已通关</span>' : "") +
      (unlocked && !beaten ? '<span class="level-badge" style="background:#fff3cd;color:#8a6d14">进行中</span>' : "");

    if (unlocked) {
      card.addEventListener("click", function () {
        if (config.freePlay) {
          levelSelectOverlay.hidden = true;
          freeOpponentBonus.checked = false;
          freeGiantJelly.checked = false;
          freeBossMode.checked = false;
          freeplayAdvanceControls.hidden = false;
          startFreePlayAdvance.hidden = false;
          startFreePlayAdvance.textContent = "开始第六关";
        } else {
          startLevel(lv);
        }
      });
    }

    if (secretLock) {
      var lockIcon = card.querySelector(".secret-lock");
      lockIcon.addEventListener("click", function (event) {
        event.stopPropagation();
        level5LockClicks += 1;
        lockIcon.style.transform = "scale(1.2)";
        setTimeout(function () { lockIcon.style.transform = ""; }, 150);
        if (level5LockClicks >= 5) {
          level5LockClicks = 5;
          renderLevelCards();
        }
      });
    }

    levelCards.appendChild(card);
  }
}

function showFreePlayConfig() {
  levelSelectTitle.textContent = "第六关 — 可选择关卡";
  levelCards.hidden = true;
  freePlayConfig.hidden = false;
  closeLevelSelect.hidden = true;
  freeOpponentBonus.checked = false;
  freeGiantJelly.checked = false;
  freeBossMode.checked = false;
  freeplayAdvanceControls.hidden = false;
  startFreePlayAdvance.hidden = true;
}

function hideFreePlayConfig() {
  levelSelectTitle.textContent = "选择关卡";
  levelCards.hidden = false;
  freePlayConfig.hidden = true;
  closeLevelSelect.hidden = false;
  freeplayAdvanceControls.hidden = true;
}

function startFreePlay() {
  const config = {
    opponentBonus: freeOpponentBonus.checked,
    giantJelly: freeGiantJelly.checked,
    bossMode: freeBossMode.checked,
  };

  if (multiplayer.mode === "double" && !isNetworkHost()) {
    setNetworkStatus("双人联机由房主选择关卡。");
    return;
  }

  const descParts = [];
  if (config.opponentBonus) descParts.push("对手加分");
  if (config.giantJelly) descParts.push("巨大水母");
  if (config.bossMode) descParts.push("Boss");
  const desc = descParts.length > 0 ? descParts.join("+") : "无额外机制";

  // Advancing from previous level — apply config to existing state
  if (state && state.advancingToFreePlay) {
    state.advancingToFreePlay = false;
    state.waitingForNextLevel = false;
    completedLevels.add(5);
    state.currentLevel = 6;
    state.opponentBonusEnabled = config.opponentBonus;
    state.giantJellyEnabled = config.giantJelly;
    state.bossModeEnabled = config.bossMode;
    state.remaining = state.duration;
    state.running = true;
    state.paused = false;
    state.gameMode = "jellyfish";
    state.bossActive = false;
    state.bossJellies = [];
    state.bossSpawnTimer = 0;
    state.giantJelly = null;
    state.giantJellyAwarded = false;
    state.bullets = [];
    for (var pi = 0; pi < state.players.length; pi++) {
      state.players[pi].hp = state.initialHp;
      state.players[pi].invincible = 0;
      state.players[pi].catchCooldown = 0;
      state.players[pi].catchBonusCooldown = 0;
    }
    pauseButton.textContent = "⏸";
    pauseButton.classList.remove("is-paused");
    levelIndicator.textContent = "可选";
    levelDesc.textContent = desc;
    statusText.textContent = `可选择关卡 — ${desc}！${buildStartHint()}`;
    levelSelectOverlay.hidden = true;
    hideFreePlayConfig();
    startLoop();
    sendNetworkMessage({ type: "start" });
    sendSnapshot(true);
    return;
  }

  // Fresh start from level select
  const selected = document.querySelector("input[name='player']:checked").value;
  const duration = clamp(Number(durationInput.value) || 60, 20, 300);
  const initialHp = clamp(Number(initialHpInput.value) || 10, 1, 99);
  durationInput.value = duration;
  initialHpInput.value = initialHp;

  const spongePlayer = createPlayer(characters.spongebob, multiplayer.mode === "double" || selected === "spongebob", initialHp);
  const patrickPlayer = createPlayer(characters.patrick, selected === "patrick" && multiplayer.mode !== "double", initialHp);
  if (multiplayer.mode === "double") {
    patrickPlayer.remoteControlled = true;
  }

  state = {
    playerChoice: selected,
    players: [spongePlayer, patrickPlayer],
    jellyfish: Array.from({ length: 7 }, spawnJellyfish),
    bullets: [],
    remaining: duration,
    duration,
    initialHp,
    currentLevel: 6,
    gameMode: "jellyfish",
    opponentBonusEnabled: config.opponentBonus,
    giantJellyEnabled: config.giantJelly,
    bossModeEnabled: config.bossMode,
    bossActive: false,
    bossJellies: [],
    bossSpawnTimer: 0,
    bossDefeated: 0,
    giantJelly: null,
    giantJellyAwarded: false,
    running: true,
    paused: false,
    waitingForNextLevel: false,
    winner: "",
  };

  startButton.textContent = "重新开始";
  pauseButton.textContent = "⏸";
  pauseButton.classList.remove("is-paused");
  updateLevelHud();
  levelIndicator.textContent = "可选";
  levelDesc.textContent = desc;
  statusText.textContent = `可选择关卡 — ${desc}！${buildStartHint()}`;
  levelSelectOverlay.hidden = true;
  hideFreePlayConfig();
  startLoop();
  sendNetworkMessage({ type: "start" });
  sendSnapshot(true);
}

function updateRedLight(dt) {
  state.remaining = Math.max(0, state.remaining - dt);
  const rl = state.rl;

  rl.phaseTimer -= dt;

  if (rl.phase === "green" && rl.phaseTimer <= 0) {
    rl.phase = "turning";
    rl.phaseTimer = 0.65;
    statusText.textContent = "皮老板要转身了……";
  } else if (rl.phase === "turning" && rl.phaseTimer <= 0) {
    rl.phase = "red";
    rl.phaseTimer = 1.8 + Math.random() * 2.5;
    rl.playerSnapshots = {};
    rl.playerCaught = {};
    for (const player of state.players) {
      if (player.hp <= 0) continue;
      rl.playerSnapshots[player.id] = { x: player.x, y: player.y };
      rl.playerCaught[player.id] = false;
    }
    statusText.textContent = "🔴 红灯！不许动！";
  } else if (rl.phase === "red" && rl.phaseTimer <= 0) {
    rl.phase = "green";
    rl.phaseTimer = 2.5 + Math.random() * 3;
    for (const player of state.players) {
      if (player.hp <= 0) continue;
      if (!rl.playerCaught[player.id]) {
        player.score += 1;
        player.hp += 1;
        player.bonusFlash = 0.6;
        statusText.textContent = `${player.name} 没动！+1 分 +1 生命`;
      }
    }
  }

  for (const player of state.players) {
    player.invincible = Math.max(0, player.invincible - dt);
    player.caughtFlash = Math.max(0, player.caughtFlash - dt);
    player.bonusFlash = Math.max(0, player.bonusFlash - dt);
    player.catchCooldown = 0;
    player.catchBonusCooldown = 0;

    if (player.hp <= 0) continue;

    if (player.remoteControlled && isNetworkHost()) {
      moveRedLightPlayer(player, dt, rl);
    } else if (player.controlledByHuman) {
      moveRedLightPlayer(player, dt, rl);
    } else {
      handleRedLightAi(player, dt, rl);
    }
  }

  for (const player of state.players) {
    if (player.hp <= 0) continue;
    if (distance(player, rl.plankton) < player.radius + 30) {
      player.score += 10;
      player.bonusFlash = 1;
      player.x = player.id === "spongebob" ? canvas.width * 0.35 : canvas.width * 0.65;
      player.y = canvas.height - 90;
      statusText.textContent = `${player.name} 摸到皮老板 +10 分！退回起点`;
    }
  }

  updateHud();

  const allDown = state.players.every(function (p) { return p.hp <= 0; });
  if (allDown) { finishGame(true); return; }
  if (state.remaining <= 0) { showLevelComplete(); }
}

function moveRedLightPlayer(player, dt, rl) {
  var dx = 0, dy = 0;
  if (player.controlledByHuman) {
    if (keys.has("ArrowLeft") || keys.has("a")) dx -= 1;
    if (keys.has("ArrowRight") || keys.has("d")) dx += 1;
    if (keys.has("ArrowUp") || keys.has("w")) dy -= 1;
    if (keys.has("ArrowDown") || keys.has("s")) dy += 1;
    if (touchMoves.has("left")) dx -= 1;
    if (touchMoves.has("right")) dx += 1;
    if (touchMoves.has("up")) dy -= 1;
    if (touchMoves.has("down")) dy += 1;
  } else {
    // Remote input
    if (multiplayer.remoteInput.left) dx -= 1;
    if (multiplayer.remoteInput.right) dx += 1;
    if (multiplayer.remoteInput.up) dy -= 1;
    if (multiplayer.remoteInput.down) dy += 1;
  }

  var length = Math.hypot(dx, dy) || 1;
  player.vx = (dx / length) * 200;
  player.vy = (dy / length) * 200;

  if (rl.phase === "red") {
    var snap = rl.playerSnapshots[player.id];
    if (snap && !rl.playerCaught[player.id]) {
      var moved = Math.hypot(player.x + player.vx * dt - snap.x, player.y + player.vy * dt - snap.y);
      if (moved > 6) {
        rl.playerCaught[player.id] = true;
        player.hp = Math.max(0, player.hp - 1);
        player.invincible = 1;
        player.caughtFlash = 0.4;
        var dx2 = player.x - rl.plankton.x;
        var dy2 = player.y - rl.plankton.y;
        var dl = Math.hypot(dx2, dy2) || 1;
        player.x = clamp(player.x + (dx2 / dl) * 70, player.radius, canvas.width - player.radius);
        player.y = clamp(player.y + (dy2 / dl) * 70, player.radius + 18, canvas.height - player.radius);
        player.vx = 0; player.vy = 0;
        statusText.textContent = player.name + " 动了！-1 生命，退一步";
        return;
      }
    }
  }

  movePlayer(player, dt);
}

function handleRedLightAi(player, dt, rl) {
  if (rl.phase === "red") {
    player.vx = 0;
    player.vy = 0;
    movePlayer(player, dt);
    return;
  }

  var dx = rl.plankton.x - player.x;
  var dy = rl.plankton.y - player.y;
  var d = Math.hypot(dx, dy) || 1;
  var speed = rl.phase === "turning" ? 60 : 170;
  player.vx = (dx / d) * speed;
  player.vy = (dy / d) * speed;
  movePlayer(player, dt);
}

function drawRedLight() {
  drawBackground();

  var rl = state.rl;
  var pl = rl.plankton;

  drawPlankton(pl.x, pl.y);

  state.players.forEach(drawPlayer);

  var signalY = 50;
  ctx.fillStyle = rl.phase === "green" ? "#4caf50" : rl.phase === "turning" ? "#ff9800" : "#f44336";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.shadowColor = rl.phase === "green" ? "#4caf50" : rl.phase === "turning" ? "#ff9800" : "#f44336";
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.arc(canvas.width / 2, signalY, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#12313f";
  ctx.lineWidth = 2;
  ctx.font = "800 14px Microsoft YaHei, Arial";
  ctx.textAlign = "center";
  var label = rl.phase === "green" ? "绿灯" : rl.phase === "turning" ? "预备" : "红灯";
  ctx.strokeText(label, canvas.width / 2, signalY + 5);
  ctx.fillText(label, canvas.width / 2, signalY + 5);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 16px Microsoft YaHei, Arial";
  ctx.fillText("摸到皮老板 +10 分", canvas.width / 2, signalY + 46);

  drawEndMessage();
  drawLevelCompleteMessage();
  drawPauseOverlay();
}

function drawPlankton(x, y) {
  ctx.save();
  ctx.translate(x, y);

  // Antennae
  ctx.strokeStyle = "#2d5a1e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4, -16);
  ctx.quadraticCurveTo(-12, -34, -10, -40);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(4, -16);
  ctx.quadraticCurveTo(12, -34, 10, -40);
  ctx.stroke();
  ctx.fillStyle = "#ff6b6b";
  ctx.beginPath();
  ctx.arc(-10, -41, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(10, -41, 3, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = "#4caf50";
  ctx.strokeStyle = "#1b5e20";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, -4, 14, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eye
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(0, -10, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#12313f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -10, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#c62828";
  ctx.beginPath();
  ctx.arc(0, -10, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Eyebrow (angry look)
  ctx.strokeStyle = "#1b5e20";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, -18);
  ctx.lineTo(-1, -15);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(6, -18);
  ctx.lineTo(1, -15);
  ctx.stroke();

  // Arms
  ctx.strokeStyle = "#2d5a1e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.lineTo(-20, 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(20, 8);
  ctx.stroke();

  // Legs
  ctx.beginPath();
  ctx.moveTo(-5, 12);
  ctx.lineTo(-7, 20);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(5, 12);
  ctx.lineTo(7, 20);
  ctx.stroke();

  ctx.restore();
}

function startLevel(levelNum) {
  if (!isLevelUnlocked(levelNum)) return;

  freeplayAdvanceControls.hidden = true;

  const config = LEVELS[levelNum - 1];

  if (multiplayer.mode === "double" && !isNetworkHost()) {
    setNetworkStatus("双人联机由房主选择关卡。");
    return;
  }

  const selected = document.querySelector("input[name='player']:checked").value;
  const duration = clamp(Number(durationInput.value) || 60, 20, 300);
  const initialHp = clamp(Number(initialHpInput.value) || 10, 1, 99);
  durationInput.value = duration;
  initialHpInput.value = initialHp;

  const spongePlayer = createPlayer(characters.spongebob, multiplayer.mode === "double" || selected === "spongebob", initialHp);
  const patrickPlayer = createPlayer(characters.patrick, selected === "patrick" && multiplayer.mode !== "double", initialHp);
  if (multiplayer.mode === "double") {
    patrickPlayer.remoteControlled = true;
  }

  state = {
    playerChoice: selected,
    players: [spongePlayer, patrickPlayer],
    jellyfish: Array.from({ length: 7 }, spawnJellyfish),
    bullets: [],
    remaining: duration,
    duration,
    initialHp,
    currentLevel: levelNum,
    gameMode: "jellyfish",
    opponentBonusEnabled: config.opponentBonus,
    giantJellyEnabled: config.giantJelly,
    bossModeEnabled: config.bossMode,
    bossActive: false,
    bossJellies: [],
    bossSpawnTimer: 0,
    bossDefeated: 0,
    giantJelly: null,
    giantJellyAwarded: false,
    running: true,
    paused: false,
    waitingForNextLevel: false,
    winner: "",
  };

  startButton.textContent = "重新开始";
  pauseButton.textContent = "⏸";
  pauseButton.classList.remove("is-paused");
  updateLevelHud();
  statusText.textContent = `第 ${levelNum} 关 — ${config.desc}！${buildStartHint()}`;
  levelSelectOverlay.hidden = true;
  startLoop();
  sendNetworkMessage({ type: "start" });
  sendSnapshot(true);
}

function togglePause() {
  if (!state || !state.running) return;
  state.paused = !state.paused;
  if (state.paused) {
    pauseButton.classList.add("is-paused");
  } else {
    pauseButton.classList.remove("is-paused");
    statusText.textContent = "游戏继续";
  }
}

window.addEventListener("keydown", (event) => {
  if (state?.waitingForNextLevel && (event.key === " " || event.key === "Enter")) {
    event.preventDefault();
    confirmLevelComplete();
    return;
  }
  if (event.key === "p" || event.key === "P") {
    event.preventDefault();
    togglePause();
    return;
  }
  if (state?.paused) return;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
    event.preventDefault();
  }
  keys.add(event.key.length === 1 ? event.key.toLowerCase() : event.key);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
});

canvas.addEventListener("pointerdown", () => {
  if (state?.waitingForNextLevel) {
    confirmLevelComplete();
    return;
  }
  const human = state?.players.find((player) => player.controlledByHuman);
  if (human && state.running && human.catchCooldown <= 0) tryCatch(human);
});

document.querySelectorAll("[data-move]").forEach((button) => {
  const direction = button.dataset.move;
  const hold = (event) => {
    event.preventDefault();
    touchMoves.add(direction);
    button.classList.add("is-held");
    button.setPointerCapture?.(event.pointerId);
  };
  const release = (event) => {
    event.preventDefault();
    touchMoves.delete(direction);
    button.classList.remove("is-held");
  };

  button.addEventListener("pointerdown", hold);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
});

touchCatchButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (state?.waitingForNextLevel) {
    confirmLevelComplete();
    return;
  }
  touchCatchHeld = true;
  touchCatchButton.classList.add("is-held");
  touchCatchButton.setPointerCapture?.(event.pointerId);
  const human = state?.players.find((player) => player.controlledByHuman);
  if (human && state.running && human.catchCooldown <= 0) tryCatch(human);
});

function releaseTouchCatch(event) {
  event.preventDefault();
  touchCatchHeld = false;
  touchCatchButton.classList.remove("is-held");
}

touchCatchButton.addEventListener("pointerup", releaseTouchCatch);
touchCatchButton.addEventListener("pointercancel", releaseTouchCatch);
touchCatchButton.addEventListener("pointerleave", releaseTouchCatch);

document.querySelectorAll("input[name='gameMode']").forEach((input) => {
  input.addEventListener("change", updateMultiplayerUi);
});

createRoomButton.addEventListener("click", createRoom);
joinRoomButton.addEventListener("click", joinRoom);
copyRoomButton.addEventListener("click", copyRoomCode);
readyButton.addEventListener("click", setReady);
roomCodeInput.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});

startButton.addEventListener("click", () => {
  multiplayer.mode = isDoubleMode() ? "double" : "single";
  if (multiplayer.mode === "double") {
    if (!isNetworkHost()) {
      setNetworkStatus("请等待房主开始游戏。");
      return;
    }
    if (!multiplayer.localReady || !multiplayer.remoteReady) {
      setNetworkStatus("需要两个玩家都点击准备后才能开始。");
      return;
    }
  }
  resetGame();
});
durationInput.addEventListener("input", () => {
  timerText.textContent = clamp(Number(durationInput.value) || 60, 20, 300);
});

initialHpInput.addEventListener("input", () => {
  const hp = clamp(Number(initialHpInput.value) || 10, 1, 99);
  if (!state) {
    spongeHp.textContent = `生命 ${hp}`;
    patrickHp.textContent = `生命 ${hp}`;
  }
});

levelSelectButton.addEventListener("click", () => {
  renderLevelCards();
  levelSelectOverlay.hidden = false;
});

closeLevelSelect.addEventListener("click", function () {
  hideFreePlayConfig();
  levelSelectOverlay.hidden = true;
});

levelSelectOverlay.addEventListener("click", function (event) {
  if (event.target === levelSelectOverlay) {
    hideFreePlayConfig();
    levelSelectOverlay.hidden = true;
  }
});

startFreePlayBtn.addEventListener("click", startFreePlay);

backToLevelCardsBtn.addEventListener("click", hideFreePlayConfig);

pauseButton.addEventListener("click", togglePause);

rulesButton.addEventListener("click", function () {
  rulesOverlay.hidden = false;
});

closeRules.addEventListener("click", function () {
  rulesOverlay.hidden = true;
});

rulesOverlay.addEventListener("click", function (event) {
  if (event.target === rulesOverlay) {
    rulesOverlay.hidden = true;
  }
});

startFreePlayAdvance.addEventListener("click", function () {
  if (state && state.waitingForNextLevel && state.advancingToFreePlay) {
    confirmLevelComplete();
  } else {
    startFreePlay();
  }
});

updateMultiplayerUi();
draw();
