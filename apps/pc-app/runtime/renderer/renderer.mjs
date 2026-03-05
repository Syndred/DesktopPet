const panelElement = document.getElementById("panel");
const runtimeElement = document.getElementById("runtime");
const logElement = document.getElementById("log");
const closePanelBtn = document.getElementById("btn-close-panel");
const captureBtn = document.getElementById("btn-capture");
const occupyBtn = document.getElementById("btn-occupy");
const pauseBtn = document.getElementById("btn-pause");
const battleResetBtn = document.getElementById("btn-battle-reset");
const endBattleBtn = document.getElementById("btn-end-battle");
const stageBattleActionButtons = [...document.querySelectorAll(".battle-tag")];
const battleActionButtons = [...stageBattleActionButtons];
const languageBtn = document.getElementById("btn-language");
const inventoryListElement = document.getElementById("pet-inventory-list");
const petDetailElement = document.getElementById("pet-detail");
const petDetailPlaceholderElement = document.getElementById("pet-detail-placeholder");
const battleReportListElement = document.getElementById("battle-report-list");
const playerModel = document.getElementById("player-model");
const enemyModel = document.getElementById("enemy-model");

const battleSceneElement = document.getElementById("battle-scene");
const battleVsElement = document.getElementById("battle-vs");
const battleCountdownElement = document.getElementById("battle-countdown");
const battleCountdownValueElement = document.getElementById("battle-countdown-value");
const battleFxElement = document.getElementById("battle-fx");
const roundFeedElement = document.getElementById("round-feed");
const lastRoundResultElement = document.getElementById("last-round-result");
const battleActionTagsElement = document.getElementById("battle-action-tags");
const playerHudElement = document.getElementById("player-hud");
const enemyHudElement = document.getElementById("enemy-hud");

const battleRoundElement = document.getElementById("battle-round");
const playerElementLabel = document.getElementById("player-element-label");
const enemyElementLabel = document.getElementById("enemy-element-label");
const statusPlayerElement = document.getElementById("status-player");
const statusEnemyElement = document.getElementById("status-enemy");
const battleSettlementElement = document.getElementById("battle-settlement");
const battleSettlementTitleElement = document.getElementById("battle-settlement-title");
const battleSettlementSubtitleElement = document.getElementById("battle-settlement-subtitle");
const settlementConfirmBtn = document.getElementById("btn-settlement-confirm");

const hpFillPlayer = document.getElementById("hp-fill-player");
const hpFillEnemy = document.getElementById("hp-fill-enemy");
const angerFillPlayer = document.getElementById("anger-fill-player");
const angerFillEnemy = document.getElementById("anger-fill-enemy");
const hpValuePlayer = document.getElementById("hp-value-player");
const hpValueEnemy = document.getElementById("hp-value-enemy");
const angerValuePlayer = document.getElementById("anger-value-player");
const angerValueEnemy = document.getElementById("anger-value-enemy");

const playerCard = document.getElementById("player-card");
const enemyCard = document.getElementById("enemy-card");

const i18n = {
  zh: {
    appTitle: "轻宠·领主 3D",
    loadingRuntime: "正在加载运行时...",
    battleTitle: "对战控制",
    playerPet: "我方宠物",
    enemyPet: "敌方宠物",
    round: "回合",
    hp: "生命",
    anger: "怒气",
    playerElement: "我方属性",
    enemyElement: "敌方属性",
    resetBattle: "开始对战",
    endBattle: "结束对战",
    closePanel: "关闭面板",
    actionNormal: "普攻",
    actionElement: "属性",
    actionDodge: "闪避",
    actionUltimate: "大招",
    companionTitle: "陪伴交互",
    captureTest: "收留测试",
    occupyTest: "占领测试",
    pauseHit: "暂停穿透判定",
    resumeHit: "恢复穿透判定",
    tip: "提示：桌面默认只显示你的宠物，开始对战后会出现敌方宠物。",
    statusPrefix: "状态",
    statusNone: "无",
    battleResetLog: "对战已开始：我方={player}，敌方={enemy}",
    battleRoundLog: "第 {round} 回合：我方 {playerAction} vs 敌方 {enemyAction} | 伤害(我方:{playerDamage}, 敌方:{enemyDamage})",
    battleNotesLog: "回合说明：{notes}",
    battleTickerAction: "我方 {playerAction} · 敌方 {enemyAction}",
    battleTickerDamage: "伤害 我方-{playerDamage} / 敌方-{enemyDamage}",
    battleWaiting: "已选择 {playerAction}，等待对方...",
    battleAutoNormal: "5秒未选择动作，已默认普攻。",
    battleNoAngerDodge: "怒气为 0，无法闪避，已改为普攻。",
    battleRelationAdvantage: "克制",
    battleRelationDisadvantage: "被克",
    battleRelationEven: "均势",
    battleLastResult: "上一回合：我方 {playerAction} vs 敌方 {enemyAction}",
    battleTickerWinnerPlayer: "本回合结算：你已获胜",
    battleTickerWinnerEnemy: "本回合结算：敌方获胜",
    battleTickerWinnerDraw: "本回合结算：平局",
    battleWinPlayer: "对战结束：你获胜，可尝试占领。",
    battleWinEnemy: "对战结束：敌方获胜。",
    battleDraw: "对战结束：平局。",
    battleCelebrateWin: "恭喜获胜，今天的你势不可挡。",
    battleCelebrateLose: "这回合惜败，再来一局一定翻盘。",
    battleCelebrateDraw: "势均力敌，下一回合继续博弈。",
    battleExitLog: "已退出对战，桌面恢复为仅显示我的宠物。",
    battleSettlementConfirmLog: "已确认结算，桌面恢复为仅显示我的宠物。",
    battleSettlementWinTitle: "胜利",
    battleSettlementLoseTitle: "失败",
    battleSettlementDrawTitle: "平局",
    battleSettlementConfirm: "确认",
    petInteract: "宠物交互：宠物给出轻量陪伴反馈。",
    actionSent: "已提交本回合动作。",
    activePetChanged: "已切换当前宠物：{petName}",
    inventoryTitle: "现有宠物",
    inventoryTip: "桌面右键宠物可打开面板；点击下方头像后在右侧查看详情。",
    inventoryPlaceholder: "点击左侧宠物头像查看详情",
    inventoryQuickSet: "出战",
    inventoryQuickActive: "出战中",
    inventoryFieldIndex: "序号",
    inventoryFieldSerial: "编号",
    inventoryFieldModel: "模型",
    inventoryFieldElement: "属性",
    inventoryFieldStats: "数值",
    inventoryFieldCapturedAt: "收留时间",
    inventoryActive: "当前出战",
    inventorySetActive: "设为出战",
    inventorySelectedDetail: "宠物详情",
    battleReportTitle: "最近战报",
    battleReportEmpty: "暂无战报，先开一局对战吧。",
    battleReportFinished: "已结算",
    battleReportAbandoned: "中断",
    battleReportPlayerWin: "我方胜",
    battleReportEnemyWin: "敌方胜",
    battleReportDraw: "平局",
    battleReportRound: "回合",
    battleReportStartedAt: "开始",
    captureLog: "收留测试：记忆标签已记录，收益倍率 {reward}。",
    captureBurst: "收留反馈触发。",
    occupyNoAttempts: "占领测试：今日免费入侵次数已用完。",
    occupySuccess: "占领成功，剩余免费次数：{count}。",
    occupyFail: "占领失败，请先赢下对战。剩余免费次数：{count}。",
    pausedLog: "穿透判定已暂停（仍可操作控制面板）。",
    resumedLog: "穿透判定已恢复。",
    trayPaused: "托盘操作：已暂停交互穿透。",
    trayResumed: "托盘操作：已恢复交互穿透。",
    runtimeStarted: "桌宠运行时已启动。",
    languageButton: "EN",
    runtimeInfo: "Electron {electron} | {platform} | 应用 {app}",
    elementNames: {
      metal: "金",
      wood: "木",
      earth: "土",
      water: "水",
      fire: "火"
    },
    statusNames: {
      burn: "灼烧",
      freeze: "冻结",
      parasite: "寄生",
      vulnerability: "易伤",
      petrify: "石化"
    },
    actionNames: {
      normal_attack: "普攻",
      element_attack: "属性攻击",
      dodge: "闪避",
      ultimate: "大招",
      stunned: "眩晕"
    }
  },
  en: {
    appTitle: "QingPet Lord 3D",
    loadingRuntime: "Loading runtime...",
    battleTitle: "Battle Control",
    playerPet: "Player Pet",
    enemyPet: "Enemy Pet",
    round: "Round",
    hp: "HP",
    anger: "Anger",
    playerElement: "Player Element",
    enemyElement: "Enemy Element",
    resetBattle: "Start Battle",
    endBattle: "End Battle",
    closePanel: "Close Panel",
    actionNormal: "Normal",
    actionElement: "Element",
    actionDodge: "Dodge",
    actionUltimate: "Ultimate",
    companionTitle: "Companion Interaction",
    captureTest: "Capture Test",
    occupyTest: "Territory Test",
    pauseHit: "Pause Hit-Test",
    resumeHit: "Resume Hit-Test",
    tip: "Tip: desktop shows your pet only; enemy appears after battle starts.",
    statusPrefix: "Status",
    statusNone: "none",
    battleResetLog: "Battle started: player={player}, enemy={enemy}",
    battleRoundLog: "Round {round}: player {playerAction} vs enemy {enemyAction} | damage(player:{playerDamage}, enemy:{enemyDamage})",
    battleNotesLog: "Notes: {notes}",
    battleTickerAction: "Player {playerAction} · Enemy {enemyAction}",
    battleTickerDamage: "Damage You-{playerDamage} / Enemy-{enemyDamage}",
    battleWaiting: "Selected {playerAction}. Waiting for opponent...",
    battleAutoNormal: "No action selected in 5 seconds. Defaulted to Normal.",
    battleNoAngerDodge: "Anger is 0. Dodge is unavailable, switched to Normal.",
    battleRelationAdvantage: "Adv",
    battleRelationDisadvantage: "Weak",
    battleRelationEven: "Even",
    battleLastResult: "Last round: You {playerAction} vs Enemy {enemyAction}",
    battleTickerWinnerPlayer: "Round result: you won the duel",
    battleTickerWinnerEnemy: "Round result: enemy won the duel",
    battleTickerWinnerDraw: "Round result: draw",
    battleWinPlayer: "Battle finished: you won and can occupy territory.",
    battleWinEnemy: "Battle finished: enemy won this duel.",
    battleDraw: "Battle finished: draw.",
    battleCelebrateWin: "Victory! Great control and timing.",
    battleCelebrateLose: "Defeat this round. Regroup and strike again.",
    battleCelebrateDraw: "Balanced duel. Next round decides it.",
    battleExitLog: "Battle exited. Desktop now shows only your pet.",
    battleSettlementConfirmLog: "Settlement confirmed. Desktop now shows only your pet.",
    battleSettlementWinTitle: "Victory",
    battleSettlementLoseTitle: "Defeat",
    battleSettlementDrawTitle: "Draw",
    battleSettlementConfirm: "Confirm",
    petInteract: "Pet interaction: companion gives a gentle response.",
    actionSent: "Battle action sent.",
    activePetChanged: "Active pet switched: {petName}",
    inventoryTitle: "Pet Inventory",
    inventoryTip: "Right-click your desktop pet to open panel; click avatar then view details on the right.",
    inventoryPlaceholder: "Click an avatar on the left to view details.",
    inventoryQuickSet: "Deploy",
    inventoryQuickActive: "Active",
    inventoryFieldIndex: "Index",
    inventoryFieldSerial: "Serial",
    inventoryFieldModel: "Model",
    inventoryFieldElement: "Element",
    inventoryFieldStats: "Stats",
    inventoryFieldCapturedAt: "Captured At",
    inventoryActive: "Active",
    inventorySetActive: "Set Active",
    inventorySelectedDetail: "Pet Detail",
    battleReportTitle: "Recent Battle Reports",
    battleReportEmpty: "No reports yet. Start a battle to generate one.",
    battleReportFinished: "Finished",
    battleReportAbandoned: "Abandoned",
    battleReportPlayerWin: "Player Win",
    battleReportEnemyWin: "Enemy Win",
    battleReportDraw: "Draw",
    battleReportRound: "Round",
    battleReportStartedAt: "Started",
    captureLog: "Capture test: memory tag persisted, reward multiplier {reward}.",
    captureBurst: "Capture feedback triggered.",
    occupyNoAttempts: "Territory test: no free invade attempts left for today.",
    occupySuccess: "Territory occupied. Free attempts left: {count}.",
    occupyFail: "Invade failed. Win a duel first. Free attempts left: {count}.",
    pausedLog: "Hit-test paused (control panel still clickable).",
    resumedLog: "Hit-test resumed.",
    trayPaused: "Tray action: interaction paused.",
    trayResumed: "Tray action: interaction resumed.",
    runtimeStarted: "Desktop runtime started.",
    languageButton: "中文",
    runtimeInfo: "Electron {electron} | {platform} | App {app}",
    elementNames: {
      metal: "Metal",
      wood: "Wood",
      earth: "Earth",
      water: "Water",
      fire: "Fire"
    },
    statusNames: {
      burn: "Burn",
      freeze: "Freeze",
      parasite: "Parasite",
      vulnerability: "Vulnerability",
      petrify: "Petrify"
    },
    actionNames: {
      normal_attack: "Normal",
      element_attack: "Element",
      dodge: "Dodge",
      ultimate: "Ultimate",
      stunned: "Stunned"
    }
  }
};

const DEFAULT_PET_ROSTER = [
  {
    id: "pet-001",
    serial: "QP-202603-001",
    name: { zh: "焰尾", en: "BlazeTail" },
    model: "../assets/models/Fox.glb",
    element: "fire",
    stats: "HP128 / ATK32 / DEF20 / SPD18",
    capturedAt: "2026-03-01 21:10",
    avatar: "焰"
  },
  {
    id: "pet-002",
    serial: "QP-202603-002",
    name: { zh: "星航", en: "Astror" },
    model: "../assets/models/Astronaut.glb",
    element: "water",
    stats: "HP122 / ATK28 / DEF24 / SPD21",
    capturedAt: "2026-03-02 09:35",
    avatar: "星"
  },
  {
    id: "pet-003",
    serial: "QP-202603-003",
    name: { zh: "草蹄", en: "Hoofleaf" },
    model: "../assets/models/Horse.glb",
    element: "wood",
    stats: "HP130 / ATK26 / DEF26 / SPD17",
    capturedAt: "2026-03-02 20:42",
    avatar: "草"
  },
  {
    id: "pet-004",
    serial: "QP-202603-004",
    name: { zh: "锐铠", en: "IronGuard" },
    model: "../assets/models/CesiumMan.glb",
    element: "metal",
    stats: "HP135 / ATK30 / DEF30 / SPD12",
    capturedAt: "2026-03-03 08:20",
    avatar: "铠"
  },
  {
    id: "pet-005",
    serial: "QP-202603-005",
    name: { zh: "月壤", en: "MoonSoil" },
    model: "../assets/models/NeilArmstrong.glb",
    element: "earth",
    stats: "HP142 / ATK24 / DEF34 / SPD10",
    capturedAt: "2026-03-03 18:05",
    avatar: "壤"
  },
  {
    id: "pet-006",
    serial: "QP-202603-006",
    name: { zh: "律动", en: "Groove" },
    model: "../assets/models/RobotExpressive.glb",
    element: "fire",
    stats: "HP118 / ATK33 / DEF22 / SPD20",
    capturedAt: "2026-03-04 12:11",
    avatar: "律"
  }
];

const uiRefs = {
  appTitle: document.getElementById("app-title"),
  battleTitle: document.getElementById("battle-title"),
  playerLabel: document.getElementById("player-label"),
  enemyLabel: document.getElementById("enemy-label"),
  tagActionNormal: document.getElementById("tag-action-normal"),
  tagActionElement: document.getElementById("tag-action-element"),
  tagActionDodge: document.getElementById("tag-action-dodge"),
  tagActionUltimate: document.getElementById("tag-action-ultimate"),
  inventoryTitle: document.getElementById("inventory-title"),
  inventoryTip: document.getElementById("inventory-tip"),
  battleReportTitle: document.getElementById("battle-report-title"),
  companionTitle: document.getElementById("companion-title"),
  tipText: document.getElementById("tip-text")
};

const LANG_STORAGE_KEY = "qp_runtime_lang";

let language = getInitialLanguage();
let isPaused = false;
let isInteractive = false;
let lastHitReportAt = 0;
let frameMode = "idle";
let territoryOwner = "enemy";
let freeInvadeCount = 2;
let battleMode = false;
let lastBattleState = null;
let runtimeInfo = null;
let roundFeedQueue = [];
let roundFeedTimer = null;
let actionCountdownTimer = null;
let actionCountdownRemaining = 0;
let isRoundResolving = false;
let petRoster = DEFAULT_PET_ROSTER.map((pet) => ({ ...pet, name: { ...pet.name } }));
let activePetId = petRoster[0].id;
let enemyPetInBattle = petRoster[1];
let selectedPetDetailId = null;
let settlementWinner = null;
let battleReports = [];

const ACTION_COUNTDOWN_SECONDS = 5;

const ELEMENT_ADVANTAGE_CHAIN = {
  metal: "wood",
  wood: "earth",
  earth: "water",
  water: "fire",
  fire: "metal"
};

function getInitialLanguage() {
  const stored = localStorage.getItem(LANG_STORAGE_KEY);
  if (stored === "en" || stored === "zh") return stored;
  return "zh";
}

function currentI18n() {
  return i18n[language];
}

function t(key, params) {
  const template = currentI18n()[key];
  if (typeof template !== "string") return String(template ?? key);
  return template.replace(/\{(\w+)\}/g, (_, token) => String(params?.[token] ?? ""));
}

function appendLog(text) {
  const time = new Date().toLocaleTimeString();
  const current = logElement.textContent || "";
  logElement.textContent = `[${time}] ${text}\n${current}`.trim();
}

function setPanelVisible(visible) {
  if (visible) {
    panelElement.classList.remove("hidden");
    battleSceneElement.classList.add("panel-open");
  } else {
    panelElement.classList.add("hidden");
    battleSceneElement.classList.remove("panel-open");
  }
  reportHitState();
}

function updatePetClass() {
  playerCard.classList.toggle("interacting", frameMode === "interacting");
  playerCard.classList.toggle("paused", isPaused);
}

function reportHitState() {
  const x = window.__lastMouseX ?? 0;
  const y = window.__lastMouseY ?? 0;

  const insidePlayer = isPointInsideRect(x, y, playerCard.getBoundingClientRect());
  const insideEnemy =
    battleMode && !enemyCard.classList.contains("hidden")
      ? isPointInsideRect(x, y, enemyCard.getBoundingClientRect())
      : false;

  const panelVisible = !panelElement.classList.contains("hidden");
  const insidePanel = panelVisible && isPointInsideRect(x, y, panelElement.getBoundingClientRect());
  const settlementVisible = Boolean(
    battleSettlementElement && !battleSettlementElement.classList.contains("hidden")
  );
  const insideSettlement =
    settlementVisible && isPointInsideRect(x, y, battleSettlementElement.getBoundingClientRect());
  const insidePlayerHud = isPointInsideRect(x, y, playerHudElement.getBoundingClientRect());
  const insideEnemyHud =
    battleMode && !enemyHudElement.classList.contains("hidden")
      ? isPointInsideRect(x, y, enemyHudElement.getBoundingClientRect())
      : false;
  const insideActionTags =
    battleMode &&
    !battleActionTagsElement.classList.contains("hidden") &&
    isPointInsideRect(x, y, battleActionTagsElement.getBoundingClientRect());

  const insideBattleActors = insidePlayer || insideEnemy;
  const insideHud = insidePlayerHud || insideEnemyHud;
  const insideControls = insidePanel || insideActionTags || insideHud || insideSettlement;
  const insideInteractiveRegion = battleMode
    ? true
    : insideControls || (!isPaused && insideBattleActors);

  const now = Date.now();
  if (now - lastHitReportAt > 30) {
    window.petApi.setHitRegion(insideInteractiveRegion);
    lastHitReportAt = now;
  }
}

function isPointInsideRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function formatStatuses(statuses) {
  if (!statuses || statuses.length === 0) return currentI18n().statusNone;
  return statuses
    .map((item) => {
      const statusName = currentI18n().statusNames[item.type] ?? item.type;
      const stacks = Math.max(1, Number(item.stacks ?? 1));
      return `${statusName}${stacks}`;
    })
    .join(", ");
}

function formatAction(action) {
  return currentI18n().actionNames[action] ?? action;
}

function getElementText(element) {
  return currentI18n().elementNames[element] ?? element;
}

function setElementTagTheme(elementNode, element) {
  for (const cls of [...elementNode.classList]) {
    if (cls.startsWith("element-")) elementNode.classList.remove(cls);
  }
  elementNode.classList.add(`element-${element}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDotColor(type) {
  if (type === "burn") return "#ffb07a";
  if (type === "parasite") return "#9ff09a";
  return "#cfe6ff";
}

function getElementColor(element) {
  if (element === "fire") return "#ff8e8e";
  if (element === "water") return "#8dc9ff";
  if (element === "wood") return "#9ee8a1";
  if (element === "metal") return "#e6edf5";
  if (element === "earth") return "#ffd39a";
  return "#93e4ff";
}

function getElementMultiplier(attacker, defender) {
  if (ELEMENT_ADVANTAGE_CHAIN[attacker] === defender) return 1.5;
  if (ELEMENT_ADVANTAGE_CHAIN[defender] === attacker) return 0.7;
  return 1;
}

function getBattleRelationText(playerElement, enemyElement) {
  const multiplier = getElementMultiplier(playerElement, enemyElement);
  if (multiplier > 1) return currentI18n().battleRelationAdvantage;
  if (multiplier < 1) return currentI18n().battleRelationDisadvantage;
  return currentI18n().battleRelationEven;
}

function getBattleRelationTone(playerElement, enemyElement) {
  const multiplier = getElementMultiplier(playerElement, enemyElement);
  if (multiplier > 1) return "advantage";
  if (multiplier < 1) return "disadvantage";
  return "even";
}

function updateBattleRelationTag(playerElement, enemyElement) {
  if (!battleMode || !playerElement || !enemyElement) {
    battleVsElement.classList.add("hidden");
    battleVsElement.classList.remove("advantage", "disadvantage", "even");
    battleVsElement.textContent = "";
    return;
  }

  const tone = getBattleRelationTone(playerElement, enemyElement);
  battleVsElement.classList.remove("hidden", "advantage", "disadvantage", "even");
  battleVsElement.classList.add(tone);
  battleVsElement.textContent = getBattleRelationText(playerElement, enemyElement);
}

function hideBattleCountdown() {
  if (battleCountdownElement) {
    battleCountdownElement.classList.add("hidden");
  }
  if (battleCountdownValueElement) {
    battleCountdownValueElement.textContent = "";
  }
}

function updateBattleCountdown(value) {
  if (!battleCountdownElement || !battleCountdownValueElement) return;
  battleCountdownElement.classList.remove("hidden");
  battleCountdownValueElement.textContent = `${value}`;
}

function getRoster() {
  return petRoster.length > 0 ? petRoster : DEFAULT_PET_ROSTER;
}

function applyInventorySnapshot(snapshot) {
  const incomingPets = Array.isArray(snapshot?.pets) ? snapshot.pets : [];
  const normalizedPets = incomingPets.length > 0 ? incomingPets : DEFAULT_PET_ROSTER;
  petRoster = normalizedPets.map((pet) => ({
    ...pet,
    name: { ...(pet.name || {}) }
  }));

  const fallbackActivePetId = petRoster[0]?.id ?? DEFAULT_PET_ROSTER[0].id;
  const incomingActivePetId =
    typeof snapshot?.activePetId === "string" ? snapshot.activePetId : fallbackActivePetId;
  activePetId = petRoster.some((pet) => pet.id === incomingActivePetId)
    ? incomingActivePetId
    : fallbackActivePetId;

  if (!petRoster.some((pet) => pet.id === enemyPetInBattle?.id)) {
    enemyPetInBattle = petRoster[1] || petRoster[0];
  }
  if (selectedPetDetailId && !petRoster.some((pet) => pet.id === selectedPetDetailId)) {
    selectedPetDetailId = null;
  }
}

async function loadInventorySnapshot() {
  try {
    const snapshot = await window.petApi.getPetInventory();
    applyInventorySnapshot(snapshot);
  } catch {
    applyInventorySnapshot({
      pets: DEFAULT_PET_ROSTER,
      activePetId: DEFAULT_PET_ROSTER[0].id
    });
  }
}

function getActivePet() {
  const roster = getRoster();
  return roster.find((pet) => pet.id === activePetId) || roster[0];
}

function getEnemyCandidates() {
  return getRoster().filter((pet) => pet.id !== activePetId);
}

function chooseEnemyPetForBattle() {
  const candidates = getEnemyCandidates();
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx] || getRoster()[0];
}

function getPetDisplayName(pet) {
  return language === "zh" ? pet.name.zh : pet.name.en;
}

function getPetById(petId) {
  const roster = getRoster();
  return roster.find((pet) => pet.id === petId) || roster[0];
}

function getStatTone(token) {
  const key = token.toUpperCase();
  if (key.startsWith("HP")) return "hp";
  if (key.startsWith("ATK")) return "atk";
  if (key.startsWith("DEF")) return "def";
  if (key.startsWith("SPD")) return "spd";
  return "neutral";
}

function renderStatTagHtml(statsText) {
  return statsText
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((token) => `<span class="pet-stat-chip ${getStatTone(token)}">${token}</span>`)
    .join("");
}

async function setActivePet(petId, options = {}) {
  const pet = getPetById(petId);
  if (pet.id === activePetId) return;
  const previousActivePetId = activePetId;
  activePetId = pet.id;

  try {
    const snapshot = await window.petApi.setActivePet(pet.id);
    applyInventorySnapshot(snapshot);
  } catch {
    activePetId = previousActivePetId;
    return;
  }

  const activePet = getActivePet();
  playerModel.src = activePet.model;
  playerElementLabel.textContent = getElementText(activePet.element);
  setElementTagTheme(playerElementLabel, activePet.element);
  appendLog(t("activePetChanged", { petName: getPetDisplayName(activePet) }));
  renderPetInventory();
  renderPetDetail();
  if (options.closePanel) {
    setPanelVisible(false);
  }
}

function renderPetDetail() {
  if (!petDetailElement) return;
  if (!selectedPetDetailId) {
    petDetailElement.classList.add("hidden");
    petDetailElement.innerHTML = "";
    if (petDetailPlaceholderElement) {
      petDetailPlaceholderElement.classList.remove("hidden");
      petDetailPlaceholderElement.textContent = currentI18n().inventoryPlaceholder;
    }
    return;
  }
  const pet = getPetById(selectedPetDetailId);
  const isActive = pet.id === activePetId;
  const elementName = getElementText(pet.element);
  const displayName = getPetDisplayName(pet);
  const index = getRoster().findIndex((item) => item.id === pet.id) + 1;
  const modelName = pet.model.split("/").pop();
  const statTags = renderStatTagHtml(pet.stats);

  petDetailElement.classList.remove("hidden");
  if (petDetailPlaceholderElement) {
    petDetailPlaceholderElement.classList.add("hidden");
  }
  petDetailElement.innerHTML = `
    <div class="pet-detail-head">
      <span class="pet-detail-name">${currentI18n().inventorySelectedDetail} · ${displayName}</span>
      <div class="pet-detail-tags">
        <span class="pet-meta-chip serial">#${index}</span>
        <span class="pet-meta-chip model">${modelName}</span>
        <span class="pet-meta-chip element element-${pet.element}">${elementName}</span>
      </div>
    </div>
    <div class="pet-detail-meta">
      <span><b>${currentI18n().inventoryFieldSerial}:</b> ${pet.serial}</span>
      <span><b>${currentI18n().inventoryFieldCapturedAt}:</b> ${pet.capturedAt}</span>
      <span><b>${currentI18n().inventoryFieldStats}:</b></span>
      <div class="pet-stat-chip-row">${statTags}</div>
    </div>
    <div class="pet-detail-actions">
      <button id="btn-set-active-pet" ${isActive ? "disabled" : ""}>${currentI18n().inventorySetActive}</button>
    </div>
  `;

  const setActiveBtn = document.getElementById("btn-set-active-pet");
  if (setActiveBtn) {
    setActiveBtn.addEventListener("click", () => {
      void setActivePet(pet.id);
    });
  }
}

function renderPetInventory() {
  if (!inventoryListElement) return;
  const activePet = getActivePet();
  inventoryListElement.innerHTML = "";

  getRoster().forEach((pet) => {
    const isActive = pet.id === activePet.id;
    const isSelected = selectedPetDetailId === pet.id;
    const elementName = getElementText(pet.element);
    const displayName = getPetDisplayName(pet);
    const avatar = pet.avatar || displayName.slice(0, 1).toUpperCase();
    const entry = document.createElement("div");
    entry.className = `pet-avatar-entry${isSelected ? " selected" : ""}`;
    entry.innerHTML = `
      <button
        type="button"
        class="pet-avatar-item${isActive ? " active" : ""}${isSelected ? " selected" : ""}"
        data-pet-id="${pet.id}"
        title="${displayName} · ${elementName}"
        aria-label="${displayName} ${elementName}"
      >
        <span class="pet-avatar">${avatar}</span>
        ${isActive ? "<span class=\"pet-avatar-active\"></span>" : ""}
      </button>
      ${
        isSelected
          ? isActive
            ? `<span class="pet-quick-active">${currentI18n().inventoryQuickActive}</span>`
            : `<button type="button" class="pet-quick-set">${currentI18n().inventoryQuickSet}</button>`
          : "<span class=\"pet-quick-placeholder\"></span>"
      }
    `;

    const avatarBtn = entry.querySelector(".pet-avatar-item");
    avatarBtn?.addEventListener("click", () => {
      selectedPetDetailId = pet.id;
      renderPetInventory();
      renderPetDetail();
    });

    const quickSetBtn = entry.querySelector(".pet-quick-set");
    quickSetBtn?.addEventListener("click", (event) => {
      event.stopPropagation();
      void setActivePet(pet.id, { closePanel: true });
    });

    inventoryListElement.appendChild(entry);
  });

  renderPetDetail();
}

function formatReportTime(value) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value || "-";
  const date = new Date(parsed);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function getBattleReportWinnerText(report) {
  if (report.winner === "player") return currentI18n().battleReportPlayerWin;
  if (report.winner === "enemy") return currentI18n().battleReportEnemyWin;
  return currentI18n().battleReportDraw;
}

function renderBattleReports() {
  if (!battleReportListElement) return;
  if (!battleReports || battleReports.length === 0) {
    battleReportListElement.innerHTML = `<div class="battle-report-empty">${currentI18n().battleReportEmpty}</div>`;
    return;
  }

  battleReportListElement.innerHTML = battleReports
    .map((report) => {
      const finished = report.status === "finished";
      const statusLabel = finished
        ? currentI18n().battleReportFinished
        : currentI18n().battleReportAbandoned;
      const winnerLabel = finished ? getBattleReportWinnerText(report) : "-";
      const statusClass = finished ? "finished" : "abandoned";
      const winnerClass =
        report.winner === "player"
          ? "player-win"
          : report.winner === "enemy"
            ? "enemy-win"
            : report.winner === "draw"
              ? "draw"
              : "neutral";
      return `
        <article class="battle-report-item ${statusClass}">
          <div class="battle-report-head">
            <span class="battle-report-status ${statusClass}">${statusLabel}</span>
            <span class="battle-report-time">${currentI18n().battleReportStartedAt}: ${formatReportTime(report.startedAt)}</span>
          </div>
          <div class="battle-report-main">
            <span class="battle-report-side">${report.player.petName || "Player"}</span>
            <span class="battle-report-vs">VS</span>
            <span class="battle-report-side">${report.enemy.petName || "Enemy"}</span>
          </div>
          <div class="battle-report-foot">
            <span class="battle-report-round">${currentI18n().battleReportRound}: ${report.totalRounds}</span>
            <span class="battle-report-winner ${winnerClass}">${winnerLabel}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

async function refreshBattleReports(limit = 8) {
  try {
    const reports = await window.petApi.getBattleReports(limit);
    battleReports = Array.isArray(reports) ? reports : [];
  } catch {
    battleReports = [];
  }
  renderBattleReports();
}

function setLanguage(nextLanguage) {
  language = nextLanguage;
  localStorage.setItem(LANG_STORAGE_KEY, language);
  applyLanguage();
  renderRuntimeInfo();
  if (lastBattleState) updateBattleBoard(lastBattleState);
}

function toggleLanguage() {
  setLanguage(language === "zh" ? "en" : "zh");
}

function applyLanguage() {
  uiRefs.appTitle.textContent = currentI18n().appTitle;
  uiRefs.battleTitle.textContent = currentI18n().battleTitle;
  const activePet = getActivePet();
  uiRefs.playerLabel.textContent = `${currentI18n().playerPet} · ${getPetDisplayName(activePet)}`;
  uiRefs.enemyLabel.textContent = `${currentI18n().enemyPet} · ${getPetDisplayName(enemyPetInBattle)}`;
  battleResetBtn.textContent = currentI18n().resetBattle;
  endBattleBtn.textContent = currentI18n().endBattle;
  closePanelBtn.title = currentI18n().closePanel;
  closePanelBtn.setAttribute("aria-label", currentI18n().closePanel);
  uiRefs.tagActionNormal.textContent = currentI18n().actionNormal;
  uiRefs.tagActionElement.textContent = currentI18n().actionElement;
  uiRefs.tagActionDodge.textContent = currentI18n().actionDodge;
  uiRefs.tagActionUltimate.textContent = currentI18n().actionUltimate;
  uiRefs.inventoryTitle.textContent = currentI18n().inventoryTitle;
  uiRefs.inventoryTip.textContent = currentI18n().inventoryTip;
  uiRefs.battleReportTitle.textContent = currentI18n().battleReportTitle;
  uiRefs.companionTitle.textContent = currentI18n().companionTitle;
  captureBtn.textContent = currentI18n().captureTest;
  occupyBtn.textContent = currentI18n().occupyTest;
  uiRefs.tipText.textContent = currentI18n().tip;
  updatePauseText();
  languageBtn.textContent = currentI18n().languageButton;
  if (settlementConfirmBtn) {
    settlementConfirmBtn.textContent = currentI18n().battleSettlementConfirm;
  }
  playerElementLabel.textContent = getElementText(activePet.element);
  enemyElementLabel.textContent = getElementText(enemyPetInBattle.element);
  setElementTagTheme(playerElementLabel, activePet.element);
  setElementTagTheme(enemyElementLabel, enemyPetInBattle.element);
  renderPetInventory();
  renderBattleReports();
  syncBattleSettlementText();

  if (!runtimeInfo) {
    runtimeElement.textContent = currentI18n().loadingRuntime;
  }
}

function renderRuntimeInfo() {
  if (!runtimeInfo) {
    runtimeElement.textContent = currentI18n().loadingRuntime;
    return;
  }
  runtimeElement.textContent = t("runtimeInfo", {
    electron: runtimeInfo.electronVersion,
    platform: runtimeInfo.platform,
    app: runtimeInfo.appVersion
  });
}

function getBattleSettlementCopy(winner) {
  if (winner === "player") {
    return {
      theme: "win",
      title: currentI18n().battleSettlementWinTitle,
      subtitle: currentI18n().battleCelebrateWin
    };
  }
  if (winner === "enemy") {
    return {
      theme: "lose",
      title: currentI18n().battleSettlementLoseTitle,
      subtitle: currentI18n().battleCelebrateLose
    };
  }
  return {
    theme: "draw",
    title: currentI18n().battleSettlementDrawTitle,
    subtitle: currentI18n().battleCelebrateDraw
  };
}

function syncBattleSettlementText() {
  if (!settlementWinner || !battleSettlementTitleElement || !battleSettlementSubtitleElement) return;
  const copy = getBattleSettlementCopy(settlementWinner);
  battleSettlementTitleElement.textContent = copy.title;
  battleSettlementSubtitleElement.textContent = copy.subtitle;
}

function showBattleSettlement(winner) {
  if (!battleSettlementElement || !battleSettlementTitleElement || !battleSettlementSubtitleElement) {
    return;
  }
  settlementWinner = winner;
  const copy = getBattleSettlementCopy(winner);
  battleSettlementElement.classList.remove("hidden", "show", "win", "lose", "draw");
  battleSettlementElement.classList.add(copy.theme);
  battleSettlementTitleElement.textContent = copy.title;
  battleSettlementSubtitleElement.textContent = copy.subtitle;
  requestAnimationFrame(() => {
    battleSettlementElement.classList.add("show");
  });
}

function hideBattleSettlement() {
  if (!battleSettlementElement) return;
  settlementWinner = null;
  battleSettlementElement.classList.remove("show", "win", "lose", "draw");
  battleSettlementElement.classList.add("hidden");
}

function setBattleMode(active) {
  battleMode = active;
  battleSceneElement.classList.toggle("battle-mode", active);
  roundFeedElement.classList.toggle("hidden", !active);
  lastRoundResultElement.classList.toggle("hidden", !active);
  enemyCard.classList.toggle("hidden", !active);
  enemyHudElement.classList.toggle("hidden", !active);
  battleActionTagsElement.classList.toggle("hidden", !active);
  if (!active) {
    clearActionCountdown();
    isRoundResolving = false;
    setActiveActionTag("");
    clearRoundFeed();
    lastRoundResultElement.textContent = "";
    updateBattleRelationTag(null, null);
    hideBattleCountdown();
    hideBattleSettlement();
  } else {
    updateBattleRelationTag(lastBattleState?.player?.element, lastBattleState?.enemy?.element);
  }
  void window.petApi.setLayoutMode(active ? "battle" : "idle");
  syncActionButtons();
  if (active && !isPaused) {
    window.petApi.setHitRegion(true);
  } else {
    reportHitState();
  }
}

function updateBar(fillElement, valueElement, current, max, formatter) {
  const safeMax = Math.max(1, max);
  const ratio = Math.max(0, Math.min(1, current / safeMax));
  fillElement.style.width = `${Math.round(ratio * 100)}%`;
  valueElement.textContent = formatter(current, max);
}

function clearRoundFeed() {
  roundFeedQueue = [];
  if (roundFeedTimer) {
    clearTimeout(roundFeedTimer);
    roundFeedTimer = null;
  }
  roundFeedElement.classList.remove("show");
  roundFeedElement.textContent = "";
}

function playNextRoundFeed() {
  if (roundFeedQueue.length === 0) {
    roundFeedTimer = null;
    roundFeedElement.classList.remove("show");
    roundFeedElement.textContent = "";
    return;
  }

  const message = roundFeedQueue.shift();
  roundFeedElement.textContent = message;
  roundFeedElement.classList.remove("show");
  requestAnimationFrame(() => {
    roundFeedElement.classList.add("show");
  });
  roundFeedTimer = setTimeout(() => {
    playNextRoundFeed();
  }, 1150);
}

function enqueueRoundFeed(messages) {
  const list = messages.filter((item) => typeof item === "string" && item.trim().length > 0);
  if (list.length === 0) return;
  roundFeedQueue.push(...list);
  if (!roundFeedTimer) {
    playNextRoundFeed();
  }
}

function clearActionCountdown() {
  if (actionCountdownTimer) {
    clearInterval(actionCountdownTimer);
    actionCountdownTimer = null;
  }
  actionCountdownRemaining = 0;
  hideBattleCountdown();
}

function startActionCountdown() {
  clearActionCountdown();
  if (!battleMode || isRoundResolving || isBattleFinished(lastBattleState)) {
    hideBattleCountdown();
    return;
  }

  updateBattleRelationTag(lastBattleState?.player?.element, lastBattleState?.enemy?.element);
  actionCountdownRemaining = ACTION_COUNTDOWN_SECONDS;
  updateBattleCountdown(actionCountdownRemaining);

  actionCountdownTimer = setInterval(() => {
    if (!battleMode || isRoundResolving || isBattleFinished(lastBattleState)) {
      clearActionCountdown();
      return;
    }

    actionCountdownRemaining -= 1;
    if (actionCountdownRemaining <= 0) {
      clearActionCountdown();
      appendLog(t("battleAutoNormal"));
      void actBattle("normal_attack", { auto: true });
      return;
    }
    updateBattleCountdown(actionCountdownRemaining);
  }, 1000);
}

function isBattleFinished(state) {
  return Boolean(state) && (state.player.hp <= 0 || state.enemy.hp <= 0);
}

function syncActionButtons() {
  const disabled = !battleMode || isBattleFinished(lastBattleState) || isRoundResolving;
  const playerAnger = lastBattleState?.player?.anger ?? 0;
  for (const button of battleActionButtons) {
    const isDodgeAction = button.dataset.action === "dodge";
    const isUltimateAction = button.dataset.action === "ultimate";
    button.disabled =
      disabled || (isDodgeAction && playerAnger <= 0) || (isUltimateAction && playerAnger < 100);
  }
}

function setActiveActionTag(action) {
  for (const button of stageBattleActionButtons) {
    button.classList.toggle("active", button.dataset.action === action);
  }
}

function updateBattleBoard(state) {
  if (!state) return;
  lastBattleState = state;
  const activePet = getActivePet();

  battleRoundElement.textContent = `${currentI18n().round}: ${state.round}`;

  updateBar(hpFillPlayer, hpValuePlayer, state.player.hp, state.player.maxHp, (v, m) => `${v}/${m}`);
  updateBar(hpFillEnemy, hpValueEnemy, state.enemy.hp, state.enemy.maxHp, (v, m) => `${v}/${m}`);
  updateBar(angerFillPlayer, angerValuePlayer, state.player.anger, 100, (v) => `${v}%`);
  updateBar(angerFillEnemy, angerValueEnemy, state.enemy.anger, 100, (v) => `${v}%`);

  playerElementLabel.textContent = getElementText(state.player.element);
  enemyElementLabel.textContent = getElementText(state.enemy.element);
  setElementTagTheme(playerElementLabel, state.player.element);
  setElementTagTheme(enemyElementLabel, state.enemy.element);
  updateBattleRelationTag(state.player.element, state.enemy.element);
  uiRefs.playerLabel.textContent = `${currentI18n().playerPet} · ${getPetDisplayName(activePet)}`;
  uiRefs.enemyLabel.textContent = `${currentI18n().enemyPet} · ${getPetDisplayName(enemyPetInBattle)}`;

  statusPlayerElement.textContent = formatStatuses(state.player.statuses);
  statusEnemyElement.textContent = formatStatuses(state.enemy.statuses);

  syncActionButtons();
}

function setBurstInteraction(message) {
  frameMode = "interacting";
  updatePetClass();
  appendLog(message);
  setTimeout(() => {
    if (!isInteractive) {
      frameMode = "idle";
      updatePetClass();
    }
  }, 800);
}

function updatePauseText() {
  pauseBtn.textContent = isPaused ? currentI18n().resumeHit : currentI18n().pauseHit;
}

function playModelAnimation(modelElement, preferredNames) {
  const names = modelElement.availableAnimations || [];
  if (names.length === 0) return;

  const preferred = preferredNames
    .map((name) => names.find((candidate) => candidate.toLowerCase().includes(name.toLowerCase())))
    .find(Boolean);
  modelElement.animationName = preferred || names[0];
  modelElement.play();
}

function animateDefenderHit(defender) {
  defender.classList.add("hit");
  setTimeout(() => defender.classList.remove("hit"), 320);
}

function animateBattleCards(attacker, defender, options = {}) {
  const isPlayer = attacker === playerCard;
  const lungeX = isPlayer ? 34 : -34;
  const lift = options.heavy ? -6 : -4;
  const scale = options.heavy ? 1.1 : 1.07;
  attacker.animate(
    [
      { transform: "translateX(0) translateY(0) scale(1)" },
      { transform: `translateX(${lungeX}px) translateY(${lift}px) scale(${scale})` },
      { transform: "translateX(0) translateY(0) scale(1)" }
    ],
    {
      duration: options.heavy ? 360 : 300,
      easing: "cubic-bezier(0.22, 0.68, 0.32, 1)"
    }
  );
  animateDefenderHit(defender);
}

function animateCasterChant(target) {
  target.animate(
    [
      { transform: "translateY(0) scale(1)" },
      { transform: "translateY(-7px) scale(1.04)" },
      { transform: "translateY(0) scale(1)" }
    ],
    {
      duration: 420,
      easing: "ease-out"
    }
  );
}

function spawnCastAura(target, element) {
  const anchor = target === "player" ? playerCard : enemyCard;
  const sceneRect = battleFxElement.getBoundingClientRect();
  const rect = anchor.getBoundingClientRect();
  const x = rect.left - sceneRect.left + rect.width / 2;
  const y = rect.top - sceneRect.top + rect.height * 0.45;

  const aura = document.createElement("span");
  aura.className = "cast-aura";
  const color = getElementColor(element);
  aura.style.left = `${x}px`;
  aura.style.top = `${y}px`;
  aura.style.borderColor = `${color}dd`;
  aura.style.boxShadow = `0 0 14px ${color}`;

  battleFxElement.appendChild(aura);
  requestAnimationFrame(() => aura.classList.add("show"));
  setTimeout(() => aura.remove(), 560);
}

function spawnDamagePopup(target, amount, options = {}) {
  if (amount <= 0) return;
  const anchor = target === "player" ? playerCard : enemyCard;
  const sceneRect = battleFxElement.getBoundingClientRect();
  const rect = anchor.getBoundingClientRect();

  const popup = document.createElement("span");
  popup.className = "damage-popup";
  popup.textContent = `${options.prefix ?? "-"}${amount}`;
  if (options.color) popup.style.color = options.color;
  popup.style.left = `${rect.left - sceneRect.left + rect.width / 2}px`;
  popup.style.top = `${rect.top - sceneRect.top + (options.offsetY ?? 20)}px`;

  battleFxElement.appendChild(popup);
  requestAnimationFrame(() => popup.classList.add("show"));
  setTimeout(() => popup.remove(), options.duration ?? 700);
}

function spawnMissPopup(target) {
  const anchor = target === "player" ? playerCard : enemyCard;
  const sceneRect = battleFxElement.getBoundingClientRect();
  const rect = anchor.getBoundingClientRect();

  const popup = document.createElement("span");
  popup.className = "damage-popup";
  popup.textContent = "MISS";
  popup.style.color = "#d6f0ff";
  popup.style.left = `${rect.left - sceneRect.left + rect.width / 2}px`;
  popup.style.top = `${rect.top - sceneRect.top + 22}px`;

  battleFxElement.appendChild(popup);
  requestAnimationFrame(() => popup.classList.add("show"));
  setTimeout(() => popup.remove(), 620);
}

function spawnAttackTrail(attacker, defender, action) {
  const attackerCard = attacker === "player" ? playerCard : enemyCard;
  const defenderCard = defender === "player" ? playerCard : enemyCard;
  const sceneRect = battleFxElement.getBoundingClientRect();
  const fromRect = attackerCard.getBoundingClientRect();
  const toRect = defenderCard.getBoundingClientRect();

  const fromX = fromRect.left - sceneRect.left + fromRect.width / 2;
  const fromY = fromRect.top - sceneRect.top + fromRect.height * 0.42;
  const toX = toRect.left - sceneRect.left + toRect.width / 2;
  const toY = toRect.top - sceneRect.top + toRect.height * 0.42;
  const distance = Math.hypot(toX - fromX, toY - fromY);
  const angle = (Math.atan2(toY - fromY, toX - fromX) * 180) / Math.PI;

  const trail = document.createElement("span");
  trail.className = `attack-trail ${attacker}${action === "ultimate" ? " ultimate" : ""}`;
  trail.style.left = `${fromX}px`;
  trail.style.top = `${fromY}px`;
  trail.style.width = `${Math.max(40, distance)}px`;
  trail.style.setProperty("--trail-angle", `${angle}deg`);

  battleFxElement.appendChild(trail);
  requestAnimationFrame(() => trail.classList.add("show"));
  setTimeout(() => trail.remove(), 420);
}

function spawnImpactBurst(target, action) {
  const targetCard = target === "player" ? playerCard : enemyCard;
  const sceneRect = battleFxElement.getBoundingClientRect();
  const rect = targetCard.getBoundingClientRect();
  const x = rect.left - sceneRect.left + rect.width / 2;
  const y = rect.top - sceneRect.top + rect.height * 0.42;

  const ring = document.createElement("span");
  ring.className = "impact-ring";
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  if (action === "ultimate") {
    ring.style.borderColor = "rgba(255, 227, 141, 0.98)";
  }
  battleFxElement.appendChild(ring);
  requestAnimationFrame(() => ring.classList.add("show"));
  setTimeout(() => ring.remove(), 360);

  const sparkCount = action === "ultimate" ? 8 : 5;
  for (let i = 0; i < sparkCount; i += 1) {
    const spark = document.createElement("span");
    spark.className = "hit-spark";
    spark.style.left = `${x}px`;
    spark.style.top = `${y}px`;
    const angle = -70 + (i * 140) / Math.max(1, sparkCount - 1) + (Math.random() * 18 - 9);
    spark.style.setProperty("--spark-angle", `${angle}deg`);
    battleFxElement.appendChild(spark);
    requestAnimationFrame(() => spark.classList.add("show"));
    setTimeout(() => spark.remove(), 460);
  }
}

function triggerSceneShake(level) {
  const className = level === "heavy" ? "shake-heavy" : "shake-light";
  battleSceneElement.classList.remove("shake-light", "shake-heavy");
  requestAnimationFrame(() => {
    battleSceneElement.classList.add(className);
  });
  setTimeout(() => {
    battleSceneElement.classList.remove(className);
  }, level === "heavy" ? 360 : 280);
}

function triggerBattleModelAnimation(action, target) {
  if (target === "player") {
    if (action === "element_attack") {
      playModelAnimation(playerModel, ["survey", "idle", "stand"]);
      return;
    }
    if (action === "dodge") {
      playModelAnimation(playerModel, ["idle", "stand", "survey"]);
      return;
    }
    if (action === "ultimate") {
      playModelAnimation(playerModel, ["run", "walk", "survey"]);
      return;
    }
    playModelAnimation(playerModel, ["walk", "run", "bite", "attack", "survey"]);
    return;
  }

  if (action === "element_attack") {
    playModelAnimation(enemyModel, ["idle", "stand", "walk"]);
    return;
  }
  if (action === "dodge") {
    playModelAnimation(enemyModel, ["idle", "stand", "walk"]);
    return;
  }
  if (action === "ultimate") {
    playModelAnimation(enemyModel, ["run", "walk", "idle"]);
    return;
  }
  playModelAnimation(enemyModel, ["walk", "run", "attack", "idle"]);
}

async function resetBattle() {
  clearActionCountdown();
  isRoundResolving = false;
  hideBattleSettlement();
  setBattleMode(true);
  clearRoundFeed();
  lastRoundResultElement.textContent = "";
  setPanelVisible(false);

  const activePet = getActivePet();
  enemyPetInBattle = chooseEnemyPetForBattle();
  playerModel.src = activePet.model;
  enemyModel.src = enemyPetInBattle.model;

  const playerElement = activePet.element;
  const enemyElement = enemyPetInBattle.element;
  const state = await window.petApi.battleReset({
    playerElement,
    enemyElement,
    playerPetId: activePet.id,
    enemyPetId: enemyPetInBattle.id,
    playerPetName: getPetDisplayName(activePet),
    enemyPetName: getPetDisplayName(enemyPetInBattle)
  });

  territoryOwner = "enemy";
  updateBattleBoard(state);
  setActiveActionTag("");
  startActionCountdown();
  appendLog(
    t("battleResetLog", {
      player: `${getPetDisplayName(activePet)}(${getElementText(playerElement)})`,
      enemy: `${getPetDisplayName(enemyPetInBattle)}(${getElementText(enemyElement)})`
    })
  );
}

async function endBattle(manual = true) {
  try {
    await window.petApi.battleEnd();
  } catch {
    // Keep runtime flow non-blocking even if persistence fails.
  }
  clearActionCountdown();
  isRoundResolving = false;
  hideBattleSettlement();
  setBattleMode(false);
  syncActionButtons();
  appendLog(manual ? t("battleExitLog") : t("battleSettlementConfirmLog"));
  void refreshBattleReports();
}

async function actBattle(action, options = {}) {
  if (!battleMode) {
    setBattleMode(true);
  }
  if (isRoundResolving) return;

  let resolvedAction = options.auto ? "normal_attack" : action;
  if (resolvedAction === "dodge" && (lastBattleState?.player?.anger ?? 0) <= 0) {
    resolvedAction = "normal_attack";
    appendLog(t("battleNoAngerDodge"));
  }

  clearActionCountdown();
  hideBattleCountdown();

  isRoundResolving = true;
  syncActionButtons();

  setActiveActionTag(resolvedAction);
  clearRoundFeed();
  enqueueRoundFeed([t("battleWaiting", { playerAction: formatAction(resolvedAction) })]);

  let hasWinner = false;
  try {
    const startAt = Date.now();
    const result = await window.petApi.battleAct(resolvedAction);
    const elapsed = Date.now() - startAt;
    if (elapsed < 220) {
      await sleep(220 - elapsed);
    }
    const round = result.roundResult;
    const directDamage = round.directDamage || round.damageTaken;
    const dotDamageEvents = round.dotDamageEvents || { player: [], enemy: [] };
    const healEvents = round.healEvents || { player: [], enemy: [] };
    const totalDamage = round.damageTaken.player + round.damageTaken.enemy;
    const playerElement = result.state.player.element;
    const enemyElement = result.state.enemy.element;

    triggerBattleModelAnimation(result.playerAction, "player");
    triggerBattleModelAnimation(result.enemyAction, "enemy");

    const playerDidAttack = result.playerAction !== "dodge" && result.playerAction !== "stunned";
    const enemyDidAttack = result.enemyAction !== "dodge" && result.enemyAction !== "stunned";

    if (playerDidAttack) {
      if (result.playerAction === "element_attack") {
        animateCasterChant(playerCard);
        spawnCastAura("player", playerElement);
      }
      spawnAttackTrail("player", "enemy", result.playerAction);
    }
    if (enemyDidAttack) {
      if (result.enemyAction === "element_attack") {
        animateCasterChant(enemyCard);
        spawnCastAura("enemy", enemyElement);
      }
      spawnAttackTrail("enemy", "player", result.enemyAction);
    }

    if (directDamage.enemy > 0) {
      if (result.playerAction === "element_attack") {
        animateDefenderHit(enemyCard);
      } else {
        animateBattleCards(playerCard, enemyCard, { heavy: result.playerAction === "ultimate" });
      }
      spawnImpactBurst("enemy", result.playerAction);
      spawnDamagePopup("enemy", directDamage.enemy);
    } else if (playerDidAttack) {
      spawnMissPopup("enemy");
    }
    if (directDamage.player > 0) {
      if (result.enemyAction === "element_attack") {
        animateDefenderHit(playerCard);
      } else {
        animateBattleCards(enemyCard, playerCard, { heavy: result.enemyAction === "ultimate" });
      }
      spawnImpactBurst("player", result.enemyAction);
      spawnDamagePopup("player", directDamage.player);
    } else if (enemyDidAttack) {
      spawnMissPopup("player");
    }

    dotDamageEvents.enemy.forEach((event, idx) => {
      spawnDamagePopup("enemy", event.amount, {
        color: getDotColor(event.type),
        offsetY: 36 + idx * 12,
        duration: 760
      });
    });
    dotDamageEvents.player.forEach((event, idx) => {
      spawnDamagePopup("player", event.amount, {
        color: getDotColor(event.type),
        offsetY: 36 + idx * 12,
        duration: 760
      });
    });
    healEvents.player.forEach((event, idx) => {
      spawnDamagePopup("player", event.amount, {
        prefix: "+",
        color: "#7ff5a8",
        offsetY: 54 + idx * 12,
        duration: 860
      });
    });
    healEvents.enemy.forEach((event, idx) => {
      spawnDamagePopup("enemy", event.amount, {
        prefix: "+",
        color: "#7ff5a8",
        offsetY: 54 + idx * 12,
        duration: 860
      });
    });

    if (totalDamage > 0) {
      const heavy =
        result.playerAction === "ultimate" ||
        result.enemyAction === "ultimate" ||
        totalDamage >= 56;
      triggerSceneShake(heavy ? "heavy" : "light");
    }

    updateBattleBoard(result.state);

    appendLog(
      t("battleRoundLog", {
        round: round.round,
        playerAction: formatAction(result.playerAction),
        enemyAction: formatAction(result.enemyAction),
        playerDamage: round.damageTaken.player,
        enemyDamage: round.damageTaken.enemy
      })
    );

    if (round.notes.length > 0) {
      appendLog(t("battleNotesLog", { notes: round.notes.join("; ") }));
    }

    lastRoundResultElement.textContent = t("battleLastResult", {
      playerAction: formatAction(result.playerAction),
      enemyAction: formatAction(result.enemyAction)
    });

    const tickerMessages = [
      `${currentI18n().round} ${round.round} · ${t("battleTickerAction", {
        playerAction: formatAction(result.playerAction),
        enemyAction: formatAction(result.enemyAction)
      })}`,
      t("battleTickerDamage", {
        playerDamage: round.damageTaken.player,
        enemyDamage: round.damageTaken.enemy
      })
    ];
    if (round.notes.length > 0) {
      tickerMessages.push(round.notes.slice(0, 2).join(" | "));
    }

    if (round.winner) {
      hasWinner = true;
      if (round.winner === "player") {
        territoryOwner = "player";
        appendLog(t("battleWinPlayer"));
        appendLog(t("battleCelebrateWin"));
        tickerMessages.push(t("battleTickerWinnerPlayer"));
        tickerMessages.push(t("battleCelebrateWin"));
      } else if (round.winner === "enemy") {
        territoryOwner = "enemy";
        appendLog(t("battleWinEnemy"));
        appendLog(t("battleCelebrateLose"));
        tickerMessages.push(t("battleTickerWinnerEnemy"));
        tickerMessages.push(t("battleCelebrateLose"));
      } else {
        appendLog(t("battleDraw"));
        appendLog(t("battleCelebrateDraw"));
        tickerMessages.push(t("battleTickerWinnerDraw"));
        tickerMessages.push(t("battleCelebrateDraw"));
      }
      showBattleSettlement(round.winner);
      void refreshBattleReports();
    }
    enqueueRoundFeed(tickerMessages);
  } finally {
    isRoundResolving = false;
    syncActionButtons();
    if (battleMode) {
      setActiveActionTag("");
      if (!hasWinner && !isBattleFinished(lastBattleState)) {
        startActionCountdown();
      }
    }
  }
}

function setupMouseTracking() {
  window.addEventListener("mousemove", (event) => {
    window.__lastMouseX = event.clientX;
    window.__lastMouseY = event.clientY;
    reportHitState();
  });

  playerCard.addEventListener("mouseenter", () => {
    isInteractive = true;
    frameMode = "interacting";
    updatePetClass();
  });

  playerCard.addEventListener("mouseleave", () => {
    isInteractive = false;
    frameMode = "idle";
    updatePetClass();
  });

  playerCard.addEventListener("click", () => {
    setBurstInteraction(t("petInteract"));
  });

  playerCard.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    setPanelVisible(true);
  });
}

function setupButtons() {
  languageBtn.addEventListener("click", () => {
    toggleLanguage();
  });

  closePanelBtn.addEventListener("click", () => {
    setPanelVisible(false);
  });

  battleResetBtn.addEventListener("click", () => {
    void resetBattle();
  });

  endBattleBtn.addEventListener("click", () => {
    void endBattle(true);
  });

  if (settlementConfirmBtn) {
    settlementConfirmBtn.addEventListener("click", () => {
      void endBattle(false);
    });
  }

  for (const button of battleActionButtons) {
    button.addEventListener("click", () => {
      void actBattle(button.dataset.action || "normal_attack");
      setBurstInteraction(t("actionSent"));
    });
  }

  battleActionTagsElement.addEventListener("mouseenter", () => {
    window.petApi.setHitRegion(true);
  });
  battleActionTagsElement.addEventListener("mousemove", () => {
    window.petApi.setHitRegion(true);
  });
  battleActionTagsElement.addEventListener("mouseleave", () => {
    reportHitState();
  });

  captureBtn.addEventListener("click", () => {
    const reward = territoryOwner === "player" ? "2.0x" : "1.0x";
    appendLog(t("captureLog", { reward }));
    setBurstInteraction(t("captureBurst"));
  });

  occupyBtn.addEventListener("click", () => {
    if (freeInvadeCount <= 0) {
      appendLog(t("occupyNoAttempts"));
      return;
    }

    freeInvadeCount -= 1;
    const canOccupy = lastBattleState && lastBattleState.enemy.hp <= 0;
    if (canOccupy) {
      territoryOwner = "player";
      appendLog(t("occupySuccess", { count: freeInvadeCount }));
    } else {
      appendLog(t("occupyFail", { count: freeInvadeCount }));
    }
  });

  pauseBtn.addEventListener("click", async () => {
    isPaused = await window.petApi.togglePause();
    updatePauseText();
    appendLog(isPaused ? t("pausedLog") : t("resumedLog"));
    updatePetClass();
    reportHitState();
  });
}

function setupIpcEvents() {
  window.petApi.onPauseState((state) => {
    isPaused = state;
    updatePauseText();
    appendLog(state ? t("trayPaused") : t("trayResumed"));
    updatePetClass();
    reportHitState();
  });

  window.petApi.onTogglePanel((visible) => {
    setPanelVisible(visible);
  });
}

function setupModelDefaults() {
  playerModel.addEventListener("load", () => {
    playModelAnimation(playerModel, ["survey", "idle", "walk"]);
  });

  enemyModel.addEventListener("load", () => {
    playModelAnimation(enemyModel, ["idle", "walk", "run"]);
  });
}

async function bootstrap() {
  await loadInventorySnapshot();
  const activePet = getActivePet();
  playerModel.src = activePet.model;
  enemyPetInBattle = chooseEnemyPetForBattle();
  enemyModel.src = enemyPetInBattle.model;

  applyLanguage();
  await refreshBattleReports();
  runtimeInfo = await window.petApi.getRuntimeInfo();
  renderRuntimeInfo();
  appendLog(t("runtimeStarted"));

  setupButtons();
  setupMouseTracking();
  setupIpcEvents();
  setupModelDefaults();
  updatePetClass();

  const battleState = await window.petApi.getBattleState();
  updateBattleBoard(battleState);
  setBattleMode(false);

  setInterval(() => {
    if (!isInteractive && !isPaused) {
      reportHitState();
    }
  }, 120);
}

bootstrap();
