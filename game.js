const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const startButton = document.getElementById("startButton");
const durationInput = document.getElementById("durationInput");
const initialHpInput = document.getElementById("initialHpInput");
const opponentBonusInput = document.getElementById("opponentBonusInput");
const giantJellyInput = document.getElementById("giantJellyInput");
const bossModeInput = document.getElementById("bossModeInput");
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

  const bossModeEnabled = bossModeInput.checked;
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
    opponentBonusEnabled: opponentBonusInput.checked,
    giantJellyEnabled: giantJellyInput.checked || bossModeEnabled,
    bossModeEnabled,
    bossActive: false,
    bossJellies: [],
    bossSpawnTimer: 0,
    bossDefeated: 0,
    giantJelly: null,
    giantJellyAwarded: false,
    running: true,
    winner: "",
  };

  startButton.textContent = "重新开始";
  statusText.textContent = buildStartHint();
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
    statusText.textContent = `${player.name}打爆巨大水母，获得 ${giant.points} 分`;
  } else {
    statusText.textContent = `巨大水母 ${giant.hits}/${giant.maxHits}`;
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
    shootFrom(giant, 2);
    giant.shootTimer = giant.boss ? 0.45 + Math.random() * 0.55 : 0.6 + Math.random() * 1.05;
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
  if (state.remaining <= 0 || allDown) {
    finishGame(allDown);
  }
}

function finishGame(allDown) {
  state.running = false;
  const [sponge, patrick] = state.players;
  if (sponge.score === patrick.score) state.winner = "平局";
  else state.winner = sponge.score > patrick.score ? "海绵宝宝获胜" : "派大星获胜";
  statusText.textContent = allDown ? `双方生命耗尽，${state.winner}` : state.winner;
}

function updateHud() {
  const [sponge, patrick] = state.players;
  spongeScore.textContent = sponge.score;
  patrickScore.textContent = patrick.score;
  spongeHp.textContent = `生命 ${sponge.hp}`;
  patrickHp.textContent = `生命 ${patrick.hp}`;
  timerText.textContent = Math.ceil(state.remaining);
  if (state.bossActive) {
    timerText.textContent = `${Math.ceil(state.remaining)} | Boss ${state.bossJellies.length}`;
    return;
  }
  if (state.giantJelly && state.giantJelly.explodeFlash <= 0) {
    timerText.textContent = `${Math.ceil(state.remaining)} | 巨大 ${state.giantJelly.hits}/10`;
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

  ctx.save();
  ctx.translate(giant.x, giant.y);
  const scale = 1 + Math.sin(giant.pulse) * 0.05;
  const radius = giant.radius * scale;

  if (giant.explodeFlash > 0) {
    ctx.fillStyle = `rgba(255, 244, 93, ${Math.max(0, giant.explodeFlash * 1.8)})`;
    ctx.beginPath();
    ctx.arc(0, 0, radius + (0.5 - giant.explodeFlash) * 180, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#b05cff";
  ctx.strokeStyle = "#4c167c";
  ctx.lineWidth = 5;
  ctx.shadowColor = "rgba(255,255,255,0.65)";
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(0, -4, radius, Math.PI, 0);
  ctx.quadraticCurveTo(radius * 0.9, radius * 0.9, 0, radius * 0.78);
  ctx.quadraticCurveTo(-radius * 0.9, radius * 0.9, -radius, -4);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(72, 22, 124, 0.82)";
  ctx.lineWidth = 4;
  for (let i = -4; i <= 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 13, radius * 0.62);
    ctx.quadraticCurveTo(i * 17, radius * 1.15, i * 7, radius * 1.7);
    ctx.stroke();
  }

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#12313f";
  ctx.lineWidth = 4;
  ctx.font = "800 24px Microsoft YaHei, Arial";
  ctx.textAlign = "center";
  ctx.strokeText(`${giant.hits}/10`, 0, 6);
  ctx.fillText(`${giant.hits}/10`, 0, 6);
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
  else drawPatrick(player);

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

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
    event.preventDefault();
  }
  keys.add(event.key.length === 1 ? event.key.toLowerCase() : event.key);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
});

canvas.addEventListener("pointerdown", () => {
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

updateMultiplayerUi();
draw();
