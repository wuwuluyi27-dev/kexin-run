const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreValue = document.getElementById("scoreValue");
const bestValue = document.getElementById("bestValue");
const finalScore = document.getElementById("finalScore");
const finalBest = document.getElementById("finalBest");
const startOverlay = document.getElementById("startOverlay");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const leaderboardOverlay = document.getElementById("leaderboardOverlay");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const quickStartButton = document.getElementById("quickStartButton");
const leaderboardButton = document.getElementById("leaderboardButton");
const viewLeaderboardButton = document.getElementById("viewLeaderboardButton");
const closeLeaderboardButton = document.getElementById("closeLeaderboardButton");
const refreshLeaderboardButton = document.getElementById("refreshLeaderboardButton");
const submitScoreButton = document.getElementById("submitScoreButton");
const nicknameInput = document.getElementById("nicknameInput");
const submitStatus = document.getElementById("submitStatus");
const leaderboardStatus = document.getElementById("leaderboardStatus");
const leaderboardBody = document.getElementById("leaderboardBody");
const myBestLeaderboardValue = document.getElementById("myBestLeaderboardValue");
const startHint = document.getElementById("startHint");
const jumpButton = document.getElementById("jumpButton");
const attackButton = document.getElementById("attackButton");

const WORLD = {
  width: 1280,
  height: 720,
  groundY: 560
};

const STORAGE_KEY = "kexin-runner-best-score";
const PLAYER_NICKNAME_KEY = "kexin-runner-nickname";
const SUBMITTED_BEST_KEY = "kexin-runner-submitted-best";
const API_ENDPOINTS = {
  submitScore: "/.netlify/functions/submit-score",
  leaderboard: "/.netlify/functions/get-leaderboard"
};
const NICKNAME_PATTERN = /^[A-Za-z0-9_\u4e00-\u9fa5]{1,16}$/;
const JUMP_CONFIG = {
  initialVelocity: -720,
  holdAcceleration: 1700,
  maxHoldTime: 0.22,
  gravity: 2100,
  fallGravityMultiplier: 1.22,
  lowJumpGravityMultiplier: 1.72,
  releaseCutoffVelocity: -360,
  sustainVelocityLimit: -90
};
const SCORE_CONFIG = {
  survivalBase: 5,
  survivalSpeedFactor: 0.025,
  dodgeObstacle: 10,
  dodgeEnemy: 14,
  destroyDart: 12,
  defeatEnemy: 18
};
const CAMERA_CONFIG = {
  baseZoom: 1,
  runningZoom: 1.012,
  speedZoomRange: 0.016,
  smoothing: 6,
  shakeDamping: 12,
  tiltSmoothing: 5
};

function loadBestScore() {
  try {
    return Number(localStorage.getItem(STORAGE_KEY) || 0);
  } catch (error) {
    return 0;
  }
}

function saveBestScore(value) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch (error) {
    // 某些浏览器隐私模式会禁用存储，这里静默降级即可。
  }
}

function loadSavedNickname() {
  try {
    return localStorage.getItem(PLAYER_NICKNAME_KEY) || "";
  } catch (error) {
    return "";
  }
}

function saveNickname(value) {
  try {
    localStorage.setItem(PLAYER_NICKNAME_KEY, value);
  } catch (error) {
    // 本地存储失败时静默降级。
  }
}

function loadSubmittedBestScore() {
  try {
    return Number(localStorage.getItem(SUBMITTED_BEST_KEY) || 0);
  } catch (error) {
    return 0;
  }
}

function saveSubmittedBestScore(value) {
  try {
    localStorage.setItem(SUBMITTED_BEST_KEY, String(value));
  } catch (error) {
    // 本地存储失败时静默降级。
  }
}

const state = {
  running: false,
  ended: false,
  score: 0,
  best: loadBestScore(),
  speed: 420,
  elapsed: 0,
  spawnTimer: 0,
  time: 0,
  hitFlash: 0,
  jumpHoldTime: 0,
  jumpBoosting: false,
  latestRunScore: 0,
  pendingSubmitScore: 0,
  leaderboardEntries: [],
  leaderboardLoading: false,
  leaderboardSubmitting: false,
  leaderboardFetched: false,
  mySubmittedBest: loadSubmittedBestScore(),
  camera: {
    zoom: 1,
    targetZoom: 1,
    offsetX: 0,
    offsetY: 0,
    impact: 0,
    shakeTime: 0,
    shakeStrength: 0,
    tilt: 0,
    targetTilt: 0
  },
  particles: [],
  entities: [],
  player: null
};

const keysDown = new Set();
const jumpInputSources = new Set();

const palette = {
  skyTop: "#708fd2",
  skyBottom: "#18243f",
  mountainNear: "#243253",
  mountainFar: "#5f76aa",
  grass: "#2b6a56",
  path: "#53372b",
  pathLight: "#8c5a47",
  cloud: "rgba(255,245,252,0.76)",
  moon: "#ffd9c0",
  moonGlow: "rgba(255,201,195,0.26)"
};

let rafId = 0;
let previousTime = performance.now();

function isReadyToStart() {
  return !state.running && !state.ended;
}

function approach(current, target, speed) {
  return current + (target - current) * Math.min(1, speed);
}

function triggerCameraKick({ zoom = 0.01, shake = 2.2, duration = 0.12, tilt = 0, drop = 0 } = {}) {
  state.camera.targetZoom = Math.max(state.camera.targetZoom, CAMERA_CONFIG.baseZoom + zoom);
  state.camera.shakeTime = Math.max(state.camera.shakeTime, duration);
  state.camera.shakeStrength = Math.max(state.camera.shakeStrength, shake);
  state.camera.impact = Math.max(state.camera.impact, drop);
  state.camera.targetTilt += tilt;
}

function updateCamera(dt) {
  const runRatio = Math.min(1, Math.max(0, (state.speed - 420) / 300));
  const targetZoom = state.running
    ? CAMERA_CONFIG.runningZoom + runRatio * CAMERA_CONFIG.speedZoomRange
    : CAMERA_CONFIG.baseZoom;

  state.camera.targetZoom = Math.max(targetZoom, state.camera.targetZoom - dt * 0.08);
  state.camera.zoom = approach(state.camera.zoom, state.camera.targetZoom, dt * CAMERA_CONFIG.smoothing);
  state.camera.targetTilt *= Math.max(0, 1 - dt * 8);
  state.camera.tilt = approach(state.camera.tilt, state.camera.targetTilt, dt * CAMERA_CONFIG.tiltSmoothing);
  state.camera.impact *= Math.max(0, 1 - dt * 10);

  if (state.camera.shakeTime > 0) {
    state.camera.shakeTime = Math.max(0, state.camera.shakeTime - dt);
    const intensity = state.camera.shakeStrength * (state.camera.shakeTime / Math.max(0.001, state.camera.shakeTime + dt));
    state.camera.offsetX = (Math.random() - 0.5) * intensity * 2.4;
    state.camera.offsetY = (Math.random() - 0.5) * intensity * 1.6 + state.camera.impact * 0.7;
    state.camera.shakeStrength = Math.max(0, state.camera.shakeStrength - dt * CAMERA_CONFIG.shakeDamping);
  } else {
    state.camera.offsetX = approach(state.camera.offsetX, 0, dt * 10);
    state.camera.offsetY = approach(state.camera.offsetY, state.camera.impact * 0.65, dt * 8);
    state.camera.shakeStrength = 0;
  }
}

function updateStartUi() {
  if (state.running) {
    quickStartButton.textContent = "正在奔跑";
    quickStartButton.classList.add("running");
    startHint.textContent = "游戏进行中，点“跳跃”或“攻击”继续操作";
  } else if (state.ended) {
    quickStartButton.textContent = "重新开始";
    quickStartButton.classList.remove("running");
    startHint.textContent = "任务失败后，点这里或点“跳跃”都能再来一局";
  } else {
    quickStartButton.textContent = "开始游戏";
    quickStartButton.classList.remove("running");
    startHint.textContent = "点开始游戏，或直接点“跳跃”立即开跑";
  }
}

function sanitizeNickname(value) {
  return String(value || "").trim();
}

function validateNickname(value) {
  const nickname = sanitizeNickname(value);

  if (!nickname) {
    return {
      valid: false,
      nickname: "",
      error: "请输入昵称后再提交。"
    };
  }

  if (nickname.length < 1 || nickname.length > 16) {
    return {
      valid: false,
      nickname,
      error: "昵称长度需为 1 到 16 个字符。"
    };
  }

  if (/\s/.test(nickname)) {
    return {
      valid: false,
      nickname,
      error: "昵称不能包含空格。"
    };
  }

  if (!NICKNAME_PATTERN.test(nickname)) {
    return {
      valid: false,
      nickname,
      error: "昵称格式不正确，仅支持中文、字母、数字和下划线。"
    };
  }

  return {
    valid: true,
    nickname,
    error: ""
  };
}

function formatLeaderboardTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  const formatter = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

  return formatter.format(date).replace(/\//g, "-");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setSubmitStatus(message, isError = false) {
  submitStatus.textContent = message;
  submitStatus.style.color = isError ? "#ffbac3" : "#dce7ff";
}

function setLeaderboardStatus(message, isError = false) {
  leaderboardStatus.textContent = message;
  leaderboardStatus.style.color = isError ? "#ffbac3" : "#dce7ff";
}

function formatClientFacingError(error, fallbackMessage) {
  const message = String(error?.message || "");

  if (!message || message === "Failed to fetch") {
    return fallbackMessage;
  }

  if (message.includes("Unexpected token") || message.includes("JSON")) {
    return "排行榜服务返回异常，请检查函数部署。";
  }

  return message;
}

function updateMyBestDisplay() {
  myBestLeaderboardValue.textContent = Math.max(state.mySubmittedBest, 0);
}

function updateSubmitAvailability(showValidationMessage = false) {
  const result = validateNickname(nicknameInput.value);
  submitScoreButton.disabled = state.pendingSubmitScore <= 0 || !result.valid || state.leaderboardSubmitting;

  if (state.pendingSubmitScore <= 0) {
    setSubmitStatus("本局分数无效，暂不支持上传。");
    return result;
  }

  if (!result.valid) {
    if (showValidationMessage || nicknameInput.value.trim()) {
      setSubmitStatus(result.error, true);
    } else {
      setSubmitStatus(`输入昵称后即可提交本局 ${state.pendingSubmitScore} 分。`);
    }
    return result;
  }

  setSubmitStatus(`输入昵称后即可提交本局 ${state.pendingSubmitScore} 分。`);
  return result;
}

function resetSubmitForm(score) {
  state.pendingSubmitScore = Math.max(0, Math.floor(score || 0));
  nicknameInput.value = loadSavedNickname();
  updateSubmitAvailability(false);
}

function renderLeaderboardEntries(entries) {
  if (!entries.length) {
    leaderboardBody.innerHTML = '<tr><td colspan="4" class="empty-row">暂无排行数据</td></tr>';
    return;
  }

  leaderboardBody.innerHTML = entries
    .map((entry, index) => {
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(entry.nickname)}</td>
          <td>${entry.score}</td>
          <td>${formatLeaderboardTime(entry.created_at)}</td>
        </tr>
      `;
    })
    .join("");
}

async function fetchLeaderboard(force = false) {
  if (state.leaderboardLoading) {
    return;
  }

  if (state.leaderboardFetched && !force) {
    renderLeaderboardEntries(state.leaderboardEntries);
    setLeaderboardStatus("已显示最近获取到的公共榜单。");
    return;
  }

  state.leaderboardLoading = true;
  refreshLeaderboardButton.disabled = true;
  setLeaderboardStatus("正在加载排行榜...");

  try {
    const response = await fetch(API_ENDPOINTS.leaderboard, {
      headers: {
        Accept: "application/json"
      }
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "排行榜加载失败");
    }

    state.leaderboardEntries = Array.isArray(payload.entries) ? payload.entries : [];
    state.leaderboardFetched = true;
    renderLeaderboardEntries(state.leaderboardEntries);
    setLeaderboardStatus(`已加载前 ${state.leaderboardEntries.length} 名。`);
  } catch (error) {
    renderLeaderboardEntries(state.leaderboardEntries);
    const message = formatClientFacingError(error, "排行榜服务暂时不可用，请稍后再试。");
    setLeaderboardStatus(message, true);
  } finally {
    state.leaderboardLoading = false;
    refreshLeaderboardButton.disabled = false;
  }
}

function openLeaderboardPanel() {
  leaderboardOverlay.classList.add("visible");
  leaderboardOverlay.setAttribute("aria-hidden", "false");
  updateMyBestDisplay();
  fetchLeaderboard();
}

function closeLeaderboardPanel() {
  leaderboardOverlay.classList.remove("visible");
  leaderboardOverlay.setAttribute("aria-hidden", "true");
}

async function submitScore() {
  if (state.leaderboardSubmitting) {
    return;
  }

  const validation = validateNickname(nicknameInput.value);
  nicknameInput.value = validation.nickname;

  if (!validation.valid) {
    setSubmitStatus(validation.error, true);
    nicknameInput.focus();
    return;
  }

  if (state.pendingSubmitScore <= 0) {
    setSubmitStatus("当前没有可提交的有效分数。", true);
    return;
  }

  state.leaderboardSubmitting = true;
  submitScoreButton.disabled = true;
  setSubmitStatus("正在提交分数...");

  try {
    const response = await fetch(API_ENDPOINTS.submitScore, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        nickname: validation.nickname,
        score: state.pendingSubmitScore
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "分数提交失败");
    }

    saveNickname(validation.nickname);
    state.mySubmittedBest = Math.max(state.mySubmittedBest, payload.entry.score);
    saveSubmittedBestScore(state.mySubmittedBest);
    updateMyBestDisplay();
    state.pendingSubmitScore = 0;
    state.leaderboardFetched = false;
    setSubmitStatus("提交成功，已写入公共排行榜。");
    await fetchLeaderboard(true);
  } catch (error) {
    const message = formatClientFacingError(error, "排行榜服务暂时不可用，请稍后再试。");
    setSubmitStatus(message, true);
  } finally {
    state.leaderboardSubmitting = false;
    updateSubmitAvailability(false);
  }
}

function createPlayer() {
  return {
    x: 220,
    y: WORLD.groundY - 128,
    width: 92,
    height: 128,
    vy: 0,
    wasOnGround: true,
    attackTimer: 0,
    runCycle: 0,
    blinkTimer: 1.4
  };
}

function clearJumpInputState() {
  jumpInputSources.clear();
  state.jumpHoldTime = 0;
  state.jumpBoosting = false;
}

function resetGame(options = {}) {
  const { preserveJumpInputs = false } = options;
  state.running = false;
  state.ended = false;
  state.score = 0;
  state.latestRunScore = 0;
  state.pendingSubmitScore = 0;
  state.speed = 420;
  state.elapsed = 0;
  state.spawnTimer = 0.8;
  state.time = 0;
  state.hitFlash = 0;
  state.camera.zoom = 1;
  state.camera.targetZoom = 1;
  state.camera.offsetX = 0;
  state.camera.offsetY = 0;
  state.camera.impact = 0;
  state.camera.shakeTime = 0;
  state.camera.shakeStrength = 0;
  state.camera.tilt = 0;
  state.camera.targetTilt = 0;
  if (preserveJumpInputs) {
    state.jumpHoldTime = 0;
    state.jumpBoosting = false;
  } else {
    clearJumpInputState();
  }
  state.entities = [];
  state.particles = [];
  state.player = createPlayer();
  updateScore();
  bestValue.textContent = state.best;
  resetSubmitForm(0);
  updateStartUi();
  render();
}

function startGame(options = {}) {
  const { preserveJumpInputs = false } = options;
  const shouldReset = !state.running;
  if (shouldReset) {
    resetGame({ preserveJumpInputs });
  }
  state.running = true;
  state.ended = false;
  startOverlay.classList.remove("visible");
  gameOverOverlay.classList.remove("visible");
  gameOverOverlay.setAttribute("aria-hidden", "true");
  closeLeaderboardPanel();
  previousTime = performance.now();
  updateStartUi();
  render();
}

function endGame() {
  state.running = false;
  state.ended = true;
  state.hitFlash = 0.8;
  clearJumpInputState();
  triggerCameraKick({ zoom: 0.03, shake: 6, duration: 0.24, drop: 5, tilt: 0.035 });
  const roundedScore = Math.floor(state.score);
  state.latestRunScore = roundedScore;

  if (roundedScore > state.best) {
    state.best = roundedScore;
    saveBestScore(state.best);
  }

  finalScore.textContent = roundedScore;
  finalBest.textContent = state.best;
  bestValue.textContent = state.best;
  resetSubmitForm(roundedScore);
  gameOverOverlay.classList.add("visible");
  gameOverOverlay.setAttribute("aria-hidden", "false");
  updateStartUi();
}

function updateScore() {
  scoreValue.textContent = Math.floor(state.score);
  bestValue.textContent = state.best;
}

function startJump() {
  if (!state.running) {
    if (isReadyToStart() || state.ended) {
      startGame({ preserveJumpInputs: true });
    } else {
      return;
    }
  }

  const player = state.player;
  const onGround = player.y >= WORLD.groundY - player.height - 1;

  if (onGround) {
    player.vy = JUMP_CONFIG.initialVelocity;
    player.y = WORLD.groundY - player.height - 1;
    player.wasOnGround = false;
    state.jumpHoldTime = 0;
    state.jumpBoosting = true;
    triggerCameraKick({ zoom: 0.012, shake: 1.8, duration: 0.08, drop: 2, tilt: -0.012 });
    spawnDust(player.x + 16, WORLD.groundY - 8, "#fff0b3", 7, 90);
  }
}

function releaseJump() {
  state.jumpBoosting = false;

  if (!state.player) {
    return;
  }

  if (state.player.vy < JUMP_CONFIG.releaseCutoffVelocity) {
    state.player.vy = JUMP_CONFIG.releaseCutoffVelocity;
  }
}

function pressJumpInput(source) {
  if (jumpInputSources.has(source)) {
    return;
  }

  jumpInputSources.add(source);

  if (jumpInputSources.size === 1) {
    startJump();
  }
}

function releaseJumpInput(source) {
  if (!jumpInputSources.has(source)) {
    return;
  }

  jumpInputSources.delete(source);

  if (jumpInputSources.size === 0) {
    releaseJump();
  }
}

function attack() {
  if (!state.running) {
    if (isReadyToStart() || state.ended) {
      startGame();
    } else {
      return;
    }
  }

  if (state.player.attackTimer <= 0.08) {
    state.player.attackTimer = 0.28;
    triggerCameraKick({ zoom: 0.014, shake: 2.3, duration: 0.1, tilt: 0.015 });
    spawnDust(state.player.x + state.player.width + 20, state.player.y + 52, "#ffcf8d", 5, 70);
  }
}

function addPressListener(element, handler) {
  let lastTriggerTime = 0;

  const trigger = (event) => {
    const now = Date.now();
    if (now - lastTriggerTime < 320) {
      if (event) {
        event.preventDefault();
      }
      return;
    }

    lastTriggerTime = now;

    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    handler();
  };

  if (window.PointerEvent) {
    element.addEventListener("pointerdown", trigger, { passive: false });
  }

  element.addEventListener("touchstart", trigger, { passive: false });
  element.addEventListener("click", trigger);
}

function addHoldListener(element, source, onPress, onRelease) {
  const handlePress = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    onPress(source);
  };

  const handleRelease = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    onRelease(source);
  };

  if (window.PointerEvent) {
    element.addEventListener("pointerdown", handlePress, { passive: false });
    element.addEventListener("pointerup", handleRelease, { passive: false });
    element.addEventListener("pointercancel", handleRelease, { passive: false });
    element.addEventListener("pointerleave", handleRelease, { passive: false });
  } else {
    element.addEventListener("mousedown", handlePress);
    element.addEventListener("mouseup", handleRelease);
    element.addEventListener("mouseleave", handleRelease);
  }

  element.addEventListener("touchstart", handlePress, { passive: false });
  element.addEventListener("touchend", handleRelease, { passive: false });
  element.addEventListener("touchcancel", handleRelease, { passive: false });
  element.addEventListener("contextmenu", (event) => event.preventDefault());
}

function spawnDust(x, y, color, amount, spread) {
  for (let i = 0; i < amount; i += 1) {
    state.particles.push({
      x,
      y,
      vx: (Math.random() - 0.2) * spread,
      vy: (Math.random() - 0.5) * spread,
      size: 4 + Math.random() * 7,
      life: 0.35 + Math.random() * 0.35,
      maxLife: 0.7,
      color
    });
  }
}

function spawnSlash(x, y) {
  for (let i = 0; i < 6; i += 1) {
    state.particles.push({
      x: x + Math.random() * 38,
      y: y + Math.random() * 40 - 20,
      vx: 80 + Math.random() * 160,
      vy: (Math.random() - 0.5) * 100,
      size: 5 + Math.random() * 9,
      life: 0.12 + Math.random() * 0.1,
      maxLife: 0.22,
      color: i % 2 === 0 ? "#fff4c2" : "#ff9255"
    });
  }
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function pickEntityKind() {
  const speedTier = Math.min(1, (state.speed - 420) / 280);
  const roll = Math.random();

  if (roll < 0.16 + speedTier * 0.06) {
    return "dart";
  }

  if (roll < 0.36) {
    return "puddle";
  }

  if (roll < 0.53) {
    return "stone";
  }

  if (roll < 0.7) {
    return "barrel";
  }

  return Math.random() < 0.55 + speedTier * 0.15 ? "patrol" : "chaser";
}

function spawnEntity(kind) {
  const baseX = WORLD.width + 100;
  const common = {
    x: baseX,
    counted: false,
    rotation: 0,
    wobble: Math.random() * Math.PI * 2
  };

  if (kind === "stone") {
    state.entities.push({
      ...common,
      kind,
      type: "obstacle",
      width: 72,
      height: 48,
      y: WORLD.groundY - 48
    });
  } else if (kind === "barrel") {
    state.entities.push({
      ...common,
      kind,
      type: "obstacle",
      width: 74,
      height: 88,
      y: WORLD.groundY - 88
    });
  } else if (kind === "puddle") {
    state.entities.push({
      ...common,
      kind,
      type: "obstacle",
      width: 132,
      height: 20,
      y: WORLD.groundY - 14
    });
  } else if (kind === "dart") {
    state.entities.push({
      ...common,
      kind,
      type: "obstacle",
      width: 110,
      height: 20,
      y: WORLD.groundY - randomBetween(190, 250),
      vxOffset: randomBetween(90, 150)
    });
  } else if (kind === "patrol") {
    state.entities.push({
      ...common,
      kind,
      type: "enemy",
      width: 82,
      height: 118,
      y: WORLD.groundY - 118,
      animation: Math.random() * Math.PI * 2
    });
  } else if (kind === "chaser") {
    state.entities.push({
      ...common,
      kind,
      type: "enemy",
      width: 90,
      height: 128,
      y: WORLD.groundY - 128,
      animation: Math.random() * Math.PI * 2,
      extraSpeed: 55
    });
  }
}

function rectanglesOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function playerBodyRect() {
  const player = state.player;
  return {
    x: player.x + 18,
    y: player.y + 10,
    width: player.width - 30,
    height: player.height - 14
  };
}

function playerAttackRect() {
  const player = state.player;
  return {
    x: player.x + player.width - 4,
    y: player.y + 14,
    width: 126,
    height: 82
  };
}

function updateEntities(dt) {
  const attackRect = state.player.attackTimer > 0 ? playerAttackRect() : null;
  const bodyRect = playerBodyRect();

  for (let i = state.entities.length - 1; i >= 0; i -= 1) {
    const entity = state.entities[i];
    const velocity = state.speed + (entity.extraSpeed || 0) + (entity.kind === "dart" ? entity.vxOffset : 0);
    entity.x -= velocity * dt;
    entity.wobble += dt * 5.4;
    entity.rotation += dt * (entity.kind === "barrel" ? 2.1 : entity.kind === "dart" ? 9 : 0);

    if (!entity.counted && entity.x + entity.width < state.player.x) {
      entity.counted = true;
      state.score += entity.type === "enemy" ? SCORE_CONFIG.dodgeEnemy : SCORE_CONFIG.dodgeObstacle;
    }

    const rect = {
      x: entity.x + 6,
      y: entity.y + (entity.kind === "puddle" ? 2 : 6),
      width: entity.width - 12,
      height: entity.height - (entity.kind === "puddle" ? 4 : 10)
    };

    if (attackRect && rectanglesOverlap(attackRect, rect)) {
      if (entity.type === "enemy" || entity.kind === "dart") {
        spawnSlash(entity.x + entity.width * 0.5, entity.y + entity.height * 0.4);
        state.score += entity.type === "enemy" ? SCORE_CONFIG.defeatEnemy : SCORE_CONFIG.destroyDart;
        state.entities.splice(i, 1);
        continue;
      }
    }

    if (rectanglesOverlap(bodyRect, rect)) {
      spawnDust(entity.x + entity.width * 0.5, entity.y + entity.height * 0.4, "#ffd0c2", 12, 180);
      endGame();
      break;
    }

    if (entity.x + entity.width < -160) {
      state.entities.splice(i, 1);
    }
  }
}

function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const particle = state.particles[i];
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 180 * dt;

    if (particle.life <= 0) {
      state.particles.splice(i, 1);
    }
  }
}

function update(dt) {
  if (!state.running) {
    updateParticles(dt);
    if (state.hitFlash > 0) {
      state.hitFlash = Math.max(0, state.hitFlash - dt);
    }
    updateCamera(dt);
    return;
  }

  state.time += dt;
  state.elapsed += dt;
  state.speed = 420 + Math.min(300, state.elapsed * 28);
  state.score += dt * (SCORE_CONFIG.survivalBase + state.speed * SCORE_CONFIG.survivalSpeedFactor);

  const player = state.player;
  const wasOnGround = player.y >= WORLD.groundY - player.height - 1;
  const holdingJump =
    state.jumpBoosting &&
    jumpInputSources.size > 0 &&
    state.jumpHoldTime < JUMP_CONFIG.maxHoldTime &&
    player.vy < JUMP_CONFIG.sustainVelocityLimit;

  let gravityMultiplier = 1;
  if (player.vy > 0) {
    gravityMultiplier = JUMP_CONFIG.fallGravityMultiplier;
  } else if (!holdingJump) {
    gravityMultiplier = JUMP_CONFIG.lowJumpGravityMultiplier;
  }

  player.vy += JUMP_CONFIG.gravity * gravityMultiplier * dt;

  if (holdingJump) {
    player.vy -= JUMP_CONFIG.holdAcceleration * dt;
    state.jumpHoldTime += dt;
  } else if (state.jumpBoosting && jumpInputSources.size === 0) {
    state.jumpBoosting = false;
  } else if (state.jumpHoldTime >= JUMP_CONFIG.maxHoldTime) {
    state.jumpBoosting = false;
  }

  player.y += player.vy * dt;
  player.attackTimer = Math.max(0, player.attackTimer - dt);
  player.runCycle += dt * (state.speed / 160);
  player.blinkTimer -= dt;

  if (player.y >= WORLD.groundY - player.height) {
    player.y = WORLD.groundY - player.height;
    player.vy = 0;
    state.jumpHoldTime = 0;
    state.jumpBoosting = false;
  }

  const onGround = player.y >= WORLD.groundY - player.height - 1;
  if (!wasOnGround && onGround) {
    triggerCameraKick({ zoom: 0.016, shake: 2.4, duration: 0.12, drop: 4, tilt: 0.01 });
    spawnDust(player.x + player.width * 0.4, WORLD.groundY - 8, "#b6e0ff", 5, 72);
  }
  player.wasOnGround = onGround;

  if (player.blinkTimer <= 0) {
    player.blinkTimer = randomBetween(1.5, 3.4);
  }

  state.spawnTimer -= dt;

  if (state.spawnTimer <= 0) {
    const kind = pickEntityKind();
    spawnEntity(kind);
    state.spawnTimer = randomBetween(0.8, 1.45) - Math.min(0.32, (state.speed - 420) / 900);
  }

  updateEntities(dt);
  updateParticles(dt);
  updateCamera(dt);
  updateScore();
}

function getRoadMetrics() {
  return {
    centerX: WORLD.width * 0.53,
    horizonY: 344,
    topY: 440,
    bottomY: WORLD.height + 36,
    topWidth: 280,
    bottomWidth: WORLD.width * 1.22
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function drawRoadPerspective(metrics) {
  const leftTop = metrics.centerX - metrics.topWidth * 0.5;
  const rightTop = metrics.centerX + metrics.topWidth * 0.5;
  const leftBottom = metrics.centerX - metrics.bottomWidth * 0.5;
  const rightBottom = metrics.centerX + metrics.bottomWidth * 0.5;

  ctx.save();
  const roadGradient = ctx.createLinearGradient(0, metrics.topY, 0, metrics.bottomY);
  roadGradient.addColorStop(0, "#3a2a2d");
  roadGradient.addColorStop(0.45, "#523436");
  roadGradient.addColorStop(1, "#24191d");
  ctx.fillStyle = roadGradient;
  ctx.beginPath();
  ctx.moveTo(leftTop, metrics.topY);
  ctx.lineTo(rightTop, metrics.topY);
  ctx.lineTo(rightBottom, metrics.bottomY);
  ctx.lineTo(leftBottom, metrics.bottomY);
  ctx.closePath();
  ctx.fill();

  const shoulderGradient = ctx.createLinearGradient(0, metrics.topY, 0, metrics.bottomY);
  shoulderGradient.addColorStop(0, "rgba(255, 178, 136, 0.14)");
  shoulderGradient.addColorStop(1, "rgba(255, 130, 116, 0.28)");
  ctx.fillStyle = shoulderGradient;
  ctx.beginPath();
  ctx.moveTo(leftTop - 26, metrics.topY);
  ctx.lineTo(leftTop, metrics.topY);
  ctx.lineTo(leftBottom, metrics.bottomY);
  ctx.lineTo(leftBottom - 78, metrics.bottomY);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(rightTop, metrics.topY);
  ctx.lineTo(rightTop + 26, metrics.topY);
  ctx.lineTo(rightBottom + 78, metrics.bottomY);
  ctx.lineTo(rightBottom, metrics.bottomY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 214, 183, 0.18)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i += 1) {
    const t = i / 7;
    const topX = lerp(leftTop, rightTop, t);
    const bottomX = lerp(leftBottom, rightBottom, t);
    ctx.beginPath();
    ctx.moveTo(topX, metrics.topY);
    ctx.lineTo(bottomX, metrics.bottomY);
    ctx.stroke();
  }

  const stripeScroll = (state.time * state.speed * 0.12) % 1;
  for (let i = 0; i < 10; i += 1) {
    const t = (i / 10 + stripeScroll) % 1;
    const eased = t * t;
    const y = lerp(metrics.topY, metrics.bottomY, eased);
    const width = lerp(metrics.topWidth, metrics.bottomWidth, eased);
    ctx.strokeStyle = `rgba(255,255,255,${0.07 + eased * 0.1})`;
    ctx.lineWidth = 1 + eased * 2.5;
    ctx.beginPath();
    ctx.moveTo(metrics.centerX - width * 0.5, y);
    ctx.lineTo(metrics.centerX + width * 0.5, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 222, 176, 0.55)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(metrics.centerX, metrics.bottomY);
  ctx.lineTo(metrics.centerX, metrics.topY + 18);
  ctx.stroke();

  ctx.restore();
}

function drawForegroundSweep(metrics) {
  ctx.save();
  const offset = (state.time * state.speed * 0.7) % 210;
  for (let i = -1; i < 8; i += 1) {
    const baseX = i * 180 - offset;
    const alpha = 0.08 + ((i + 1) % 3) * 0.03;
    ctx.fillStyle = `rgba(109, 203, 163, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(baseX, WORLD.height);
    ctx.quadraticCurveTo(baseX + 36, metrics.bottomY - 60, baseX + 60, metrics.bottomY + 20);
    ctx.lineTo(baseX + 10, WORLD.height + 12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawMidHills(speedFactor, baseY, colorA, colorB) {
  const offset = (state.time * state.speed * speedFactor) % 540;
  for (let i = -1; i < 5; i += 1) {
    const x = i * 420 - offset;
    const hillGradient = ctx.createLinearGradient(x, baseY - 80, x, baseY + 120);
    hillGradient.addColorStop(0, colorA);
    hillGradient.addColorStop(1, colorB);
    ctx.fillStyle = hillGradient;
    ctx.beginPath();
    ctx.moveTo(x, baseY + 120);
    ctx.quadraticCurveTo(x + 90, baseY - 70, x + 180, baseY + 16);
    ctx.quadraticCurveTo(x + 260, baseY - 120, x + 400, baseY + 120);
    ctx.closePath();
    ctx.fill();
  }
}

function drawBackground() {
  const metrics = getRoadMetrics();
  const gradient = ctx.createLinearGradient(0, 0, 0, WORLD.height);
  gradient.addColorStop(0, palette.skyTop);
  gradient.addColorStop(0.52, "#334c79");
  gradient.addColorStop(1, palette.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  ctx.fillStyle = "rgba(255, 214, 205, 0.08)";
  ctx.fillRect(0, metrics.horizonY - 24, WORLD.width, 120);

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.shadowColor = palette.moonGlow;
  ctx.shadowBlur = 36;
  ctx.fillStyle = palette.moon;
  ctx.beginPath();
  ctx.arc(1050, 122, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawCloud(210 + Math.sin(state.time * 0.14) * 26, 112, 1.15);
  drawCloud(520 + Math.cos(state.time * 0.12) * 22, 92, 0.9);
  drawCloud(930 + Math.sin(state.time * 0.18) * 18, 170, 0.76);

  drawMountains(0.12, 364, "#7186ba");
  drawMidHills(0.18, 404, "rgba(74, 97, 145, 0.94)", "rgba(35, 51, 83, 0.96)");
  drawMountains(0.24, 448, palette.mountainNear);
  drawBambooForest();
  drawRoadPerspective(metrics);
  drawForegroundSweep(metrics);
}

function drawCloud(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = palette.cloud;
  ctx.beginPath();
  ctx.arc(-34, 4, 22, 0, Math.PI * 2);
  ctx.arc(0, -8, 26, 0, Math.PI * 2);
  ctx.arc(32, 4, 20, 0, Math.PI * 2);
  ctx.arc(8, 12, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMountains(speedFactor, baseY, color) {
  const offset = (state.time * state.speed * speedFactor) % 420;
  ctx.fillStyle = color;
  for (let i = -1; i < 6; i += 1) {
    const x = i * 300 - offset;
    ctx.beginPath();
    ctx.moveTo(x, baseY + 120);
    ctx.lineTo(x + 110, baseY - 110);
    ctx.lineTo(x + 220, baseY + 120);
    ctx.closePath();
    ctx.fill();
  }
}

function drawBambooForest() {
  const offset = (state.time * state.speed * 0.45) % 210;
  for (let i = -1; i < 9; i += 1) {
    const x = i * 160 - offset;
    const height = 170 + (i % 3) * 28;
    ctx.fillStyle = "#29553a";
    ctx.fillRect(x + 30, WORLD.groundY - height, 16, height);
    ctx.fillRect(x + 72, WORLD.groundY - height + 20, 14, height - 20);
    ctx.fillStyle = "#66a568";
    for (let j = 0; j < 4; j += 1) {
      ctx.fillRect(x + 30, WORLD.groundY - height + 24 + j * 34, 16, 4);
      ctx.fillRect(x + 72, WORLD.groundY - height + 40 + j * 32, 14, 4);
    }
    drawLeafCluster(x + 34, WORLD.groundY - height + 18);
    drawLeafCluster(x + 76, WORLD.groundY - height + 42);
  }
}

function drawLeafCluster(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#5bc16d";
  ctx.beginPath();
  ctx.ellipse(-26, -4, 26, 6, -0.5, 0, Math.PI * 2);
  ctx.ellipse(-20, 14, 24, 6, 0.4, 0, Math.PI * 2);
  ctx.ellipse(26, -2, 26, 6, 0.5, 0, Math.PI * 2);
  ctx.ellipse(20, 16, 22, 6, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function getLiftFromGround(y, height) {
  return Math.max(0, WORLD.groundY - (y + height));
}

function drawGroundShadow(x, y, width, height, strength = 1) {
  const lift = getLiftFromGround(y, height);
  const opacity = Math.max(0.08, (0.24 - lift * 0.00075) * strength);
  const shadowWidth = width * (0.55 - Math.min(0.18, lift * 0.00035));
  const shadowHeight = 9 + Math.max(0, 18 - lift * 0.04) * strength;
  ctx.save();
  ctx.fillStyle = `rgba(8, 10, 18, ${opacity})`;
  ctx.beginPath();
  ctx.ellipse(x + width * 0.5, WORLD.groundY + 16, shadowWidth, shadowHeight, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function getEntityRenderScale(entity) {
  const lift = getLiftFromGround(entity.y, entity.height);
  const liftScale = 1 - Math.min(0.18, lift / 780);
  const typeBoost = entity.kind === "chaser" ? 0.04 : entity.kind === "patrol" ? 0.02 : 0;
  return liftScale + typeBoost;
}

function drawPlayer() {
  const player = state.player;
  const attackStrength = player.attackTimer > 0 ? Math.sin((player.attackTimer / 0.28) * Math.PI) : 0;
  const onGround = player.y >= WORLD.groundY - player.height - 1;
  const isAttacking = player.attackTimer > 0.02;
  const isJumping = !onGround;
  const isIdle = !state.running && !state.ended;
  const runWave = Math.sin(player.runCycle * 4.4);
  const legSwing = isJumping ? 0 : runWave * 0.75;
  const armSwing = isJumping ? 0 : Math.sin(player.runCycle * 4.4 + 0.85) * 0.55;
  const isBlinking = player.blinkTimer < 0.1;
  const hoverBounce = isIdle ? Math.sin(state.time * 2.2) * 2.4 : 0;
  const runBounce = isJumping ? -10 : isAttacking ? 2 : Math.abs(runWave) * 6 + hoverBounce;
  const bodyLean = isAttacking ? 0.38 * attackStrength : isJumping ? -0.2 : legSwing * 0.08;
  const hairSwing = isJumping ? -0.26 : isAttacking ? -0.18 : -legSwing * 0.12;
  const scarfSwing = isJumping ? -0.45 : isAttacking ? -0.25 : -legSwing * 0.3;
  const frontArmAngle = isAttacking ? 1.05 * attackStrength + 0.2 : isJumping ? 0.22 : -armSwing * 0.8;
  const rearArmAngle = isAttacking ? -0.55 : isJumping ? -0.85 : armSwing * 0.7;
  const frontLegAngle = isJumping ? -0.48 : isAttacking ? 0.95 * attackStrength : legSwing * 0.78;
  const rearLegAngle = isJumping ? 0.92 : isAttacking ? -0.15 : -legSwing * 0.72;
  const lift = getLiftFromGround(player.y, player.height);
  const playerScale = 1 - Math.min(0.08, lift / 1300) + (isAttacking ? 0.02 : 0);

  ctx.save();
  ctx.translate(player.x + player.width * 0.5, player.y + player.height);
  ctx.scale(playerScale, playerScale);
  ctx.translate(-player.width * 0.5, -player.height);
  ctx.translate(0, runBounce);
  ctx.rotate(bodyLean);

  ctx.fillStyle = `rgba(0, 0, 0, ${0.24 - Math.min(0.14, lift / 1200)})`;
  ctx.beginPath();
  ctx.ellipse(player.width * 0.48, player.height + 18, 50 - Math.min(18, lift * 0.08), 11 - Math.min(5, lift * 0.024), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(30, 82);
  ctx.rotate(rearLegAngle);
  ctx.fillStyle = "#e6efff";
  roundRect(ctx, 0, 0, 14, 34, 7);
  ctx.fill();
  ctx.translate(7, 30);
  ctx.rotate(isJumping ? -0.9 : 0.28);
  ctx.fillStyle = "#edf5ff";
  roundRect(ctx, -6, 0, 12, 36, 6);
  ctx.fill();
  ctx.fillStyle = "#ff8cb2";
  roundRect(ctx, -11, 30, 24, 10, 5);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-6, 31, 12, 4);
  ctx.restore();

  ctx.save();
  ctx.translate(56, 82);
  ctx.rotate(frontLegAngle);
  ctx.fillStyle = "#d8e8ff";
  roundRect(ctx, 0, 0, 15, 36, 7);
  ctx.fill();
  ctx.translate(8, 31);
  ctx.rotate(isJumping ? 0.95 : -0.18);
  ctx.fillStyle = "#f4f8ff";
  roundRect(ctx, -6, 0, 12, 38, 6);
  ctx.fill();
  ctx.fillStyle = "#7a8fff";
  roundRect(ctx, -11, 32, 24, 10, 5);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-6, 33, 12, 4);
  ctx.restore();

  ctx.save();
  ctx.translate(42, 88);
  ctx.rotate(isAttacking ? -0.2 : isJumping ? -0.12 : 0);
  ctx.fillStyle = "#7d8cff";
  ctx.beginPath();
  ctx.moveTo(-22, 0);
  ctx.quadraticCurveTo(-2, 18 + Math.abs(legSwing) * 4, 18, 2);
  ctx.lineTo(10, 20);
  ctx.quadraticCurveTo(-4, 36, -26, 18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#f6f8ff";
  roundRect(ctx, 20, 32, 42, 58, 18);
  ctx.fill();
  ctx.fillStyle = "#8eb5ff";
  roundRect(ctx, 16, 34, 14, 52, 10);
  ctx.fill();
  roundRect(ctx, 54, 34, 14, 52, 10);
  ctx.fill();
  ctx.fillStyle = "#bfd0ff";
  roundRect(ctx, 30, 36, 22, 40, 10);
  ctx.fill();
  ctx.fillStyle = "#8d7fff";
  ctx.fillRect(29, 56, 24, 6);
  ctx.fillStyle = "#ff93c0";
  ctx.beginPath();
  ctx.moveTo(20, 42);
  ctx.quadraticCurveTo(40, 24, 62, 42);
  ctx.lineTo(58, 50);
  ctx.quadraticCurveTo(40, 36, 24, 50);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.translate(20, 44);
  ctx.rotate(rearArmAngle);
  ctx.fillStyle = "#dfe9ff";
  roundRect(ctx, 0, 0, 13, 34, 6);
  ctx.fill();
  ctx.translate(6, 30);
  ctx.rotate(isJumping ? -0.25 : 0.14);
  ctx.fillStyle = "#f7d9c5";
  roundRect(ctx, -5, 0, 11, 27, 5);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(60, 42);
  ctx.rotate(frontArmAngle);
  ctx.fillStyle = "#dce8ff";
  roundRect(ctx, 0, 0, 14, 34, 6);
  ctx.fill();
  ctx.translate(8, 30);
  ctx.rotate(isAttacking ? 0.28 : isJumping ? 0.22 : -0.08);
  ctx.fillStyle = "#f7d9c5";
  roundRect(ctx, -6, 0, 12, 26, 5);
  ctx.fill();

  ctx.fillStyle = "#dbe6f8";
  ctx.fillRect(8, 6, 42, 6);
  ctx.fillStyle = "#b9cdff";
  ctx.fillRect(44, 3, 16, 12);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(10, 7, 24, 2);
  ctx.restore();

  ctx.save();
  ctx.translate(44, 7);
  ctx.rotate(hairSwing);
  ctx.fillStyle = "#141928";
  ctx.beginPath();
  ctx.moveTo(-34, 14);
  ctx.quadraticCurveTo(-46, 42, -22, 58);
  ctx.quadraticCurveTo(4, 70, 30, 58);
  ctx.quadraticCurveTo(48, 42, 44, 10);
  ctx.quadraticCurveTo(18, -18, -12, -8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#22273b";
  ctx.beginPath();
  ctx.moveTo(-6, -10);
  ctx.quadraticCurveTo(10, -26, 24, -8);
  ctx.quadraticCurveTo(16, 0, -6, -10);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#f8d8c8";
  roundRect(ctx, 22, 2, 46, 48, 20);
  ctx.fill();

  ctx.save();
  ctx.translate(45, 54);
  ctx.rotate(scarfSwing);
  ctx.fillStyle = "#ff9ec2";
  ctx.beginPath();
  ctx.moveTo(-4, 0);
  ctx.quadraticCurveTo(-14, 22, -34, 28);
  ctx.quadraticCurveTo(-22, 8, -8, -4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#111725";
  ctx.beginPath();
  ctx.moveTo(20, 20);
  ctx.quadraticCurveTo(30, -8, 48, -4);
  ctx.quadraticCurveTo(66, -8, 76, 20);
  ctx.lineTo(72, 32);
  ctx.quadraticCurveTo(50, 16, 18, 32);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#171d2c";
  ctx.beginPath();
  ctx.moveTo(26, 22);
  ctx.quadraticCurveTo(36, 10, 42, 22);
  ctx.quadraticCurveTo(37, 35, 28, 36);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(46, 20);
  ctx.quadraticCurveTo(58, 6, 64, 20);
  ctx.quadraticCurveTo(58, 38, 48, 36);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#55648b";
  ctx.lineWidth = 3;
  roundRect(ctx, 28, 22, 12, 11, 5);
  ctx.stroke();
  roundRect(ctx, 50, 22, 12, 11, 5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(40, 27);
  ctx.lineTo(50, 27);
  ctx.stroke();

  ctx.fillStyle = "#433648";
  ctx.fillRect(43, 28, 4, 6);

  ctx.fillStyle = "#23304b";
  if (isBlinking) {
    ctx.fillRect(31, 27, 6, 2);
    ctx.fillRect(53, 27, 6, 2);
  } else {
    ctx.fillRect(31, 25, 6, 4);
    ctx.fillRect(53, 25, 6, 4);
  }

  ctx.fillStyle = "#ffb4c8";
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(29, 34, 4, 0, Math.PI * 2);
  ctx.arc(61, 34, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "#8a5964";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(39, 39);
  ctx.quadraticCurveTo(45, 43, 52, 39);
  ctx.stroke();

  ctx.fillStyle = "#8ce2ff";
  ctx.beginPath();
  ctx.moveTo(61, 7);
  ctx.quadraticCurveTo(72, -7, 78, 6);
  ctx.quadraticCurveTo(70, 14, 61, 7);
  ctx.fill();

  if (isAttacking) {
    ctx.strokeStyle = "rgba(255, 206, 230, 0.92)";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(74, 58, 46 + attackStrength * 12, -0.7, 0.72);
    ctx.stroke();

    ctx.strokeStyle = "rgba(144, 220, 255, 0.88)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(74, 58, 34 + attackStrength * 9, -0.78, 0.55);
    ctx.stroke();
  } else if (isJumping) {
    ctx.strokeStyle = "rgba(162, 222, 255, 0.55)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(12, 98);
    ctx.quadraticCurveTo(36, 86, 62, 94);
    ctx.stroke();
  }

  if (isIdle) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(74, 14);
    ctx.quadraticCurveTo(86, 2, 88, 18);
    ctx.stroke();
  }

  ctx.restore();
}

function drawEntities() {
  for (const entity of state.entities) {
    drawGroundShadow(entity.x, entity.y, entity.width, entity.height, entity.kind === "dart" ? 0.7 : 1);
    if (entity.kind === "stone") {
      drawStone(entity);
    } else if (entity.kind === "barrel") {
      drawBarrel(entity);
    } else if (entity.kind === "puddle") {
      drawPuddle(entity);
    } else if (entity.kind === "dart") {
      drawDart(entity);
    } else if (entity.kind === "patrol") {
      drawPatrol(entity);
    } else if (entity.kind === "chaser") {
      drawChaser(entity);
    }
  }
}

function drawStone(entity) {
  ctx.save();
  const scale = getEntityRenderScale(entity);
  ctx.translate(entity.x + entity.width * 0.5, entity.y + entity.height);
  ctx.scale(scale, scale);
  ctx.translate(-entity.width * 0.5, -entity.height);
  const stoneGradient = ctx.createLinearGradient(0, 0, entity.width, entity.height);
  stoneGradient.addColorStop(0, "#9ba4b7");
  stoneGradient.addColorStop(1, "#5c6476");
  ctx.fillStyle = stoneGradient;
  ctx.beginPath();
  ctx.moveTo(8, 46);
  ctx.lineTo(20, 16);
  ctx.lineTo(42, 4);
  ctx.lineTo(66, 14);
  ctx.lineTo(70, 40);
  ctx.lineTo(54, 48);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.moveTo(20, 16);
  ctx.lineTo(42, 4);
  ctx.lineTo(52, 14);
  ctx.lineTo(28, 24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(20,26,40,0.18)";
  ctx.beginPath();
  ctx.moveTo(52, 14);
  ctx.lineTo(66, 14);
  ctx.lineTo(70, 40);
  ctx.lineTo(54, 48);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBarrel(entity) {
  ctx.save();
  const scale = getEntityRenderScale(entity);
  ctx.translate(entity.x + entity.width * 0.5, entity.y + entity.height);
  ctx.scale(scale, scale);
  ctx.translate(0, -entity.height * 0.5);
  ctx.rotate(entity.rotation);
  ctx.translate(-entity.width * 0.5, -entity.height * 0.5);
  const barrelGradient = ctx.createLinearGradient(0, 0, entity.width, 0);
  barrelGradient.addColorStop(0, "#704126");
  barrelGradient.addColorStop(0.48, "#bc7a43");
  barrelGradient.addColorStop(1, "#6c3f22");
  ctx.fillStyle = barrelGradient;
  roundRect(ctx, 6, 6, entity.width - 12, entity.height - 12, 20);
  ctx.fill();
  ctx.fillStyle = "#c78d58";
  ctx.beginPath();
  ctx.ellipse(entity.width * 0.5, 12, entity.width * 0.32, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5d3119";
  ctx.fillRect(12, 14, entity.width - 24, 8);
  ctx.fillRect(12, entity.height - 24, entity.width - 24, 8);
  ctx.fillRect(18, 6, 6, entity.height - 12);
  ctx.fillRect(entity.width - 24, 6, 6, entity.height - 12);
  ctx.fillStyle = "rgba(255,255,255,0.13)";
  ctx.fillRect(26, 16, 8, entity.height - 30);
  ctx.restore();
}

function drawPuddle(entity) {
  ctx.save();
  ctx.translate(entity.x, entity.y);
  ctx.fillStyle = "rgba(78, 180, 255, 0.68)";
  ctx.beginPath();
  ctx.ellipse(entity.width * 0.52, 10, entity.width * 0.44, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(214, 247, 255, 0.3)";
  ctx.beginPath();
  ctx.ellipse(entity.width * 0.4, 7, entity.width * 0.16, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(174, 236, 255, 0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(44, 10, 10 + Math.sin(state.time * 4 + entity.wobble) * 3, 0, Math.PI);
  ctx.arc(86, 10, 8 + Math.cos(state.time * 4 + entity.wobble) * 2, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawDart(entity) {
  ctx.save();
  const scale = getEntityRenderScale(entity);
  ctx.translate(entity.x + entity.width * 0.5, entity.y + entity.height * 0.5);
  ctx.scale(scale, scale);
  ctx.rotate(entity.rotation * 0.2);
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(-entity.width * 0.42, -2, entity.width * 0.1, 4);
  ctx.fillStyle = "#cfd7df";
  ctx.fillRect(-entity.width * 0.38, -4, entity.width * 0.54, 8);
  ctx.beginPath();
  ctx.moveTo(entity.width * 0.16, 0);
  ctx.lineTo(entity.width * 0.34, -12);
  ctx.lineTo(entity.width * 0.34, 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ff664d";
  ctx.beginPath();
  ctx.moveTo(-entity.width * 0.38, 0);
  ctx.lineTo(-entity.width * 0.5, -10);
  ctx.lineTo(-entity.width * 0.5, 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPatrol(entity) {
  const bounce = Math.sin(state.time * 7 + entity.animation) * 4;
  const swing = Math.sin(state.time * 10 + entity.animation) * 0.4;
  ctx.save();
  const scale = getEntityRenderScale(entity) + Math.abs(bounce) * 0.002;
  ctx.translate(entity.x + entity.width * 0.5, entity.y + entity.height);
  ctx.scale(scale, scale);
  ctx.translate(-entity.width * 0.5, -entity.height);
  ctx.translate(0, bounce);

  ctx.save();
  ctx.translate(22, 74);
  ctx.rotate(-swing);
  ctx.fillStyle = "#3f2432";
  ctx.fillRect(0, 0, 14, 42);
  ctx.restore();

  ctx.save();
  ctx.translate(48, 74);
  ctx.rotate(swing);
  ctx.fillStyle = "#4d2b3b";
  ctx.fillRect(0, 0, 14, 42);
  ctx.restore();

  const bodyGradient = ctx.createLinearGradient(16, 26, 66, 82);
  bodyGradient.addColorStop(0, "#7c4a67");
  bodyGradient.addColorStop(1, "#4b2337");
  ctx.fillStyle = bodyGradient;
  roundRect(ctx, 16, 26, 50, 56, 16);
  ctx.fill();

  ctx.fillStyle = "#f7c8aa";
  roundRect(ctx, 18, 0, 44, 40, 16);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(22, 30, 8, 36);

  ctx.fillStyle = "#2c2138";
  ctx.fillRect(14, 6, 52, 16);
  ctx.fillStyle = "#f5f8ff";
  ctx.fillRect(26, 18, 8, 5);
  ctx.fillRect(44, 18, 8, 5);

  ctx.fillStyle = "#7b8cad";
  ctx.fillRect(70, 20, 8, 68);
  ctx.fillStyle = "#d5dbe9";
  ctx.fillRect(66, 12, 16, 12);

  ctx.restore();
}

function drawChaser(entity) {
  const bounce = Math.sin(state.time * 9 + entity.animation) * 5;
  const swing = Math.sin(state.time * 12 + entity.animation) * 0.45;
  ctx.save();
  const scale = getEntityRenderScale(entity) + Math.abs(bounce) * 0.002;
  ctx.translate(entity.x + entity.width * 0.5, entity.y + entity.height);
  ctx.scale(scale, scale);
  ctx.translate(-entity.width * 0.5, -entity.height);
  ctx.translate(0, bounce);

  ctx.save();
  ctx.translate(24, 80);
  ctx.rotate(-swing);
  ctx.fillStyle = "#1f2648";
  ctx.fillRect(0, 0, 16, 44);
  ctx.restore();

  ctx.save();
  ctx.translate(54, 78);
  ctx.rotate(swing);
  ctx.fillStyle = "#162344";
  ctx.fillRect(0, 0, 16, 48);
  ctx.restore();

  const bodyGradient = ctx.createLinearGradient(18, 28, 72, 90);
  bodyGradient.addColorStop(0, "#4261b2");
  bodyGradient.addColorStop(1, "#20345f");
  ctx.fillStyle = bodyGradient;
  roundRect(ctx, 18, 28, 54, 62, 18);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(24, 34, 8, 40);

  ctx.save();
  ctx.translate(14, 40);
  ctx.rotate(-0.3 + swing * 0.2);
  ctx.fillStyle = "#1f2d58";
  ctx.fillRect(0, 0, 14, 42);
  ctx.restore();

  ctx.save();
  ctx.translate(62, 36);
  ctx.rotate(0.5 + swing * 0.15);
  ctx.fillStyle = "#1c2a54";
  ctx.fillRect(0, 0, 14, 42);
  ctx.fillStyle = "#d0dcf9";
  ctx.fillRect(12, 2, 40, 4);
  ctx.restore();

  ctx.fillStyle = "#f1c6a6";
  roundRect(ctx, 22, 0, 46, 44, 18);
  ctx.fill();

  ctx.fillStyle = "#0c1226";
  ctx.beginPath();
  ctx.moveTo(20, 18);
  ctx.quadraticCurveTo(40, -8, 70, 12);
  ctx.lineTo(66, 22);
  ctx.lineTo(22, 22);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#f04a56";
  ctx.fillRect(20, 10, 50, 8);
  ctx.fillStyle = "#f2fbff";
  ctx.fillRect(32, 24, 8, 5);
  ctx.fillRect(48, 24, 8, 5);

  ctx.restore();
}

function drawParticles() {
  for (const particle of state.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * ctx.globalAlpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawHUDOnCanvas() {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(26, 26, 230, 14);
  ctx.fillStyle = "#ffb34c";
  const speedRatio = Math.min(1, (state.speed - 420) / 300);
  ctx.fillRect(26, 26, 230 * speedRatio, 14);
  ctx.fillStyle = "#f3f7ff";
  ctx.font = "700 20px Microsoft YaHei";
  ctx.fillText("速度提升", 26, 20);

  if (!state.running && !state.ended) {
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "700 26px Microsoft YaHei";
    ctx.fillText("准备好后点开始游戏", 26, WORLD.height - 36);
  }
  ctx.restore();
}

function drawHitFlash() {
  if (state.hitFlash <= 0) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = Math.min(0.38, state.hitFlash * 0.5);
  ctx.fillStyle = "#ff6c59";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  ctx.save();
  ctx.translate(WORLD.width * 0.5 + state.camera.offsetX, WORLD.height * 0.5 + state.camera.offsetY);
  ctx.scale(state.camera.zoom, state.camera.zoom);
  ctx.rotate(state.camera.tilt);
  ctx.translate(-WORLD.width * 0.5, -WORLD.height * 0.5);
  drawBackground();
  drawEntities();
  drawPlayer();
  drawParticles();
  ctx.restore();
  drawHUDOnCanvas();
  drawHitFlash();
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function resizeCanvas() {
  const ratio = WORLD.width / WORLD.height;
  const container = canvas.parentElement;
  const hud = document.querySelector(".hud");
  const controls = document.querySelector(".controls");
  const availableWidth = container.clientWidth;
  const reservedHeight =
    (hud ? hud.offsetHeight : 0) +
    (controls ? controls.offsetHeight : 0) +
    (window.innerWidth > window.innerHeight ? 68 : 96);
  const availableHeight = Math.max(220, window.innerHeight - reservedHeight);
  let width = availableWidth;
  let height = width / ratio;

  if (height > availableHeight && availableHeight > 0) {
    height = availableHeight;
    width = height * ratio;
  }

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

function handleKeyDown(event) {
  const code = event.code;
  if (keysDown.has(code)) {
    return;
  }
  keysDown.add(code);

  if (["Space", "ArrowUp"].includes(code)) {
    event.preventDefault();
    pressJumpInput(`key-${code}`);
  }

  if (["KeyJ", "KeyK", "Enter", "ArrowRight"].includes(code)) {
    event.preventDefault();
    attack();
  }
}

function handleKeyUp(event) {
  keysDown.delete(event.code);

  if (["Space", "ArrowUp"].includes(event.code)) {
    event.preventDefault();
    releaseJumpInput(`key-${event.code}`);
  }
}

function gameLoop(now) {
  const dt = Math.min(0.033, (now - previousTime) / 1000);
  previousTime = now;
  update(dt);
  render();
  rafId = requestAnimationFrame(gameLoop);
}

function ensureGameLoop() {
  if (rafId) {
    return;
  }
  previousTime = performance.now();
  rafId = requestAnimationFrame(gameLoop);
}

document.addEventListener(
  "touchmove",
  (event) => {
    const target = event.target;
    if (!(target && target.nodeType === 1)) {
      return;
    }

    if (
      leaderboardOverlay.classList.contains("visible") ||
      gameOverOverlay.classList.contains("visible")
    ) {
      const allowModalScroll =
        target.closest(".modal-content") ||
        target.closest(".leaderboard-scroll") ||
        target.closest(".text-input");

      if (!allowModalScroll) {
        event.preventDefault();
      }
      return;
    }

    const shouldBlockTouch =
      target === canvas ||
      target.closest(".control-buttons") ||
      target.closest(".start-strip") ||
      target.closest(".stage-wrap");

    if (shouldBlockTouch) {
      event.preventDefault();
    }
  },
  { passive: false }
);

addHoldListener(jumpButton, "jump-button", pressJumpInput, releaseJumpInput);
addPressListener(attackButton, attack);
addPressListener(startButton, startGame);
addPressListener(restartButton, startGame);
addPressListener(quickStartButton, startGame);
addPressListener(leaderboardButton, openLeaderboardPanel);
addPressListener(viewLeaderboardButton, openLeaderboardPanel);
addPressListener(closeLeaderboardButton, closeLeaderboardPanel);
addPressListener(refreshLeaderboardButton, () => {
  fetchLeaderboard(true);
});
addPressListener(submitScoreButton, submitScore);
addPressListener(canvas, () => {
  if (!state.running && !state.ended) {
    startGame();
  }
});
addPressListener(startOverlay, () => {
  if (!state.running && !state.ended) {
    startGame();
  }
});

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("blur", clearJumpInputState);
window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", resizeCanvas);
window.addEventListener("pageshow", () => {
  previousTime = performance.now();
  render();
});

nicknameInput.addEventListener("input", () => {
  const originalValue = nicknameInput.value;
  const trimmedEdgeValue = originalValue.replace(/^\s+|\s+$/g, "");
  if (trimmedEdgeValue !== originalValue) {
    nicknameInput.value = trimmedEdgeValue;
  }
  updateSubmitAvailability(true);
});

nicknameInput.addEventListener("blur", () => {
  nicknameInput.value = sanitizeNickname(nicknameInput.value);
  updateSubmitAvailability(true);
});

nicknameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitScore();
  }
});

leaderboardOverlay.addEventListener("click", (event) => {
  if (event.target === leaderboardOverlay || event.target.classList.contains("modal-backdrop")) {
    closeLeaderboardPanel();
  }
});

bestValue.textContent = state.best;
nicknameInput.value = loadSavedNickname();
updateMyBestDisplay();
renderLeaderboardEntries([]);
resetGame();
resizeCanvas();
ensureGameLoop();

function triggerCameraKick({ shake = 2.2, duration = 0.1, drop = 0, driftX = 0 } = {}) {
  state.camera.shakeTime = Math.max(state.camera.shakeTime, duration);
  state.camera.shakeStrength = Math.max(state.camera.shakeStrength, shake);
  state.camera.impact = Math.max(state.camera.impact, drop);
  state.camera.targetZoom = 1;
  state.camera.targetTilt = 0;
  state.camera.offsetX += driftX;
}

function updateCamera(dt) {
  state.camera.impact *= Math.max(0, 1 - dt * 9);

  if (state.camera.shakeTime > 0) {
    state.camera.shakeTime = Math.max(0, state.camera.shakeTime - dt);
    const fade = state.camera.shakeTime / Math.max(0.001, state.camera.shakeTime + dt);
    const intensity = state.camera.shakeStrength * fade;
    state.camera.offsetX = (Math.random() - 0.5) * intensity * 1.4;
    state.camera.offsetY = (Math.random() - 0.5) * intensity * 0.9 + state.camera.impact * 0.55;
    state.camera.shakeStrength = Math.max(0, state.camera.shakeStrength - dt * 10);
  } else {
    state.camera.offsetX = approach(state.camera.offsetX, 0, dt * 10);
    state.camera.offsetY = approach(state.camera.offsetY, state.camera.impact * 0.45, dt * 8);
    state.camera.shakeStrength = 0;
  }

  state.camera.zoom = 1;
  state.camera.targetZoom = 1;
  state.camera.tilt = 0;
  state.camera.targetTilt = 0;
}

function drawBackground() {
  const skyGradient = ctx.createLinearGradient(0, 0, 0, WORLD.height);
  skyGradient.addColorStop(0, "#718fd6");
  skyGradient.addColorStop(0.42, "#445f99");
  skyGradient.addColorStop(1, "#16233f");
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  ctx.fillStyle = "rgba(255, 223, 212, 0.08)";
  ctx.fillRect(0, 160, WORLD.width, 110);

  ctx.save();
  ctx.shadowColor = "rgba(255, 229, 210, 0.35)";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#ffe0c5";
  ctx.beginPath();
  ctx.arc(1030, 114, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawCloud(220 + Math.sin(state.time * 0.12) * 20, 112, 1.05);
  drawCloud(520 + Math.cos(state.time * 0.1) * 18, 92, 0.82);
  drawCloud(910 + Math.sin(state.time * 0.15) * 14, 170, 0.66);

  drawCampusFarBuildings();
  drawCampusDorms();
  drawCampusTrees();
  drawCampusFence();
  drawCampusGround();
  drawCampusForeground();
}

function drawCampusFarBuildings() {
  const offset = (state.time * state.speed * 0.04) % 360;
  for (let i = -1; i < 6; i += 1) {
    const x = i * 260 - offset;
    const width = 160 + (i % 2) * 24;
    const height = 110 + (i % 3) * 22;
    ctx.fillStyle = "rgba(39, 52, 83, 0.62)";
    roundRect(ctx, x, 318 - height, width, height, 10);
    ctx.fill();
    ctx.fillStyle = "rgba(252, 230, 179, 0.16)";
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const wx = x + 18 + col * 32;
        const wy = 330 - height + 18 + row * 20;
        ctx.fillRect(wx, wy, 12, 9);
      }
    }
  }
}

function drawCampusDorms() {
  const offset = (state.time * state.speed * 0.09) % 460;
  for (let i = -1; i < 5; i += 1) {
    const x = i * 340 - offset;
    ctx.fillStyle = "#31466f";
    roundRect(ctx, x, 270, 210, 146, 18);
    ctx.fill();
    ctx.fillStyle = "#4f6796";
    ctx.fillRect(x, 286, 210, 14);
    ctx.fillStyle = "#283956";
    ctx.fillRect(x + 94, 344, 28, 72);
    ctx.fillStyle = "rgba(255, 236, 191, 0.22)";
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        ctx.fillRect(x + 22 + col * 34, 306 + row * 26, 16, 12);
      }
    }
  }
}

function drawCampusTrees() {
  const offset = (state.time * state.speed * 0.18) % 170;
  for (let i = -2; i < 10; i += 1) {
    const x = i * 138 - offset;
    const trunkHeight = 72 + (i % 3) * 12;
    ctx.fillStyle = "#5c4a4e";
    ctx.fillRect(x + 48, 396 - trunkHeight, 10, trunkHeight);
    ctx.fillStyle = i % 2 === 0 ? "#4d8d73" : "#6da794";
    ctx.beginPath();
    ctx.arc(x + 52, 322, 34, 0, Math.PI * 2);
    ctx.arc(x + 28, 340, 24, 0, Math.PI * 2);
    ctx.arc(x + 76, 338, 24, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCampusFence() {
  const offset = (state.time * state.speed * 0.34) % 88;
  ctx.fillStyle = "#58739e";
  ctx.fillRect(0, 438, WORLD.width, 8);
  for (let i = -1; i < 18; i += 1) {
    const x = i * 76 - offset;
    ctx.fillRect(x + 14, 438, 6, 62);
    ctx.fillRect(x + 48, 438, 6, 62);
    ctx.strokeStyle = "rgba(224, 236, 255, 0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 17, 454);
    ctx.lineTo(x + 51, 454);
    ctx.moveTo(x + 17, 474);
    ctx.lineTo(x + 51, 474);
    ctx.stroke();
  }
}

function drawCampusGround() {
  const pathTop = WORLD.groundY - 10;
  const grassGradient = ctx.createLinearGradient(0, pathTop - 54, 0, pathTop + 16);
  grassGradient.addColorStop(0, "#5da98b");
  grassGradient.addColorStop(1, "#3d765f");
  ctx.fillStyle = grassGradient;
  ctx.fillRect(0, pathTop - 46, WORLD.width, 58);

  const pathGradient = ctx.createLinearGradient(0, pathTop, 0, WORLD.height);
  pathGradient.addColorStop(0, "#4f5262");
  pathGradient.addColorStop(1, "#323645");
  ctx.fillStyle = pathGradient;
  ctx.fillRect(0, pathTop, WORLD.width, WORLD.height - pathTop);

  ctx.fillStyle = "#dce7fb";
  ctx.fillRect(0, pathTop, WORLD.width, 6);

  const dashOffset = (state.time * state.speed * 0.72) % 140;
  for (let i = -1; i < 12; i += 1) {
    const x = i * 140 - dashOffset;
    ctx.fillStyle = "rgba(236, 243, 255, 0.7)";
    roundRect(ctx, x + 24, pathTop + 48, 56, 8, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
    roundRect(ctx, x + 26, pathTop + 66, 52, 6, 3);
    ctx.fill();
  }
}

function drawCampusForeground() {
  const offset = (state.time * state.speed * 0.58) % 150;
  for (let i = -1; i < 10; i += 1) {
    const x = i * 140 - offset;
    ctx.fillStyle = i % 2 === 0 ? "#73c39f" : "#8fd4b8";
    ctx.beginPath();
    ctx.moveTo(x, WORLD.groundY + 2);
    ctx.quadraticCurveTo(x + 16, WORLD.groundY - 22, x + 32, WORLD.groundY + 2);
    ctx.quadraticCurveTo(x + 48, WORLD.groundY - 18, x + 62, WORLD.groundY + 4);
    ctx.lineTo(x + 4, WORLD.groundY + 8);
    ctx.closePath();
    ctx.fill();
  }
}

function drawGroundShadow(x, y, width, height, strength = 1) {
  const lift = getLiftFromGround(y, height);
  const opacity = Math.max(0.06, (0.24 - lift * 0.0011) * strength);
  const shadowWidth = width * (0.44 - Math.min(0.12, lift * 0.00048));
  const shadowHeight = 7 + Math.max(0, 12 - lift * 0.03);
  ctx.save();
  ctx.fillStyle = `rgba(13, 16, 28, ${opacity})`;
  ctx.beginPath();
  ctx.ellipse(x + width * 0.5, WORLD.groundY + 14, shadowWidth, shadowHeight, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function getEntityRenderScale() {
  return 1;
}

function drawKexinLimb(options) {
  const {
    x,
    y,
    upperLength,
    lowerLength,
    upperWidth,
    lowerWidth,
    upperAngle,
    lowerAngle,
    upperColor,
    lowerColor,
    footColor,
    footWidth = 20
  } = options;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(upperAngle);
  ctx.fillStyle = upperColor;
  roundRect(ctx, -upperWidth * 0.5, 0, upperWidth, upperLength, upperWidth * 0.5);
  ctx.fill();
  ctx.translate(0, upperLength - 2);
  ctx.rotate(lowerAngle);
  ctx.fillStyle = lowerColor;
  roundRect(ctx, -lowerWidth * 0.5, 0, lowerWidth, lowerLength, lowerWidth * 0.5);
  ctx.fill();
  ctx.fillStyle = footColor;
  roundRect(ctx, -footWidth * 0.45, lowerLength - 4, footWidth, 10, 5);
  ctx.fill();
  ctx.restore();
}

function drawKexinArm(options) {
  const {
    x,
    y,
    upperLength,
    lowerLength,
    upperWidth,
    lowerWidth,
    upperAngle,
    lowerAngle,
    sleeveColor,
    skinColor,
    item
  } = options;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(upperAngle);
  ctx.fillStyle = sleeveColor;
  roundRect(ctx, -upperWidth * 0.5, 0, upperWidth, upperLength, upperWidth * 0.5);
  ctx.fill();
  ctx.translate(0, upperLength - 2);
  ctx.rotate(lowerAngle);
  ctx.fillStyle = skinColor;
  roundRect(ctx, -lowerWidth * 0.5, 0, lowerWidth, lowerLength, lowerWidth * 0.5);
  ctx.fill();
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.arc(0, lowerLength, lowerWidth * 0.6, 0, Math.PI * 2);
  ctx.fill();
  if (item === "blade") {
    ctx.fillStyle = "#eef6ff";
    ctx.fillRect(6, lowerLength - 8, 30, 4);
    ctx.fillStyle = "#8fd7ff";
    ctx.fillRect(30, lowerLength - 10, 10, 8);
  }
  ctx.restore();
}

function drawPlayer() {
  const player = state.player;
  const attackStrength = player.attackTimer > 0 ? Math.sin((player.attackTimer / 0.28) * Math.PI) : 0;
  const onGround = player.y >= WORLD.groundY - player.height - 1;
  const isAttacking = player.attackTimer > 0.02;
  const isJumping = !onGround;
  const isIdle = !state.running && !state.ended;
  const runWave = Math.sin(player.runCycle * 4.1);
  const runWaveAlt = Math.sin(player.runCycle * 4.1 + Math.PI);
  const bob = isJumping ? -4 : isIdle ? Math.sin(state.time * 2) * 1.6 : Math.abs(runWave) * 4;
  const lift = getLiftFromGround(player.y, player.height);
  const skin = "#f7d9cd";
  const jacket = "#eff6ff";
  const jacketBlue = "#82aefc";
  const skirt = "#a898ff";
  const pink = "#ff9fca";
  const hair = "#171a27";
  const glass = "#5a6d92";

  let torsoTilt = isJumping ? -0.16 : isAttacking ? 0.26 * attackStrength : runWave * 0.04;
  let rearLegUpper = isJumping ? 0.55 : runWaveAlt * 0.52;
  let rearLegLower = isJumping ? -0.65 : -0.22 + Math.max(0, runWaveAlt) * 0.44;
  let frontLegUpper = isJumping ? -0.68 : runWave * 0.56;
  let frontLegLower = isJumping ? 0.82 : 0.12 - Math.min(0, runWave) * 0.48;
  let rearArmUpper = isJumping ? -0.8 : runWave * 0.38;
  let rearArmLower = isJumping ? -0.1 : -0.14;
  let frontArmUpper = isJumping ? 0.42 : -runWave * 0.48;
  let frontArmLower = isJumping ? 0.16 : 0.08;

  if (isAttacking) {
    frontArmUpper = 0.82 * attackStrength + 0.18;
    frontArmLower = 0.22;
    rearArmUpper = -0.6;
    rearArmLower = -0.12;
    frontLegUpper = 0.22;
    frontLegLower = -0.22;
    rearLegUpper = -0.18;
    rearLegLower = 0.34;
  }

  drawGroundShadow(player.x + 6, player.y, player.width - 12, player.height, 1.15);

  ctx.save();
  ctx.translate(player.x + player.width * 0.5, player.y + player.height);
  ctx.translate(0, bob);
  ctx.rotate(torsoTilt);
  ctx.translate(-player.width * 0.5, -player.height);

  drawKexinLimb({
    x: 36,
    y: 78,
    upperLength: 26,
    lowerLength: 26,
    upperWidth: 12,
    lowerWidth: 11,
    upperAngle: rearLegUpper,
    lowerAngle: rearLegLower,
    upperColor: "#f4f8ff",
    lowerColor: "#edf3ff",
    footColor: "#ff9ab4"
  });

  drawKexinLimb({
    x: 54,
    y: 78,
    upperLength: 28,
    lowerLength: 27,
    upperWidth: 13,
    lowerWidth: 11,
    upperAngle: frontLegUpper,
    lowerAngle: frontLegLower,
    upperColor: "#eef6ff",
    lowerColor: "#f8fbff",
    footColor: "#7f9fff"
  });

  ctx.fillStyle = "#94a8ff";
  ctx.beginPath();
  ctx.moveTo(27, 86);
  ctx.quadraticCurveTo(44, 98, 66, 84);
  ctx.lineTo(64, 98);
  ctx.quadraticCurveTo(45, 112, 24, 98);
  ctx.closePath();
  ctx.fill();

  drawKexinArm({
    x: 26,
    y: 42,
    upperLength: 22,
    lowerLength: 20,
    upperWidth: 12,
    lowerWidth: 10,
    upperAngle: rearArmUpper,
    lowerAngle: rearArmLower,
    sleeveColor: jacketBlue,
    skinColor: skin
  });

  ctx.fillStyle = jacket;
  roundRect(ctx, 24, 34, 40, 42, 16);
  ctx.fill();
  ctx.fillStyle = jacketBlue;
  roundRect(ctx, 24, 34, 10, 42, 10);
  ctx.fill();
  roundRect(ctx, 54, 34, 10, 42, 10);
  ctx.fill();
  ctx.fillStyle = "#d4e0ff";
  ctx.fillRect(40, 40, 8, 26);
  ctx.fillStyle = pink;
  ctx.beginPath();
  ctx.moveTo(32, 44);
  ctx.quadraticCurveTo(44, 34, 56, 44);
  ctx.lineTo(52, 50);
  ctx.quadraticCurveTo(44, 44, 36, 50);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = skirt;
  ctx.beginPath();
  ctx.moveTo(28, 74);
  ctx.quadraticCurveTo(44, 86, 60, 74);
  ctx.lineTo(62, 92);
  ctx.quadraticCurveTo(44, 102, 26, 92);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(34, 78, 4, 16);
  ctx.fillRect(42, 80, 4, 14);
  ctx.fillRect(50, 78, 4, 16);

  drawKexinArm({
    x: 62,
    y: 40,
    upperLength: 23,
    lowerLength: 20,
    upperWidth: 12,
    lowerWidth: 10,
    upperAngle: frontArmUpper,
    lowerAngle: frontArmLower,
    sleeveColor: jacketBlue,
    skinColor: skin,
    item: isAttacking ? "blade" : null
  });

  ctx.save();
  ctx.translate(44, 18);
  ctx.rotate(isJumping ? -0.24 : isAttacking ? -0.16 : runWaveAlt * 0.05);
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.moveTo(-23, -2);
  ctx.quadraticCurveTo(-28, 26, -18, 42);
  ctx.quadraticCurveTo(0, 56, 20, 42);
  ctx.quadraticCurveTo(28, 24, 22, -2);
  ctx.quadraticCurveTo(4, -16, -18, -8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#22263a";
  ctx.beginPath();
  ctx.moveTo(10, 6);
  ctx.quadraticCurveTo(22, -4, 24, 10);
  ctx.quadraticCurveTo(18, 18, 10, 6);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = skin;
  roundRect(ctx, 24, 6, 40, 40, 18);
  ctx.fill();

  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.moveTo(22, 20);
  ctx.quadraticCurveTo(26, -2, 44, 0);
  ctx.quadraticCurveTo(62, -2, 66, 18);
  ctx.lineTo(62, 26);
  ctx.quadraticCurveTo(44, 14, 26, 26);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(30, 18);
  ctx.quadraticCurveTo(34, 10, 40, 20);
  ctx.quadraticCurveTo(35, 28, 30, 18);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(48, 18);
  ctx.quadraticCurveTo(55, 8, 58, 20);
  ctx.quadraticCurveTo(54, 28, 48, 18);
  ctx.fill();

  ctx.strokeStyle = glass;
  ctx.lineWidth = 2.5;
  roundRect(ctx, 29, 21, 11, 9, 4);
  ctx.stroke();
  roundRect(ctx, 48, 21, 11, 9, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(40, 25);
  ctx.lineTo(48, 25);
  ctx.stroke();

  ctx.fillStyle = "#22344e";
  ctx.fillRect(32, 24, 5, 3);
  ctx.fillRect(51, 24, 5, 3);
  ctx.fillStyle = "rgba(255, 176, 202, 0.5)";
  ctx.beginPath();
  ctx.arc(30, 32, 3.5, 0, Math.PI * 2);
  ctx.arc(58, 32, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#92596d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(39, 36);
  ctx.quadraticCurveTo(44, 39, 49, 36);
  ctx.stroke();

  ctx.fillStyle = "#8fe0ff";
  ctx.beginPath();
  ctx.moveTo(56, 8);
  ctx.quadraticCurveTo(66, -4, 72, 8);
  ctx.quadraticCurveTo(64, 14, 56, 8);
  ctx.fill();

  if (isAttacking) {
    ctx.strokeStyle = "rgba(255, 189, 225, 0.85)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(72, 54, 34 + attackStrength * 10, -0.7, 0.65);
    ctx.stroke();
    ctx.strokeStyle = "rgba(144, 227, 255, 0.9)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(72, 54, 26 + attackStrength * 8, -0.75, 0.52);
    ctx.stroke();
  } else if (isJumping) {
    ctx.strokeStyle = "rgba(153, 221, 255, 0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(18, 94);
    ctx.quadraticCurveTo(42, 86, 68, 94);
    ctx.stroke();
  }

  if (isIdle) {
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(68, 12);
    ctx.quadraticCurveTo(78, 2, 82, 14);
    ctx.stroke();
  }

  ctx.restore();
}

function drawEntities() {
  const sorted = [...state.entities].sort((a, b) => (a.y + a.height) - (b.y + b.height));
  for (const entity of sorted) {
    drawGroundShadow(entity.x, entity.y, entity.width, entity.height, entity.kind === "dart" ? 0.6 : 1);
    if (entity.kind === "stone") {
      drawStone(entity);
    } else if (entity.kind === "barrel") {
      drawBarrel(entity);
    } else if (entity.kind === "puddle") {
      drawPuddle(entity);
    } else if (entity.kind === "dart") {
      drawDart(entity);
    } else if (entity.kind === "patrol") {
      drawPatrol(entity);
    } else if (entity.kind === "chaser") {
      drawChaser(entity);
    }
  }
}

function drawStone(entity) {
  ctx.save();
  ctx.translate(entity.x, entity.y);
  const rockGradient = ctx.createLinearGradient(0, 0, entity.width, entity.height);
  rockGradient.addColorStop(0, "#b3bccd");
  rockGradient.addColorStop(1, "#667085");
  ctx.fillStyle = rockGradient;
  ctx.beginPath();
  ctx.moveTo(10, 44);
  ctx.lineTo(22, 16);
  ctx.lineTo(40, 8);
  ctx.lineTo(60, 14);
  ctx.lineTo(68, 32);
  ctx.lineTo(58, 48);
  ctx.lineTo(20, 48);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.moveTo(22, 16);
  ctx.lineTo(40, 8);
  ctx.lineTo(48, 18);
  ctx.lineTo(28, 24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(32,38,54,0.18)";
  ctx.beginPath();
  ctx.moveTo(48, 18);
  ctx.lineTo(68, 32);
  ctx.lineTo(58, 48);
  ctx.lineTo(38, 44);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBarrel(entity) {
  ctx.save();
  ctx.translate(entity.x, entity.y);
  const barrelGradient = ctx.createLinearGradient(0, 0, entity.width, 0);
  barrelGradient.addColorStop(0, "#7f482a");
  barrelGradient.addColorStop(0.5, "#c78650");
  barrelGradient.addColorStop(1, "#704124");
  ctx.fillStyle = barrelGradient;
  roundRect(ctx, 8, 10, entity.width - 16, entity.height - 20, 18);
  ctx.fill();
  ctx.fillStyle = "#d8a16a";
  ctx.beginPath();
  ctx.ellipse(entity.width * 0.5, 16, entity.width * 0.3, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#53301c";
  ctx.fillRect(14, 18, entity.width - 28, 8);
  ctx.fillRect(14, entity.height - 28, entity.width - 28, 8);
  ctx.fillRect(18, 12, 6, entity.height - 24);
  ctx.fillRect(entity.width - 24, 12, 6, entity.height - 24);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(28, 18, 8, entity.height - 36);
  ctx.restore();
}

function drawPuddle(entity) {
  ctx.save();
  ctx.translate(entity.x, entity.y);
  const puddleGradient = ctx.createLinearGradient(0, 0, entity.width, 0);
  puddleGradient.addColorStop(0, "rgba(80, 178, 255, 0.32)");
  puddleGradient.addColorStop(0.5, "rgba(118, 208, 255, 0.72)");
  puddleGradient.addColorStop(1, "rgba(80, 178, 255, 0.34)");
  ctx.fillStyle = puddleGradient;
  ctx.beginPath();
  ctx.ellipse(entity.width * 0.5, 10, entity.width * 0.42, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(238, 252, 255, 0.34)";
  ctx.beginPath();
  ctx.ellipse(entity.width * 0.38, 7, entity.width * 0.16, 4, -0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(181, 237, 255, 0.88)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(42, 10, 8 + Math.sin(state.time * 4 + entity.wobble) * 2, 0, Math.PI);
  ctx.arc(88, 10, 7 + Math.cos(state.time * 4 + entity.wobble) * 2, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawDart(entity) {
  ctx.save();
  ctx.translate(entity.x + entity.width * 0.5, entity.y + entity.height * 0.5);
  ctx.rotate(entity.rotation * 0.18);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(-entity.width * 0.46, -2, entity.width * 0.12, 4);
  ctx.fillStyle = "#eff6ff";
  ctx.fillRect(-entity.width * 0.36, -4, entity.width * 0.5, 8);
  ctx.fillStyle = "#8fd8ff";
  ctx.fillRect(-entity.width * 0.08, -3, entity.width * 0.16, 6);
  ctx.fillStyle = "#ff7f98";
  ctx.beginPath();
  ctx.moveTo(entity.width * 0.16, 0);
  ctx.lineTo(entity.width * 0.34, -11);
  ctx.lineTo(entity.width * 0.34, 11);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#c4d6ef";
  ctx.beginPath();
  ctx.moveTo(-entity.width * 0.38, 0);
  ctx.lineTo(-entity.width * 0.5, -9);
  ctx.lineTo(-entity.width * 0.5, 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPatrol(entity) {
  const run = Math.sin(state.time * 8 + entity.animation);
  ctx.save();
  ctx.translate(entity.x, entity.y);

  drawKexinLimb({
    x: 28,
    y: 76,
    upperLength: 24,
    lowerLength: 22,
    upperWidth: 12,
    lowerWidth: 10,
    upperAngle: -run * 0.42,
    lowerAngle: 0.18,
    upperColor: "#2b3557",
    lowerColor: "#202a45",
    footColor: "#60719d",
    footWidth: 18
  });

  drawKexinLimb({
    x: 48,
    y: 76,
    upperLength: 24,
    lowerLength: 22,
    upperWidth: 12,
    lowerWidth: 10,
    upperAngle: run * 0.42,
    lowerAngle: 0.12,
    upperColor: "#2b3557",
    lowerColor: "#202a45",
    footColor: "#60719d",
    footWidth: 18
  });

  drawKexinArm({
    x: 22,
    y: 40,
    upperLength: 20,
    lowerLength: 18,
    upperWidth: 11,
    lowerWidth: 9,
    upperAngle: run * 0.32,
    lowerAngle: -0.08,
    sleeveColor: "#41527e",
    skinColor: "#efc7ab"
  });

  ctx.fillStyle = "#4f618f";
  roundRect(ctx, 18, 30, 38, 44, 14);
  ctx.fill();
  ctx.fillStyle = "#33456f";
  ctx.fillRect(34, 34, 8, 30);

  drawKexinArm({
    x: 54,
    y: 38,
    upperLength: 22,
    lowerLength: 18,
    upperWidth: 11,
    lowerWidth: 9,
    upperAngle: -run * 0.32 + 0.2,
    lowerAngle: 0.12,
    sleeveColor: "#41527e",
    skinColor: "#efc7ab",
    item: "blade"
  });

  ctx.fillStyle = "#f2c7aa";
  roundRect(ctx, 20, 0, 34, 34, 14);
  ctx.fill();
  ctx.fillStyle = "#242c42";
  ctx.beginPath();
  ctx.moveTo(18, 16);
  ctx.quadraticCurveTo(32, -4, 58, 12);
  ctx.lineTo(54, 22);
  ctx.lineTo(20, 22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#dce6ff";
  ctx.fillRect(28, 20, 5, 3);
  ctx.fillRect(40, 20, 5, 3);
  ctx.fillStyle = "#7090c9";
  ctx.fillRect(16, 10, 42, 7);

  ctx.restore();
}

function drawChaser(entity) {
  const run = Math.sin(state.time * 9 + entity.animation);
  ctx.save();
  ctx.translate(entity.x, entity.y);

  drawKexinLimb({
    x: 30,
    y: 84,
    upperLength: 28,
    lowerLength: 24,
    upperWidth: 13,
    lowerWidth: 11,
    upperAngle: -run * 0.5,
    lowerAngle: 0.22,
    upperColor: "#202846",
    lowerColor: "#151c34",
    footColor: "#5d77c4",
    footWidth: 20
  });

  drawKexinLimb({
    x: 54,
    y: 84,
    upperLength: 28,
    lowerLength: 24,
    upperWidth: 13,
    lowerWidth: 11,
    upperAngle: run * 0.5,
    lowerAngle: 0.14,
    upperColor: "#202846",
    lowerColor: "#151c34",
    footColor: "#5d77c4",
    footWidth: 20
  });

  drawKexinArm({
    x: 20,
    y: 44,
    upperLength: 22,
    lowerLength: 18,
    upperWidth: 11,
    lowerWidth: 9,
    upperAngle: run * 0.3 - 0.22,
    lowerAngle: -0.08,
    sleeveColor: "#253660",
    skinColor: "#efc2a7"
  });

  const coatGradient = ctx.createLinearGradient(18, 30, 62, 82);
  coatGradient.addColorStop(0, "#5e73d7");
  coatGradient.addColorStop(1, "#2a3567");
  ctx.fillStyle = coatGradient;
  roundRect(ctx, 18, 30, 46, 50, 16);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(24, 36, 8, 36);

  drawKexinArm({
    x: 64,
    y: 42,
    upperLength: 24,
    lowerLength: 18,
    upperWidth: 11,
    lowerWidth: 9,
    upperAngle: -run * 0.34 + 0.46,
    lowerAngle: 0.08,
    sleeveColor: "#253660",
    skinColor: "#efc2a7",
    item: "blade"
  });

  ctx.fillStyle = "#f1c4a7";
  roundRect(ctx, 24, 0, 36, 36, 15);
  ctx.fill();
  ctx.fillStyle = "#0f1529";
  ctx.beginPath();
  ctx.moveTo(22, 18);
  ctx.quadraticCurveTo(34, -4, 62, 16);
  ctx.lineTo(58, 24);
  ctx.lineTo(24, 24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ff6f89";
  ctx.fillRect(24, 12, 38, 7);
  ctx.fillStyle = "#f2fbff";
  ctx.fillRect(34, 22, 5, 3);
  ctx.fillRect(46, 22, 5, 3);

  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  ctx.save();
  ctx.translate(state.camera.offsetX, state.camera.offsetY);
  drawBackground();
  drawEntities();
  drawPlayer();
  drawParticles();
  ctx.restore();
  drawHUDOnCanvas();
  drawHitFlash();
}
