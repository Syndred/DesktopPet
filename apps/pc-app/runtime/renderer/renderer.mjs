const panelElement = document.getElementById("panel");
const runtimeElement = document.getElementById("runtime");
const logElement = document.getElementById("log");
const captureBtn = document.getElementById("btn-capture");
const occupyBtn = document.getElementById("btn-occupy");
const pauseBtn = document.getElementById("btn-pause");
const battleResetBtn = document.getElementById("btn-battle-reset");
const endBattleBtn = document.getElementById("btn-end-battle");
const stageBattleActionButtons = [...document.querySelectorAll(".battle-tag")];
const battleActionButtons = [...stageBattleActionButtons];
const languageBtn = document.getElementById("btn-language");
const userMenuBtn = document.getElementById("btn-user-menu");
const userAvatarElement = document.getElementById("user-avatar");
const userMenuDropdownElement = document.getElementById("user-menu-dropdown");
const userMenuAccountElement = document.getElementById("user-menu-account");
const userEditProfileBtn = document.getElementById("btn-user-edit-profile");
const userLogoutBtn = document.getElementById("btn-user-logout");
const profileModalElement = document.getElementById("profile-modal");
const profileModalTitleElement = document.getElementById("profile-modal-title");
const profileModalStatusElement = document.getElementById("profile-modal-status");
const profileAccountInput = document.getElementById("profile-account");
const profileOldPasswordInput = document.getElementById("profile-old-password");
const profileNewPasswordInput = document.getElementById("profile-new-password");
const profileConfirmPasswordInput = document.getElementById("profile-confirm-password");
const profileSaveBtn = document.getElementById("btn-profile-save");
const petInventoryLayoutElement = document.getElementById("pet-inventory-layout");
const inventoryListElement = document.getElementById("pet-inventory-list");
const petDetailPopoverElement = document.getElementById("pet-detail-popover");
const petDetailElement = document.getElementById("pet-detail");
const petDetailPlaceholderElement = document.getElementById("pet-detail-placeholder");
const battleReportListElement = document.getElementById("battle-report-list");
const battleReportDetailPopoverElement = document.getElementById("battle-report-detail-popover");
const mapProviderSelectElement = document.getElementById("map-provider-select");
const mapPermissionSelectElement = document.getElementById("map-permission-select");
const mapPermissionBtn = document.getElementById("btn-map-permission");
const mapCurrentBtn = document.getElementById("btn-map-current");
const mapWatchStartBtn = document.getElementById("btn-map-watch-start");
const mapWatchStopBtn = document.getElementById("btn-map-watch-stop");
const mapDistanceBtn = document.getElementById("btn-map-distance");
const mapStatusProviderValueElement = document.getElementById("map-status-provider-value");
const mapStatusCoordinateValueElement = document.getElementById("map-status-coordinate-value");
const mapStatusPermissionValueElement = document.getElementById("map-status-permission-state-value");
const mapStatusWatchValueElement = document.getElementById("map-status-watch-value");
const mapStatusLocationValueElement = document.getElementById("map-status-location-value");
const mapStatusDistanceValueElement = document.getElementById("map-status-distance-value");
const wildListElement = document.getElementById("wild-list");
const wildRefreshBtn = document.getElementById("btn-wild-refresh");
const authStatusElement = document.getElementById("auth-status");
const duelSearchKeywordInput = document.getElementById("duel-search-keyword");
const duelSearchBtn = document.getElementById("btn-duel-search");
const duelSearchResultsElement = document.getElementById("duel-search-results");
const duelRequestListElement = document.getElementById("duel-request-list");
const duelOnlineRoomInput = document.getElementById("duel-online-room-code");
const duelOnlineCreateBtn = document.getElementById("btn-duel-online-create");
const duelOnlineJoinBtn = document.getElementById("btn-duel-online-join");
const duelOnlineLeaveBtn = document.getElementById("btn-duel-online-leave");
const duelOnlineStatusElement = document.getElementById("duel-online-status");
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
const settlementSecondaryBtn = document.getElementById("btn-settlement-secondary");
const captureDecisionElement = document.getElementById("capture-decision");
const captureDecisionTextElement = document.getElementById("capture-decision-text");
const captureDecisionConfirmBtn = document.getElementById("btn-capture-confirm");
const captureDecisionCancelBtn = document.getElementById("btn-capture-cancel");

const hpFillPlayer = document.getElementById("hp-fill-player");
const hpFillEnemy = document.getElementById("hp-fill-enemy");
const angerFillPlayer = document.getElementById("anger-fill-player");
const angerFillEnemy = document.getElementById("anger-fill-enemy");
const hpValuePlayer = document.getElementById("hp-value-player");
const hpValueEnemy = document.getElementById("hp-value-enemy");
const angerValuePlayer = document.getElementById("anger-value-player");
const angerValueEnemy = document.getElementById("anger-value-enemy");
const playerHudAvatarElement = document.getElementById("player-hud-avatar");
const playerHudLevelElement = document.getElementById("player-hud-level");
const enemyHudAvatarElement = document.getElementById("enemy-hud-avatar");
const enemyHudLevelElement = document.getElementById("enemy-hud-level");

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
    battleAutoNormal: "10秒未选择动作，已默认普攻。",
    battleNoAngerDodge: "怒气为 0，无法闪避，已改为普攻。",
    battleFreeDodgeUsed: "首回免费闪避已使用，后续闪避需消耗怒气。",
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
    battleSettlementCancel: "取消",
    battleSettlementCaptureTitle: "收服确认",
    battleSettlementCaptureSuccess: "收服成功：{serial}",
    battleSettlementCaptureFail: "收服失败：{serial}",
    battleSettlementCaptureAbandon: "已放弃收服：{serial}",
    captureDecisionPrompt: "恭喜战胜 {name}（序号 {serial}），是否收服？",
    captureDecisionConfirm: "确认",
    captureDecisionCancel: "取消",
    petInteract: "宠物交互：宠物给出轻量陪伴反馈。",
    actionSent: "已提交本回合动作。",
    battleLevelUpLog: "{petName} 升级到 Lv.{level}，属性已提升。",
    battleExpGainLog: "{petName} 获得经验：{exp}/{required}。",
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
    inventoryFieldLevel: "等级",
    inventoryFieldExperience: "经验",
    inventoryFieldWins: "胜场",
    inventoryFieldCapturedAt: "收留时间",
    inventoryActive: "当前出战",
    inventorySetActive: "设为出战",
    inventorySelectedDetail: "宠物详情",
    inventoryDetailClose: "关闭",
    inventoryRelease: "放逐",
    inventoryReleaseDone: "已放逐宠物：{petName}",
    duelTitle: "对战申请",
    authStatusLoggedOut: "未登录",
    authStatusLoggedIn: "已登录：{username}（@{account}）",
    userMenuAriaLabel: "账号菜单",
    userMenuEditProfile: "修改信息",
    userMenuLogout: "退出登录",
    profileModalTitle: "修改信息",
    profileAccountLabel: "用户名",
    profileOldPasswordLabel: "旧密码",
    profileNewPasswordLabel: "新密码",
    profileConfirmPasswordLabel: "确认新密码",
    profileSaveBtn: "保存修改",
    profileHint: "输入旧密码后可修改用户名或密码。",
    profileSaved: "账号信息已更新。",
    profileNoChange: "未检测到修改项。",
    profileNeedOldPassword: "请输入旧密码。",
    profilePasswordMismatch: "两次输入的新密码不一致。",
    authSearchLabel: "搜索账号发起对战",
    authSearchBtn: "搜索",
    authSearchPlaceholder: "输入账号关键字",
    authSearchEmpty: "未找到可发起对战的账号。",
    authSearchSend: "发起申请",
    authSearchSelf: "不能挑战自己",
    authRequestTitle: "对战申请",
    authRequestInbound: "收到申请",
    authRequestOutbound: "发出申请",
    authRequestEmpty: "暂无申请记录。",
    authRequestPending: "待处理",
    authRequestAccepted: "已接受",
    authRequestRejected: "已拒绝",
    authRequestCancelled: "已取消",
    authLogoutLog: "已退出登录。",
    authSearchErrorLog: "账号搜索失败：{message}",
    authActionFailLog: "账号操作失败：{message}",
    authSendRequestSuccessLog: "已向 {account} 发起对战申请。",
    authSendRequestFailLog: "发起对战申请失败：{message}",
    duelOnlineRoomLabel: "联机房间号",
    duelOnlineCreateBtn: "创建联机房",
    duelOnlineJoinBtn: "加入房间",
    duelOnlineLeaveBtn: "离开房间",
    duelOnlineStatusNeedLogin: "联机状态：请先登录",
    duelOnlineStatusDisabled: "联机状态：未配置 SUPABASE_URL / SUPABASE_ANON_KEY",
    duelOnlineStatusIdle: "联机状态：未加入房间",
    duelOnlineStatusWaiting: "联机状态：房间 {roomCode} 等待对手",
    duelOnlineStatusActive: "联机状态：房间 {roomCode} 对战中",
    duelOnlineStatusFinished: "联机状态：房间 {roomCode} 已结束",
    duelOnlineCreateSuccessLog: "联机房已创建：{roomCode}",
    duelOnlineJoinSuccessLog: "已加入联机房：{roomCode}",
    duelOnlineLeaveLog: "已离开联机房。",
    duelOnlineActionFailLog: "联机操作失败：{message}",
    duelOnlineResetLog: "联机对战已同步，房间号：{roomCode}",
    battleReportTitle: "最近战报",
    battleReportEmpty: "暂无战报，先开一局对战吧。",
    battleReportFinished: "已结算",
    battleReportAbandoned: "中断",
    battleReportPlayerWin: "我方胜",
    battleReportEnemyWin: "敌方胜",
    battleReportDraw: "平局",
    battleReportRound: "回合",
    battleReportStartedAt: "开始",
    battleReportModeDuel: "对战",
    battleReportModeCapture: "收服",
    battleReportCaptureSuccess: "收服成功 · 编号 {serial}",
    battleReportCaptureFail: "收服失败 · 编号 {serial}",
    battleReportDetailTitle: "对局回顾",
    battleReportDetailClose: "关闭",
    mapTitle: "地图能力（演示）",
    mapTip: "PC 演示版地图能力抽象：Provider、权限状态、定位与追踪。",
    mapProviderLabel: "地图 Provider",
    mapPermissionLabel: "权限模式",
    mapProviderTencent: "腾讯地图",
    mapProviderGoogle: "谷歌地图",
    mapPermissionPrompt: "未请求",
    mapPermissionGranted: "已授权",
    mapPermissionDenied: "已拒绝",
    mapPermissionSystemDisabled: "系统定位关闭",
    mapRequestPermission: "请求权限",
    mapRefreshLocation: "刷新位置",
    mapStartWatch: "开始追踪",
    mapStopWatch: "停止追踪",
    mapDistanceDemo: "距离演示",
    mapStatusProvider: "Provider",
    mapStatusCoordinate: "坐标系",
    mapStatusPermission: "权限",
    mapStatusWatch: "追踪",
    mapStatusLocation: "当前位置",
    mapStatusDistance: "到演示点距离",
    mapWatchOn: "追踪中",
    mapWatchOff: "未追踪",
    mapProviderChangedLog: "地图 Provider 已切换：{provider}",
    mapPermissionAppliedLog: "定位权限模式已更新：{mode}",
    mapLocationLog: "定位刷新成功：{lat}, {lng}",
    mapWatchStartLog: "定位追踪已启动。",
    mapWatchStopLog: "定位追踪已停止。",
    mapDistanceLog: "到演示点距离：{meters}m",
    mapErrorLog: "地图操作失败：{message}",
    wildTitle: "附近流浪宠物",
    wildTip: "进入100米范围可发起收服对战，胜利后自动入库并保留编号。",
    wildRefresh: "刷新附近宠物",
    wildEmpty: "附近暂无可见流浪宠物，请先开启定位或移动位置。",
    wildCaptureAction: "收服对战",
    wildStatusInRange: "可收服",
    wildStatusOutRange: "超出范围",
    wildStatusCooldown: "冷却中",
    wildStatusCaptured: "已收服",
    wildStatusEngaged: "对战中",
    wildDistance: "距离",
    wildCaptureStartLog: "已发起收服对战：{serial}（{name}）",
    wildCaptureSuccessLog: "收服成功：{serial} 已加入仓库。",
    wildCaptureReportLog: "收服战报已记录：{serial}",
    wildCaptureFailLog: "收服失败：{serial} 进入冷却。",
    wildCaptureAbortLog: "收服对战中断：{serial} 进入冷却。",
    wildRefreshLog: "附近流浪宠物刷新完成，共 {count} 只。",
    wildRefreshFailLog: "附近宠物刷新失败：{message}",
    wildRarityCommon: "普通",
    wildRarityRare: "稀有",
    wildRarityEpic: "史诗",
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
    battleAutoNormal: "No action selected in 10 seconds. Defaulted to Normal.",
    battleNoAngerDodge: "Anger is 0. Dodge is unavailable, switched to Normal.",
    battleFreeDodgeUsed: "Free first dodge consumed. Dodge now requires anger.",
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
    battleSettlementCancel: "Cancel",
    battleSettlementCaptureTitle: "Capture Decision",
    battleSettlementCaptureSuccess: "Capture success: {serial}",
    battleSettlementCaptureFail: "Capture failed: {serial}",
    battleSettlementCaptureAbandon: "Capture abandoned: {serial}",
    captureDecisionPrompt: "You defeated {name} (Serial {serial}). Capture this pet?",
    captureDecisionConfirm: "Confirm",
    captureDecisionCancel: "Cancel",
    petInteract: "Pet interaction: companion gives a gentle response.",
    actionSent: "Battle action sent.",
    battleLevelUpLog: "{petName} reached Lv.{level}; stats upgraded.",
    battleExpGainLog: "{petName} gained EXP: {exp}/{required}.",
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
    inventoryFieldLevel: "Level",
    inventoryFieldExperience: "EXP",
    inventoryFieldWins: "Wins",
    inventoryFieldCapturedAt: "Captured At",
    inventoryActive: "Active",
    inventorySetActive: "Set Active",
    inventorySelectedDetail: "Pet Detail",
    inventoryDetailClose: "Close",
    inventoryRelease: "Release",
    inventoryReleaseDone: "Pet released: {petName}",
    duelTitle: "Duel Requests",
    authStatusLoggedOut: "Not logged in",
    authStatusLoggedIn: "Logged in: {username} (@{account})",
    userMenuAriaLabel: "Account Menu",
    userMenuEditProfile: "Edit Profile",
    userMenuLogout: "Logout",
    profileModalTitle: "Edit Profile",
    profileAccountLabel: "Username",
    profileOldPasswordLabel: "Old Password",
    profileNewPasswordLabel: "New Password",
    profileConfirmPasswordLabel: "Confirm New Password",
    profileSaveBtn: "Save Changes",
    profileHint: "Enter old password to update username or password.",
    profileSaved: "Profile updated.",
    profileNoChange: "No changes detected.",
    profileNeedOldPassword: "Old password is required.",
    profilePasswordMismatch: "New password and confirm password do not match.",
    authSearchLabel: "Search account to request a duel",
    authSearchBtn: "Search",
    authSearchPlaceholder: "Enter account keyword",
    authSearchEmpty: "No account found for duel request.",
    authSearchSend: "Request Duel",
    authSearchSelf: "Cannot challenge yourself",
    authRequestTitle: "Duel Requests",
    authRequestInbound: "Inbound",
    authRequestOutbound: "Outbound",
    authRequestEmpty: "No duel requests yet.",
    authRequestPending: "Pending",
    authRequestAccepted: "Accepted",
    authRequestRejected: "Rejected",
    authRequestCancelled: "Cancelled",
    authLogoutLog: "Logged out.",
    authSearchErrorLog: "Account search failed: {message}",
    authActionFailLog: "Auth action failed: {message}",
    authSendRequestSuccessLog: "Duel request sent to {account}.",
    authSendRequestFailLog: "Duel request failed: {message}",
    duelOnlineRoomLabel: "Online Room Code",
    duelOnlineCreateBtn: "Create Online Room",
    duelOnlineJoinBtn: "Join Room",
    duelOnlineLeaveBtn: "Leave Room",
    duelOnlineStatusNeedLogin: "Online: login required",
    duelOnlineStatusDisabled: "Online: SUPABASE_URL / SUPABASE_ANON_KEY not configured",
    duelOnlineStatusIdle: "Online: no room joined",
    duelOnlineStatusWaiting: "Online: room {roomCode} waiting for opponent",
    duelOnlineStatusActive: "Online: room {roomCode} active",
    duelOnlineStatusFinished: "Online: room {roomCode} finished",
    duelOnlineCreateSuccessLog: "Online room created: {roomCode}",
    duelOnlineJoinSuccessLog: "Joined online room: {roomCode}",
    duelOnlineLeaveLog: "Left online room.",
    duelOnlineActionFailLog: "Online operation failed: {message}",
    duelOnlineResetLog: "Online battle synced. Room: {roomCode}",
    battleReportTitle: "Recent Battle Reports",
    battleReportEmpty: "No reports yet. Start a battle to generate one.",
    battleReportFinished: "Finished",
    battleReportAbandoned: "Abandoned",
    battleReportPlayerWin: "Player Win",
    battleReportEnemyWin: "Enemy Win",
    battleReportDraw: "Draw",
    battleReportRound: "Round",
    battleReportStartedAt: "Started",
    battleReportModeDuel: "Duel",
    battleReportModeCapture: "Capture",
    battleReportCaptureSuccess: "Capture success · Serial {serial}",
    battleReportCaptureFail: "Capture failed · Serial {serial}",
    battleReportDetailTitle: "Battle Replay",
    battleReportDetailClose: "Close",
    mapTitle: "Map Capability (Demo)",
    mapTip: "Desktop demo of map abstraction: provider, permission state, location and watch.",
    mapProviderLabel: "Map Provider",
    mapPermissionLabel: "Permission Mode",
    mapProviderTencent: "Tencent Map",
    mapProviderGoogle: "Google Map",
    mapPermissionPrompt: "Prompt",
    mapPermissionGranted: "Granted",
    mapPermissionDenied: "Denied",
    mapPermissionSystemDisabled: "System Disabled",
    mapRequestPermission: "Request Permission",
    mapRefreshLocation: "Refresh Location",
    mapStartWatch: "Start Watch",
    mapStopWatch: "Stop Watch",
    mapDistanceDemo: "Distance Demo",
    mapStatusProvider: "Provider",
    mapStatusCoordinate: "Coord System",
    mapStatusPermission: "Permission",
    mapStatusWatch: "Watch",
    mapStatusLocation: "Current Location",
    mapStatusDistance: "Distance to Demo Point",
    mapWatchOn: "Watching",
    mapWatchOff: "Idle",
    mapProviderChangedLog: "Map provider switched: {provider}",
    mapPermissionAppliedLog: "Location permission mode updated: {mode}",
    mapLocationLog: "Location refreshed: {lat}, {lng}",
    mapWatchStartLog: "Location watch started.",
    mapWatchStopLog: "Location watch stopped.",
    mapDistanceLog: "Distance to demo point: {meters}m",
    mapErrorLog: "Map operation failed: {message}",
    wildTitle: "Nearby Wild Pets",
    wildTip: "Enter 100m capture radius to duel and recruit wild pets with serial IDs.",
    wildRefresh: "Refresh Nearby Pets",
    wildEmpty: "No visible wild pets nearby. Enable location or move around.",
    wildCaptureAction: "Capture Duel",
    wildStatusInRange: "Capturable",
    wildStatusOutRange: "Out of Range",
    wildStatusCooldown: "Cooling Down",
    wildStatusCaptured: "Captured",
    wildStatusEngaged: "In Duel",
    wildDistance: "Distance",
    wildCaptureStartLog: "Capture duel started: {serial} ({name}).",
    wildCaptureSuccessLog: "Capture success: {serial} added to inventory.",
    wildCaptureReportLog: "Capture report persisted: {serial}.",
    wildCaptureFailLog: "Capture failed: {serial} entered cooldown.",
    wildCaptureAbortLog: "Capture duel aborted: {serial} entered cooldown.",
    wildRefreshLog: "Nearby wild pets refreshed: {count}.",
    wildRefreshFailLog: "Failed to refresh nearby pets: {message}",
    wildRarityCommon: "Common",
    wildRarityRare: "Rare",
    wildRarityEpic: "Epic",
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
    serial: "0019001",
    name: { zh: "焰尾", en: "BlazeTail" },
    model: "../assets/models/Fox.glb",
    element: "fire",
    stats: "HP128 / ATK32 / DEF20 / SPD18",
    capturedAt: "2026-03-01 21:10",
    avatar: "焰",
    level: 1,
    experience: 0,
    winsTotal: 0
  },
  {
    id: "pet-002",
    serial: "0029001",
    name: { zh: "星航", en: "Astror" },
    model: "../assets/models/Astronaut.glb",
    element: "water",
    stats: "HP122 / ATK28 / DEF24 / SPD21",
    capturedAt: "2026-03-02 09:35",
    avatar: "星",
    level: 1,
    experience: 0,
    winsTotal: 0
  },
  {
    id: "pet-003",
    serial: "0039001",
    name: { zh: "草蹄", en: "Hoofleaf" },
    model: "../assets/models/Horse.glb",
    element: "wood",
    stats: "HP130 / ATK26 / DEF26 / SPD17",
    capturedAt: "2026-03-02 20:42",
    avatar: "草",
    level: 1,
    experience: 0,
    winsTotal: 0
  },
  {
    id: "pet-004",
    serial: "0049001",
    name: { zh: "锐铠", en: "IronGuard" },
    model: "../assets/models/CesiumMan.glb",
    element: "metal",
    stats: "HP135 / ATK30 / DEF30 / SPD12",
    capturedAt: "2026-03-03 08:20",
    avatar: "铠",
    level: 1,
    experience: 0,
    winsTotal: 0
  },
  {
    id: "pet-005",
    serial: "0059001",
    name: { zh: "月壤", en: "MoonSoil" },
    model: "../assets/models/NeilArmstrong.glb",
    element: "earth",
    stats: "HP142 / ATK24 / DEF34 / SPD10",
    capturedAt: "2026-03-03 18:05",
    avatar: "壤",
    level: 1,
    experience: 0,
    winsTotal: 0
  },
  {
    id: "pet-006",
    serial: "0069001",
    name: { zh: "律动", en: "Groove" },
    model: "../assets/models/RobotExpressive.glb",
    element: "fire",
    stats: "HP118 / ATK33 / DEF22 / SPD20",
    capturedAt: "2026-03-04 12:11",
    avatar: "律",
    level: 1,
    experience: 0,
    winsTotal: 0
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
  mapTitle: document.getElementById("map-title"),
  mapTip: document.getElementById("map-tip"),
  duelTitle: document.getElementById("duel-title"),
  duelSearchLabel: document.getElementById("duel-search-label"),
  duelOnlineRoomLabel: document.getElementById("duel-online-room-label"),
  profileAccountLabel: document.getElementById("profile-account-label"),
  profileOldPasswordLabel: document.getElementById("profile-old-password-label"),
  profileNewPasswordLabel: document.getElementById("profile-new-password-label"),
  profileConfirmPasswordLabel: document.getElementById("profile-confirm-password-label"),
  mapProviderLabel: document.getElementById("map-provider-label"),
  mapPermissionLabel: document.getElementById("map-permission-label"),
  mapStatusProviderLabel: document.getElementById("map-status-provider-label"),
  mapStatusCoordinateLabel: document.getElementById("map-status-coordinate-label"),
  mapStatusPermissionLabel: document.getElementById("map-status-permission-state-label"),
  mapStatusWatchLabel: document.getElementById("map-status-watch-label"),
  mapStatusLocationLabel: document.getElementById("map-status-location-label"),
  mapStatusDistanceLabel: document.getElementById("map-status-distance-label"),
  wildTitle: document.getElementById("wild-title"),
  wildTip: document.getElementById("wild-tip"),
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
let selectedBattleReportId = null;
let settlementWinner = null;
let settlementActionMode = "normal";
let battleReports = [];
let mapState = null;
let mapDemoDistanceMeters = null;
let nearbyWildPets = [];
let lastNearbyRefreshSeq = -1;
let authSession = {
  currentUser: null
};
let authSearchResults = [];
let duelRequests = {
  inbound: [],
  outbound: []
};
let onlineDuelState = {
  enabled: false,
  available: false,
  configured: false,
  room: null,
  side: null
};
let authSearchExecuted = false;
let profileUpdatePending = false;

const ACTION_COUNTDOWN_SECONDS = 10;
const LEVEL_UP_REQUIRED_WINS = 5;
const IDLE_WINDOW_SCALE_STEP = 0.04;
const IDLE_WINDOW_SCALE_MIN = 0.82;
const IDLE_WINDOW_SCALE_MAX = 2.2;
const BATTLE_PLAYER_AZIMUTH_DEG = -92;
const BATTLE_ENEMY_AZIMUTH_DEG = 92;
const BATTLE_CAMERA_PITCH_MIN = 58;
const BATTLE_CAMERA_PITCH_MAX = 86;
let idleWindowScale = 1;
let settlementExtraMessage = "";
let pendingCaptureDecision = null;
let dragPointerSession = null;
let rotatePointerSession = null;
let idleOrbitDeg = 0;
let battleFacingOffsetDeg = 0;
let battleCameraPitchDeg = 74;
let idleModelBaseSize = {
  width: 188,
  height: 220
};
let idleWheelScaleDelta = 0;
let idleWheelFrameToken = null;
let panelTransitionSeq = 0;
let freeDodgeUsedBySide = {
  player: false,
  enemy: false
};

const ELEMENT_ADVANTAGE_CHAIN = {
  metal: "wood",
  wood: "earth",
  earth: "water",
  water: "fire",
  fire: "metal"
};

const MAP_DEMO_TARGET = {
  tencent: { lat: 31.2331, lng: 121.4751 },
  google: { lat: 37.7769, lng: -122.4177 }
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

function localizeAuthErrorMessage(message) {
  const raw = typeof message === "string" ? message.trim() : String(message ?? "");
  if (!raw) {
    return language === "zh" ? "未知错误" : "unknown error";
  }
  if (language !== "zh") return raw;

  const lower = raw.toLowerCase();
  const mappings = [
    ["account already exists", "账号已存在"],
    ["account length must be 3-32", "账号长度需在 3-32 之间"],
    ["account cannot contain spaces", "账号不能包含空格"],
    ["password length must be 6-64", "密码长度需在 6-64 之间"],
    ["account not found", "账号不存在"],
    ["invalid password", "密码错误"],
    ["login required", "请先登录"],
    ["target account not found", "目标账号不存在"],
    ["cannot challenge yourself", "不能挑战自己"],
    ["pending duel request already exists", "已存在待处理的对战申请"],
    ["username is required", "用户名不能为空"],
    ["username length must be 2-24", "用户名长度需在 2-24 之间"],
    ["old password is required", "请输入旧密码"],
    ["invalid old password", "旧密码错误"],
    ["invalid username", "用户名格式不合法"],
    ["invalid new password", "新密码格式不合法"],
    ["profile update failed", "修改信息失败"],
    ["list failed", "列表加载失败"],
    ["search failed", "搜索失败"],
    ["request failed", "请求失败"],
    ["logout failed", "退出登录失败"],
    ["login failed", "登录失败"],
    ["register failed", "注册失败"]
  ];

  for (const [keyword, translated] of mappings) {
    if (lower.includes(keyword)) return translated;
  }
  return raw;
}

function appendLog(text) {
  const time = new Date().toLocaleTimeString();
  const current = logElement.textContent || "";
  logElement.textContent = `[${time}] ${text}\n${current}`.trim();
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getIdleWindowSize(scaleValue) {
  const scale = clampNumber(scaleValue, IDLE_WINDOW_SCALE_MIN, IDLE_WINDOW_SCALE_MAX);
  const baseWidth = Math.max(150, idleModelBaseSize.width + 26);
  const baseHeight = Math.max(180, idleModelBaseSize.height + 26);
  return {
    width: Math.round(baseWidth * scale),
    height: Math.round(baseHeight * scale)
  };
}

async function applyIdleWindowScale(scaleValue) {
  idleWindowScale = clampNumber(scaleValue, IDLE_WINDOW_SCALE_MIN, IDLE_WINDOW_SCALE_MAX);
  const size = getIdleWindowSize(idleWindowScale);
  try {
    await window.petApi.setIdleWindowSize(size);
  } catch {
    // Keep non-blocking behavior when IPC is unavailable.
  }
}

function queueIdleScale(stepDelta) {
  idleWheelScaleDelta += stepDelta;
  if (idleWheelFrameToken) return;
  idleWheelFrameToken = requestAnimationFrame(() => {
    idleWheelFrameToken = null;
    const nextScale = clampNumber(
      idleWindowScale + idleWheelScaleDelta,
      IDLE_WINDOW_SCALE_MIN,
      IDLE_WINDOW_SCALE_MAX
    );
    idleWheelScaleDelta = 0;
    if (Math.abs(nextScale - idleWindowScale) < 0.001) return;
    void applyIdleWindowScale(nextScale);
  });
}

function beginWindowDrag(event) {
  dragPointerSession = {
    lastScreenX: event.screenX,
    lastScreenY: event.screenY
  };
}

function updateWindowDrag(event) {
  if (!dragPointerSession) return;
  const dx = event.screenX - dragPointerSession.lastScreenX;
  const dy = event.screenY - dragPointerSession.lastScreenY;
  dragPointerSession.lastScreenX = event.screenX;
  dragPointerSession.lastScreenY = event.screenY;
  if (dx === 0 && dy === 0) return;
  window.petApi.moveWindowBy({ dx, dy });
}

function endWindowDrag() {
  dragPointerSession = null;
}

function isInteractivePanelTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      "button, input, select, textarea, label, article, model-viewer, .row, .field, .panel-section, .pet-avatar-item, .pet-quick-set, .battle-report-item, .wild-item, .pet-detail-popover, #log"
      + ", .battle-report-detail-popover, .user-menu-wrap, .user-menu-dropdown, .profile-modal, .profile-modal-card"
    )
  );
}

function measureIdleModelBase() {
  const dims =
    typeof playerModel.getDimensions === "function" ? playerModel.getDimensions() : null;
  const dimX = Number(dims?.x);
  const dimY = Number(dims?.y);
  const dimZ = Number(dims?.z);
  if (Number.isFinite(dimX) && Number.isFinite(dimY) && Number.isFinite(dimZ) && dimY > 0.001) {
    const aspect = clampNumber(Math.max(dimX, dimZ) / dimY, 0.55, 1.45);
    const baseHeight = 212;
    idleModelBaseSize = {
      width: Math.round(baseHeight * aspect),
      height: baseHeight
    };
    return;
  }

  const rect = playerModel.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return;
  if (rect.width < 30 || rect.height < 30) return;
  const fallbackHeight = Math.max(180, Math.round(rect.height * 0.88));
  const fallbackAspect = clampNumber(rect.width / Math.max(1, rect.height), 0.55, 1.45);
  idleModelBaseSize = {
    width: Math.round(fallbackHeight * fallbackAspect),
    height: fallbackHeight
  };
}

function isUserMenuOpen() {
  return Boolean(userMenuDropdownElement && !userMenuDropdownElement.classList.contains("hidden"));
}

function closeUserMenu() {
  if (!userMenuDropdownElement || !userMenuBtn) return;
  userMenuDropdownElement.classList.add("hidden");
  userMenuBtn.setAttribute("aria-expanded", "false");
}

function openUserMenu() {
  if (!userMenuDropdownElement || !userMenuBtn) return;
  userMenuDropdownElement.classList.remove("hidden");
  userMenuBtn.setAttribute("aria-expanded", "true");
}

function setProfileStatus(text, type = "normal") {
  if (!profileModalStatusElement) return;
  profileModalStatusElement.textContent = text;
  profileModalStatusElement.classList.remove("error", "success");
  if (type === "error") profileModalStatusElement.classList.add("error");
  if (type === "success") profileModalStatusElement.classList.add("success");
}

function setProfileModalVisible(visible) {
  if (!profileModalElement) return;
  profileModalElement.classList.toggle("hidden", !visible);
  if (profileSaveBtn && !visible && !profileUpdatePending) {
    profileSaveBtn.disabled = false;
  }
  if (!visible) {
    if (profileOldPasswordInput) profileOldPasswordInput.value = "";
    if (profileNewPasswordInput) profileNewPasswordInput.value = "";
    if (profileConfirmPasswordInput) profileConfirmPasswordInput.value = "";
    setProfileStatus(currentI18n().profileHint);
  } else {
    profileAccountInput?.focus();
  }
  reportHitState();
}

function openProfileModal() {
  if (!authSession?.currentUser?.account) return;
  const username =
    authSession?.currentUser?.username || authSession?.currentUser?.account || "";
  if (profileAccountInput) profileAccountInput.value = username;
  if (profileOldPasswordInput) profileOldPasswordInput.value = "";
  if (profileNewPasswordInput) profileNewPasswordInput.value = "";
  if (profileConfirmPasswordInput) profileConfirmPasswordInput.value = "";
  setProfileStatus(currentI18n().profileHint);
  setProfileModalVisible(true);
}

function updateBattleHudTop() {
  if (!battleSceneElement) return;
  if (!battleMode) {
    battleSceneElement.style.removeProperty("--hud-top");
    return;
  }
  const sceneRect = battleSceneElement.getBoundingClientRect();
  const candidates = [playerCard, enemyCard].filter((card) => {
    if (!(card instanceof HTMLElement)) return false;
    return !card.classList.contains("hidden");
  });
  if (candidates.length === 0) return;
  const minTop = Math.min(
    ...candidates.map((card) => card.getBoundingClientRect().top - sceneRect.top)
  );
  const hudTop = clampNumber(minTop - 52, 18, 124);
  battleSceneElement.style.setProperty("--hud-top", `${Math.round(hudTop)}px`);
}

function closeTopLayerByEsc() {
  if (profileModalElement && !profileModalElement.classList.contains("hidden")) {
    setProfileModalVisible(false);
    return true;
  }
  if (isUserMenuOpen()) {
    closeUserMenu();
    return true;
  }
  if (battleSettlementElement && !battleSettlementElement.classList.contains("hidden")) {
    if (settlementActionMode === "capture") {
      void resolveCaptureDecision(false);
    } else {
      void endBattle(false);
    }
    return true;
  }
  if (
    battleReportDetailPopoverElement &&
    !battleReportDetailPopoverElement.classList.contains("hidden")
  ) {
    selectedBattleReportId = null;
    renderBattleReportDetail();
    return true;
  }
  if (petDetailPopoverElement && !petDetailPopoverElement.classList.contains("hidden")) {
    selectedPetDetailId = null;
    renderPetInventory();
    hidePetDetailPopover();
    return true;
  }
  if (panelElement && !panelElement.classList.contains("hidden")) {
    setPanelVisible(false);
    return true;
  }
  return false;
}

function setPanelVisible(visible) {
  const seq = ++panelTransitionSeq;
  if (visible) {
    closeUserMenu();
    setProfileModalVisible(false);
    // Hide scene immediately, then reveal panel after layout switch to avoid top-left flash.
    battleSceneElement.classList.add("panel-open");
    panelElement.classList.add("hidden");
    void window.petApi
      .setLayoutMode("panel")
      .catch(() => null)
      .then(() => {
        if (seq !== panelTransitionSeq) return;
        panelElement.classList.remove("hidden");
        reportHitState();
      });
    return;
  }

  panelElement.classList.add("hidden");
  battleSceneElement.classList.remove("panel-open");
  closeUserMenu();
  setProfileModalVisible(false);
  selectedBattleReportId = null;
  renderBattleReportDetail();
  void window.petApi.setLayoutMode(battleMode ? "battle" : "idle");
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
  const insideIdleScene =
    !battleMode &&
    !panelVisible &&
    isPointInsideRect(x, y, battleSceneElement.getBoundingClientRect());
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
    : insideControls || insideIdleScene || (!isPaused && insideBattleActors);

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

function setModelElementTint(modelElement, element) {
  if (!modelElement) return;
  for (const cls of [...modelElement.classList]) {
    if (cls.startsWith("model-tint-")) {
      modelElement.classList.remove(cls);
    }
  }
  modelElement.classList.add(`model-tint-${element}`);
}

function applyIdleOrbit() {
  const orbit = `${idleOrbitDeg}deg 74deg auto`;
  playerModel.cameraOrbit = orbit;
}

function applyBattleView() {
  if (!battleMode) return;
  const yawOffset = clampNumber(battleFacingOffsetDeg, -120, 120);
  const playerAzimuth = BATTLE_PLAYER_AZIMUTH_DEG + yawOffset;
  const enemyAzimuth = BATTLE_ENEMY_AZIMUTH_DEG - yawOffset;
  const pitch = clampNumber(battleCameraPitchDeg, BATTLE_CAMERA_PITCH_MIN, BATTLE_CAMERA_PITCH_MAX);
  playerModel.orientation = "0deg 0deg 0deg";
  enemyModel.orientation = "0deg 0deg 0deg";
  playerModel.cameraOrbit = `${playerAzimuth}deg ${pitch}deg auto`;
  enemyModel.cameraOrbit = `${enemyAzimuth}deg ${pitch}deg auto`;
}

function canUseDodge(side, anger) {
  const stateUsed =
    side === "player" || side === "enemy"
      ? Boolean(lastBattleState?.[side]?.freeDodgeUsed ?? freeDodgeUsedBySide[side])
      : true;
  if (!stateUsed) return true;
  return anger > 0;
}

function getElementAdvantage(element) {
  const target = ELEMENT_ADVANTAGE_CHAIN[element] || "metal";
  const weak = Object.keys(ELEMENT_ADVANTAGE_CHAIN).find(
    (candidate) => ELEMENT_ADVANTAGE_CHAIN[candidate] === element
  );
  return {
    strongAgainst: target,
    weakAgainst: weak || "metal"
  };
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

function toPositiveInt(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function toNonNegativeInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

function normalizeRosterPet(input, fallback = {}) {
  const level = toPositiveInt(input?.level, toPositiveInt(fallback.level, 1));
  const experienceRaw = toNonNegativeInt(input?.experience, toNonNegativeInt(fallback.experience, 0));
  const winsTotal = toNonNegativeInt(input?.winsTotal, toNonNegativeInt(fallback.winsTotal, 0));
  const nameZh =
    typeof input?.name?.zh === "string" && input.name.zh.trim().length > 0
      ? input.name.zh.trim()
      : typeof fallback?.name?.zh === "string" && fallback.name.zh.trim().length > 0
        ? fallback.name.zh.trim()
        : "";
  const nameEn =
    typeof input?.name?.en === "string" && input.name.en.trim().length > 0
      ? input.name.en.trim()
      : typeof fallback?.name?.en === "string" && fallback.name.en.trim().length > 0
        ? fallback.name.en.trim()
        : "";

  return {
    ...fallback,
    ...input,
    name: {
      zh: nameZh || nameEn || "未命名宠物",
      en: nameEn || nameZh || "Unknown Pet"
    },
    level,
    experience: experienceRaw % LEVEL_UP_REQUIRED_WINS,
    winsTotal
  };
}

function getPetLevel(pet) {
  return toPositiveInt(pet?.level, 1);
}

function getPetExperience(pet) {
  return toNonNegativeInt(pet?.experience, 0) % LEVEL_UP_REQUIRED_WINS;
}

function getPetWinsTotal(pet) {
  return toNonNegativeInt(pet?.winsTotal, 0);
}

function getPetAvatarToken(pet) {
  const displayName = getPetDisplayName(pet || { name: { zh: "宠", en: "Pet" } });
  return pet?.avatar || displayName.slice(0, 1).toUpperCase();
}

function formatLevelText(level) {
  return `Lv.${toPositiveInt(level, 1)}`;
}

function applyInventorySnapshot(snapshot) {
  const incomingPets = Array.isArray(snapshot?.pets) ? snapshot.pets : [];
  const normalizedPets = incomingPets.length > 0 ? incomingPets : DEFAULT_PET_ROSTER;
  petRoster = normalizedPets.map((pet, index) =>
    normalizeRosterPet(pet, DEFAULT_PET_ROSTER[index] || {})
  );

  const fallbackActivePetId = petRoster[0]?.id ?? DEFAULT_PET_ROSTER[0].id;
  const incomingActivePetId =
    typeof snapshot?.activePetId === "string" ? snapshot.activePetId : fallbackActivePetId;
  activePetId = petRoster.some((pet) => pet.id === incomingActivePetId)
    ? incomingActivePetId
    : fallbackActivePetId;

  const keepBattleEnemy =
    battleMode &&
    typeof enemyPetInBattle?.id === "string" &&
    enemyPetInBattle.id.startsWith("wild-");
  if (!keepBattleEnemy && !petRoster.some((pet) => pet.id === enemyPetInBattle?.id)) {
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
  const zh = pet?.name?.zh;
  const en = pet?.name?.en;
  if (language === "zh") return zh || en || "宠物";
  return en || zh || "Pet";
}

function getPetById(petId) {
  const roster = getRoster();
  return roster.find((pet) => pet.id === petId) || roster[0];
}

function getModelByElement(element) {
  const roster = getRoster();
  const matched = roster.find((pet) => pet.element === element && typeof pet.model === "string");
  return matched?.model || DEFAULT_PET_ROSTER[0].model;
}

function getOnlinePeerPrefix(side) {
  return side === "host" ? "guest" : "host";
}

function buildOnlineEnemyPet(room, side) {
  const peerPrefix = getOnlinePeerPrefix(side);
  const peerElement = room?.[`${peerPrefix}_element`] || "wood";
  const peerName = room?.[`${peerPrefix}_pet_name`] || (language === "zh" ? "对手" : "Opponent");
  return normalizeRosterPet({
    id: `online-${room?.id || "room"}-${peerPrefix}`,
    serial: room?.room_code || "ONLINE",
    name: {
      zh: peerName,
      en: peerName
    },
    model: getModelByElement(peerElement),
    element: peerElement,
    stats: "HP120 / ATK30 / DEF24 / SPD18",
    capturedAt: room?.updated_at || "",
    avatar: peerName.slice(0, 1) || "O",
    level: 1,
    experience: 0,
    winsTotal: 0
  });
}

function isOnlineDuelReadyForBattle() {
  return Boolean(onlineDuelState?.enabled && onlineDuelState?.room?.id && onlineDuelState?.side);
}

function applyOnlineDuelSnapshot(payload) {
  if (!payload || typeof payload !== "object") return;
  onlineDuelState = {
    enabled: Boolean(payload.enabled),
    available: Boolean(payload.available),
    configured: Boolean(payload.configured),
    room: payload.room && typeof payload.room === "object" ? { ...payload.room } : null,
    side: typeof payload.side === "string" ? payload.side : null
  };
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

function getSelectedPetAvatarButton() {
  if (!inventoryListElement || !selectedPetDetailId) return null;
  const buttons = inventoryListElement.querySelectorAll(".pet-avatar-item");
  for (const button of buttons) {
    if (button.getAttribute("data-pet-id") === selectedPetDetailId) {
      return button;
    }
  }
  return null;
}

function syncInventoryListHeight() {
  if (!inventoryListElement) return;
  const entries = [...inventoryListElement.querySelectorAll(".pet-avatar-entry")];
  if (entries.length === 0) {
    inventoryListElement.style.height = "0px";
    return;
  }
  const contentBottom = entries.reduce((max, entry) => {
    return Math.max(max, entry.offsetTop + entry.offsetHeight);
  }, 0);
  inventoryListElement.style.height = `${Math.ceil(contentBottom + 6)}px`;
}

function hidePetDetailPopover() {
  if (!petDetailPopoverElement) return;
  petDetailPopoverElement.classList.add("hidden");
  petDetailPopoverElement.innerHTML = "";
}

function positionPetDetailPopover() {
  if (
    !petDetailPopoverElement ||
    petDetailPopoverElement.classList.contains("hidden") ||
    !petInventoryLayoutElement
  ) {
    return;
  }
  const anchor = getSelectedPetAvatarButton();
  if (!anchor) return;

  const layoutRect = petInventoryLayoutElement.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const popoverRect = petDetailPopoverElement.getBoundingClientRect();

  const spacing = 10;
  let left = anchorRect.right - layoutRect.left + spacing;
  if (left + popoverRect.width > layoutRect.width - 4) {
    left = anchorRect.left - layoutRect.left - popoverRect.width - spacing;
  }
  left = Math.max(4, Math.min(left, layoutRect.width - popoverRect.width - 4));

  let top = anchorRect.top - layoutRect.top - 8;
  top = Math.max(4, Math.min(top, layoutRect.height - popoverRect.height - 4));

  petDetailPopoverElement.style.left = `${Math.round(left)}px`;
  petDetailPopoverElement.style.top = `${Math.round(top)}px`;
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
  setModelElementTint(playerModel, activePet.element);
  applyIdleOrbit();
  measureIdleModelBase();
  if (!battleMode && panelElement.classList.contains("hidden")) {
    void applyIdleWindowScale(idleWindowScale);
  }
  playerElementLabel.textContent = getElementText(activePet.element);
  setElementTagTheme(playerElementLabel, activePet.element);
  updateBattleHudBadges(activePet, enemyPetInBattle);
  appendLog(t("activePetChanged", { petName: getPetDisplayName(activePet) }));
  renderPetInventory();
  renderPetDetail();
  if (options.closePanel) {
    setPanelVisible(false);
  }
}

async function releasePet(petId) {
  const pet = getPetById(petId);
  if (!pet?.id) return;
  try {
    const snapshot = await window.petApi.releasePet(pet.id);
    applyInventorySnapshot(snapshot);
    if (selectedPetDetailId === pet.id) {
      selectedPetDetailId = null;
    }
    const activePet = getActivePet();
    playerModel.src = activePet.model;
    setModelElementTint(playerModel, activePet.element);
    playerElementLabel.textContent = getElementText(activePet.element);
    setElementTagTheme(playerElementLabel, activePet.element);
    appendLog(t("inventoryReleaseDone", { petName: getPetDisplayName(pet) }));
    renderPetInventory();
    renderPetDetail();
  } catch {
    // Keep release operation non-blocking for demo runtime.
  }
}

function renderPetDetail() {
  if (!petDetailPopoverElement) return;
  if (!selectedPetDetailId) {
    hidePetDetailPopover();
    if (petDetailElement) {
      petDetailElement.classList.add("hidden");
      petDetailElement.innerHTML = "";
    }
    if (petDetailPlaceholderElement) {
      petDetailPlaceholderElement.classList.add("hidden");
    }
    return;
  }
  const pet = getPetById(selectedPetDetailId);
  const isActive = pet.id === activePetId;
  const elementName = getElementText(pet.element);
  const displayName = getPetDisplayName(pet);
  const statTags = renderStatTagHtml(pet.stats);
  const level = getPetLevel(pet);
  const experience = getPetExperience(pet);
  const winsTotal = getPetWinsTotal(pet);
  const relation = getElementAdvantage(pet.element);
  const strongText = getElementText(relation.strongAgainst);
  const weakText = getElementText(relation.weakAgainst);

  petDetailPopoverElement.classList.remove("hidden");
  petDetailPopoverElement.innerHTML = `
    <div class="pet-detail-head">
      <span class="pet-detail-name">${currentI18n().inventorySelectedDetail} · ${displayName}</span>
      <div class="pet-detail-tags">
        <span class="pet-meta-chip serial">${pet.serial}</span>
        <span class="pet-meta-chip level">${formatLevelText(level)}</span>
        <span class="pet-meta-chip exp">EXP ${experience}/${LEVEL_UP_REQUIRED_WINS}</span>
        <span class="pet-meta-chip element element-${pet.element}">${elementName}</span>
      </div>
    </div>
    <div class="pet-detail-preview">
      <model-viewer class="pet-detail-model model-tint-${pet.element}" src="${pet.model}" autoplay disable-pan disable-zoom interaction-prompt="none"></model-viewer>
      <div class="pet-detail-relation">
        <span class="pet-relation-chip strong">${currentI18n().battleRelationAdvantage}: ${strongText}</span>
        <span class="pet-relation-chip weak">${currentI18n().battleRelationDisadvantage}: ${weakText}</span>
      </div>
    </div>
    <div class="pet-detail-meta">
      <span><b>${currentI18n().inventoryFieldSerial}:</b> ${pet.serial}</span>
      <span><b>${currentI18n().inventoryFieldCapturedAt}:</b> ${formatReportTime(pet.capturedAt)}</span>
      <span><b>${currentI18n().inventoryFieldLevel}:</b> ${formatLevelText(level)}</span>
      <span><b>${currentI18n().inventoryFieldExperience}:</b> ${experience}/${LEVEL_UP_REQUIRED_WINS}</span>
      <span><b>${currentI18n().inventoryFieldWins}:</b> ${winsTotal}</span>
      <span><b>${currentI18n().inventoryFieldStats}:</b></span>
      <div class="pet-stat-chip-row">${statTags}</div>
    </div>
    <div class="pet-detail-actions">
      <button id="btn-close-pet-detail">${currentI18n().inventoryDetailClose}</button>
      <button id="btn-set-active-pet" ${isActive ? "disabled" : ""}>${currentI18n().inventorySetActive}</button>
      <button id="btn-release-pet" ${isActive ? "disabled" : ""}>${currentI18n().inventoryRelease}</button>
    </div>
  `;

  const closeBtn = document.getElementById("btn-close-pet-detail");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      selectedPetDetailId = null;
      renderPetInventory();
      hidePetDetailPopover();
    });
  }

  const setActiveBtn = document.getElementById("btn-set-active-pet");
  if (setActiveBtn) {
    setActiveBtn.addEventListener("click", () => {
      void setActivePet(pet.id);
    });
  }

  const releaseBtn = document.getElementById("btn-release-pet");
  if (releaseBtn) {
    releaseBtn.addEventListener("click", () => {
      void releasePet(pet.id);
    });
  }

  requestAnimationFrame(() => {
    positionPetDetailPopover();
  });
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
    const avatar = getPetAvatarToken(pet);
    const levelText = formatLevelText(getPetLevel(pet));
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
        <span class="pet-avatar-level-chip">${levelText}</span>
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

  syncInventoryListHeight();
  renderPetDetail();
}

function formatReportTime(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  let parsed = Date.parse(raw);
  if (
    Number.isNaN(parsed) &&
    /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(raw)
  ) {
    parsed = Date.parse(raw.replace(" ", "T") + "+08:00");
  }
  if (Number.isNaN(parsed)) return raw || "-";
  const date = new Date(parsed);
  const locale = language === "zh" ? "zh-CN" : "en-GB";
  const timeZone = language === "zh" ? "Asia/Shanghai" : undefined;
  const formatter = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timeZone ? { timeZone } : {})
  });
  const parts = formatter.formatToParts(date);
  const get = (token) => parts.find((item) => item.type === token)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
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
    selectedBattleReportId = null;
    renderBattleReportDetail();
    return;
  }

  battleReportListElement.innerHTML = battleReports
    .map((report) => {
      const finished = report.status === "finished";
      const statusLabel = finished
        ? currentI18n().battleReportFinished
        : currentI18n().battleReportAbandoned;
      const modeLabel =
        report.mode === "capture"
          ? currentI18n().battleReportModeCapture
          : currentI18n().battleReportModeDuel;
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
      let captureLine = "";
      if (report.mode === "capture") {
        const serial = report.captureSerial || "-";
        if (report.captureSuccess === true) {
          captureLine = `<div class="battle-report-capture success">${t("battleReportCaptureSuccess", { serial })}</div>`;
        } else if (report.captureSuccess === false) {
          captureLine = `<div class="battle-report-capture fail">${t("battleReportCaptureFail", { serial })}</div>`;
        }
      }
      return `
        <article class="battle-report-item ${statusClass}" data-report-id="${report.id}">
          <div class="battle-report-head">
            <span class="battle-report-status ${statusClass}">${statusLabel}</span>
            <span class="battle-report-time">${currentI18n().battleReportStartedAt}: ${formatReportTime(report.startedAt)}</span>
          </div>
          <div class="battle-report-main">
            <span class="battle-report-side">${report.player.petName || "Player"}</span>
            <span class="battle-report-vs">${modeLabel}</span>
            <span class="battle-report-side">${report.enemy.petName || "Enemy"}</span>
          </div>
          <div class="battle-report-foot">
            <span class="battle-report-round">${currentI18n().battleReportRound}: ${report.totalRounds}</span>
            <span class="battle-report-winner ${winnerClass}">${winnerLabel}</span>
          </div>
          ${captureLine}
        </article>
      `;
    })
    .join("");

  const cards = battleReportListElement.querySelectorAll(".battle-report-item");
  for (const card of cards) {
    card.addEventListener("click", () => {
      const reportId = card.getAttribute("data-report-id");
      selectedBattleReportId = reportId || null;
      renderBattleReportDetail();
    });
  }
  renderBattleReportDetail();
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

function renderBattleReportDetail() {
  if (!battleReportDetailPopoverElement) return;
  if (!selectedBattleReportId) {
    battleReportDetailPopoverElement.classList.add("hidden");
    battleReportDetailPopoverElement.innerHTML = "";
    return;
  }

  const report = battleReports.find((item) => item.id === selectedBattleReportId);
  if (!report) {
    selectedBattleReportId = null;
    battleReportDetailPopoverElement.classList.add("hidden");
    battleReportDetailPopoverElement.innerHTML = "";
    return;
  }

  const rounds = Array.isArray(report.rounds) ? report.rounds : [];
  const roundListHtml =
    rounds.length === 0
      ? `<div class="battle-report-round-item">${currentI18n().battleReportEmpty}</div>`
      : rounds
          .map((round) => {
            const notes = Array.isArray(round.notes) ? round.notes.filter(Boolean).join("；") : "";
            const playerAction = formatAction(round.playerAction || "normal_attack");
            const enemyAction = formatAction(round.enemyAction || "normal_attack");
            const playerDamage = Number(round.damageTaken?.player || 0);
            const enemyDamage = Number(round.damageTaken?.enemy || 0);
            const actionsLine =
              language === "zh"
                ? `我方 ${playerAction} · 敌方 ${enemyAction}`
                : `Player ${playerAction} · Enemy ${enemyAction}`;
            return `
              <article class="battle-report-round-item">
                <div class="battle-report-round-top">
                  <span>${currentI18n().battleReportRound} ${round.round}</span>
                  <span>HP-${playerDamage} / HP-${enemyDamage}</span>
                </div>
                <div class="battle-report-round-actions">${actionsLine}</div>
                <div class="battle-report-round-notes">${notes || "-"}</div>
              </article>
            `;
          })
          .join("");

  battleReportDetailPopoverElement.classList.remove("hidden");
  battleReportDetailPopoverElement.innerHTML = `
    <div class="battle-report-detail-head">
      <span class="battle-report-detail-title">${currentI18n().battleReportDetailTitle}</span>
      <button id="btn-close-battle-report-detail" class="battle-report-detail-close">${currentI18n().battleReportDetailClose}</button>
    </div>
    <div class="battle-report-round-list">${roundListHtml}</div>
  `;

  const closeBtn = document.getElementById("btn-close-battle-report-detail");
  closeBtn?.addEventListener("click", () => {
    selectedBattleReportId = null;
    renderBattleReportDetail();
  });
}

function getMapProviderName(providerId) {
  return providerId === "google"
    ? currentI18n().mapProviderGoogle
    : currentI18n().mapProviderTencent;
}

function getMapPermissionName(status) {
  if (status === "granted") return currentI18n().mapPermissionGranted;
  if (status === "denied") return currentI18n().mapPermissionDenied;
  if (status === "system_disabled") return currentI18n().mapPermissionSystemDisabled;
  return currentI18n().mapPermissionPrompt;
}

function formatMapLocation(location) {
  if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
    return "-";
  }
  const accuracy = Number.isFinite(location.accuracyMeters) ? Math.round(location.accuracyMeters) : 0;
  return `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)} (±${accuracy}m)`;
}

function formatMapDistance(meters) {
  if (!Number.isFinite(meters)) return "-";
  return `${Number(meters).toFixed(2)}m`;
}

function syncMapSelectLabels() {
  if (mapProviderSelectElement) {
    const tencentOption = mapProviderSelectElement.querySelector("option[value='tencent']");
    const googleOption = mapProviderSelectElement.querySelector("option[value='google']");
    if (tencentOption) tencentOption.textContent = currentI18n().mapProviderTencent;
    if (googleOption) googleOption.textContent = currentI18n().mapProviderGoogle;
  }

  if (mapPermissionSelectElement) {
    const grantedOption = mapPermissionSelectElement.querySelector("option[value='granted']");
    const deniedOption = mapPermissionSelectElement.querySelector("option[value='denied']");
    const systemDisabledOption = mapPermissionSelectElement.querySelector(
      "option[value='system_disabled']"
    );
    if (grantedOption) grantedOption.textContent = currentI18n().mapPermissionGranted;
    if (deniedOption) deniedOption.textContent = currentI18n().mapPermissionDenied;
    if (systemDisabledOption) {
      systemDisabledOption.textContent = currentI18n().mapPermissionSystemDisabled;
    }
  }
}

function renderMapState() {
  const state = mapState;
  if (!mapStatusProviderValueElement || !mapStatusCoordinateValueElement) return;
  if (!state) {
    mapStatusProviderValueElement.textContent = "-";
    mapStatusCoordinateValueElement.textContent = "-";
    mapStatusPermissionValueElement.textContent = currentI18n().mapPermissionPrompt;
    mapStatusWatchValueElement.textContent = currentI18n().mapWatchOff;
    mapStatusLocationValueElement.textContent = "-";
    mapStatusDistanceValueElement.textContent = "-";
    mapCurrentBtn.disabled = true;
    mapWatchStartBtn.disabled = true;
    mapWatchStopBtn.disabled = true;
    mapDistanceBtn.disabled = true;
    return;
  }

  mapStatusProviderValueElement.textContent = getMapProviderName(state.providerId);
  mapStatusCoordinateValueElement.textContent = state.coordinateSystem || "-";
  mapStatusPermissionValueElement.textContent = getMapPermissionName(state.permissionStatus);
  mapStatusWatchValueElement.textContent = state.watchActive
    ? currentI18n().mapWatchOn
    : currentI18n().mapWatchOff;
  mapStatusLocationValueElement.textContent = formatMapLocation(state.lastLocation);
  mapStatusDistanceValueElement.textContent = formatMapDistance(mapDemoDistanceMeters);

  if (mapProviderSelectElement && state.providerId) {
    mapProviderSelectElement.value = state.providerId;
  }
  const granted = state.permissionStatus === "granted";
  mapCurrentBtn.disabled = !granted;
  mapWatchStartBtn.disabled = !granted || Boolean(state.watchActive);
  mapWatchStopBtn.disabled = !state.watchActive;
  mapDistanceBtn.disabled = !granted;
}

function applyMapState(nextState) {
  if (!nextState || typeof nextState !== "object") return;
  mapState = nextState;
  renderMapState();
  if (mapState.permissionStatus === "granted" && Number.isFinite(mapState.updateSeq)) {
    if (mapState.updateSeq !== lastNearbyRefreshSeq) {
      lastNearbyRefreshSeq = mapState.updateSeq;
      void refreshNearbyWildPets({ silent: true });
    }
  }
}

async function refreshMapState() {
  try {
    const state = await window.petApi.getMapState();
    applyMapState(state);
  } catch {
    // Keep non-blocking for environments without map runtime.
  }
}

function applyMapActionResult(result) {
  if (result?.state) {
    applyMapState(result.state);
  }
  if (!result?.ok) {
    appendLog(t("mapErrorLog", { message: result?.error?.message || "unknown error" }));
    return false;
  }
  return true;
}

function getWildRarityText(rarity) {
  if (rarity === "epic") return currentI18n().wildRarityEpic;
  if (rarity === "rare") return currentI18n().wildRarityRare;
  return currentI18n().wildRarityCommon;
}

function getWildStatusText(pet) {
  if (pet.status === "captured") return currentI18n().wildStatusCaptured;
  if (pet.status === "engaged") return currentI18n().wildStatusEngaged;
  if (pet.status === "cooldown") return `${currentI18n().wildStatusCooldown} (${pet.cooldownRemainingSec}s)`;
  if (pet.inRange) return currentI18n().wildStatusInRange;
  return currentI18n().wildStatusOutRange;
}

function getWildPetDisplayName(pet) {
  if (language === "zh") return pet.name?.zh || pet.name?.en || pet.serial || "WildPet";
  return pet.name?.en || pet.name?.zh || pet.serial || "WildPet";
}

function renderNearbyWildPets() {
  if (!wildListElement) return;
  if (!nearbyWildPets || nearbyWildPets.length === 0) {
    wildListElement.innerHTML = `<div class="wild-empty">${currentI18n().wildEmpty}</div>`;
    return;
  }

  wildListElement.innerHTML = nearbyWildPets
    .map((pet) => {
      const rarityClass = pet.rarity === "epic" ? "epic" : pet.rarity === "rare" ? "rare" : "common";
      const inRange = Boolean(pet.inRange);
      const canCapture = inRange && pet.status === "available";
      const itemClass =
        pet.status === "captured"
          ? "captured"
          : pet.status === "cooldown"
            ? "cooldown"
            : inRange
              ? "in"
              : "out";
      return `
        <article class="wild-item ${itemClass}" data-wild-id="${pet.id}">
          <div class="wild-head">
            <span class="wild-serial">${pet.serial}</span>
            <span class="wild-rarity ${rarityClass}">${getWildRarityText(pet.rarity)}</span>
          </div>
          <div class="wild-main">
            <span class="wild-name">${getWildPetDisplayName(pet)}</span>
            <span class="wild-meta">${pet.element} · ${pet.landmarkType}</span>
          </div>
          <div class="wild-actions">
            <span class="wild-status">${currentI18n().wildDistance}: ${pet.distanceMeters}m · ${getWildStatusText(pet)}</span>
            <button class="wild-capture-btn" ${canCapture ? "" : "disabled"}>${currentI18n().wildCaptureAction}</button>
          </div>
        </article>
      `;
    })
    .join("");

  const cards = wildListElement.querySelectorAll(".wild-item");
  for (const card of cards) {
    const id = card.getAttribute("data-wild-id");
    const btn = card.querySelector(".wild-capture-btn");
    btn?.addEventListener("click", () => {
      const target = nearbyWildPets.find((item) => item.id === id);
      if (!target) return;
      void startCaptureBattle(target);
    });
  }
}

async function refreshNearbyWildPets(options = {}) {
  const silent = Boolean(options.silent);
  const result = await window.petApi.getNearbyWildPets(280);
  if (!result?.ok) {
    nearbyWildPets = [];
    renderNearbyWildPets();
    if (!silent) {
      appendLog(
        t("wildRefreshFailLog", {
          message: result?.error?.message || "unknown error"
        })
      );
    }
    return;
  }
  nearbyWildPets = Array.isArray(result.pets) ? result.pets : [];
  renderNearbyWildPets();
  if (!silent) {
    appendLog(
      t("wildRefreshLog", {
        count: nearbyWildPets.length
      })
    );
  }
}

async function startCaptureBattle(wildPet) {
  if (!wildPet?.id) return;
  const activePet = getActivePet();
  clearActionCountdown();
  isRoundResolving = false;
  hideBattleSettlement();
  hideCaptureDecision();
  settlementExtraMessage = "";
  freeDodgeUsedBySide = { player: false, enemy: false };
  setBattleMode(true);
  clearRoundFeed();
  lastRoundResultElement.textContent = "";
  setPanelVisible(false);

  const response = await window.petApi.beginCaptureBattle({
    wildPetId: wildPet.id,
    playerElement: activePet.element,
    playerPetId: activePet.id,
    playerPetName: getPetDisplayName(activePet)
  });
  if (!response?.ok) {
    setBattleMode(false);
    appendLog(
      t("wildRefreshFailLog", {
        message: response?.error?.message || "capture battle start failed"
      })
    );
    return;
  }

  const capture = response.capture;
  playerModel.src = activePet.model;
  setModelElementTint(playerModel, activePet.element);
  enemyPetInBattle = {
    id: capture.id,
    serial: capture.serial,
    name: { zh: capture.name?.zh || "流浪宠物", en: capture.name?.en || "WildPet" },
    model: capture.model,
    element: capture.element,
    stats: capture.stats || "N/A",
    capturedAt: "",
    avatar: capture.avatar || "野",
    level: 1,
    experience: 0,
    winsTotal: 0
  };
  enemyModel.src = capture.model;
  setModelElementTint(enemyModel, capture.element);
  updateBattleBoard(response.state);
  setActiveActionTag("");
  startActionCountdown();
  appendLog(
    t("wildCaptureStartLog", {
      serial: capture.serial,
      name: getWildPetDisplayName(capture)
    })
  );
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
  uiRefs.playerLabel.textContent = getPetDisplayName(activePet);
  uiRefs.enemyLabel.textContent = getPetDisplayName(enemyPetInBattle);
  battleResetBtn.textContent = currentI18n().resetBattle;
  endBattleBtn.textContent = currentI18n().endBattle;
  uiRefs.tagActionNormal.textContent = currentI18n().actionNormal;
  uiRefs.tagActionElement.textContent = currentI18n().actionElement;
  uiRefs.tagActionDodge.textContent = currentI18n().actionDodge;
  uiRefs.tagActionUltimate.textContent = currentI18n().actionUltimate;
  uiRefs.inventoryTitle.textContent = currentI18n().inventoryTitle;
  uiRefs.inventoryTip.textContent = currentI18n().inventoryTip;
  uiRefs.battleReportTitle.textContent = currentI18n().battleReportTitle;
  uiRefs.mapTitle.textContent = currentI18n().mapTitle;
  uiRefs.mapTip.textContent = currentI18n().mapTip;
  uiRefs.duelTitle.textContent = currentI18n().duelTitle;
  uiRefs.duelSearchLabel.textContent = currentI18n().authSearchLabel;
  if (uiRefs.duelOnlineRoomLabel) {
    uiRefs.duelOnlineRoomLabel.textContent = currentI18n().duelOnlineRoomLabel;
  }
  uiRefs.profileAccountLabel.textContent = currentI18n().profileAccountLabel;
  uiRefs.profileOldPasswordLabel.textContent = currentI18n().profileOldPasswordLabel;
  uiRefs.profileNewPasswordLabel.textContent = currentI18n().profileNewPasswordLabel;
  uiRefs.profileConfirmPasswordLabel.textContent = currentI18n().profileConfirmPasswordLabel;
  uiRefs.mapProviderLabel.textContent = currentI18n().mapProviderLabel;
  uiRefs.mapPermissionLabel.textContent = currentI18n().mapPermissionLabel;
  uiRefs.mapStatusProviderLabel.textContent = currentI18n().mapStatusProvider;
  uiRefs.mapStatusCoordinateLabel.textContent = currentI18n().mapStatusCoordinate;
  uiRefs.mapStatusPermissionLabel.textContent = currentI18n().mapStatusPermission;
  uiRefs.mapStatusWatchLabel.textContent = currentI18n().mapStatusWatch;
  uiRefs.mapStatusLocationLabel.textContent = currentI18n().mapStatusLocation;
  uiRefs.mapStatusDistanceLabel.textContent = currentI18n().mapStatusDistance;
  uiRefs.wildTitle.textContent = currentI18n().wildTitle;
  uiRefs.wildTip.textContent = currentI18n().wildTip;
  uiRefs.companionTitle.textContent = currentI18n().companionTitle;
  captureBtn.textContent = currentI18n().captureTest;
  occupyBtn.textContent = currentI18n().occupyTest;
  mapPermissionBtn.textContent = currentI18n().mapRequestPermission;
  mapCurrentBtn.textContent = currentI18n().mapRefreshLocation;
  mapWatchStartBtn.textContent = currentI18n().mapStartWatch;
  mapWatchStopBtn.textContent = currentI18n().mapStopWatch;
  mapDistanceBtn.textContent = currentI18n().mapDistanceDemo;
  wildRefreshBtn.textContent = currentI18n().wildRefresh;
  if (userMenuBtn) userMenuBtn.setAttribute("aria-label", currentI18n().userMenuAriaLabel);
  if (userEditProfileBtn) userEditProfileBtn.textContent = currentI18n().userMenuEditProfile;
  if (userLogoutBtn) userLogoutBtn.textContent = currentI18n().userMenuLogout;
  if (profileModalTitleElement) profileModalTitleElement.textContent = currentI18n().profileModalTitle;
  if (profileSaveBtn) profileSaveBtn.textContent = currentI18n().profileSaveBtn;
  if (profileModalStatusElement && profileModalElement?.classList.contains("hidden")) {
    profileModalStatusElement.textContent = currentI18n().profileHint;
    profileModalStatusElement.classList.remove("error", "success");
  }
  if (duelSearchBtn) duelSearchBtn.textContent = currentI18n().authSearchBtn;
  if (duelSearchKeywordInput) {
    duelSearchKeywordInput.placeholder = currentI18n().authSearchPlaceholder;
  }
  if (duelOnlineCreateBtn) duelOnlineCreateBtn.textContent = currentI18n().duelOnlineCreateBtn;
  if (duelOnlineJoinBtn) duelOnlineJoinBtn.textContent = currentI18n().duelOnlineJoinBtn;
  if (duelOnlineLeaveBtn) duelOnlineLeaveBtn.textContent = currentI18n().duelOnlineLeaveBtn;
  if (duelOnlineRoomInput) {
    duelOnlineRoomInput.placeholder = "ABC123";
  }
  uiRefs.tipText.textContent = currentI18n().tip;
  updatePauseText();
  languageBtn.textContent = currentI18n().languageButton;
  if (settlementConfirmBtn) {
    settlementConfirmBtn.textContent =
      settlementActionMode === "capture"
        ? currentI18n().captureDecisionConfirm
        : currentI18n().battleSettlementConfirm;
  }
  if (settlementSecondaryBtn) {
    settlementSecondaryBtn.textContent = currentI18n().battleSettlementCancel;
    settlementSecondaryBtn.classList.toggle("hidden", settlementActionMode !== "capture");
  }
  if (captureDecisionConfirmBtn) {
    captureDecisionConfirmBtn.textContent = currentI18n().captureDecisionConfirm;
  }
  if (captureDecisionCancelBtn) {
    captureDecisionCancelBtn.textContent = currentI18n().captureDecisionCancel;
  }
  if (pendingCaptureDecision && captureDecisionTextElement) {
    captureDecisionTextElement.textContent = t("captureDecisionPrompt", {
      name: pendingCaptureDecision.name,
      serial: pendingCaptureDecision.serial
    });
  }
  playerElementLabel.textContent = getElementText(activePet.element);
  enemyElementLabel.textContent = getElementText(enemyPetInBattle.element);
  setElementTagTheme(playerElementLabel, activePet.element);
  setElementTagTheme(enemyElementLabel, enemyPetInBattle.element);
  updateBattleHudBadges(activePet, enemyPetInBattle);
  renderPetInventory();
  renderBattleReports();
  renderAuthSection();
  syncMapSelectLabels();
  renderMapState();
  renderNearbyWildPets();
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

function getDuelRequestStatusText(status) {
  if (status === "accepted") return currentI18n().authRequestAccepted;
  if (status === "rejected") return currentI18n().authRequestRejected;
  if (status === "cancelled") return currentI18n().authRequestCancelled;
  return currentI18n().authRequestPending;
}

function hasPendingDuelWithAccount(account) {
  const accountKey = typeof account === "string" ? account.toLowerCase() : "";
  if (!accountKey) return false;
  const all = [...(duelRequests.inbound || []), ...(duelRequests.outbound || [])];
  return all.some((request) => {
    if (request.status !== "pending") return false;
    return (
      String(request.fromAccount || "").toLowerCase() === accountKey ||
      String(request.toAccount || "").toLowerCase() === accountKey
    );
  });
}

function renderDuelSearchResults() {
  if (!duelSearchResultsElement) return;
  const currentUser = authSession?.currentUser || null;
  if (!currentUser) {
    duelSearchResultsElement.innerHTML = "";
    return;
  }

  if (!authSearchExecuted) {
    duelSearchResultsElement.innerHTML = "";
    return;
  }

  if (!Array.isArray(authSearchResults) || authSearchResults.length === 0) {
    duelSearchResultsElement.innerHTML = `<div class="duel-empty">${currentI18n().authSearchEmpty}</div>`;
    return;
  }

  duelSearchResultsElement.innerHTML = authSearchResults
    .map((user) => {
      const account = String(user.account || "-");
      const self = String(account).toLowerCase() === String(currentUser.account || "").toLowerCase();
      const pending = hasPendingDuelWithAccount(account);
      const disabled = self || pending;
      const statusText = self
        ? currentI18n().authSearchSelf
        : pending
          ? currentI18n().authRequestPending
          : "";
      return `
        <article class="duel-result-item" data-account="${account}">
          <div class="duel-result-main">
            <span class="duel-account">${account}</span>
            <span class="duel-account-meta">${formatReportTime(user.createdAt)}</span>
          </div>
          <div class="duel-result-actions">
            <button class="duel-send-btn" ${disabled ? "disabled" : ""}>${currentI18n().authSearchSend}</button>
            ${statusText ? `<span class="duel-send-state">${statusText}</span>` : ""}
          </div>
        </article>
      `;
    })
    .join("");

  const sendButtons = duelSearchResultsElement.querySelectorAll(".duel-result-item .duel-send-btn");
  for (const button of sendButtons) {
    button.addEventListener("click", () => {
      const container = button.closest(".duel-result-item");
      const account = container?.getAttribute("data-account");
      if (!account) return;
      void sendDuelRequest(account);
    });
  }
}

function renderDuelRequestList() {
  if (!duelRequestListElement) return;
  const currentUser = authSession?.currentUser || null;
  if (!currentUser) {
    duelRequestListElement.innerHTML = "";
    return;
  }

  const inbound = Array.isArray(duelRequests.inbound) ? duelRequests.inbound : [];
  const outbound = Array.isArray(duelRequests.outbound) ? duelRequests.outbound : [];
  if (inbound.length === 0 && outbound.length === 0) {
    duelRequestListElement.innerHTML = `<div class="duel-empty">${currentI18n().authRequestEmpty}</div>`;
    return;
  }

  const renderItems = (list, direction) => {
    if (!Array.isArray(list) || list.length === 0) {
      return `<div class="duel-empty">${currentI18n().authRequestEmpty}</div>`;
    }
    return list
      .slice(0, 8)
      .map((request) => {
        const peer = direction === "inbound" ? request.fromAccount : request.toAccount;
        return `
          <article class="duel-request-item ${request.status}">
            <div class="duel-request-main">
              <span class="duel-account">${peer || "-"}</span>
              <span class="duel-send-state">${getDuelRequestStatusText(request.status)}</span>
            </div>
            <span class="duel-account-meta">${formatReportTime(request.createdAt)}</span>
          </article>
        `;
      })
      .join("");
  };

  duelRequestListElement.innerHTML = `
    <div class="duel-request-group">
      <h3>${currentI18n().authRequestInbound}</h3>
      ${renderItems(inbound, "inbound")}
    </div>
    <div class="duel-request-group">
      <h3>${currentI18n().authRequestOutbound}</h3>
      ${renderItems(outbound, "outbound")}
    </div>
  `;
}

function getOnlineDuelStatusText() {
  if (!authSession?.currentUser) {
    return currentI18n().duelOnlineStatusNeedLogin;
  }
  if (!onlineDuelState.enabled) {
    return currentI18n().duelOnlineStatusDisabled;
  }
  const room = onlineDuelState.room;
  if (!room?.id) {
    return currentI18n().duelOnlineStatusIdle;
  }
  if (room.status === "waiting") {
    return t("duelOnlineStatusWaiting", { roomCode: room.room_code || "-" });
  }
  if (room.status === "active") {
    return t("duelOnlineStatusActive", { roomCode: room.room_code || "-" });
  }
  return t("duelOnlineStatusFinished", { roomCode: room.room_code || "-" });
}

function renderOnlineDuelStatus() {
  if (duelOnlineStatusElement) {
    duelOnlineStatusElement.textContent = getOnlineDuelStatusText();
  }
  const canOperate = Boolean(authSession?.currentUser && onlineDuelState.enabled);
  if (duelOnlineCreateBtn) duelOnlineCreateBtn.disabled = !canOperate;
  if (duelOnlineJoinBtn) duelOnlineJoinBtn.disabled = !canOperate;
  if (duelOnlineLeaveBtn) duelOnlineLeaveBtn.disabled = !canOperate || !onlineDuelState.room?.id;
}

async function refreshOnlineDuelStatus(options = {}) {
  const silent = Boolean(options.silent);
  if (!authSession?.currentUser) {
    onlineDuelState = {
      enabled: false,
      available: false,
      configured: false,
      room: null,
      side: null
    };
    renderOnlineDuelStatus();
    return;
  }
  try {
    const response = await window.petApi.getOnlineDuelStatus();
    if (response?.ok) {
      applyOnlineDuelSnapshot(response);
    } else if (!silent) {
      appendLog(
        t("duelOnlineActionFailLog", {
          message: localizeAuthErrorMessage(response?.error || "status failed")
        })
      );
    }
  } catch (error) {
    if (!silent) {
      appendLog(
        t("duelOnlineActionFailLog", {
          message: localizeAuthErrorMessage(error instanceof Error ? error.message : "status failed")
        })
      );
    }
  }
  renderOnlineDuelStatus();
}

async function createOnlineDuelRoom() {
  if (!authSession?.currentUser) return;
  const activePet = getActivePet();
  try {
    const response = await window.petApi.createOnlineDuelRoom({
      petElement: activePet.element,
      petName: getPetDisplayName(activePet)
    });
    if (!response?.ok) {
      appendLog(
        t("duelOnlineActionFailLog", {
          message: localizeAuthErrorMessage(response?.error || "create room failed")
        })
      );
      return;
    }
    applyOnlineDuelSnapshot(response);
    if (duelOnlineRoomInput && response.room?.room_code) {
      duelOnlineRoomInput.value = response.room.room_code;
    }
    renderOnlineDuelStatus();
    appendLog(
      t("duelOnlineCreateSuccessLog", {
        roomCode: response.room?.room_code || "-"
      })
    );
  } catch (error) {
    appendLog(
      t("duelOnlineActionFailLog", {
        message: localizeAuthErrorMessage(error instanceof Error ? error.message : "create room failed")
      })
    );
  }
}

async function joinOnlineDuelRoom() {
  if (!authSession?.currentUser) return;
  const roomCode = duelOnlineRoomInput?.value?.trim() || "";
  if (!roomCode) return;
  const activePet = getActivePet();
  try {
    const response = await window.petApi.joinOnlineDuelRoom({
      roomCode,
      petElement: activePet.element,
      petName: getPetDisplayName(activePet)
    });
    if (!response?.ok) {
      appendLog(
        t("duelOnlineActionFailLog", {
          message: localizeAuthErrorMessage(response?.error || "join room failed")
        })
      );
      return;
    }
    applyOnlineDuelSnapshot(response);
    renderOnlineDuelStatus();
    appendLog(
      t("duelOnlineJoinSuccessLog", {
        roomCode: response.room?.room_code || roomCode
      })
    );
  } catch (error) {
    appendLog(
      t("duelOnlineActionFailLog", {
        message: localizeAuthErrorMessage(error instanceof Error ? error.message : "join room failed")
      })
    );
  }
}

async function leaveOnlineDuelRoom(reason = "manual") {
  try {
    const response = await window.petApi.leaveOnlineDuelRoom(reason);
    if (!response?.ok) {
      appendLog(
        t("duelOnlineActionFailLog", {
          message: localizeAuthErrorMessage(response?.error || "leave room failed")
        })
      );
      return;
    }
    await refreshOnlineDuelStatus({ silent: true });
    appendLog(currentI18n().duelOnlineLeaveLog);
  } catch (error) {
    appendLog(
      t("duelOnlineActionFailLog", {
        message: localizeAuthErrorMessage(error instanceof Error ? error.message : "leave room failed")
      })
    );
  }
}

function renderAuthSection() {
  const currentUser = authSession?.currentUser || null;
  const account = currentUser?.account || "-";
  const username = currentUser?.username || currentUser?.account || "-";
  const loggedIn = Boolean(currentUser?.account);
  if (authStatusElement) {
    authStatusElement.textContent = loggedIn
      ? t("authStatusLoggedIn", { account, username })
      : currentI18n().authStatusLoggedOut;
  }
  if (userMenuAccountElement) {
    userMenuAccountElement.textContent = loggedIn ? `${username} (@${account})` : "-";
  }
  if (userAvatarElement) {
    userAvatarElement.textContent = getUserAvatarToken(username);
  }
  if (userMenuBtn) {
    userMenuBtn.disabled = !loggedIn;
  }
  if (!currentUser) {
    closeUserMenu();
    setProfileModalVisible(false);
  }

  renderDuelSearchResults();
  renderDuelRequestList();
  renderOnlineDuelStatus();
}

async function refreshAuthSession() {
  try {
    const session = await window.petApi.getAuthSession();
    if (session?.ok) {
      authSession = {
        currentUser: session.currentUser || null
      };
    } else {
      authSession = { currentUser: null };
    }
  } catch {
    authSession = { currentUser: null };
  }

  if (authSession.currentUser) {
    await refreshDuelRequests({ silent: true });
    await refreshOnlineDuelStatus({ silent: true });
  } else {
    duelRequests = { inbound: [], outbound: [] };
    onlineDuelState = {
      enabled: false,
      available: false,
      configured: false,
      room: null,
      side: null
    };
  }
  renderAuthSection();
}

async function applyAuthStateFromEvent(session) {
  if (session?.ok) {
    authSession = {
      currentUser: session.currentUser || null
    };
  } else {
    authSession = { currentUser: null };
  }
  if (authSession.currentUser) {
    await refreshDuelRequests({ silent: true });
    await refreshOnlineDuelStatus({ silent: true });
  } else {
    authSearchResults = [];
    authSearchExecuted = false;
    duelRequests = { inbound: [], outbound: [] };
    onlineDuelState = {
      enabled: false,
      available: false,
      configured: false,
      room: null,
      side: null
    };
    renderDuelSearchResults();
    renderDuelRequestList();
    renderOnlineDuelStatus();
  }
  renderAuthSection();
}

async function refreshDuelRequests(options = {}) {
  const silent = Boolean(options.silent);
  if (!authSession.currentUser) {
    duelRequests = { inbound: [], outbound: [] };
    renderDuelRequestList();
    return;
  }
  try {
    const response = await window.petApi.listDuelRequests();
    if (response?.ok) {
      duelRequests = {
        inbound: Array.isArray(response.inbound) ? response.inbound : [],
        outbound: Array.isArray(response.outbound) ? response.outbound : []
      };
    } else {
      duelRequests = { inbound: [], outbound: [] };
      if (!silent) {
        appendLog(
          t("authSearchErrorLog", {
            message: localizeAuthErrorMessage(response?.error || "list failed")
          })
        );
      }
    }
  } catch (error) {
    duelRequests = { inbound: [], outbound: [] };
    if (!silent) {
      appendLog(
        t("authSearchErrorLog", {
          message: localizeAuthErrorMessage(error instanceof Error ? error.message : "list failed")
        })
      );
    }
  }
  renderDuelRequestList();
  renderDuelSearchResults();
}

async function sendDuelRequest(targetAccount) {
  const account = typeof targetAccount === "string" ? targetAccount.trim() : "";
  if (!account) return;
  const response = await window.petApi.sendDuelRequest(account);
  if (!response?.ok) {
    appendLog(
      t("authSendRequestFailLog", {
        message: localizeAuthErrorMessage(response?.error || "request failed")
      })
    );
    return;
  }
  appendLog(t("authSendRequestSuccessLog", { account }));
  await refreshDuelRequests({ silent: true });
}

function getUserAvatarToken(input) {
  const text = typeof input === "string" ? input.trim() : "";
  if (!text) return "U";
  return text.slice(0, 1).toUpperCase();
}

async function logoutAccount() {
  closeUserMenu();
  setProfileModalVisible(false);
  const response = await window.petApi.authLogout();
  if (!response?.ok) {
    appendLog(
      t("authActionFailLog", {
        message: localizeAuthErrorMessage(response?.error || "logout failed")
      })
    );
    return;
  }
  authSearchResults = [];
  authSearchExecuted = false;
  duelRequests = { inbound: [], outbound: [] };
  onlineDuelState = {
    enabled: false,
    available: false,
    configured: false,
    room: null,
    side: null
  };
  appendLog(currentI18n().authLogoutLog);
  await refreshAuthSession();
}

function toggleUserMenu() {
  if (isUserMenuOpen()) {
    closeUserMenu();
  } else {
    openUserMenu();
  }
  reportHitState();
}

async function saveProfileChanges() {
  if (profileUpdatePending) return;
  const username = profileAccountInput?.value?.trim() || "";
  const oldPassword = profileOldPasswordInput?.value?.trim() || "";
  const newPassword = profileNewPasswordInput?.value?.trim() || "";
  const confirmPassword = profileConfirmPasswordInput?.value?.trim() || "";

  if (!oldPassword) {
    setProfileStatus(currentI18n().profileNeedOldPassword, "error");
    return;
  }
  if (newPassword && newPassword !== confirmPassword) {
    setProfileStatus(currentI18n().profilePasswordMismatch, "error");
    return;
  }

  const currentUsername =
    authSession?.currentUser?.username || authSession?.currentUser?.account || "";
  const changedUsername = username && username !== currentUsername;
  const changedPassword = Boolean(newPassword);
  if (!changedUsername && !changedPassword) {
    setProfileStatus(currentI18n().profileNoChange);
    return;
  }

  profileUpdatePending = true;
  if (profileSaveBtn) profileSaveBtn.disabled = true;
  setProfileStatus(currentI18n().profileHint);
  try {
    const response = await window.petApi.authUpdateProfile({
      username,
      oldPassword,
      newPassword
    });
    if (!response?.ok) {
      setProfileStatus(
        t("authActionFailLog", {
          message: localizeAuthErrorMessage(response?.error || "profile update failed")
        }),
        "error"
      );
      return;
    }
    setProfileStatus(currentI18n().profileSaved, "success");
    await refreshAuthSession();
    setTimeout(() => {
      setProfileModalVisible(false);
    }, 240);
  } catch (error) {
    setProfileStatus(
      t("authActionFailLog", {
        message: localizeAuthErrorMessage(
          error instanceof Error ? error.message : "profile update failed"
        )
      }),
      "error"
    );
  } finally {
    profileUpdatePending = false;
    if (profileSaveBtn) profileSaveBtn.disabled = false;
  }
}

async function searchDuelTarget() {
  const keyword = duelSearchKeywordInput?.value?.trim() || "";
  const response = await window.petApi.searchUsers(keyword, 12);
  if (!response?.ok) {
    appendLog(
      t("authSearchErrorLog", {
        message: localizeAuthErrorMessage(response?.error || "search failed")
      })
    );
    return;
  }
  authSearchExecuted = true;
  authSearchResults = Array.isArray(response.users) ? response.users : [];
  renderDuelSearchResults();
}

function getBattleSettlementCopy(winner) {
  const decorateSubtitle = (base) => {
    if (!settlementExtraMessage) return base;
    return `${base}\n${settlementExtraMessage}`;
  };
  if (winner === "player") {
    return {
      theme: "win",
      title: currentI18n().battleSettlementWinTitle,
      subtitle: decorateSubtitle(currentI18n().battleCelebrateWin)
    };
  }
  if (winner === "enemy") {
    return {
      theme: "lose",
      title: currentI18n().battleSettlementLoseTitle,
      subtitle: decorateSubtitle(currentI18n().battleCelebrateLose)
    };
  }
  return {
    theme: "draw",
    title: currentI18n().battleSettlementDrawTitle,
    subtitle: decorateSubtitle(currentI18n().battleCelebrateDraw)
  };
}

function getCaptureDecisionSettlementCopy() {
  const decision = pendingCaptureDecision || {
    serial: enemyPetInBattle?.serial || "-",
    name: getPetDisplayName(enemyPetInBattle)
  };
  return {
    theme: "win",
    title: currentI18n().battleSettlementCaptureTitle,
    subtitle: t("captureDecisionPrompt", {
      name: decision.name,
      serial: decision.serial
    })
  };
}

function syncBattleSettlementText() {
  if (!battleSettlementElement || battleSettlementElement.classList.contains("hidden")) return;
  if (!battleSettlementTitleElement || !battleSettlementSubtitleElement) return;
  const copy =
    settlementActionMode === "capture"
      ? getCaptureDecisionSettlementCopy()
      : getBattleSettlementCopy(settlementWinner);
  battleSettlementTitleElement.textContent = copy.title;
  battleSettlementSubtitleElement.textContent = copy.subtitle;
  if (settlementConfirmBtn) {
    settlementConfirmBtn.textContent =
      settlementActionMode === "capture"
        ? currentI18n().captureDecisionConfirm
        : currentI18n().battleSettlementConfirm;
  }
  if (settlementSecondaryBtn) {
    settlementSecondaryBtn.textContent = currentI18n().battleSettlementCancel;
    settlementSecondaryBtn.classList.toggle("hidden", settlementActionMode !== "capture");
  }
}

function showBattleSettlement(winner) {
  if (!battleSettlementElement || !battleSettlementTitleElement || !battleSettlementSubtitleElement) {
    return;
  }
  settlementActionMode = "normal";
  settlementWinner = winner;
  const copy = getBattleSettlementCopy(winner);
  battleSettlementElement.classList.remove("hidden", "show", "win", "lose", "draw");
  battleSettlementElement.classList.add(copy.theme);
  battleSettlementTitleElement.textContent = copy.title;
  battleSettlementSubtitleElement.textContent = copy.subtitle;
  if (settlementConfirmBtn) {
    settlementConfirmBtn.textContent = currentI18n().battleSettlementConfirm;
  }
  if (settlementSecondaryBtn) {
    settlementSecondaryBtn.classList.add("hidden");
  }
  requestAnimationFrame(() => {
    battleSettlementElement.classList.add("show");
  });
}

function showCaptureDecisionSettlement(payload) {
  if (!battleSettlementElement || !battleSettlementTitleElement || !battleSettlementSubtitleElement) {
    return;
  }
  pendingCaptureDecision = {
    serial: payload?.serial || enemyPetInBattle?.serial || "-",
    name: payload?.name || getPetDisplayName(enemyPetInBattle)
  };
  settlementActionMode = "capture";
  settlementWinner = "player";
  const copy = getCaptureDecisionSettlementCopy();
  battleSettlementElement.classList.remove("hidden", "show", "win", "lose", "draw");
  battleSettlementElement.classList.add(copy.theme);
  battleSettlementTitleElement.textContent = copy.title;
  battleSettlementSubtitleElement.textContent = copy.subtitle;
  if (settlementConfirmBtn) {
    settlementConfirmBtn.textContent = currentI18n().captureDecisionConfirm;
    settlementConfirmBtn.disabled = false;
  }
  if (settlementSecondaryBtn) {
    settlementSecondaryBtn.textContent = currentI18n().battleSettlementCancel;
    settlementSecondaryBtn.classList.remove("hidden");
    settlementSecondaryBtn.disabled = false;
  }
  requestAnimationFrame(() => {
    battleSettlementElement.classList.add("show");
  });
}

function hideBattleSettlement() {
  if (!battleSettlementElement) return;
  settlementWinner = null;
  settlementExtraMessage = "";
  settlementActionMode = "normal";
  battleSettlementElement.classList.remove("show", "win", "lose", "draw");
  battleSettlementElement.classList.add("hidden");
  if (settlementConfirmBtn) {
    settlementConfirmBtn.textContent = currentI18n().battleSettlementConfirm;
    settlementConfirmBtn.disabled = false;
  }
  if (settlementSecondaryBtn) {
    settlementSecondaryBtn.classList.add("hidden");
    settlementSecondaryBtn.disabled = false;
  }
}

function hideCaptureDecision() {
  pendingCaptureDecision = null;
  if (!captureDecisionElement || !captureDecisionTextElement) return;
  captureDecisionTextElement.textContent = "";
  captureDecisionElement.classList.add("hidden");
}

function showCaptureDecision(payload) {
  // Keep compatibility function name while converging to a single settlement dialog.
  hideCaptureDecision();
  showCaptureDecisionSettlement(payload);
}

async function resolveCaptureDecision(accept) {
  if (!pendingCaptureDecision) {
    hideBattleSettlement();
    hideCaptureDecision();
    return;
  }
  const decision = { ...pendingCaptureDecision };
  if (settlementConfirmBtn) {
    settlementConfirmBtn.disabled = true;
  }
  if (settlementSecondaryBtn) {
    settlementSecondaryBtn.disabled = true;
  }

  const result = await window.petApi.resolveCapture(Boolean(accept));
  if (!result?.ok) {
    if (settlementConfirmBtn) {
      settlementConfirmBtn.disabled = false;
    }
    if (settlementSecondaryBtn) {
      settlementSecondaryBtn.disabled = false;
    }
    appendLog(t("wildRefreshFailLog", { message: result?.error?.message || "resolve failed" }));
    return;
  }

  const captureOutcome = result.captureOutcome;
  if (captureOutcome?.ok) {
    if (captureOutcome.success) {
      settlementExtraMessage = t("battleSettlementCaptureSuccess", {
        serial: captureOutcome.wildPet?.serial || decision.serial || "-"
      });
      appendLog(
        t("wildCaptureSuccessLog", {
          serial: captureOutcome.wildPet?.serial || decision.serial || "-"
        })
      );
      appendLog(
        t("wildCaptureReportLog", {
          serial: captureOutcome.wildPet?.serial || decision.serial || "-"
        })
      );
      await loadInventorySnapshot();
      renderPetInventory();
      renderPetDetail();
      updateBattleHudBadges(getActivePet(), enemyPetInBattle);
    } else {
      settlementExtraMessage = t("battleSettlementCaptureAbandon", {
        serial: captureOutcome.wildPet?.serial || decision.serial || "-"
      });
      appendLog(
        t("battleSettlementCaptureAbandon", {
          serial: captureOutcome.wildPet?.serial || decision.serial || "-"
        })
      );
      appendLog(
        t("wildCaptureAbortLog", {
          serial: captureOutcome.wildPet?.serial || decision.serial || "-"
        })
      );
    }
    await refreshNearbyWildPets({ silent: true });
  }

  hideCaptureDecision();
  hideBattleSettlement();
  await endBattle(false);
}

function setBattleMode(active) {
  battleMode = active;
  battleSceneElement.classList.toggle("battle-mode", active);
  playerModel.orientation = "0deg 0deg 0deg";
  enemyModel.orientation = "0deg 0deg 0deg";
  if (active) {
    applyBattleView();
  } else {
    applyIdleOrbit();
    enemyModel.cameraOrbit = "0deg 74deg auto";
    battleFacingOffsetDeg = 0;
    battleCameraPitchDeg = 74;
  }
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
    hideCaptureDecision();
  } else {
    updateBattleRelationTag(lastBattleState?.player?.element, lastBattleState?.enemy?.element);
  }
  updateBattleHudTop();
  const panelVisible = !panelElement.classList.contains("hidden");
  void window.petApi.setLayoutMode(panelVisible ? "panel" : active ? "battle" : "idle");
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
      disabled ||
      (isDodgeAction && !canUseDodge("player", playerAnger)) ||
      (isUltimateAction && playerAnger < 50);
  }
}

function updateBattleHudBadges(playerPet, enemyPet) {
  if (playerHudAvatarElement) {
    playerHudAvatarElement.textContent = getPetAvatarToken(playerPet);
  }
  if (playerHudLevelElement) {
    playerHudLevelElement.textContent = formatLevelText(getPetLevel(playerPet));
  }
  if (enemyHudAvatarElement) {
    enemyHudAvatarElement.textContent = getPetAvatarToken(enemyPet);
  }
  if (enemyHudLevelElement) {
    enemyHudLevelElement.textContent = formatLevelText(getPetLevel(enemyPet));
  }
}

function patchRosterPet(updatedPet) {
  if (!updatedPet?.id) return;
  const idx = petRoster.findIndex((pet) => pet.id === updatedPet.id);
  if (idx < 0) return;
  petRoster[idx] = normalizeRosterPet(updatedPet, petRoster[idx]);
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
  const playerDisplayElement = battleMode ? state.player.element : activePet.element;
  const enemyDisplayElement = battleMode ? state.enemy.element : enemyPetInBattle.element;

  battleRoundElement.textContent = `${currentI18n().round}: ${state.round}`;

  updateBar(hpFillPlayer, hpValuePlayer, state.player.hp, state.player.maxHp, (v, m) => `${v}/${m}`);
  updateBar(hpFillEnemy, hpValueEnemy, state.enemy.hp, state.enemy.maxHp, (v, m) => `${v}/${m}`);
  updateBar(angerFillPlayer, angerValuePlayer, state.player.anger, 100, (v) => `${v}%`);
  updateBar(angerFillEnemy, angerValueEnemy, state.enemy.anger, 100, (v) => `${v}%`);

  playerElementLabel.textContent = getElementText(playerDisplayElement);
  enemyElementLabel.textContent = getElementText(enemyDisplayElement);
  setModelElementTint(playerModel, playerDisplayElement);
  setModelElementTint(enemyModel, enemyDisplayElement);
  setElementTagTheme(playerElementLabel, playerDisplayElement);
  setElementTagTheme(enemyElementLabel, enemyDisplayElement);
  updateBattleRelationTag(playerDisplayElement, enemyDisplayElement);
  uiRefs.playerLabel.textContent = getPetDisplayName(activePet);
  uiRefs.enemyLabel.textContent = getPetDisplayName(enemyPetInBattle);
  updateBattleHudBadges(activePet, enemyPetInBattle);

  statusPlayerElement.textContent = formatStatuses(state.player.statuses);
  statusEnemyElement.textContent = formatStatuses(state.enemy.statuses);

  updateBattleHudTop();
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
  hideCaptureDecision();
  settlementExtraMessage = "";
  freeDodgeUsedBySide = { player: false, enemy: false };
  setBattleMode(true);
  clearRoundFeed();
  lastRoundResultElement.textContent = "";
  setPanelVisible(false);

  const activePet = getActivePet();
  if (isOnlineDuelReadyForBattle()) {
    playerModel.src = activePet.model;
    setModelElementTint(playerModel, activePet.element);
    const onlineReset = await window.petApi.onlineDuelReset({
      playerPetId: activePet.id
    });
    if (!onlineReset?.ok) {
      appendLog(
        t("duelOnlineActionFailLog", {
          message: localizeAuthErrorMessage(onlineReset?.error || "online battle reset failed")
        })
      );
      setBattleMode(false);
      return;
    }
    if (onlineReset.room && typeof onlineReset.room === "object") {
      onlineDuelState.room = { ...onlineReset.room };
    }
    if (typeof onlineReset.side === "string" && onlineReset.side.length > 0) {
      onlineDuelState.side = onlineReset.side;
    }
    if (duelOnlineRoomInput && onlineDuelState.room?.room_code) {
      duelOnlineRoomInput.value = onlineDuelState.room.room_code;
    }
    enemyPetInBattle = buildOnlineEnemyPet(onlineDuelState.room || {}, onlineDuelState.side || "host");
    enemyModel.src = enemyPetInBattle.model;
    setModelElementTint(enemyModel, enemyPetInBattle.element);
    territoryOwner = "enemy";
    updateBattleBoard(onlineReset.state);
    setActiveActionTag("");
    startActionCountdown();
    renderOnlineDuelStatus();
    appendLog(
      t("duelOnlineResetLog", {
        roomCode: onlineDuelState.room?.room_code || "-"
      })
    );
    return;
  }

  enemyPetInBattle = chooseEnemyPetForBattle();
  playerModel.src = activePet.model;
  enemyModel.src = enemyPetInBattle.model;
  setModelElementTint(playerModel, activePet.element);
  setModelElementTint(enemyModel, enemyPetInBattle.element);

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
  let battleEndResult = null;
  if (isOnlineDuelReadyForBattle()) {
    try {
      await window.petApi.leaveOnlineDuelRoom(manual ? "manual_end" : "settlement_confirm");
      await refreshOnlineDuelStatus({ silent: true });
    } catch {
      // Keep runtime flow non-blocking.
    }
  } else {
    try {
      battleEndResult = await window.petApi.battleEnd();
    } catch {
      // Keep runtime flow non-blocking even if persistence fails.
    }
  }
  if (battleEndResult?.captureOutcome?.ok && battleEndResult.captureOutcome.success === false) {
    appendLog(
      t("wildCaptureAbortLog", {
        serial: battleEndResult.captureOutcome.wildPet?.serial || "-"
      })
    );
    appendLog(
      t("battleSettlementCaptureAbandon", {
        serial: battleEndResult.captureOutcome.wildPet?.serial || "-"
      })
    );
    await refreshNearbyWildPets({ silent: true });
  }
  clearActionCountdown();
  isRoundResolving = false;
  hideBattleSettlement();
  settlementExtraMessage = "";
  freeDodgeUsedBySide = { player: false, enemy: false };
  setBattleMode(false);
  syncActionButtons();
  appendLog(manual ? t("battleExitLog") : t("battleSettlementConfirmLog"));
  void refreshBattleReports();
}

async function actBattle(action, options = {}) {
  if (!battleMode) {
    setBattleMode(true);
  }
  if (pendingCaptureDecision) return;
  if (isRoundResolving) return;

  let resolvedAction = options.auto ? "normal_attack" : action;
  if (resolvedAction === "dodge" && !canUseDodge("player", lastBattleState?.player?.anger ?? 0)) {
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
    let result = null;
    if (isOnlineDuelReadyForBattle()) {
      const onlineResult = await window.petApi.onlineDuelAct(resolvedAction);
      if (!onlineResult?.ok) {
        throw new Error(onlineResult?.error || "online action failed");
      }
      result = onlineResult;
    } else {
      result = await window.petApi.battleAct(resolvedAction);
    }
    const elapsed = Date.now() - startAt;
    if (elapsed < 220) {
      await sleep(220 - elapsed);
    }
    const round = result.roundResult;
    if (round.actions?.player === "dodge") {
      freeDodgeUsedBySide.player = true;
      if ((lastBattleState?.player?.anger ?? 0) <= 0) {
        appendLog(t("battleFreeDodgeUsed"));
      }
    }
    if (round.actions?.enemy === "dodge") {
      freeDodgeUsedBySide.enemy = true;
    }
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
      } else {
        territoryOwner = "enemy";
        appendLog(t("battleWinEnemy"));
        appendLog(t("battleCelebrateLose"));
        tickerMessages.push(t("battleTickerWinnerEnemy"));
        tickerMessages.push(t("battleCelebrateLose"));
      }

      if (result.progression?.ok && result.progression.pet) {
        patchRosterPet(result.progression.pet);
        if (result.progression.leveledUp) {
          appendLog(
            t("battleLevelUpLog", {
              petName: getPetDisplayName(result.progression.pet),
              level: result.progression.currentLevel
            })
          );
        } else {
          appendLog(
            t("battleExpGainLog", {
              petName: getPetDisplayName(result.progression.pet),
              exp: result.progression.currentExperience,
              required: LEVEL_UP_REQUIRED_WINS
            })
          );
        }
        renderPetInventory();
        renderPetDetail();
        updateBattleHudBadges(getActivePet(), enemyPetInBattle);
      }

      if (result.captureDecisionRequired) {
        showCaptureDecision({
          serial: enemyPetInBattle?.serial || "-",
          name: getPetDisplayName(enemyPetInBattle)
        });
      } else if (result.captureOutcome && result.captureOutcome.ok) {
        if (result.captureOutcome.success) {
          settlementExtraMessage = t("battleSettlementCaptureSuccess", {
            serial: result.captureOutcome.wildPet?.serial || "-"
          });
          appendLog(
            t("wildCaptureSuccessLog", {
              serial: result.captureOutcome.wildPet?.serial || "-"
            })
          );
          appendLog(
            t("wildCaptureReportLog", {
              serial: result.captureOutcome.wildPet?.serial || "-"
            })
          );
          await loadInventorySnapshot();
          renderPetInventory();
          renderPetDetail();
          updateBattleHudBadges(getActivePet(), enemyPetInBattle);
          await refreshNearbyWildPets({ silent: true });
        } else {
          settlementExtraMessage = t("battleSettlementCaptureFail", {
            serial: result.captureOutcome.wildPet?.serial || "-"
          });
          appendLog(
            t("wildCaptureFailLog", {
              serial: result.captureOutcome.wildPet?.serial || "-"
            })
          );
          await refreshNearbyWildPets({ silent: true });
        }
      }

      if (!result.captureDecisionRequired) {
        showBattleSettlement(round.winner);
        void refreshBattleReports();
      }
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
    updateWindowDrag(event);
    if (rotatePointerSession) {
      const deltaX = event.clientX - rotatePointerSession.lastClientX;
      const deltaY = event.clientY - rotatePointerSession.lastClientY;
      rotatePointerSession.lastClientX = event.clientX;
      rotatePointerSession.lastClientY = event.clientY;
      if (rotatePointerSession.mode === "battle") {
        if (deltaX !== 0) {
          battleFacingOffsetDeg += deltaX * 0.45;
        }
        if (deltaY !== 0) {
          battleCameraPitchDeg = clampNumber(
            battleCameraPitchDeg + deltaY * 0.2,
            BATTLE_CAMERA_PITCH_MIN,
            BATTLE_CAMERA_PITCH_MAX
          );
        }
        applyBattleView();
      } else if (deltaX !== 0) {
        idleOrbitDeg += deltaX * 0.55;
        applyIdleOrbit();
      }
    }
    window.__lastMouseX = event.clientX;
    window.__lastMouseY = event.clientY;
    reportHitState();
  });

  window.addEventListener("mouseup", () => {
    endWindowDrag();
    rotatePointerSession = null;
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

  playerCard.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    const panelVisible = !panelElement.classList.contains("hidden");
    if (panelVisible) return;
    event.preventDefault();
    if (event.ctrlKey) {
      rotatePointerSession = {
        mode: battleMode ? "battle" : "idle",
        lastClientX: event.clientX,
        lastClientY: event.clientY
      };
      return;
    }
    if (battleMode) return;
    beginWindowDrag(event);
  });

  playerCard.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    setPanelVisible(true);
  });

  playerCard.addEventListener(
    "wheel",
    (event) => {
      const panelVisible = !panelElement.classList.contains("hidden");
      if (battleMode || panelVisible) return;
      if (!event.ctrlKey) return;
      event.preventDefault();
      const delta = event.deltaY < 0 ? IDLE_WINDOW_SCALE_STEP : -IDLE_WINDOW_SCALE_STEP;
      queueIdleScale(delta);
    },
    { passive: false }
  );

  battleSceneElement.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    const panelVisible = !panelElement.classList.contains("hidden");
    if (panelVisible) return;
    if (!event.ctrlKey) return;
    rotatePointerSession = {
      mode: battleMode ? "battle" : "idle",
      lastClientX: event.clientX,
      lastClientY: event.clientY
    };
  });

  panelElement.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    if (isInteractivePanelTarget(event.target)) return;
    beginWindowDrag(event);
  });
}

function setupButtons() {
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (closeTopLayerByEsc()) {
      event.preventDefault();
    }
  });

  languageBtn.addEventListener("click", () => {
    toggleLanguage();
  });

  userMenuBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleUserMenu();
  });

  userEditProfileBtn?.addEventListener("click", () => {
    closeUserMenu();
    openProfileModal();
  });

  userLogoutBtn?.addEventListener("click", () => {
    void logoutAccount();
  });

  profileSaveBtn?.addEventListener("click", () => {
    void saveProfileChanges();
  });

  const handleProfileEnter = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void saveProfileChanges();
  };
  profileAccountInput?.addEventListener("keydown", handleProfileEnter);
  profileOldPasswordInput?.addEventListener("keydown", handleProfileEnter);
  profileNewPasswordInput?.addEventListener("keydown", handleProfileEnter);
  profileConfirmPasswordInput?.addEventListener("keydown", handleProfileEnter);

  window.addEventListener("mousedown", (event) => {
    if (!isUserMenuOpen()) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const clickedInsideMenu = Boolean(target.closest(".user-menu-wrap"));
    if (!clickedInsideMenu) {
      closeUserMenu();
    }
  });

  duelSearchBtn?.addEventListener("click", () => {
    void searchDuelTarget();
  });

  duelSearchKeywordInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void searchDuelTarget();
  });

  duelOnlineCreateBtn?.addEventListener("click", () => {
    void createOnlineDuelRoom();
  });

  duelOnlineJoinBtn?.addEventListener("click", () => {
    void joinOnlineDuelRoom();
  });

  duelOnlineLeaveBtn?.addEventListener("click", () => {
    void leaveOnlineDuelRoom("manual");
  });

  duelOnlineRoomInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void joinOnlineDuelRoom();
  });

  battleResetBtn.addEventListener("click", () => {
    void resetBattle();
  });

  endBattleBtn.addEventListener("click", () => {
    void endBattle(true);
  });

  if (settlementConfirmBtn) {
    settlementConfirmBtn.addEventListener("click", () => {
      if (settlementActionMode === "capture") {
        void resolveCaptureDecision(true);
      } else {
        void endBattle(false);
      }
    });
  }

  settlementSecondaryBtn?.addEventListener("click", () => {
    if (settlementActionMode === "capture") {
      void resolveCaptureDecision(false);
    }
  });

  captureDecisionConfirmBtn?.addEventListener("click", () => {
    void resolveCaptureDecision(true);
  });
  captureDecisionCancelBtn?.addEventListener("click", () => {
    void resolveCaptureDecision(false);
  });

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

  mapProviderSelectElement.addEventListener("change", async () => {
    const providerId = mapProviderSelectElement.value;
    const result = await window.petApi.setMapProvider(providerId);
    if (!applyMapActionResult(result)) return;
    mapDemoDistanceMeters = null;
    renderMapState();
    appendLog(t("mapProviderChangedLog", { provider: getMapProviderName(providerId) }));
  });

  mapPermissionBtn.addEventListener("click", async () => {
    const mode = mapPermissionSelectElement.value;
    const result = await window.petApi.requestMapPermission(mode);
    if (!applyMapActionResult(result)) return;
    if (mode !== "granted") {
      mapDemoDistanceMeters = null;
      nearbyWildPets = [];
      renderNearbyWildPets();
    }
    renderMapState();
    appendLog(t("mapPermissionAppliedLog", { mode: getMapPermissionName(mode) }));
  });

  mapCurrentBtn.addEventListener("click", async () => {
    const result = await window.petApi.getCurrentLocation();
    if (!applyMapActionResult(result)) return;
    const location = result.state?.lastLocation;
    if (location) {
      appendLog(
        t("mapLocationLog", {
          lat: Number(location.lat).toFixed(5),
          lng: Number(location.lng).toFixed(5)
        })
      );
    }
  });

  mapWatchStartBtn.addEventListener("click", async () => {
    const result = await window.petApi.startMapWatch(1200);
    if (!applyMapActionResult(result)) return;
    appendLog(t("mapWatchStartLog"));
  });

  mapWatchStopBtn.addEventListener("click", async () => {
    const result = await window.petApi.stopMapWatch();
    if (!applyMapActionResult(result)) return;
    appendLog(t("mapWatchStopLog"));
  });

  mapDistanceBtn.addEventListener("click", async () => {
    const providerId = mapState?.providerId === "google" ? "google" : "tencent";
    const target = MAP_DEMO_TARGET[providerId];
    const result = await window.petApi.distanceTo(target);
    if (!applyMapActionResult(result)) return;
    mapDemoDistanceMeters = Number(result.distanceMeters);
    renderMapState();
    appendLog(t("mapDistanceLog", { meters: Number(result.distanceMeters).toFixed(2) }));
  });

  wildRefreshBtn.addEventListener("click", () => {
    void refreshNearbyWildPets();
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

  window.petApi.onMapState((state) => {
    applyMapState(state);
  });

  window.petApi.onAuthState((session) => {
    void applyAuthStateFromEvent(session);
  });

  window.petApi.onOnlineDuelEvent((event) => {
    const room = event?.payload?.room;
    const side = event?.payload?.side;
    if (room && typeof room === "object") {
      onlineDuelState.room = { ...room };
      if (typeof side === "string" && side.length > 0) {
        onlineDuelState.side = side;
      }
      if (duelOnlineRoomInput && room.room_code) {
        duelOnlineRoomInput.value = room.room_code;
      }
      renderOnlineDuelStatus();
    }
  });
}

function setupModelDefaults() {
  playerModel.addEventListener("load", () => {
    measureIdleModelBase();
    if (battleMode) {
      applyBattleView();
    } else {
      applyIdleOrbit();
    }
    updateBattleHudTop();
    if (!battleMode && panelElement.classList.contains("hidden")) {
      void applyIdleWindowScale(idleWindowScale);
    }
    playModelAnimation(playerModel, ["survey", "idle", "walk"]);
  });

  enemyModel.addEventListener("load", () => {
    if (battleMode) {
      applyBattleView();
    }
    updateBattleHudTop();
    playModelAnimation(enemyModel, ["idle", "walk", "run"]);
  });
}

async function bootstrap() {
  await loadInventorySnapshot();
  const activePet = getActivePet();
  playerModel.src = activePet.model;
  enemyPetInBattle = chooseEnemyPetForBattle();
  enemyModel.src = enemyPetInBattle.model;
  setModelElementTint(playerModel, activePet.element);
  setModelElementTint(enemyModel, enemyPetInBattle.element);
  applyIdleOrbit();

  applyLanguage();
  await refreshBattleReports();
  await refreshAuthSession();
  await refreshMapState();
  runtimeInfo = await window.petApi.getRuntimeInfo();
  renderRuntimeInfo();
  appendLog(t("runtimeStarted"));

  setupButtons();
  setupMouseTracking();
  setupIpcEvents();
  setupModelDefaults();
  window.addEventListener("resize", () => {
    syncInventoryListHeight();
    positionPetDetailPopover();
    updateBattleHudTop();
  });
  panelElement.addEventListener(
    "scroll",
    () => {
      positionPetDetailPopover();
    },
    { passive: true }
  );
  inventoryListElement.addEventListener(
    "scroll",
    () => {
      positionPetDetailPopover();
    },
    { passive: true }
  );
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
