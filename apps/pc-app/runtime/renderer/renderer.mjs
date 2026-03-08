const panelElement = document.getElementById("panel");
const runtimeElement = document.getElementById("runtime");
const versionHistoryModalElement = document.getElementById("version-history-modal");
const versionHistoryTitleElement = document.getElementById("version-history-title");
const versionHistoryHintElement = document.getElementById("version-history-hint");
const versionHistoryListElement = document.getElementById("version-history-list");
const versionHistoryCloseBtn = document.getElementById("btn-version-history-close");
const logElement = document.getElementById("log");
const captureBtn = document.getElementById("btn-capture");
const occupyBtn = document.getElementById("btn-occupy");
const pauseBtn = document.getElementById("btn-pause");
const battleResetBtn = document.getElementById("btn-battle-reset");
const endBattleBtn = document.getElementById("btn-end-battle");
const battleExitDoorBtn = document.getElementById("btn-battle-exit-door");
const battleExitConfirmElement = document.getElementById("battle-exit-confirm");
const battleExitConfirmTextElement = document.getElementById("battle-exit-confirm-text");
const battleExitConfirmCancelBtn = document.getElementById("btn-battle-exit-cancel");
const battleExitConfirmConfirmBtn = document.getElementById("btn-battle-exit-confirm");
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
const releaseConfirmModalElement = document.getElementById("release-confirm-modal");
const releaseConfirmMessageElement = document.getElementById("release-confirm-message");
const releaseConfirmSerialValueElement = document.getElementById("release-confirm-serial-value");
const releaseConfirmCapturedValueElement = document.getElementById("release-confirm-captured-value");
const releaseConfirmCancelBtn = document.getElementById("btn-release-confirm-cancel");
const releaseConfirmOkBtn = document.getElementById("btn-release-confirm-ok");
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
const duelRequestIndicatorElement = document.getElementById("duel-request-indicator");
const duelAdvancedToggleBtn = document.getElementById("btn-duel-advanced-toggle");
const duelAdvancedToggleIconElement = document.getElementById("duel-advanced-toggle-icon");
const duelAdvancedContentElement = document.getElementById("duel-advanced-content");
const duelOnlineRoomInput = document.getElementById("duel-online-room-code");
const duelOnlineCreateBtn = document.getElementById("btn-duel-online-create");
const duelOnlineJoinBtn = document.getElementById("btn-duel-online-join");
const duelOnlineLeaveBtn = document.getElementById("btn-duel-online-leave");
const duelOnlineStatusElement = document.getElementById("duel-online-status");
const exportOnlineLogBtn = document.getElementById("btn-export-online-log");
const modelCalibrationModelSelect = document.getElementById("model-calibration-model");
const modelCalibrationIdleOrientationXInput = document.getElementById("model-calibration-idle-orientation-x");
const modelCalibrationIdleOrientationYInput = document.getElementById("model-calibration-idle-orientation-y");
const modelCalibrationBattleOrientationXInput = document.getElementById("model-calibration-battle-orientation-x");
const modelCalibrationBattleOrientationYInput = document.getElementById("model-calibration-battle-orientation-y");
const modelCalibrationIdleScaleInput = document.getElementById("model-calibration-idle-scale");
const modelCalibrationBattleScaleInput = document.getElementById("model-calibration-battle-scale");
const modelCalibrationApplyBtn = document.getElementById("btn-model-calibration-apply");
const modelCalibrationResetBtn = document.getElementById("btn-model-calibration-reset");
const modelCalibrationStatusElement = document.getElementById("model-calibration-status");
const modelCalibrationPreviewLabelElement = document.getElementById("model-calibration-preview-label");
const modelCalibrationPreviewModeBtn = document.getElementById("btn-model-calibration-preview-mode");
const modelCalibrationPreviewModel = document.getElementById("model-calibration-preview");
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
const petHoverToolsElement = document.getElementById("pet-hover-tools");
const hoverMoodBtn = document.getElementById("btn-hover-mood");
const hoverTrainBtn = document.getElementById("btn-hover-train");
const hoverInteractBtn = document.getElementById("btn-hover-interact");
const petChatBubbleElement = document.getElementById("pet-chat-bubble");
const showPetBtn = document.getElementById("btn-show-pet");
const aiSettingsTitleElement = document.getElementById("ai-settings-title");
const aiSettingsTipElement = document.getElementById("ai-settings-tip");
const aiProviderLabelElement = document.getElementById("ai-provider-label");
const aiFrequencyLabelElement = document.getElementById("ai-frequency-label");
const aiApiKeyLabelElement = document.getElementById("ai-api-key-label");
const aiCustomMinutesLabelElement = document.getElementById("ai-custom-minutes-label");
const aiBaseUrlLabelElement = document.getElementById("ai-base-url-label");
const aiModelLabelElement = document.getElementById("ai-model-label");
const aiProviderSelect = document.getElementById("ai-provider-select");
const aiFrequencySelect = document.getElementById("ai-frequency-select");
const aiApiKeyInput = document.getElementById("ai-api-key-input");
const aiCustomMinutesInput = document.getElementById("ai-custom-minutes-input");
const aiBaseUrlInput = document.getElementById("ai-base-url-input");
const aiModelInput = document.getElementById("ai-model-input");
const aiSettingsStatusElement = document.getElementById("ai-settings-status");
const aiSettingsTestBtn = document.getElementById("btn-ai-settings-test");
const aiSettingsSaveBtn = document.getElementById("btn-ai-settings-save");

const i18n = {
  zh: {
    appTitle: "灵境",
    appSlogan: "拾一缕灵息，守一方小境",
    loadingRuntime: "正在加载运行时...",
    battleTitle: "对战控制",
    playerPet: "我方灵宠",
    enemyPet: "敌方灵宠",
    round: "回合",
    hp: "生命",
    anger: "怒气",
    playerElement: "我方属性",
    enemyElement: "敌方属性",
    resetBattle: "开始对战",
    endBattle: "结束对战",
    battleExitDoorLabel: "离开战斗",
    battleExitConfirmText: "确认离开战斗？",
    battleExitConfirmSubmit: "确认离开",
    battleExitConfirmCancel: "取消",
    closePanel: "关闭面板",
    sectionCollapse: "收起分组",
    sectionExpand: "展开分组",
    actionNormal: "普攻",
    actionElement: "属性",
    actionDodge: "闪避",
    actionUltimate: "大招",
    companionTitle: "陪伴交互（待开发）",
    captureTest: "收留测试",
    occupyTest: "占领测试",
    pauseHit: "暂停穿透判定",
    resumeHit: "恢复穿透判定",
    tip: "提示：桌面默认只显示你的灵宠，开始对战后会出现敌方灵宠。",
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
    battleExitLog: "已退出对战，桌面恢复为仅显示我的灵宠。",
    battleSettlementConfirmLog: "已确认结算，桌面恢复为仅显示我的灵宠。",
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
    petInteract: "你轻轻摸了摸灵宠。",
    hoverTrainBtn: "对战",
    hoverInteractBtn: "互动",
    hoverMoodLabel: "心情",
    showPetBtn: "显示灵宠",
    hoverTrainStartLog: "已为 {petName} 发起对战。",
    hoverMoodBoostLog: "{petName} 心情提升到 {mood}。",
    moodPassiveExpLog: "{petName} 心情稳定，在线陪伴奖励 +{exp} 经验（{current}/{required}）。",
    petHiddenLog: "灵宠已隐藏，点击“显示灵宠”可恢复。",
    petShownLog: "灵宠已恢复显示。",
    aiSettingsTitle: "AI互动设置",
    aiSettingsTip: "配置厂商、Key 与频率；可用于互动按钮与定时气泡。",
    aiProviderLabel: "大模型厂商",
    aiApiKeyLabel: "API Key",
    aiBaseUrlLabel: "Base URL",
    aiModelLabel: "模型名",
    aiFrequencyLabel: "互动频率",
    aiCustomMinutesLabel: "自定义分钟",
    aiFrequency30: "每30分钟",
    aiFrequency60: "每1小时",
    aiFrequencyCustom: "自定义",
    aiSettingsTestBtn: "测试连接",
    aiSettingsSaveBtn: "保存设置",
    aiSettingsTesting: "正在测试连接...",
    aiSettingsTestSuccess: "连接成功：AI 服务可用。",
    aiSettingsTestFail: "连接失败：{message}",
    aiSettingsStatusNoKey: "未配置 AI Key 时将使用本地文案兜底。",
    aiSettingsStatusSaved: "AI 设置已保存。",
    aiBubbleFallbackIdle: "{petName} 想和你说说话：主人，忙完记得休息一下。",
    aiBubbleFallbackFocus: "{petName} 提醒：主人你好像很忙，再忙也别忘了喝水。",
    aiBubbleFallbackSlack: "{petName} 嘀咕：主人你是不是在偷偷摸鱼呀？",
    aiRequestFailedLog: "AI互动请求失败，已使用本地文案：{message}",
    actionSent: "已提交本回合动作。",
    battleLevelUpLog: "{petName} 升级到 Lv.{level}，属性已提升。",
    battleExpGainLog: "{petName} 获得经验：{exp}/{required}。",
    battleExpDeltaFeed: "{petName} +{exp} 经验",
    activePetChanged: "已切换当前出战灵宠：{petName}",
    inventoryTitle: "现有灵宠",
    inventoryTip: "桌面右键灵宠可打开面板；点击下方头像后在右侧查看详情。",
    inventoryPlaceholder: "点击左侧灵宠头像查看详情",
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
    inventorySelectedDetail: "灵宠详情",
    inventoryDetailClose: "关闭",
    inventoryRelease: "放逐",
    inventoryReleaseConfirmTitle: "确认放逐",
    inventoryReleaseConfirmMessage: "确认放逐 {petName} 吗？",
    inventoryReleaseConfirmSerial: "编号",
    inventoryReleaseConfirmCapturedAt: "收留时间",
    inventoryReleaseConfirmCancel: "取消",
    inventoryReleaseConfirmSubmit: "确认放逐",
    inventoryReleaseDone: "已放逐灵宠：{petName}",
    inventoryReleaseKeepOne: "至少保留一只灵宠，无法放逐。",
    inventoryReleaseFail: "放逐失败：{message}",
    modelCalibrationTitle: "模型校准（高级）",
    modelCalibrationTip: "按模型调整静息/对战朝向，修正倒地截断和朝向反转。",
    modelCalibrationModelLabel: "目标模型",
    modelCalibrationIdleOrientationXLabel: "静息朝向X(度)",
    modelCalibrationIdleOrientationYLabel: "静息朝向Y(度)",
    modelCalibrationBattleOrientationXLabel: "对战朝向X(度)",
    modelCalibrationBattleOrientationYLabel: "对战朝向Y(度)",
    modelCalibrationIdleScaleLabel: "静息动作缩放",
    modelCalibrationBattleScaleLabel: "对战动作缩放",
    modelCalibrationPreviewLabel: "实时预览（左右拖动=Y朝向，上下拖动=X朝向）",
    modelCalibrationOriginTip:
      "说明：原点在底部（脚底）是常见模型枢轴设置，绕 X/Z 旋转会像“翻倒”，属模型原始特性。",
    modelCalibrationPreviewModeIdle: "静息预览",
    modelCalibrationPreviewModeBattle: "对战预览",
    modelCalibrationApplyBtn: "保存校准",
    modelCalibrationResetBtn: "恢复默认",
    modelCalibrationStatusHint: "可按模型保存独立校准。",
    modelCalibrationStatusSaved: "模型校准已保存并生效。",
    modelCalibrationStatusReset: "已清除该模型校准，恢复默认。",
    modelCalibrationStatusNoModel: "暂无可校准模型。",
    duelTitle: "对战申请",
    duelAdvancedTitle: "高级选项：手动房间控制",
    duelAdvancedExpand: "展开高级选项",
    duelAdvancedCollapse: "收起高级选项",
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
    authSearchResend: "补发申请",
    authSearchResendCooldown: "{seconds}s 后可补发",
    authSearchSelf: "不能挑战自己",
    authRequestTitle: "对战申请",
    authRequestInbound: "收到申请",
    authRequestOutbound: "发出申请",
    authRequestEmpty: "暂无申请记录。",
    authRequestPending: "待处理",
    authRequestAccepted: "已接受",
    authRequestRejected: "已拒绝",
    authRequestCancelled: "已取消",
    authRequestExpandMore: "展开剩余 {count} 条",
    authRequestCollapse: "收起记录",
    authRequestFlow: "{from} -> {to}",
    authRequestEntering: "进入中...",
    authRequestProcessing: "处理中...",
    authRequestAcceptBtn: "接受",
    authRequestRejectBtn: "拒绝",
    authRequestCancelBtn: "取消",
    authLogoutLog: "已退出登录。",
    authSearchErrorLog: "账号搜索失败：{message}",
    authActionFailLog: "账号操作失败：{message}",
    authSessionInvalidatedLog: "登录状态已失效：该账号已在其他设备登录，请重新登录。",
    authSessionInvalidatedToast: "账号已在其他设备登录，当前会话已下线。",
    authPendingRequestBadgeTitle: "待处理对战申请",
    authSendRequestSuccessLog: "已向 {account} 发起对战申请。",
    authSendRequestResentLog: "已向 {account} 补发对战申请。",
    authSendRequestFailLog: "发起对战申请失败：{message}",
    authRequestRespondSuccessLog: "已{decision}来自 {account} 的对战申请。",
    authRequestCancelSuccessLog: "已取消发给 {account} 的对战申请。",
    authRequestAcceptedGuideLog: "申请通过后自动建房并同步房间号，双方将自动进入联机房。",
    authRequestMatchedRoomLog: "匹配房间已创建：{roomCode}，正在等待对手加入。",
    authRequestAutoJoinLog: "检测到匹配房间：{roomCode}，正在自动加入。",
    authInboundRequestLog: "收到新的对战申请：{accounts}。",
    authInboundRequestToastSingle: "收到来自 {account} 的对战申请（右键灵宠打开面板可处理）",
    authInboundRequestToastMulti: "收到 {count} 条新的对战申请（右键灵宠打开面板可处理）",
    duelOnlineRoomLabel: "联机房间号",
    duelOnlineCreateBtn: "创建联机房",
    duelOnlineJoinBtn: "加入房间",
    duelOnlineLeaveBtn: "离开房间",
    duelOnlineStatusNeedLogin: "联机状态：请先登录",
    duelOnlineStatusInitializing: "联机状态：初始化中...",
    duelOnlineStatusUnavailable: "联机状态：Supabase 客户端不可用（请先执行 npm install）",
    duelOnlineStatusDisabled: "联机状态：未配置 SUPABASE_URL / SUPABASE_ANON_KEY",
    duelOnlineStatusDisabledDetail: "联机状态：未配置 {keys}",
    duelOnlineStatusIdle: "联机状态：未加入房间",
    duelOnlineStatusWaiting: "联机状态：房间 {roomCode} 等待对手",
    duelOnlineStatusActive: "联机状态：房间 {roomCode} 对战中（点“开始对战”进入）",
    duelOnlineStatusFinished: "联机状态：房间 {roomCode} 已结束",
    duelOnlineCreateSuccessLog: "联机房已创建：{roomCode}",
    duelOnlineJoinSuccessLog: "已加入联机房：{roomCode}",
    duelOnlineLeaveLog: "已离开联机房。",
    duelOnlineActionFailLog: "联机操作失败：{message}",
    duelOnlineAutoJoinSwitchRoomLog: "检测到旧房间 {fromCode}，正在切换并自动加入新房间 {toCode}",
    duelOnlineAutoJoinStopRetryLog: "自动加入房间 {roomCode} 失败，已停止自动重试（可手动加入）。",
    duelOnlineResetLog: "联机对战已同步，房间号：{roomCode}",
    duelOnlineAutoEnterLog: "检测到房间 {roomCode} 已开战，正在自动进入对战。",
    duelOnlinePetLockedLog: "本场联机已锁定出战灵宠：{petName}（{element}）。",
    duelOnlineParticipantsLog: "本房间出战：{hostName}（{hostElement}） vs {guestName}（{guestElement}）",
    duelDiagnosticLog:
      "[联机诊断] {reason} | room={roomCode}/{status} | side={side} | round={round} | local={local} | host={host} | guest={guest} | pModel={playerModel} | eModel={enemyModel} | battle={battleMode}",
    duelDiagnosticExportBtn: "导出联机会话日志",
    duelDiagnosticExportDone: "联机会话日志已导出：{fileName}",
    duelOpponentFledWinLog: "对手已逃跑，恭喜获得胜利。",
    duelOpponentLeftLog: "对局中断：对方已离开房间。",
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
    wildTitle: "附近流浪灵宠",
    wildTip: "进入100米范围可发起收服对战，胜利后自动入库灵宠仓并保留编号。",
    wildRefresh: "刷新附近灵宠",
    wildEmpty: "附近暂无可见流浪灵宠，请先开启定位或移动位置。",
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
    wildRefreshLog: "附近流浪灵宠刷新完成，共 {count} 只。",
    wildRefreshFailLog: "附近灵宠刷新失败：{message}",
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
    runtimeStarted: "灵境桌宠运行时已启动。",
    languageButton: "EN",
    runtimeVersionHint: "点击查看版本更新历史",
    runtimeInfo: "v{app}",
    versionHistoryTitle: "版本更新历史",
    versionHistoryHint: "点击上方版本号可随时查看每个版本的更新内容。",
    versionHistoryClose: "关闭",
    versionHistoryEmpty: "暂无版本记录。",
    versionHistoryCurrent: "当前版本",
    versionHistoryDatePrefix: "日期",
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
    appTitle: "Lingjing",
    appSlogan: "Gather a trace of spirit, guard a little realm.",
    loadingRuntime: "Loading runtime...",
    battleTitle: "Battle Control",
    playerPet: "Your Spirit Pet",
    enemyPet: "Enemy Spirit Pet",
    round: "Round",
    hp: "HP",
    anger: "Anger",
    playerElement: "Player Element",
    enemyElement: "Enemy Element",
    resetBattle: "Start Battle",
    endBattle: "End Battle",
    battleExitDoorLabel: "Leave Battle",
    battleExitConfirmText: "Confirm leaving the battle?",
    battleExitConfirmSubmit: "Leave",
    battleExitConfirmCancel: "Cancel",
    closePanel: "Close Panel",
    sectionCollapse: "Collapse section",
    sectionExpand: "Expand section",
    actionNormal: "Normal",
    actionElement: "Element",
    actionDodge: "Dodge",
    actionUltimate: "Ultimate",
    companionTitle: "Companion Interaction (WIP)",
    captureTest: "Capture Test",
    occupyTest: "Territory Test",
    pauseHit: "Pause Hit-Test",
    resumeHit: "Resume Hit-Test",
    tip: "Tip: desktop shows your spirit pet only; enemy appears after battle starts.",
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
    battleExitLog: "Battle exited. Desktop now shows only your spirit pet.",
    battleSettlementConfirmLog: "Settlement confirmed. Desktop now shows only your spirit pet.",
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
    petInteract: "You gently patted your spirit pet.",
    hoverTrainBtn: "Battle",
    hoverInteractBtn: "Interact",
    hoverMoodLabel: "Mood",
    showPetBtn: "Show Pet",
    hoverTrainStartLog: "{petName} entered a duel.",
    hoverMoodBoostLog: "{petName}'s mood increased to {mood}.",
    moodPassiveExpLog:
      "{petName} is in a good mood. Online companion bonus +{exp} EXP ({current}/{required}).",
    petHiddenLog: "Spirit pet hidden. Click \"Show Pet\" to restore.",
    petShownLog: "Spirit pet is visible again.",
    aiSettingsTitle: "AI Interaction Settings",
    aiSettingsTip: "Configure provider, key and frequency for manual and timed bubbles.",
    aiProviderLabel: "Provider",
    aiApiKeyLabel: "API Key",
    aiBaseUrlLabel: "Base URL",
    aiModelLabel: "Model",
    aiFrequencyLabel: "Frequency",
    aiCustomMinutesLabel: "Custom Minutes",
    aiFrequency30: "Every 30 min",
    aiFrequency60: "Every 1 hour",
    aiFrequencyCustom: "Custom",
    aiSettingsTestBtn: "Test Connection",
    aiSettingsSaveBtn: "Save Settings",
    aiSettingsTesting: "Testing connection...",
    aiSettingsTestSuccess: "Connection succeeded: AI service is available.",
    aiSettingsTestFail: "Connection failed: {message}",
    aiSettingsStatusNoKey: "No API key configured. Local fallback lines will be used.",
    aiSettingsStatusSaved: "AI settings saved.",
    aiBubbleFallbackIdle: "{petName}: Hey, remember to take a break after work.",
    aiBubbleFallbackFocus: "{petName}: You look busy. Please remember to drink some water.",
    aiBubbleFallbackSlack: "{petName}: Are you secretly slacking off, human?",
    aiRequestFailedLog: "AI request failed, switched to local fallback: {message}",
    actionSent: "Battle action sent.",
    battleLevelUpLog: "{petName} reached Lv.{level}; stats upgraded.",
    battleExpGainLog: "{petName} gained EXP: {exp}/{required}.",
    battleExpDeltaFeed: "{petName} +{exp} EXP",
    activePetChanged: "Active spirit pet switched: {petName}",
    inventoryTitle: "Spirit Pet Inventory",
    inventoryTip:
      "Right-click your desktop spirit pet to open panel; click avatar then view details on the right.",
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
    inventorySelectedDetail: "Spirit Pet Detail",
    inventoryDetailClose: "Close",
    inventoryRelease: "Release",
    inventoryReleaseConfirmTitle: "Confirm Release",
    inventoryReleaseConfirmMessage: "Release {petName}?",
    inventoryReleaseConfirmSerial: "Serial",
    inventoryReleaseConfirmCapturedAt: "Captured At",
    inventoryReleaseConfirmCancel: "Cancel",
    inventoryReleaseConfirmSubmit: "Release Pet",
    inventoryReleaseDone: "Spirit pet released: {petName}",
    inventoryReleaseKeepOne: "At least one spirit pet must remain.",
    inventoryReleaseFail: "Release failed: {message}",
    modelCalibrationTitle: "Model Calibration (Advanced)",
    modelCalibrationTip: "Adjust idle/battle facing per model to fix clipping and wrong orientation.",
    modelCalibrationModelLabel: "Target Model",
    modelCalibrationIdleOrientationXLabel: "Idle Facing X (deg)",
    modelCalibrationIdleOrientationYLabel: "Idle Facing Y (deg)",
    modelCalibrationBattleOrientationXLabel: "Battle Facing X (deg)",
    modelCalibrationBattleOrientationYLabel: "Battle Facing Y (deg)",
    modelCalibrationIdleScaleLabel: "Idle Action Scale",
    modelCalibrationBattleScaleLabel: "Battle Action Scale",
    modelCalibrationPreviewLabel: "Live Preview (Left/Right=Y, Up/Down=X)",
    modelCalibrationOriginTip:
      "Note: a bottom/feet pivot is common; X/Z rotation can look like tipping. This is a model pivot characteristic.",
    modelCalibrationPreviewModeIdle: "Idle Preview",
    modelCalibrationPreviewModeBattle: "Battle Preview",
    modelCalibrationApplyBtn: "Save Calibration",
    modelCalibrationResetBtn: "Reset Default",
    modelCalibrationStatusHint: "Calibration is stored per model file.",
    modelCalibrationStatusSaved: "Model calibration saved and applied.",
    modelCalibrationStatusReset: "Model calibration cleared and reset to defaults.",
    modelCalibrationStatusNoModel: "No model available for calibration.",
    duelTitle: "Duel Requests",
    duelAdvancedTitle: "Advanced: Manual Room Controls",
    duelAdvancedExpand: "Expand advanced options",
    duelAdvancedCollapse: "Collapse advanced options",
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
    authSearchResend: "Resend",
    authSearchResendCooldown: "Resend in {seconds}s",
    authSearchSelf: "Cannot challenge yourself",
    authRequestTitle: "Duel Requests",
    authRequestInbound: "Inbound",
    authRequestOutbound: "Outbound",
    authRequestEmpty: "No duel requests yet.",
    authRequestPending: "Pending",
    authRequestAccepted: "Accepted",
    authRequestRejected: "Rejected",
    authRequestCancelled: "Cancelled",
    authRequestExpandMore: "Show {count} more",
    authRequestCollapse: "Collapse",
    authRequestFlow: "{from} -> {to}",
    authRequestEntering: "Entering...",
    authRequestProcessing: "Processing...",
    authRequestAcceptBtn: "Accept",
    authRequestRejectBtn: "Reject",
    authRequestCancelBtn: "Cancel",
    authLogoutLog: "Logged out.",
    authSearchErrorLog: "Account search failed: {message}",
    authActionFailLog: "Auth action failed: {message}",
    authSessionInvalidatedLog: "Session expired: this account signed in elsewhere. Please log in again.",
    authSessionInvalidatedToast: "Signed out: this account is active on another device.",
    authPendingRequestBadgeTitle: "Pending duel requests",
    authSendRequestSuccessLog: "Duel request sent to {account}.",
    authSendRequestResentLog: "Duel request resent to {account}.",
    authSendRequestFailLog: "Duel request failed: {message}",
    authRequestRespondSuccessLog: "Request from {account} has been {decision}.",
    authRequestCancelSuccessLog: "Cancelled request sent to {account}.",
    authRequestAcceptedGuideLog:
      "Accepting request now auto-creates a room and shares room code to both sides.",
    authRequestMatchedRoomLog: "Match room created: {roomCode}. Waiting for opponent.",
    authRequestAutoJoinLog: "Matched room detected: {roomCode}. Auto joining...",
    authInboundRequestLog: "New duel request(s) received: {accounts}.",
    authInboundRequestToastSingle:
      "New duel request from {account} (right-click spirit pet to open panel and respond)",
    authInboundRequestToastMulti:
      "Received {count} new duel requests (right-click spirit pet to open panel and respond)",
    duelOnlineRoomLabel: "Online Room Code",
    duelOnlineCreateBtn: "Create Online Room",
    duelOnlineJoinBtn: "Join Room",
    duelOnlineLeaveBtn: "Leave Room",
    duelOnlineStatusNeedLogin: "Online: login required",
    duelOnlineStatusInitializing: "Online: initializing...",
    duelOnlineStatusUnavailable: "Online: Supabase client unavailable (run npm install first)",
    duelOnlineStatusDisabled: "Online: SUPABASE_URL / SUPABASE_ANON_KEY not configured",
    duelOnlineStatusDisabledDetail: "Online: missing {keys}",
    duelOnlineStatusIdle: "Online: no room joined",
    duelOnlineStatusWaiting: "Online: room {roomCode} waiting for opponent",
    duelOnlineStatusActive: "Online: room {roomCode} active (click Start Battle)",
    duelOnlineStatusFinished: "Online: room {roomCode} finished",
    duelOnlineCreateSuccessLog: "Online room created: {roomCode}",
    duelOnlineJoinSuccessLog: "Joined online room: {roomCode}",
    duelOnlineLeaveLog: "Left online room.",
    duelOnlineActionFailLog: "Online operation failed: {message}",
    duelOnlineAutoJoinSwitchRoomLog:
      "Detected stale room {fromCode}, switching to auto-join new room {toCode}",
    duelOnlineAutoJoinStopRetryLog:
      "Auto-join failed for room {roomCode}; stopped retrying automatically (manual join available).",
    duelOnlineResetLog: "Online battle synced. Room: {roomCode}",
    duelOnlineAutoEnterLog: "Room {roomCode} is active. Auto entering battle.",
    duelOnlinePetLockedLog: "This online match is locked to: {petName} ({element}).",
    duelOnlineParticipantsLog: "Lineup: {hostName} ({hostElement}) vs {guestName} ({guestElement})",
    duelDiagnosticLog:
      "[Duel Diagnostic] {reason} | room={roomCode}/{status} | side={side} | round={round} | local={local} | host={host} | guest={guest} | pModel={playerModel} | eModel={enemyModel} | battle={battleMode}",
    duelDiagnosticExportBtn: "Export Online Session Log",
    duelDiagnosticExportDone: "Online session log exported: {fileName}",
    duelOpponentFledWinLog: "Opponent fled. Victory is yours.",
    duelOpponentLeftLog: "Duel interrupted: opponent left the room.",
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
    wildTitle: "Nearby Wild Spirit Pets",
    wildTip: "Enter 100m capture radius to duel and recruit wild spirit pets with serial IDs.",
    wildRefresh: "Refresh Nearby Spirit Pets",
    wildEmpty: "No visible wild spirit pets nearby. Enable location or move around.",
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
    wildRefreshLog: "Nearby wild spirit pets refreshed: {count}.",
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
    runtimeStarted: "Lingjing desktop runtime started.",
    languageButton: "中文",
    runtimeVersionHint: "Click to view release history",
    runtimeInfo: "v{app}",
    versionHistoryTitle: "Release History",
    versionHistoryHint: "Click the version text above to view updates for each build.",
    versionHistoryClose: "Close",
    versionHistoryEmpty: "No release notes available.",
    versionHistoryCurrent: "Current",
    versionHistoryDatePrefix: "Date",
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

const RELEASE_HISTORY = [
  {
    version: "0.1.7",
    date: "2026-03-08",
    highlights: {
      zh: [
        "默认阵容回滚到上一版猫狗模型（Shiba Inu / Husky / Cat），撤回低质替换。",
        "新增模型保底呼吸动效，未带骨骼动画的模型也不再静止。"
      ],
      en: [
        "Rolled default roster back to previous cat/dog set (Shiba Inu / Husky / Cat).",
        "Added fallback breathing motion so non-rigged models no longer look static."
      ]
    }
  },
  {
    version: "0.1.6",
    date: "2026-03-08",
    highlights: {
      zh: [
        "默认阵容升级为统一风格猫狗模型（Beagle / Puppy / Poodle / Cat / Kitten / Husky）。",
        "联机元素模型映射同步更新，优先展示新版猫狗模型。",
        "补充模型来源与许可清单，便于内测阶段素材追溯。"
      ],
      en: [
        "Upgraded default roster to a cohesive cat/dog set (Beagle / Puppy / Poodle / Cat / Kitten / Husky).",
        "Updated online elemental model mapping to prioritize the new model set.",
        "Expanded model source/license catalog for easier beta asset tracking."
      ]
    }
  },
  {
    version: "0.1.5",
    date: "2026-03-07",
    highlights: {
      zh: [
        "版本号移动到左上角标题“灵境”后方，不再单独占行。",
        "接入 4 个猫狗主题模型并切换默认展示与联机映射。",
        "新增模型目录清单（含来源与许可信息）。"
      ],
      en: [
        "Moved version text beside top-left title instead of a separate row.",
        "Integrated 4 cat/dog themed models and switched default + online mappings.",
        "Added model catalog with source and license metadata."
      ]
    }
  },
  {
    version: "0.1.4",
    date: "2026-03-07",
    highlights: {
      zh: [
        "修复托盘与程序图标显示，补齐 Windows 打包图标。",
        "托盘右键菜单改为中文/英文自适应。",
        "版本号并入左上角标题，点击可查看更新历史。",
        "新增猫狗主题模型（Shiba Inu / Husky / Cat）。"
      ],
      en: [
        "Fixed tray/app icon rendering and added Windows packaging icon assets.",
        "Tray context menu now follows zh/en locale.",
        "Version text moved into top-left title and opens release history on click.",
        "Added cat & dog themed model set (Shiba Inu / Husky / Cat)."
      ]
    }
  },
  {
    version: "0.1.3",
    date: "2026-03-07",
    highlights: {
      zh: ["修复登录后反复自动连接历史房间的问题。", "增加自动入房失败后停重试与请求过期保护。"],
      en: [
        "Fixed repeated auto-join attempts to stale rooms after login.",
        "Added stop-retry and accepted-request age guard for auto-join."
      ]
    }
  },
  {
    version: "0.1.2",
    date: "2026-03-07",
    highlights: {
      zh: ["修复接受对战后偶发不进入战斗的问题。"],
      en: ["Fixed occasional failure to enter battle after accepting a duel request."]
    }
  },
  {
    version: "0.1.1",
    date: "2026-03-07",
    highlights: {
      zh: ["全局伤害下调，属性克制倍率调整为 1.2。", "注册/登录/联机错误提示中文化增强。"],
      en: [
        "Reduced global damage values and adjusted elemental multiplier to 1.2.",
        "Improved Chinese localization for auth/online error prompts."
      ]
    }
  }
];

const DEFAULT_PET_ROSTER = [
  {
    id: "pet-001",
    serial: "0019001",
    name: { zh: "焰柴", en: "BlazeShiba" },
    model: "../assets/models/AnimatedDogShibaInu.glb",
    element: "fire",
    stats: "HP128 / ATK32 / DEF20 / SPD18",
    capturedAt: "2026-03-01 21:10",
    avatar: "柴",
    level: 1,
    experience: 0,
    mood: 60,
    winsTotal: 0
  },
  {
    id: "pet-002",
    serial: "0029001",
    name: { zh: "墨喵", en: "InkCat" },
    model: "../assets/models/Husky.glb",
    element: "water",
    stats: "HP122 / ATK28 / DEF24 / SPD21",
    capturedAt: "2026-03-02 09:35",
    avatar: "墨",
    level: 1,
    experience: 0,
    mood: 60,
    winsTotal: 0
  },
  {
    id: "pet-003",
    serial: "0039001",
    name: { zh: "礼帽喵", en: "TuxedoCat" },
    model: "../assets/models/TuxedoCatAnimated.glb",
    element: "wood",
    stats: "HP130 / ATK26 / DEF26 / SPD17",
    capturedAt: "2026-03-02 20:42",
    avatar: "礼",
    level: 1,
    experience: 0,
    mood: 60,
    winsTotal: 0
  },
  {
    id: "pet-004",
    serial: "0049001",
    name: { zh: "钢狼", en: "SteelWolf" },
    model: "../assets/models/Husky.glb",
    element: "metal",
    stats: "HP135 / ATK30 / DEF30 / SPD12",
    capturedAt: "2026-03-03 08:20",
    avatar: "钢",
    level: 1,
    experience: 0,
    mood: 60,
    winsTotal: 0
  },
  {
    id: "pet-005",
    serial: "0059001",
    name: { zh: "赤柴", en: "AmberShiba" },
    model: "../assets/models/AnimatedDogShibaInu.glb",
    element: "earth",
    stats: "HP142 / ATK24 / DEF34 / SPD10",
    capturedAt: "2026-03-03 18:05",
    avatar: "赤",
    level: 1,
    experience: 0,
    mood: 60,
    winsTotal: 0
  },
  {
    id: "pet-006",
    serial: "0069001",
    name: { zh: "柴豆", en: "ShibaBean" },
    model: "../assets/models/AnimatedDogShibaInu.glb",
    element: "fire",
    stats: "HP118 / ATK33 / DEF22 / SPD20",
    capturedAt: "2026-03-04 12:11",
    avatar: "豆",
    level: 1,
    experience: 0,
    mood: 60,
    winsTotal: 0
  }
];

const ONLINE_MODEL_BY_ELEMENT = {
  fire: "../assets/models/AnimatedDogShibaInu.glb",
  water: "../assets/models/Husky.glb",
  wood: "../assets/models/TuxedoCatAnimated.glb",
  metal: "../assets/models/Husky.glb",
  earth: "../assets/models/AnimatedDogShibaInu.glb"
};
const DISABLED_MODEL_FILE_TO_FALLBACK = Object.freeze({
  "ananimatedcat.glb": "../assets/models/Husky.glb",
  "marcelprizepug.glb": "../assets/models/Husky.glb"
});

const uiRefs = {
  appTitleText: document.getElementById("app-title-text"),
  appSlogan: document.getElementById("app-slogan"),
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
  duelAdvancedTitle: document.getElementById("duel-advanced-title"),
  duelSearchLabel: document.getElementById("duel-search-label"),
  duelOnlineRoomLabel: document.getElementById("duel-online-room-label"),
  modelCalibrationTitle: document.getElementById("model-calibration-title"),
  modelCalibrationTip: document.getElementById("model-calibration-tip"),
  modelCalibrationModelLabel: document.getElementById("model-calibration-model-label"),
  modelCalibrationIdleOrientationXLabel: document.getElementById("model-calibration-idle-orientation-x-label"),
  modelCalibrationIdleOrientationYLabel: document.getElementById("model-calibration-idle-orientation-y-label"),
  modelCalibrationBattleOrientationXLabel: document.getElementById("model-calibration-battle-orientation-x-label"),
  modelCalibrationBattleOrientationYLabel: document.getElementById("model-calibration-battle-orientation-y-label"),
  modelCalibrationIdleScaleLabel: document.getElementById("model-calibration-idle-scale-label"),
  modelCalibrationBattleScaleLabel: document.getElementById("model-calibration-battle-scale-label"),
  modelCalibrationPreviewLabel: document.getElementById("model-calibration-preview-label"),
  modelCalibrationOriginTip: document.getElementById("model-calibration-origin-tip"),
  profileAccountLabel: document.getElementById("profile-account-label"),
  profileOldPasswordLabel: document.getElementById("profile-old-password-label"),
  profileNewPasswordLabel: document.getElementById("profile-new-password-label"),
  profileConfirmPasswordLabel: document.getElementById("profile-confirm-password-label"),
  releaseConfirmTitle: document.getElementById("release-confirm-title"),
  releaseConfirmSerialLabel: document.getElementById("release-confirm-serial-label"),
  releaseConfirmCapturedLabel: document.getElementById("release-confirm-captured-label"),
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
const PANEL_SECTION_STATE_STORAGE_KEY = "qp_panel_section_state_v1";
const DUEL_ADVANCED_STATE_STORAGE_KEY = "qp_duel_advanced_state_v1";
const MODEL_VIEW_CALIBRATION_STORAGE_KEY = "qp_model_view_calibration_v3";
const PANEL_SECTION_DEFAULT_EXPANDED_BY_KEY = Object.freeze({
  "ai-settings": false,
  "model-calibration": false
});
const PANEL_SECTION_ALWAYS_COLLAPSED_BY_DEFAULT = new Set([
  "ai-settings",
  "ai-settings-title",
  "model-calibration",
  "model-calibration-title"
]);

let language = getInitialLanguage();
let panelSectionState = loadPanelSectionState();
let modelViewCalibrations = loadModelViewCalibrations();
let panelSectionToggleEntries = [];
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
  statusLoaded: false,
  availabilityError: null,
  hasSupabaseUrl: false,
  hasSupabaseAnonKey: false,
  room: null,
  side: null
};
let authSearchExecuted = false;
let profileUpdatePending = false;

const ACTION_COUNTDOWN_SECONDS = 10;
const DUEL_SYNC_POLL_INTERVAL_MS = 1200;
const DUEL_REQUEST_RESEND_INTERVAL_MS = 30 * 1000;
const DUEL_AUTO_JOIN_MAX_AGE_MS = 30 * 60 * 1000;
const DUEL_REQUEST_TOAST_DURATION_MS = 4200;
const LEVEL_UP_REQUIRED_EXPERIENCE = 100;
const BATTLE_WIN_EXPERIENCE = 20;
const BATTLE_LOSE_EXPERIENCE = 5;
const PET_MOOD_MIN = 0;
const PET_MOOD_MAX = 100;
const PET_MOOD_DEFAULT = 60;
const PET_MOOD_GOOD_THRESHOLD = 70;
const PET_INTERACT_MOOD_BOOST = 8;
const MOOD_PASSIVE_EXP_HOURLY = 10;
const MOOD_PASSIVE_TICK_MS = 60 * 1000;
const MOOD_PASSIVE_INTERVAL_MS = 60 * 60 * 1000;
const AI_BUBBLE_SHOW_MS = 6200;
const AI_BUBBLE_HIDE_GUARD_MS = 400;
const AI_MANUAL_MIN_INTERVAL_MS = 3500;
const AI_ACTIVITY_IDLE_MS = 90 * 1000;
const AI_ACTIVITY_BUSY_EVENTS = 20;
const AI_CUSTOM_FREQ_MIN_MINUTES = 5;
const AI_CUSTOM_FREQ_MAX_MINUTES = 720;
const AI_DEFAULT_BASE_URL_DEEPSEEK = "https://api.deepseek.com/v1";
const AI_DEFAULT_BASE_URL_OPENAI = "https://api.openai.com/v1";
const AI_SETTINGS_STORAGE_KEY = "qp_ai_settings_v1";
const PET_HOVER_HIDE_DELAY_MS = 220;
const IDLE_OVERLAY_HEADROOM_PX = 72;
const IDLE_WINDOW_SCALE_STEP = 0.04;
const IDLE_WINDOW_SCALE_MIN = 0.82;
const IDLE_WINDOW_SCALE_MAX = 2.2;
const IDLE_POSE_WINDOW_SYNC_INTERVAL_MS = 280;
const BATTLE_PLAYER_AZIMUTH_DEG = -92;
const BATTLE_ENEMY_AZIMUTH_DEG = 92;
const BATTLE_CAMERA_PITCH_MIN = 58;
const BATTLE_CAMERA_PITCH_MAX = 86;
const DETAIL_MODEL_DEFAULT_ORBIT_DEG = 18;
const DETAIL_MODEL_DEFAULT_PITCH_DEG = 74;
const WIDE_POSE_ANIMATION_PATTERN = /(lie|lying|sleep|down|rest|roll|crawl|sprawl|sit)/i;
const CALIBRATION_DRAG_DEADZONE_PX = 1.1;
const CALIBRATION_DRAG_HORIZONTAL_SENSITIVITY = 0.6;
const CALIBRATION_DRAG_VERTICAL_SENSITIVITY = 0.5;
const DEFAULT_MODEL_VIEW_PROFILE = Object.freeze({
  idleOrientationXDeg: 0,
  idleOrientationYDeg: 0,
  idleRadius: "auto",
  idleTarget: "",
  battleOrientationXDeg: 0,
  battleOrientationYDeg: 0,
  battleRadius: "auto",
  battleTarget: "",
  battlePitchOffsetDeg: 0,
  detailOrientationXDeg: 0,
  detailOrientationYDeg: 0,
  detailOrbitDeg: DETAIL_MODEL_DEFAULT_ORBIT_DEG,
  detailPitchDeg: DETAIL_MODEL_DEFAULT_PITCH_DEG,
  detailRadius: "auto",
  detailTarget: "",
  poseWideScaleIdle: 1.24,
  poseWideScaleBattle: 1.34,
  poseWideScaleDetail: 1.24
});
const MODEL_VIEW_PROFILE_BY_FILE = {
  "animateddogshibainu.glb": {
    idleRadius: "118%",
    idleTarget: "0m -0.03m 0m",
    detailRadius: "122%",
    poseWideScaleIdle: 1.32,
    poseWideScaleBattle: 1.46,
    poseWideScaleDetail: 1.28
  }
};
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
let idleWindowSizeSignature = "";
let lastIdlePoseWindowSyncAt = 0;
let panelTransitionSeq = 0;
let duelSyncPollingTimer = null;
let duelSyncPollingInFlight = false;
let duelRequestsInitialized = false;
let pendingInboundRequestIds = new Set();
let duelRequestListExpanded = false;
let pendingDuelRequestFocusId = null;
const pendingDuelRequestActions = new Map();
let duelAdvancedExpanded = loadDuelAdvancedState();
let duelRequestToastElement = null;
let duelRequestToastTimer = null;
let onlineBattleAutoEnterInFlight = false;
const autoJoinHandledRequestIds = new Set();
let duelAutoJoinInFlight = false;
let inventoryListHeightSyncTimer = null;
let activePetUpdatePromise = null;
let lastOpponentFledNoticeKey = "";
let freeDodgeUsedBySide = {
  player: false,
  enemy: false
};
let pendingReleasePet = null;
let selectedCalibrationModelFile = "";
let calibrationPreviewMode = "idle";
let calibrationPreviewDragSession = null;
const modelCalibrationSourceMap = new Map();
let petHiddenByDoubleClick = false;
let hoverToolsVisible = false;
let hoverHideDelayTimer = null;
let chatBubbleTimer = null;
let chatBubbleHideAt = 0;
let chatBubbleHoverPinned = false;
let moodPassiveTickTimer = null;
let lastMoodPassiveExpAt = Date.now();
let aiSettings = null;
let aiSchedulerTimer = null;
let lastAiBubbleAt = 0;
let lastAiManualRequestAt = 0;
let aiRequestInFlight = false;
let aiTopicCursor = 0;
let interactionActivity = {
  lastMouseAt: Date.now(),
  lastKeyboardAt: Date.now(),
  mouseEvents: [],
  keyEvents: []
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

const AI_TOPIC_HINTS_ZH = Object.freeze([
  "回忆第一次认识主人的时刻",
  "讲一个短小冷笑话",
  "可爱地抱怨一下今天的小挫折",
  "点评上一场对战的操作",
  "给主人一句轻松打气",
  "提醒主人喝水和活动颈肩",
  "结合一条今日新闻给出灵宠视角感想"
]);

const AI_TOPIC_HINTS_EN = Object.freeze([
  "Recall the first day you met your owner",
  "Tell one tiny joke",
  "Give a playful complaint about today's setback",
  "Comment on the last duel in-character",
  "Give a short encouragement line",
  "Remind the owner to hydrate and stretch",
  "Mention one current headline with a pet-like opinion"
]);

function getInitialLanguage() {
  const stored = localStorage.getItem(LANG_STORAGE_KEY);
  if (stored === "en" || stored === "zh") return stored;
  return "zh";
}

function loadPanelSectionState() {
  try {
    const raw = localStorage.getItem(PANEL_SECTION_STATE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const next = { ...parsed };
    for (const key of PANEL_SECTION_ALWAYS_COLLAPSED_BY_DEFAULT) {
      delete next[key];
    }
    return next;
  } catch {
    return {};
  }
}

function savePanelSectionState() {
  try {
    localStorage.setItem(PANEL_SECTION_STATE_STORAGE_KEY, JSON.stringify(panelSectionState));
  } catch {
    // Keep local persistence best-effort.
  }
}

function loadDuelAdvancedState() {
  try {
    const raw = localStorage.getItem(DUEL_ADVANCED_STATE_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.expanded);
  } catch {
    return false;
  }
}

function saveDuelAdvancedState() {
  try {
    localStorage.setItem(
      DUEL_ADVANCED_STATE_STORAGE_KEY,
      JSON.stringify({
        expanded: duelAdvancedExpanded
      })
    );
  } catch {
    // Keep local persistence best-effort.
  }
}

function clampInt(value, min, max) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function sanitizeMoodValue(value) {
  return clampInt(value, PET_MOOD_MIN, PET_MOOD_MAX);
}

function getDefaultAiSettings() {
  return {
    provider: "deepseek",
    apiKey: "",
    baseUrl: AI_DEFAULT_BASE_URL_DEEPSEEK,
    model: "deepseek-chat",
    frequencyMode: "60",
    customMinutes: 60
  };
}

function getAiSettingsStorageKeyForSession() {
  const account = authSession?.currentUser?.account;
  if (typeof account === "string" && account.trim().length > 0) {
    return `${AI_SETTINGS_STORAGE_KEY}:${account.trim().toLowerCase()}`;
  }
  return AI_SETTINGS_STORAGE_KEY;
}

function normalizeAiSettings(input) {
  const fallback = getDefaultAiSettings();
  const providerRaw = typeof input?.provider === "string" ? input.provider.trim().toLowerCase() : "";
  const provider =
    providerRaw === "openai" || providerRaw === "openai_compatible" || providerRaw === "deepseek"
      ? providerRaw
      : fallback.provider;
  const apiKey =
    typeof input?.apiKey === "string" && input.apiKey.trim().length > 0 ? input.apiKey.trim() : "";
  const baseUrlRaw = typeof input?.baseUrl === "string" ? input.baseUrl.trim() : "";
  const defaultBase = provider === "openai" ? AI_DEFAULT_BASE_URL_OPENAI : AI_DEFAULT_BASE_URL_DEEPSEEK;
  const baseUrl = baseUrlRaw.length > 0 ? baseUrlRaw.replace(/\/+$/, "") : defaultBase;
  const modelRaw = typeof input?.model === "string" ? input.model.trim() : "";
  const model = modelRaw.length > 0 ? modelRaw : provider === "openai" ? "gpt-4o-mini" : "deepseek-chat";
  const frequencyRaw = typeof input?.frequencyMode === "string" ? input.frequencyMode.trim() : "";
  const frequencyMode =
    frequencyRaw === "30" || frequencyRaw === "60" || frequencyRaw === "custom" ? frequencyRaw : "60";
  const customMinutes = clampInt(
    input?.customMinutes,
    AI_CUSTOM_FREQ_MIN_MINUTES,
    AI_CUSTOM_FREQ_MAX_MINUTES
  );
  return {
    provider,
    apiKey,
    baseUrl,
    model,
    frequencyMode,
    customMinutes
  };
}

function loadAiSettings() {
  try {
    const key = getAiSettingsStorageKeyForSession();
    const raw = localStorage.getItem(key);
    if (!raw) return getDefaultAiSettings();
    const parsed = JSON.parse(raw);
    return normalizeAiSettings(parsed);
  } catch {
    return getDefaultAiSettings();
  }
}

function saveAiSettings(silent = false) {
  aiSettings = normalizeAiSettings(aiSettings);
  try {
    const key = getAiSettingsStorageKeyForSession();
    localStorage.setItem(key, JSON.stringify(aiSettings));
    if (!silent) {
      setAiSettingsStatus(currentI18n().aiSettingsStatusSaved, "success");
    }
  } catch {
    if (!silent) {
      setAiSettingsStatus(currentI18n().aiSettingsStatusNoKey, "error");
    }
  }
  renderAiSettingsPanel();
  restartAiBubbleScheduler();
}

function setAiSettingsStatus(text, tone = "normal") {
  if (!aiSettingsStatusElement) return;
  aiSettingsStatusElement.textContent = text;
  aiSettingsStatusElement.classList.remove("error", "success");
  if (tone === "error") aiSettingsStatusElement.classList.add("error");
  if (tone === "success") aiSettingsStatusElement.classList.add("success");
}

function renderAiSettingsPanel() {
  if (!aiSettings) {
    aiSettings = getDefaultAiSettings();
  }
  if (aiProviderSelect) aiProviderSelect.value = aiSettings.provider;
  if (aiApiKeyInput) aiApiKeyInput.value = aiSettings.apiKey || "";
  if (aiBaseUrlInput) aiBaseUrlInput.value = aiSettings.baseUrl || "";
  if (aiModelInput) aiModelInput.value = aiSettings.model || "";
  if (aiFrequencySelect) aiFrequencySelect.value = aiSettings.frequencyMode;
  if (aiCustomMinutesInput) aiCustomMinutesInput.value = String(aiSettings.customMinutes);
  const showCustom = aiSettings.frequencyMode === "custom";
  if (aiCustomMinutesInput) {
    aiCustomMinutesInput.disabled = !showCustom;
  }
  setAiSettingsStatus(
    aiSettings.apiKey ? currentI18n().aiSettingsStatusSaved : currentI18n().aiSettingsStatusNoKey,
    aiSettings.apiKey ? "success" : "normal"
  );
}

function getAiFrequencyMs() {
  if (!aiSettings) return 60 * 60 * 1000;
  if (aiSettings.frequencyMode === "30") return 30 * 60 * 1000;
  if (aiSettings.frequencyMode === "custom") {
    return clampInt(
      aiSettings.customMinutes,
      AI_CUSTOM_FREQ_MIN_MINUTES,
      AI_CUSTOM_FREQ_MAX_MINUTES
    ) * 60 * 1000;
  }
  return 60 * 60 * 1000;
}

function pushActivityEvent(list, timestamp) {
  list.push(timestamp);
  const threshold = timestamp - 5 * 60 * 1000;
  while (list.length > 0 && list[0] < threshold) {
    list.shift();
  }
}

function getActivityHint() {
  const now = Date.now();
  const lastInputAt = Math.max(interactionActivity.lastMouseAt, interactionActivity.lastKeyboardAt);
  if (now - lastInputAt >= AI_ACTIVITY_IDLE_MS) {
    return "idle";
  }
  const recentInputCount = interactionActivity.mouseEvents.length + interactionActivity.keyEvents.length;
  if (recentInputCount >= AI_ACTIVITY_BUSY_EVENTS) {
    return "busy";
  }
  return "normal";
}

function normalizeModelViewCalibrationEntry(entry) {
  if (!entry || typeof entry !== "object") return {};
  const read = (key, min, max) => {
    const value = Number(entry[key]);
    if (!Number.isFinite(value)) return null;
    return clampNumber(value, min, max);
  };

  const normalized = {};
  const idleOrientationXDeg = read("idleOrientationXDeg", -180, 180);
  const idleOrientationYDeg = read("idleOrientationYDeg", -180, 180);
  const battleOrientationXDeg = read("battleOrientationXDeg", -180, 180);
  const battleOrientationYDeg = read("battleOrientationYDeg", -180, 180);
  const detailOrientationXDeg = read("detailOrientationXDeg", -180, 180);
  const detailOrientationYDeg = read("detailOrientationYDeg", -180, 180);
  const poseWideScaleIdle = read("poseWideScaleIdle", 1, 2.6);
  const poseWideScaleBattle = read("poseWideScaleBattle", 1, 2.6);
  const poseWideScaleDetail = read("poseWideScaleDetail", 1, 2.6);

  if (idleOrientationXDeg !== null) normalized.idleOrientationXDeg = idleOrientationXDeg;
  if (idleOrientationYDeg !== null) normalized.idleOrientationYDeg = idleOrientationYDeg;
  if (battleOrientationXDeg !== null) normalized.battleOrientationXDeg = battleOrientationXDeg;
  if (battleOrientationYDeg !== null) normalized.battleOrientationYDeg = battleOrientationYDeg;
  if (detailOrientationXDeg !== null) normalized.detailOrientationXDeg = detailOrientationXDeg;
  if (detailOrientationYDeg !== null) normalized.detailOrientationYDeg = detailOrientationYDeg;
  if (poseWideScaleIdle !== null) normalized.poseWideScaleIdle = poseWideScaleIdle;
  if (poseWideScaleBattle !== null) normalized.poseWideScaleBattle = poseWideScaleBattle;
  if (poseWideScaleDetail !== null) normalized.poseWideScaleDetail = poseWideScaleDetail;
  return normalized;
}

function loadModelViewCalibrations() {
  try {
    const raw = localStorage.getItem(MODEL_VIEW_CALIBRATION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const normalized = {};
    for (const [key, value] of Object.entries(parsed)) {
      const fileKey = getModelSourceFileName(key);
      if (!fileKey) continue;
      const entry = normalizeModelViewCalibrationEntry(value);
      if (Object.keys(entry).length === 0) continue;
      normalized[fileKey] = entry;
    }
    return normalized;
  } catch {
    return {};
  }
}

function saveModelViewCalibrations() {
  try {
    localStorage.setItem(MODEL_VIEW_CALIBRATION_STORAGE_KEY, JSON.stringify(modelViewCalibrations));
  } catch {
    // Keep local persistence best-effort.
  }
}

function applyDuelAdvancedExpanded(expanded, options = {}) {
  const normalized = Boolean(expanded);
  duelAdvancedExpanded = normalized;
  if (duelAdvancedContentElement) {
    duelAdvancedContentElement.classList.toggle("hidden", !normalized);
  }
  if (duelAdvancedToggleBtn) {
    duelAdvancedToggleBtn.setAttribute("aria-expanded", String(normalized));
    const hint = normalized
      ? currentI18n().duelAdvancedCollapse
      : currentI18n().duelAdvancedExpand;
    duelAdvancedToggleBtn.title = hint;
    duelAdvancedToggleBtn.setAttribute(
      "aria-label",
      `${currentI18n().duelAdvancedTitle} ${hint}`
    );
  }
  if (duelAdvancedToggleIconElement) {
    duelAdvancedToggleIconElement.textContent = normalized ? "▾" : "▸";
  }
  if (options.persist) {
    saveDuelAdvancedState();
  }
}

function resolvePanelSectionKey(sectionElement, index) {
  const explicitKey = sectionElement.getAttribute("data-section-key");
  if (explicitKey && explicitKey.trim().length > 0) return explicitKey.trim();
  const titleId = sectionElement.querySelector("h2[id]")?.id;
  if (titleId && titleId.trim().length > 0) return titleId.trim();
  return `section-${index}`;
}

function getPanelSectionDefaultExpanded(key) {
  if (!key) return true;
  if (!Object.prototype.hasOwnProperty.call(PANEL_SECTION_DEFAULT_EXPANDED_BY_KEY, key)) return true;
  return Boolean(PANEL_SECTION_DEFAULT_EXPANDED_BY_KEY[key]);
}

function applyPanelSectionExpanded(entry, expanded, options = {}) {
  if (!entry || !entry.section || !entry.body || !entry.button) return;
  const normalized = Boolean(expanded);
  entry.section.classList.toggle("collapsed", !normalized);
  entry.body.classList.toggle("hidden", !normalized);
  entry.button.setAttribute("aria-expanded", String(normalized));
  entry.button.textContent = normalized ? "▾" : "▸";
  const label = normalized ? currentI18n().sectionCollapse : currentI18n().sectionExpand;
  entry.button.setAttribute("aria-label", label);
  entry.button.title = label;

  if (options.persist) {
    panelSectionState[entry.key] = normalized;
    savePanelSectionState();
  }
}

function refreshPanelSectionToggleLabels() {
  for (const entry of panelSectionToggleEntries) {
    const expanded = entry.button.getAttribute("aria-expanded") === "true";
    applyPanelSectionExpanded(entry, expanded, { persist: false });
  }
}

function setPanelSectionExpandedByKey(key, expanded, options = {}) {
  const normalizedKey = typeof key === "string" ? key.trim() : "";
  if (!normalizedKey) return false;
  const entry = panelSectionToggleEntries.find((item) => item.key === normalizedKey);
  if (!entry) return false;
  applyPanelSectionExpanded(entry, expanded, {
    persist: options.persist !== false
  });
  scheduleInventoryListHeightSync();
  positionPetDetailPopover();
  updateBattleHudTop();
  return true;
}

function setupPanelSectionToggles() {
  if (!panelElement) return;
  if (panelSectionToggleEntries.length > 0) {
    refreshPanelSectionToggleLabels();
    return;
  }

  const sections = panelElement.querySelectorAll(".panel-section");
  sections.forEach((sectionElement, index) => {
    const titleElement = sectionElement.querySelector("h2");
    if (!titleElement) return;

    const header = document.createElement("div");
    header.className = "panel-section-header";
    sectionElement.insertBefore(header, titleElement);
    header.appendChild(titleElement);

    const body = document.createElement("div");
    body.className = "panel-section-body";
    while (header.nextSibling) {
      body.appendChild(header.nextSibling);
    }
    sectionElement.appendChild(body);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "panel-section-toggle";
    header.appendChild(button);

    const key = resolvePanelSectionKey(sectionElement, index);
    sectionElement.setAttribute("data-section-key", key);
    const entry = {
      key,
      section: sectionElement,
      body,
      button
    };
    panelSectionToggleEntries.push(entry);

    const expanded = Object.prototype.hasOwnProperty.call(panelSectionState, key)
      ? panelSectionState[key] !== false
      : getPanelSectionDefaultExpanded(key);
    applyPanelSectionExpanded(entry, expanded, { persist: false });
    button.addEventListener("click", () => {
      const currentExpanded = button.getAttribute("aria-expanded") === "true";
      applyPanelSectionExpanded(entry, !currentExpanded, { persist: true });
      scheduleInventoryListHeightSync();
      positionPetDetailPopover();
      updateBattleHudTop();
    });
  });
}

function currentI18n() {
  return i18n[language];
}

function t(key, params) {
  const template = currentI18n()[key];
  if (typeof template !== "string") return String(template ?? key);
  return template.replace(/\{(\w+)\}/g, (_, token) => String(params?.[token] ?? ""));
}

function setVersionHistoryVisible(visible) {
  if (!versionHistoryModalElement) return;
  const nextVisible = Boolean(visible);
  versionHistoryModalElement.classList.toggle("hidden", !nextVisible);
  if (nextVisible) {
    renderVersionHistory();
  }
  reportHitState();
}

function renderVersionHistory() {
  if (!versionHistoryListElement) return;
  if (!Array.isArray(RELEASE_HISTORY) || RELEASE_HISTORY.length === 0) {
    versionHistoryListElement.innerHTML = `<div class="duel-empty">${currentI18n().versionHistoryEmpty}</div>`;
    return;
  }

  const locale = language === "zh" ? "zh" : "en";
  const currentVersion = String(runtimeInfo?.appVersion || "").trim();
  const entries = RELEASE_HISTORY.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const cardHtml = entries
    .map((item) => {
      const version = String(item.version || "-");
      const date = String(item.date || "-");
      const notes = Array.isArray(item.highlights?.[locale]) ? item.highlights[locale] : [];
      const noteItems =
        notes.length > 0
          ? notes.map((note) => `<li>${String(note || "")}</li>`).join("")
          : `<li>${currentI18n().versionHistoryEmpty}</li>`;
      const isCurrent = currentVersion.length > 0 && version === currentVersion;
      const currentBadge = isCurrent
        ? `<span class="version-history-item-current">${currentI18n().versionHistoryCurrent}</span>`
        : "";
      return `
        <article class="version-history-item ${isCurrent ? "current" : ""}">
          <div class="version-history-item-head">
            <span class="version-history-item-version">v${version}</span>
            <span class="version-history-item-date">${currentI18n().versionHistoryDatePrefix}: ${date}</span>
            ${currentBadge}
          </div>
          <ul class="version-history-item-notes">${noteItems}</ul>
        </article>
      `;
    })
    .join("");
  versionHistoryListElement.innerHTML = cardHtml;
}

function unwrapErrorMessage(raw) {
  const text = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
  if (!text) return "";

  const tryParseMessage = (candidate) => {
    try {
      const parsed = JSON.parse(candidate);
      const payloadMessage =
        parsed?.error?.message || parsed?.message || parsed?.data?.error?.message || null;
      return typeof payloadMessage === "string" ? payloadMessage.trim() : "";
    } catch {
      return "";
    }
  };

  const direct = tryParseMessage(text);
  if (direct) return direct;

  const jsonStart = text.indexOf("{");
  if (jsonStart >= 0) {
    const sliced = text.slice(jsonStart);
    const nested = tryParseMessage(sliced);
    if (nested) return nested;
  }
  return text;
}

function localizeAuthErrorMessage(message) {
  const raw = unwrapErrorMessage(message);
  if (!raw) {
    return language === "zh" ? "未知错误" : "unknown error";
  }
  if (language !== "zh") return raw;

  const lower = raw.toLowerCase();
  const mappings = [
    ["session invalidated", "账号已在其他设备登录，请重新登录"],
    ["session token is required", "登录态已失效，请重新登录"],
    ["invalid session token", "登录态已失效，请重新登录"],
    ["login required", "请先登录"],
    ["account is required", "账号不能为空"],
    ["account already exists", "账号已存在"],
    ["account length must be 3-32", "账号长度需在 3-32 之间"],
    ["account cannot contain spaces", "账号不能包含空格"],
    ["account not found", "账号不存在"],
    ["password is required", "密码不能为空"],
    ["password length must be 6-64", "密码长度需在 6-64 之间"],
    ["invalid password", "密码错误"],
    ["username is required", "用户名不能为空"],
    ["username length must be 2-24", "用户名长度需在 2-24 之间"],
    ["old password is required", "请输入旧密码"],
    ["invalid old password", "旧密码错误"],
    ["invalid username", "用户名格式不合法"],
    ["invalid new password", "新密码格式不合法"],
    ["target account not found", "目标账号不存在"],
    ["cannot challenge yourself", "不能挑战自己"],
    ["pending duel request already exists", "已存在待处理的对战申请"],
    ["resend too frequent", "补发太频繁，请稍后再试"],
    ["request id is required", "请求编号不能为空"],
    ["decision is required", "请选择处理动作"],
    ["invalid duel request decision", "申请处理动作不合法"],
    ["duel request not found", "对战申请不存在"],
    ["request is not inbound", "只能处理收到的申请"],
    ["request is not outbound", "只能取消自己发出的申请"],
    ["duel request already resolved", "该申请已处理"],
    ["user id is required", "用户标识不能为空"],
    ["roomcode is required", "联机房间号不能为空"],
    ["roomid or roomcode is required", "缺少房间标识，请重新进入联机"],
    ["roomid, userid, roundno and valid action are required", "回合参数不完整，请重试"],
    ["roomid and userid are required", "房间参数不完整，请重试"],
    ["room is waiting for second player", "房间还在等待对手加入"],
    ["room is waiting for opponent", "房间还在等待对手加入"],
    ["room already finished", "对局已结束"],
    ["room not found", "房间不存在或已失效"],
    ["room is not joinable", "房间当前不可加入"],
    ["room is full", "房间已满"],
    ["room is waiting", "房间还在等待对手"],
    ["room side not available", "房间席位异常，请重新加入"],
    ["round mismatch", "回合同步失败，请等待房间刷新后重试"],
    ["round resolution timeout", "回合结算超时，请重试"],
    ["invalid action", "回合动作无效"],
    ["invalid round payload", "回合数据异常，请重试"],
    ["user is not room participant", "你不在该房间对局中"],
    ["failed to query account", "账号查询失败，请稍后重试"],
    ["failed to create account", "账号创建失败，请稍后重试"],
    ["failed to update login timestamp", "登录状态更新失败，请稍后重试"],
    ["failed to update account", "账号更新失败，请稍后重试"],
    ["failed to query pending requests", "申请列表加载失败，请稍后重试"],
    ["failed to load inbound requests", "收到申请加载失败，请稍后重试"],
    ["failed to load outbound requests", "发出申请加载失败，请稍后重试"],
    ["failed to send duel request", "发起申请失败，请稍后重试"],
    ["failed to respond duel request", "处理申请失败，请稍后重试"],
    ["failed to cancel duel request", "取消申请失败，请稍后重试"],
    ["failed to query duel request", "申请查询失败，请稍后重试"],
    ["failed to query room", "房间查询失败，请稍后重试"],
    ["failed to query rounds", "回合数据查询失败，请稍后重试"],
    ["failed to query round", "回合数据查询失败，请稍后重试"],
    ["failed to query actions", "动作数据查询失败，请稍后重试"],
    ["failed to create room code", "创建房间号失败，请稍后重试"],
    ["failed to create room", "创建房间失败，请稍后重试"],
    ["failed to join room", "加入房间失败，请稍后重试"],
    ["failed to leave room", "离开房间失败，请稍后重试"],
    ["failed to submit action", "提交动作失败，请稍后重试"],
    ["failed to persist resolved round", "回合写入失败，请稍后重试"],
    ["failed to update room", "房间状态更新失败，请稍后重试"],
    ["supabase_url and supabase_anon_key are required", "联机服务未配置，请联系管理员"],
    ["supabase_url and supabase_service_role_key are required", "服务端联机配置缺失，请联系管理员"],
    ["supabase client not initialized", "联机客户端初始化失败，请重启后再试"],
    ["@supabase/supabase-js is not installed", "联机依赖缺失，请重新安装客户端"],
    ["edge function returned a non-2xx status code", "服务端请求失败，请稍后重试"],
    ["fetch failed", "网络请求失败，请检查网络后重试"],
    ["network request failed", "网络请求失败，请检查网络后重试"],
    ["failed to fetch", "网络请求失败，请检查网络后重试"],
    ["payload.op is required", "请求参数不完整，请重试"],
    ["unsupported op", "请求动作不受支持，请升级客户端"],
    ["invalid current user", "当前登录态异常，请重新登录"],
    ["at least one pet must remain", "至少保留一只灵宠"],
    ["pet id not found", "灵宠不存在或已被放逐"],
    ["invalid pet id", "灵宠编号无效"],
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

function compactModelRef(input) {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return "-";
  const normalized = raw.replace(/\\/g, "/");
  const hashIndex = normalized.indexOf("#");
  const queryIndex = normalized.indexOf("?");
  const cutIndex =
    hashIndex >= 0 && queryIndex >= 0
      ? Math.min(hashIndex, queryIndex)
      : hashIndex >= 0
        ? hashIndex
        : queryIndex;
  const clean = cutIndex >= 0 ? normalized.slice(0, cutIndex) : normalized;
  const parts = clean.split("/").filter(Boolean);
  return parts[parts.length - 1] || clean;
}

function formatOnlineParticipant(name, element) {
  const petName = typeof name === "string" && name.trim().length > 0 ? name.trim() : "-";
  const safeElement = typeof element === "string" && element.trim().length > 0 ? element.trim() : "metal";
  return `${petName}(${getElementText(safeElement)})`;
}

function appendOnlineSessionDiagnosticLog(reason) {
  const room = onlineDuelState?.room || {};
  const side = onlineDuelState?.side || "-";
  const activePet = getActivePet();
  const local = `${getPetDisplayName(activePet)}(${getElementText(activePet.element)})`;
  const host = formatOnlineParticipant(room.host_pet_name, room.host_element);
  const guest = formatOnlineParticipant(room.guest_pet_name, room.guest_element);
  appendLog(
    t("duelDiagnosticLog", {
      reason: typeof reason === "string" && reason.trim().length > 0 ? reason.trim() : "unknown",
      roomCode: room.room_code || "-",
      status: room.status || "-",
      side,
      round: Number.isFinite(Number(room.current_round)) ? Number(room.current_round) : "-",
      local,
      host,
      guest,
      playerModel: compactModelRef(playerModel?.getAttribute("src") || playerModel?.src || ""),
      enemyModel: compactModelRef(enemyModel?.getAttribute("src") || enemyModel?.src || ""),
      battleMode: battleMode ? "on" : "off"
    })
  );
}

function formatExportTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function buildOnlineDiagnosticExportText() {
  const now = new Date();
  const room = onlineDuelState?.room || null;
  const currentUser = authSession?.currentUser || null;
  const rawLog = typeof logElement?.textContent === "string" ? logElement.textContent.trim() : "";
  const lines = rawLog ? rawLog.split(/\r?\n/) : [];
  const diagnosticLines = lines.filter(
    (line) => line.includes("[联机诊断]") || line.includes("[Duel Diagnostic]")
  );

  return [
    "Lingjing Online Session Diagnostic Export",
    `ExportedAt: ${now.toISOString()}`,
    `Account: ${currentUser?.account || "-"}`,
    `UserId: ${currentUser?.id || "-"}`,
    `RoomCode: ${room?.room_code || "-"}`,
    `RoomStatus: ${room?.status || "-"}`,
    `RoomSide: ${onlineDuelState?.side || "-"}`,
    `LogLineCount: ${lines.length}`,
    `DiagnosticLineCount: ${diagnosticLines.length}`,
    "",
    "=== Diagnostic Lines ===",
    diagnosticLines.length > 0 ? diagnosticLines.join("\n") : "(none)",
    "",
    "=== Full Runtime Log ===",
    rawLog || "(empty)"
  ].join("\n");
}

function exportOnlineDiagnosticLog() {
  const content = buildOnlineDiagnosticExportText();
  const fileName = `lingjing-online-session-${formatExportTimestamp()}.log`;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => {
    URL.revokeObjectURL(href);
  }, 1500);
  appendLog(t("duelDiagnosticExportDone", { fileName }));
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getIdleWindowSize(scaleValue) {
  const scale = clampNumber(scaleValue, IDLE_WINDOW_SCALE_MIN, IDLE_WINDOW_SCALE_MAX);
  const activeModelFile = getModelSourceFileName(getActivePet()?.model || playerModel?.src || "");
  const currentAnimationName = typeof playerModel?.animationName === "string" ? playerModel.animationName : "";
  const hasWideAnimation = WIDE_POSE_ANIMATION_PATTERN.test(currentAnimationName);
  const isShibaLike = activeModelFile === "animateddogshibainu.glb";
  const widthPadding = hasWideAnimation ? (isShibaLike ? 72 : 56) : isShibaLike ? 20 : 26;
  const heightPadding = hasWideAnimation ? (isShibaLike ? 66 : 52) : isShibaLike ? 20 : 24;
  const baseWidth = Math.max(154, idleModelBaseSize.width + widthPadding);
  const baseHeight = Math.max(184, idleModelBaseSize.height + heightPadding + IDLE_OVERLAY_HEADROOM_PX);
  return {
    width: Math.round(baseWidth * scale),
    height: Math.round(baseHeight * scale)
  };
}

async function applyIdleWindowScale(scaleValue) {
  idleWindowScale = clampNumber(scaleValue, IDLE_WINDOW_SCALE_MIN, IDLE_WINDOW_SCALE_MAX);
  const size = getIdleWindowSize(idleWindowScale);
  const nextSignature = `${size.width}x${size.height}`;
  if (nextSignature === idleWindowSizeSignature) return;
  idleWindowSizeSignature = nextSignature;
  try {
    await window.petApi.setIdleWindowSize(size);
  } catch {
    // Keep non-blocking behavior when IPC is unavailable.
  }
}

function syncIdleWindowSizeForCurrentPose(options = {}) {
  const force = Boolean(options.force);
  if (force) {
    idleWindowSizeSignature = "";
  }
  if (battleMode) return;
  if (!panelElement.classList.contains("hidden")) return;
  void applyIdleWindowScale(idleWindowScale);
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
      + ", .version-history-modal, .version-history-card"
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
  closeReleaseConfirm();
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

function setBattleLeaveConfirmVisible(visible) {
  const nextVisible = Boolean(visible);
  if (battleExitConfirmElement) {
    battleExitConfirmElement.classList.toggle("hidden", !nextVisible);
  }
  reportHitState();
}

function openBattleLeaveConfirm() {
  if (!battleMode) return;
  setBattleLeaveConfirmVisible(true);
}

function closeBattleLeaveConfirm() {
  setBattleLeaveConfirmVisible(false);
}

function closeTopLayerByEsc() {
  if (versionHistoryModalElement && !versionHistoryModalElement.classList.contains("hidden")) {
    setVersionHistoryVisible(false);
    return true;
  }
  if (profileModalElement && !profileModalElement.classList.contains("hidden")) {
    setProfileModalVisible(false);
    return true;
  }
  if (battleExitConfirmElement && !battleExitConfirmElement.classList.contains("hidden")) {
    closeBattleLeaveConfirm();
    return true;
  }
  if (releaseConfirmModalElement && !releaseConfirmModalElement.classList.contains("hidden")) {
    closeReleaseConfirm();
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
    setHoverToolsVisible(false);
    hidePetChatBubble();
    hideDuelRequestToast();
    closeUserMenu();
    setProfileModalVisible(false);
    setVersionHistoryVisible(false);
    closeBattleLeaveConfirm();
    closeReleaseConfirm();
    // Hide scene immediately, then reveal panel after layout switch to avoid top-left flash.
    battleSceneElement.classList.add("panel-open");
    panelElement.classList.add("hidden");
    void window.petApi
      .setLayoutMode("panel")
      .catch(() => null)
      .then(() => {
        if (seq !== panelTransitionSeq) return;
        panelElement.classList.remove("hidden");
        if (pendingDuelRequestFocusId) {
          requestAnimationFrame(() => {
            if (scrollToDuelRequestById(pendingDuelRequestFocusId, { expandIfNeeded: true })) {
              pendingDuelRequestFocusId = null;
            }
          });
        }
        renderDuelRequestIndicator();
        reportHitState();
      });
    return;
  }

  panelElement.classList.add("hidden");
  battleSceneElement.classList.remove("panel-open");
  closeUserMenu();
  setProfileModalVisible(false);
  setVersionHistoryVisible(false);
  closeBattleLeaveConfirm();
  closeReleaseConfirm();
  duelRequestListExpanded = false;
  selectedBattleReportId = null;
  renderBattleReportDetail();
  renderDuelRequestIndicator();
  void window.petApi.setLayoutMode(battleMode ? "battle" : "idle");
  syncPetOverlayVisibility();
  reportHitState();
}

function updatePetClass() {
  playerCard.classList.toggle("interacting", frameMode === "interacting");
  playerCard.classList.toggle("paused", isPaused);
  playerCard.classList.toggle("is-hovered", isInteractive && !petHiddenByDoubleClick);
}

function reportHitState() {
  const x = window.__lastMouseX ?? 0;
  const y = window.__lastMouseY ?? 0;

  const insidePlayer = isPointInsideRect(x, y, playerCard.getBoundingClientRect());
  const insideEnemy =
    battleMode && !enemyCard.classList.contains("hidden")
      ? isPointInsideRect(x, y, enemyCard.getBoundingClientRect())
      : false;

  const panelVisible = isPanelVisible();
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
  const insideHoverTools =
    !petHiddenByDoubleClick &&
    hoverToolsVisible &&
    petHoverToolsElement &&
    !petHoverToolsElement.classList.contains("hidden")
      ? isPointInsideRect(x, y, petHoverToolsElement.getBoundingClientRect())
      : false;
  const insideShowPetButton =
    showPetBtn && !showPetBtn.classList.contains("hidden")
      ? isPointInsideRect(x, y, showPetBtn.getBoundingClientRect())
      : false;

  const insideBattleActors = insidePlayer || insideEnemy || insideHoverTools || insideShowPetButton;
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

function resolveRoundSidePerspective(sideToken) {
  const side = typeof sideToken === "string" ? sideToken.trim().toLowerCase() : "";
  if (side !== "host" && side !== "guest") return null;
  const currentSide = onlineDuelState?.side === "guest" ? "guest" : "host";
  return side === currentSide ? "player" : "enemy";
}

function getRoundSideText(sideToken) {
  const perspective = resolveRoundSidePerspective(sideToken);
  if (!perspective) return String(sideToken || "-");
  if (language === "zh") {
    return perspective === "player" ? "我方" : "敌方";
  }
  return perspective === "player" ? "You" : "Enemy";
}

function hasCjkText(text) {
  return /[\u3400-\u9fff]/.test(text);
}

function hasLatinText(text) {
  return /[A-Za-z]/.test(text);
}

function localizeRoundNote(note) {
  const raw = typeof note === "string" ? note.trim() : "";
  if (!raw) return "";

  let match = raw.match(/^(host|guest) dodge downgraded to normal_attack \(anger <= 0\)$/i);
  if (match) {
    const sideText = getRoundSideText(match[1]);
    return language === "zh"
      ? `${sideText}怒气不足，闪避改为普攻`
      : `${sideText} had dodge downgraded to normal attack (anger <= 0)`;
  }

  match = raw.match(/^(host|guest) ultimate downgraded to normal_attack \(anger < (\d+)\)$/i);
  if (match) {
    const sideText = getRoundSideText(match[1]);
    const threshold = Number(match[2]) || 50;
    return language === "zh"
      ? `${sideText}怒气不足（<${threshold}），大招改为普攻`
      : `${sideText} had ultimate downgraded to normal attack (anger < ${threshold})`;
  }

  match = raw.match(/^(host|guest) is stunned and cannot act$/i);
  if (match) {
    const sideText = getRoundSideText(match[1]);
    return language === "zh" ? `${sideText}被眩晕，无法行动` : `${sideText} is stunned and cannot act`;
  }

  match = raw.match(/^(host|guest) action missed$/i);
  if (match) {
    const sideText = getRoundSideText(match[1]);
    return language === "zh" ? `${sideText}本回合攻击落空` : `${sideText} action missed`;
  }

  match = raw.match(/^enemy burned x(\d+)$/i);
  if (match) {
    const stacks = Math.max(1, Number(match[1]) || 1);
    return language === "zh" ? `目标附加灼烧 x${stacks}` : `Target inflicted burn x${stacks}`;
  }

  if (/^enemy frozen$/i.test(raw)) {
    return language === "zh" ? "目标附加冻结" : "Target frozen";
  }

  match = raw.match(/^enemy parasitized x(\d+)$/i);
  if (match) {
    const stacks = Math.max(1, Number(match[1]) || 1);
    return language === "zh" ? `目标附加寄生 x${stacks}` : `Target parasitized x${stacks}`;
  }

  match = raw.match(/^enemy vulnerable x(\d+)$/i);
  if (match) {
    const stacks = Math.max(1, Number(match[1]) || 1);
    return language === "zh" ? `目标附加易伤 x${stacks}` : `Target vulnerable x${stacks}`;
  }

  if (/^enemy petrified$/i.test(raw)) {
    return language === "zh" ? "目标附加石化" : "Target petrified";
  }

  match = raw.match(/^(host|guest) spends 20 anger on dodge$/i);
  if (match) {
    const sideText = getRoundSideText(match[1]);
    return language === "zh" ? `${sideText}闪避消耗 20 怒气` : `${sideText} spends 20 anger on dodge`;
  }

  match = raw.match(/^(host|guest) uses first free dodge$/i);
  if (match) {
    const sideText = getRoundSideText(match[1]);
    return language === "zh" ? `${sideText}使用首回免费闪避` : `${sideText} uses the first free dodge`;
  }

  match = raw.match(/^(host|guest) dodged normal attack and refunded 30 anger$/i);
  if (match) {
    const sideText = getRoundSideText(match[1]);
    return language === "zh"
      ? `${sideText}闪避普攻并返还 30 怒气`
      : `${sideText} dodged normal attack and refunded 30 anger`;
  }

  match = raw.match(/^(host|guest) takes burn damage$/i);
  if (match) {
    const sideText = getRoundSideText(match[1]);
    return language === "zh" ? `${sideText}受到灼烧伤害` : `${sideText} takes burn damage`;
  }

  match = raw.match(/^(host|guest) healed by parasite$/i);
  if (match) {
    const sideText = getRoundSideText(match[1]);
    return language === "zh" ? `${sideText}因寄生回复生命` : `${sideText} healed by parasite`;
  }

  match = raw.match(/^(host|guest) takes parasite damage$/i);
  if (match) {
    const sideText = getRoundSideText(match[1]);
    return language === "zh" ? `${sideText}受到寄生伤害` : `${sideText} takes parasite damage`;
  }

  if (language === "zh") {
    if (hasCjkText(raw)) return raw;
    if (hasLatinText(raw)) return "";
  } else if (language === "en") {
    if (hasLatinText(raw)) return raw;
    if (hasCjkText(raw)) return "";
  }
  return raw;
}

function localizeRoundNotes(notes) {
  if (!Array.isArray(notes)) return [];
  return notes.map(localizeRoundNote).map((item) => item.trim()).filter(Boolean);
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

function getModelSourceFileName(source) {
  if (typeof source !== "string") return "";
  const trimmed = source.trim();
  if (!trimmed) return "";
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }
  const normalized = decoded.replace(/\\/g, "/");
  const withoutQuery = normalized.split(/[?#]/)[0];
  const lastSlashIndex = withoutQuery.lastIndexOf("/");
  return (lastSlashIndex >= 0 ? withoutQuery.slice(lastSlashIndex + 1) : withoutQuery).toLowerCase();
}

function sanitizeModelSource(source, element = "") {
  const fileName = getModelSourceFileName(source);
  if (fileName && DISABLED_MODEL_FILE_TO_FALLBACK[fileName]) {
    return DISABLED_MODEL_FILE_TO_FALLBACK[fileName];
  }
  if (typeof source === "string" && source.trim().length > 0) {
    return source.trim();
  }
  return getModelByElement(element);
}

function setModelCalibrationStatus(message, tone = "") {
  if (!modelCalibrationStatusElement) return;
  const text =
    typeof message === "string" && message.trim().length > 0
      ? message.trim()
      : currentI18n().modelCalibrationStatusHint;
  modelCalibrationStatusElement.textContent = text;
  modelCalibrationStatusElement.classList.remove("error", "success");
  if (tone === "error" || tone === "success") {
    modelCalibrationStatusElement.classList.add(tone);
  }
}

function collectModelCalibrationSources() {
  const sourceMap = new Map();
  const append = (source, displayName = "") => {
    const fileName = getModelSourceFileName(source);
    if (!fileName) return;
    if (!sourceMap.has(fileName)) {
      sourceMap.set(fileName, {
        fileName,
        source: typeof source === "string" ? source : "",
        names: new Set()
      });
    }
    const entry = sourceMap.get(fileName);
    if (displayName && displayName.trim().length > 0) {
      entry.names.add(displayName.trim());
    }
  };

  for (const pet of [...DEFAULT_PET_ROSTER, ...getRoster()]) {
    append(pet?.model, getPetDisplayName(pet));
  }
  append(enemyPetInBattle?.model, getPetDisplayName(enemyPetInBattle));
  append(playerModel?.getAttribute?.("src"), getPetDisplayName(getActivePet()));
  append(enemyModel?.getAttribute?.("src"), getPetDisplayName(enemyPetInBattle));
  for (const source of Object.values(ONLINE_MODEL_BY_ELEMENT)) {
    append(source, "");
  }

  return [...sourceMap.values()]
    .map((entry) => {
      const names = [...entry.names];
      const summary = names.slice(0, 2).join(" / ");
      const label = summary ? `${summary} · ${entry.fileName}` : entry.fileName;
      return {
        value: entry.fileName,
        label,
        source: entry.source
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, language === "zh" ? "zh-CN" : "en-US"));
}

function resolveModelViewProfileByFileName(fileName) {
  const key = getModelSourceFileName(fileName);
  if (!key) return DEFAULT_MODEL_VIEW_PROFILE;
  const customProfile = MODEL_VIEW_PROFILE_BY_FILE[key];
  const userProfile = modelViewCalibrations[key];
  if (!customProfile && !userProfile) return DEFAULT_MODEL_VIEW_PROFILE;
  return {
    ...DEFAULT_MODEL_VIEW_PROFILE,
    ...(customProfile || {}),
    ...(userProfile || {})
  };
}

function normalizeOrientationDegrees(value) {
  if (!Number.isFinite(value)) return 0;
  const wrapped = ((((value + 180) % 360) + 360) % 360) - 180;
  return Math.round(wrapped);
}

function getCalibrationPreviewSource(fileName) {
  const key = getModelSourceFileName(fileName);
  if (!key) return "";
  const mapped = modelCalibrationSourceMap.get(key);
  if (mapped?.source && mapped.source.trim().length > 0) return mapped.source;
  return `../assets/models/${key}`;
}

function getSelectedCalibrationFileName() {
  return getModelSourceFileName(modelCalibrationModelSelect?.value || selectedCalibrationModelFile);
}

function getCalibrationPreviewOrientationInput() {
  return calibrationPreviewMode === "battle"
    ? {
        x: modelCalibrationBattleOrientationXInput,
        y: modelCalibrationBattleOrientationYInput
      }
    : {
        x: modelCalibrationIdleOrientationXInput,
        y: modelCalibrationIdleOrientationYInput
      };
}

function getCalibrationPreviewScaleInput() {
  return calibrationPreviewMode === "battle" ? modelCalibrationBattleScaleInput : modelCalibrationIdleScaleInput;
}

function syncCalibrationPreviewModeText() {
  if (modelCalibrationPreviewLabelElement) {
    modelCalibrationPreviewLabelElement.textContent = currentI18n().modelCalibrationPreviewLabel;
  }
  if (!modelCalibrationPreviewModeBtn) return;
  const label =
    calibrationPreviewMode === "battle"
      ? currentI18n().modelCalibrationPreviewModeBattle
      : currentI18n().modelCalibrationPreviewModeIdle;
  modelCalibrationPreviewModeBtn.textContent = label;
  modelCalibrationPreviewModeBtn.title = label;
}

function readCalibrationNumber(inputElement, min, max) {
  if (!inputElement) return null;
  const raw = inputElement.value.trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return clampNumber(value, min, max);
}

function formatCalibrationNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "";
  const rounded = Number(value.toFixed(digits));
  return String(rounded);
}

function fillModelCalibrationInputs(fileName) {
  const key = getModelSourceFileName(fileName);
  const profile = key ? resolveModelViewProfileByFileName(key) : DEFAULT_MODEL_VIEW_PROFILE;
  if (modelCalibrationIdleOrientationXInput) {
    modelCalibrationIdleOrientationXInput.value = formatCalibrationNumber(profile.idleOrientationXDeg, 0);
  }
  if (modelCalibrationIdleOrientationYInput) {
    modelCalibrationIdleOrientationYInput.value = formatCalibrationNumber(profile.idleOrientationYDeg, 0);
  }
  if (modelCalibrationBattleOrientationXInput) {
    modelCalibrationBattleOrientationXInput.value = formatCalibrationNumber(profile.battleOrientationXDeg, 0);
  }
  if (modelCalibrationBattleOrientationYInput) {
    modelCalibrationBattleOrientationYInput.value = formatCalibrationNumber(profile.battleOrientationYDeg, 0);
  }
  if (modelCalibrationIdleScaleInput) {
    modelCalibrationIdleScaleInput.value = formatCalibrationNumber(profile.poseWideScaleIdle, 2);
  }
  if (modelCalibrationBattleScaleInput) {
    modelCalibrationBattleScaleInput.value = formatCalibrationNumber(profile.poseWideScaleBattle, 2);
  }
}

function applyModelCalibrationPreviewBox(options = {}) {
  if (!modelCalibrationPreviewModel) return;
  const fileName = getSelectedCalibrationFileName();
  if (!fileName) {
    modelCalibrationPreviewModel.removeAttribute("src");
    return;
  }
  const source = getCalibrationPreviewSource(fileName);
  if (source && modelCalibrationPreviewModel.getAttribute("src") !== source) {
    modelCalibrationPreviewModel.setAttribute("src", source);
  }

  const profile = resolveModelViewProfileByFileName(fileName);
  const orientationInput = getCalibrationPreviewOrientationInput();
  const scaleInput = getCalibrationPreviewScaleInput();
  const orientationFallbackX =
    calibrationPreviewMode === "battle" ? profile.battleOrientationXDeg : profile.idleOrientationXDeg;
  const orientationFallbackY =
    calibrationPreviewMode === "battle" ? profile.battleOrientationYDeg : profile.idleOrientationYDeg;
  const scaleFallback =
    calibrationPreviewMode === "battle" ? profile.poseWideScaleBattle : profile.poseWideScaleIdle;
  const orientationX = readCalibrationNumber(orientationInput.x, -180, 180);
  const orientationY = readCalibrationNumber(orientationInput.y, -180, 180);
  const scale = readCalibrationNumber(scaleInput, 1, 2.6);
  const effectiveScale = scale ?? scaleFallback;
  const previewRadiusPercent = clampNumber(100 * effectiveScale, 70, 260);

  applyModelViewerFrame(modelCalibrationPreviewModel, {
    orbitDeg: 0,
    pitchDeg: 74,
    radius: `${previewRadiusPercent.toFixed(1)}%`,
    target: "",
    orientationXDeg: orientationX ?? orientationFallbackX,
    orientationYDeg: orientationY ?? orientationFallbackY,
    zoomScale: 1
  });
  if (typeof modelCalibrationPreviewModel.jumpCameraToGoal === "function") {
    modelCalibrationPreviewModel.jumpCameraToGoal();
  }

  if (options.playAnimation !== false) {
    const names = modelCalibrationPreviewModel.availableAnimations || [];
    if (names.length > 0) {
      const preferred = ["idle", "walk", "run", "survey", "rest"]
        .map((name) => names.find((candidate) => candidate.toLowerCase().includes(name)))
        .find(Boolean);
      const nextAnimation = preferred || names[0];
      if (modelCalibrationPreviewModel.animationName !== nextAnimation) {
        modelCalibrationPreviewModel.animationName = nextAnimation;
      }
      modelCalibrationPreviewModel.play();
    }
  }
}

function applyModelCalibrationPreview() {
  if (battleMode) {
    applyBattleView();
  } else {
    applyIdleOrbit();
    applyEnemyIdleOrbit();
  }
  const detailModelElement = document.getElementById("pet-detail-model-viewer");
  if (detailModelElement) {
    applyDetailModelView(detailModelElement);
  }
}

function renderModelCalibrationPanel() {
  if (!modelCalibrationModelSelect) return;
  const options = collectModelCalibrationSources();
  if (options.length === 0) {
    modelCalibrationModelSelect.innerHTML = "";
    selectedCalibrationModelFile = "";
    modelCalibrationSourceMap.clear();
    if (modelCalibrationPreviewModel) {
      modelCalibrationPreviewModel.removeAttribute("src");
    }
    setModelCalibrationStatus(currentI18n().modelCalibrationStatusNoModel, "error");
    return;
  }

  const preferredCurrent =
    getModelSourceFileName(selectedCalibrationModelFile) ||
    getModelSourceFileName(getActivePet()?.model || "") ||
    options[0].value;
  selectedCalibrationModelFile = options.some((item) => item.value === preferredCurrent)
    ? preferredCurrent
    : options[0].value;
  modelCalibrationSourceMap.clear();
  modelCalibrationModelSelect.innerHTML = "";
  for (const item of options) {
    modelCalibrationSourceMap.set(item.value, item);
    const optionElement = document.createElement("option");
    optionElement.value = item.value;
    optionElement.textContent = item.label;
    if (item.value === selectedCalibrationModelFile) {
      optionElement.selected = true;
    }
    modelCalibrationModelSelect.appendChild(optionElement);
  }
  modelCalibrationModelSelect.value = selectedCalibrationModelFile;
  fillModelCalibrationInputs(selectedCalibrationModelFile);
  syncCalibrationPreviewModeText();
  applyModelCalibrationPreviewBox();
}

function saveModelCalibrationForSelectedModel(options = {}) {
  const fileName = getSelectedCalibrationFileName();
  if (!fileName) {
    if (!options.silent) {
      setModelCalibrationStatus(currentI18n().modelCalibrationStatusNoModel, "error");
    }
    return;
  }
  selectedCalibrationModelFile = fileName;

  const entry = normalizeModelViewCalibrationEntry({
    idleOrientationXDeg: readCalibrationNumber(modelCalibrationIdleOrientationXInput, -180, 180),
    idleOrientationYDeg: readCalibrationNumber(modelCalibrationIdleOrientationYInput, -180, 180),
    battleOrientationXDeg: readCalibrationNumber(modelCalibrationBattleOrientationXInput, -180, 180),
    battleOrientationYDeg: readCalibrationNumber(modelCalibrationBattleOrientationYInput, -180, 180),
    detailOrientationXDeg: readCalibrationNumber(modelCalibrationIdleOrientationXInput, -180, 180),
    detailOrientationYDeg: readCalibrationNumber(modelCalibrationIdleOrientationYInput, -180, 180),
    poseWideScaleIdle: readCalibrationNumber(modelCalibrationIdleScaleInput, 1, 2.6),
    poseWideScaleBattle: readCalibrationNumber(modelCalibrationBattleScaleInput, 1, 2.6),
    poseWideScaleDetail: readCalibrationNumber(modelCalibrationIdleScaleInput, 1, 2.6)
  });

  if (Object.keys(entry).length === 0) {
    delete modelViewCalibrations[fileName];
  } else {
    modelViewCalibrations[fileName] = entry;
  }
  saveModelViewCalibrations();
  fillModelCalibrationInputs(fileName);
  applyModelCalibrationPreviewBox();
  if (!options.silent) {
    setModelCalibrationStatus(currentI18n().modelCalibrationStatusSaved, "success");
  }
  applyModelCalibrationPreview();
}

function resetModelCalibrationForSelectedModel() {
  const fileName = getModelSourceFileName(modelCalibrationModelSelect?.value || selectedCalibrationModelFile);
  if (!fileName) {
    setModelCalibrationStatus(currentI18n().modelCalibrationStatusNoModel, "error");
    return;
  }
  selectedCalibrationModelFile = fileName;
  delete modelViewCalibrations[fileName];
  saveModelViewCalibrations();
  fillModelCalibrationInputs(fileName);
  applyModelCalibrationPreviewBox();
  setModelCalibrationStatus(currentI18n().modelCalibrationStatusReset, "success");
  applyModelCalibrationPreview();
}

function resolveModelViewProfile(modelElement) {
  if (!modelElement) return DEFAULT_MODEL_VIEW_PROFILE;
  const propSrc = getModelSourceFileName(typeof modelElement.src === "string" ? modelElement.src : "");
  const attrSrc = getModelSourceFileName(modelElement.getAttribute("src") || "");
  const fileName = propSrc || attrSrc;
  return resolveModelViewProfileByFileName(fileName);
}

function setModelViewerOrientation(modelElement, orientationXDeg = 0, orientationYDeg = 0, orientationZDeg = 0) {
  if (!modelElement) return;
  const safeX = Number.isFinite(orientationXDeg) ? orientationXDeg : 0;
  const safeY = Number.isFinite(orientationYDeg) ? orientationYDeg : 0;
  const safeZ = Number.isFinite(orientationZDeg) ? orientationZDeg : 0;
  // model-viewer orientation is interpreted as [roll(Z), pitch(X), yaw(Y)].
  // Keep UI/runtime semantics as X=pitch, Y=yaw, Z=roll, then remap here.
  modelElement.orientation = `${safeZ}deg ${safeX}deg ${safeY}deg`;
}

function formatModelViewerRadius(radius) {
  if (!Number.isFinite(radius)) return "";
  const clamped = clampNumber(radius, 26, 260);
  const rounded = Math.round(clamped * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function scaleModelViewerRadius(radius, scale = 1) {
  const safeScale = Number.isFinite(scale) ? Math.max(0.4, Math.min(2.6, scale)) : 1;
  const raw = typeof radius === "string" ? radius.trim() : "";
  if (!raw || raw === "auto") {
    return safeScale === 1 ? "auto" : formatModelViewerRadius(100 * safeScale) || "auto";
  }

  const percentMatch = raw.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (percentMatch) {
    const percentValue = Number(percentMatch[1]);
    if (Number.isFinite(percentValue)) {
      return formatModelViewerRadius(percentValue * safeScale) || raw;
    }
    return raw;
  }

  const meterMatch = raw.match(/^(-?\d+(?:\.\d+)?)m$/);
  if (meterMatch) {
    const meterValue = Number(meterMatch[1]);
    if (Number.isFinite(meterValue)) {
      const scaledMeter = Math.max(0.12, Math.min(12, meterValue * safeScale));
      const rounded = Math.round(scaledMeter * 1000) / 1000;
      return `${rounded}m`;
    }
    return raw;
  }

  return raw;
}

function getModelPoseScale(modelElement, profile, mode) {
  if (!modelElement || !profile) return 1;
  const safeScale = (value, fallback) =>
    Number.isFinite(value) ? clampNumber(value, 1, 2.6) : fallback;
  const modeScale =
    mode === "battle"
      ? safeScale(profile.poseWideScaleBattle, 1.2)
      : mode === "detail"
        ? safeScale(profile.poseWideScaleDetail, 1.14)
        : safeScale(profile.poseWideScaleIdle, 1.14);
  const animationName = typeof modelElement.animationName === "string" ? modelElement.animationName : "";
  if (WIDE_POSE_ANIMATION_PATTERN.test(animationName)) {
    return modeScale;
  }
  const availableAnimations = Array.isArray(modelElement.availableAnimations)
    ? modelElement.availableAnimations
    : [];
  const hasWideAnimation = availableAnimations.some((name) => WIDE_POSE_ANIMATION_PATTERN.test(String(name || "")));
  return hasWideAnimation ? modeScale : 1;
}

function applyModelViewerFrame(modelElement, options = {}) {
  if (!modelElement) return;
  const orbitDeg = Number.isFinite(options.orbitDeg) ? options.orbitDeg : 0;
  const pitchDeg = clampNumber(options.pitchDeg, 8, 88);
  const radiusRaw =
    typeof options.radius === "string" && options.radius.trim().length > 0 ? options.radius : "auto";
  const radius = scaleModelViewerRadius(radiusRaw, options.zoomScale);
  const target =
    typeof options.target === "string" && options.target.trim().length > 0
      ? options.target.trim()
      : "";
  setModelViewerOrientation(
    modelElement,
    options.orientationXDeg,
    options.orientationYDeg,
    options.orientationZDeg
  );
  modelElement.cameraOrbit = `${orbitDeg}deg ${pitchDeg}deg ${radius}`;
  if (target) {
    modelElement.setAttribute("camera-target", target);
  } else {
    modelElement.removeAttribute("camera-target");
  }
}

function applyIdleOrbit() {
  const profile = resolveModelViewProfile(playerModel);
  applyModelViewerFrame(playerModel, {
    orbitDeg: idleOrbitDeg,
    pitchDeg: 74,
    radius: profile.idleRadius,
    target: profile.idleTarget,
    orientationXDeg: profile.idleOrientationXDeg,
    orientationYDeg: profile.idleOrientationYDeg,
    zoomScale: getModelPoseScale(playerModel, profile, "idle")
  });
}

function applyEnemyIdleOrbit() {
  const profile = resolveModelViewProfile(enemyModel);
  applyModelViewerFrame(enemyModel, {
    orbitDeg: 0,
    pitchDeg: 74,
    radius: profile.idleRadius,
    target: profile.idleTarget,
    orientationXDeg: profile.idleOrientationXDeg,
    orientationYDeg: profile.idleOrientationYDeg,
    zoomScale: getModelPoseScale(enemyModel, profile, "idle")
  });
}

function applyDetailModelView(modelElement) {
  const profile = resolveModelViewProfile(modelElement);
  applyModelViewerFrame(modelElement, {
    orbitDeg: profile.detailOrbitDeg,
    pitchDeg: profile.detailPitchDeg,
    radius: profile.detailRadius,
    target: profile.detailTarget,
    orientationXDeg: profile.detailOrientationXDeg,
    orientationYDeg: profile.detailOrientationYDeg,
    zoomScale: getModelPoseScale(modelElement, profile, "detail")
  });
}

function applyBattleView() {
  if (!battleMode) return;
  const yawOffset = clampNumber(battleFacingOffsetDeg, -120, 120);
  const playerAzimuth = BATTLE_PLAYER_AZIMUTH_DEG + yawOffset;
  const enemyAzimuth = BATTLE_ENEMY_AZIMUTH_DEG - yawOffset;
  const pitch = clampNumber(battleCameraPitchDeg, BATTLE_CAMERA_PITCH_MIN, BATTLE_CAMERA_PITCH_MAX);
  const playerProfile = resolveModelViewProfile(playerModel);
  const enemyProfile = resolveModelViewProfile(enemyModel);
  applyModelViewerFrame(playerModel, {
    orbitDeg: playerAzimuth,
    pitchDeg: pitch,
    radius: "auto",
    target: "",
    orientationXDeg: playerProfile.battleOrientationXDeg,
    orientationYDeg: playerProfile.battleOrientationYDeg,
    zoomScale: getModelPoseScale(playerModel, playerProfile, "battle")
  });
  applyModelViewerFrame(enemyModel, {
    orbitDeg: enemyAzimuth,
    pitchDeg: pitch,
    radius: "auto",
    target: "",
    orientationXDeg: enemyProfile.battleOrientationXDeg,
    orientationYDeg: enemyProfile.battleOrientationYDeg,
    zoomScale: getModelPoseScale(enemyModel, enemyProfile, "battle")
  });
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
  if (ELEMENT_ADVANTAGE_CHAIN[attacker] === defender) return 1.2;
  if (ELEMENT_ADVANTAGE_CHAIN[defender] === attacker) return 0.8;
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
  const mood = sanitizeMoodValue(input?.mood ?? fallback?.mood ?? PET_MOOD_DEFAULT);
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
    model: sanitizeModelSource(input?.model, input?.element || fallback?.element),
    name: {
      zh: nameZh || nameEn || "未命名灵宠",
      en: nameEn || nameZh || "Unknown Spirit Pet"
    },
    level,
    experience: experienceRaw % LEVEL_UP_REQUIRED_EXPERIENCE,
    mood,
    winsTotal
  };
}

function getPetLevel(pet) {
  return toPositiveInt(pet?.level, 1);
}

function getPetExperience(pet) {
  return toNonNegativeInt(pet?.experience, 0) % LEVEL_UP_REQUIRED_EXPERIENCE;
}

function getPetMood(pet) {
  return sanitizeMoodValue(pet?.mood ?? PET_MOOD_DEFAULT);
}

function getPetWinsTotal(pet) {
  return toNonNegativeInt(pet?.winsTotal, 0);
}

function getPetAvatarToken(pet) {
  const displayName = getPetDisplayName(pet || { name: { zh: "灵", en: "SP" } });
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

function syncActivePetPresentation() {
  const activePet = getActivePet();
  playerModel.src = activePet.model;
  setModelElementTint(playerModel, activePet.element);
  if (!battleMode) {
    applyIdleOrbit();
    measureIdleModelBase();
    if (panelElement.classList.contains("hidden")) {
      void applyIdleWindowScale(idleWindowScale);
    }
  }
  playerElementLabel.textContent = getElementText(activePet.element);
  setElementTagTheme(playerElementLabel, activePet.element);
  updateBattleHudBadges(activePet, enemyPetInBattle);
  renderPetInventory();
  renderPetDetail();
  refreshHoverMoodText();
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
  if (language === "zh") return zh || en || "灵宠";
  return en || zh || "Spirit Pet";
}

function getPetById(petId) {
  const roster = getRoster();
  return roster.find((pet) => pet.id === petId) || null;
}

function refreshHoverMoodText() {
  const activePet = getActivePet();
  const mood = getPetMood(activePet);
  if (hoverMoodBtn) {
    hoverMoodBtn.textContent = String(mood);
    hoverMoodBtn.title = `${currentI18n().hoverMoodLabel} ${mood}`;
    hoverMoodBtn.setAttribute("aria-label", `${currentI18n().hoverMoodLabel} ${mood}`);
  }
}

function positionPetOverlays() {
  if (!battleSceneElement || !playerCard) return;
  const sceneRect = battleSceneElement.getBoundingClientRect();
  const playerRect = playerCard.getBoundingClientRect();
  if (sceneRect.width <= 0 || sceneRect.height <= 0 || playerRect.width <= 0 || playerRect.height <= 0) {
    return;
  }

  const localPlayerLeft = playerRect.left - sceneRect.left;
  const localPlayerTop = playerRect.top - sceneRect.top;

  if (petHoverToolsElement) {
    const toolsRect = petHoverToolsElement.getBoundingClientRect();
    const toolsHeight = clampNumber(toolsRect.height || 110, 70, sceneRect.height - 8);
    const iconLeft = clampNumber(localPlayerLeft - 38, 2, Math.max(2, sceneRect.width - 40));
    const centeredTop = localPlayerTop + playerRect.height / 2 - toolsHeight / 2;
    const iconTop = clampNumber(centeredTop, 2, Math.max(2, sceneRect.height - toolsHeight - 2));
    petHoverToolsElement.style.left = `${Math.round(iconLeft)}px`;
    petHoverToolsElement.style.top = `${Math.round(iconTop)}px`;
    petHoverToolsElement.style.bottom = "auto";
    petHoverToolsElement.style.transform = "none";
  }

  if (petChatBubbleElement) {
    const bubbleRect = petChatBubbleElement.getBoundingClientRect();
    const bubbleHeight = clampNumber(bubbleRect.height || 72, 44, 180);
    const desiredTop = localPlayerTop - bubbleHeight - 12;
    const bubbleTop = clampNumber(
      desiredTop,
      4,
      Math.max(4, sceneRect.height - bubbleHeight - 4)
    );
    petChatBubbleElement.style.top = `${Math.round(bubbleTop)}px`;
    petChatBubbleElement.style.right = "6px";
    petChatBubbleElement.style.left = "auto";
    petChatBubbleElement.style.bottom = "auto";
  }
}

function isPointInPetHoverHotspot(screenX, screenY) {
  if (!battleSceneElement || battleMode || petHiddenByDoubleClick) return false;
  const sceneRect = battleSceneElement.getBoundingClientRect();
  if (!isPointInsideRect(screenX, screenY, sceneRect)) return false;
  const localX = screenX - sceneRect.left;
  const localY = screenY - sceneRect.top;
  // Idle layout uses a full-card actor; use a compact hotspot near the pet area only.
  const hotspotWidth = clampNumber(sceneRect.width * 0.24, 78, 132);
  const hotspotHeight = clampNumber(sceneRect.height * 0.3, 86, 136);
  const hotspotLeft = sceneRect.width / 2 - hotspotWidth / 2;
  const hotspotTop = sceneRect.height - hotspotHeight - 12;
  return (
    localX >= hotspotLeft &&
    localX <= hotspotLeft + hotspotWidth &&
    localY >= hotspotTop &&
    localY <= hotspotTop + hotspotHeight
  );
}

function syncPetHoverByPointer(screenX, screenY) {
  const panelVisible = !panelElement.classList.contains("hidden");
  if (panelVisible || battleMode || petHiddenByDoubleClick) {
    cancelPetHoverHideDelay();
    isInteractive = false;
    setHoverToolsVisible(false);
    return;
  }
  const insideOverlay =
    petHoverToolsElement &&
    !petHoverToolsElement.classList.contains("hidden") &&
    isPointInsideRect(screenX, screenY, petHoverToolsElement.getBoundingClientRect());
  const shouldShow = insideOverlay || isPointInPetHoverHotspot(screenX, screenY);
  if (shouldShow) {
    cancelPetHoverHideDelay();
    isInteractive = true;
    setHoverToolsVisible(true);
    return;
  }
  isInteractive = false;
  frameMode = "idle";
  schedulePetHoverHideDelay();
  updatePetClass();
}

function setHoverToolsVisible(visible) {
  hoverToolsVisible = Boolean(visible);
  if (!hoverToolsVisible) {
    isInteractive = false;
    frameMode = "idle";
  }
  if (petHoverToolsElement) {
    petHoverToolsElement.classList.toggle("hidden", !hoverToolsVisible || petHiddenByDoubleClick);
    petHoverToolsElement.setAttribute(
      "aria-hidden",
      String(!hoverToolsVisible || petHiddenByDoubleClick)
    );
  }
  if (hoverToolsVisible) {
    positionPetOverlays();
    refreshHoverMoodText();
  }
  updatePetClass();
}

function cancelPetHoverHideDelay() {
  if (!hoverHideDelayTimer) return;
  clearTimeout(hoverHideDelayTimer);
  hoverHideDelayTimer = null;
}

function schedulePetHoverHideDelay() {
  cancelPetHoverHideDelay();
  hoverHideDelayTimer = setTimeout(() => {
    hoverHideDelayTimer = null;
    const x = Number(window.__lastMouseX || -1);
    const y = Number(window.__lastMouseY || -1);
    if (x < 0 || y < 0) {
      isInteractive = false;
      frameMode = "idle";
      setHoverToolsVisible(false);
      return;
    }
    const insideOverlay =
      petHoverToolsElement &&
      !petHoverToolsElement.classList.contains("hidden") &&
      isPointInsideRect(x, y, petHoverToolsElement.getBoundingClientRect());
    const stillInside = insideOverlay || isPointInPetHoverHotspot(x, y);
    if (stillInside) return;
    isInteractive = false;
    frameMode = "idle";
    setHoverToolsVisible(false);
  }, PET_HOVER_HIDE_DELAY_MS);
}

function syncPetOverlayVisibility() {
  const panelVisible = !panelElement.classList.contains("hidden");
  const shouldShow = !battleMode && !panelVisible && !petHiddenByDoubleClick && isInteractive;
  if (!shouldShow) {
    cancelPetHoverHideDelay();
  }
  setHoverToolsVisible(shouldShow);
}

function hidePetChatBubble() {
  if (!petChatBubbleElement) return;
  petChatBubbleElement.classList.add("hidden");
  petChatBubbleElement.textContent = "";
  chatBubbleHideAt = 0;
  chatBubbleHoverPinned = false;
  if (chatBubbleTimer) {
    clearTimeout(chatBubbleTimer);
    chatBubbleTimer = null;
  }
}

function isPetChatBubbleVisible() {
  return Boolean(petChatBubbleElement && !petChatBubbleElement.classList.contains("hidden"));
}

function showPetChatBubble(text, options = {}) {
  if (!petChatBubbleElement) return;
  if (petHiddenByDoubleClick) return;
  const content = String(text || "").trim();
  if (!content) return;
  positionPetOverlays();
  petChatBubbleElement.textContent = content;
  petChatBubbleElement.classList.remove("hidden");
  if (chatBubbleTimer) {
    clearTimeout(chatBubbleTimer);
  }
  chatBubbleHoverPinned = false;
  const durationMs = clampInt(options.durationMs, 1800, 30000);
  chatBubbleHideAt = Date.now() + durationMs;
  chatBubbleTimer = setTimeout(() => {
    if (chatBubbleHoverPinned) return;
    hidePetChatBubble();
  }, durationMs);
}

function setPetHiddenState(hidden, options = {}) {
  const next = Boolean(hidden);
  cancelPetHoverHideDelay();
  petHiddenByDoubleClick = next;
  if (playerCard) {
    playerCard.classList.toggle("hidden", next);
  }
  if (showPetBtn) {
    showPetBtn.classList.toggle("hidden", !next);
  }
  if (next) {
    setHoverToolsVisible(false);
    if (!options.silent) {
      appendLog(currentI18n().petHiddenLog);
    }
  } else if (!options.silent) {
    appendLog(currentI18n().petShownLog);
  }
  syncPetOverlayVisibility();
  updatePetClass();
  reportHitState();
}

async function startTrainingFromHover() {
  const activePet = getActivePet();
  appendLog(
    t("hoverTrainStartLog", {
      petName: getPetDisplayName(activePet)
    })
  );
  await resetBattle();
}

async function applyPetMoodDelta(delta, options = {}) {
  const activePet = getActivePet();
  if (!activePet?.id) return null;
  const normalizedDelta = Math.round(Number(delta) || 0);
  if (!Number.isFinite(normalizedDelta) || normalizedDelta === 0) return null;
  try {
    const response = await window.petApi.updatePetMood(activePet.id, normalizedDelta);
    if (!response?.ok || !response?.pet) {
      if (!options.silent) {
        appendLog(
          t("authActionFailLog", {
            message: localizeAuthErrorMessage(response?.error || "update mood failed")
          })
        );
      }
      return null;
    }
    patchRosterPet(response.pet);
    refreshHoverMoodText();
    renderPetInventory();
    renderPetDetail();
    if (!options.silent) {
      appendLog(
        t("hoverMoodBoostLog", {
          petName: getPetDisplayName(response.pet),
          mood: getPetMood(response.pet)
        })
      );
    }
    return response.pet;
  } catch (error) {
    if (!options.silent) {
      appendLog(
        t("authActionFailLog", {
          message: localizeAuthErrorMessage(error instanceof Error ? error.message : "update mood failed")
        })
      );
    }
    return null;
  }
}

function isCompanionOnlineAvailable() {
  return Boolean(authSession?.currentUser?.id);
}

async function maybeGrantMoodPassiveExperience() {
  if (!isCompanionOnlineAvailable()) {
    lastMoodPassiveExpAt = Date.now();
    return;
  }
  const now = Date.now();
  if (now - lastMoodPassiveExpAt < MOOD_PASSIVE_INTERVAL_MS) return;
  const activePet = getActivePet();
  if (!activePet?.id) {
    lastMoodPassiveExpAt = now;
    return;
  }
  if (getPetMood(activePet) < PET_MOOD_GOOD_THRESHOLD) {
    lastMoodPassiveExpAt = now;
    return;
  }
  const response = await window.petApi.addExperience(activePet.id, MOOD_PASSIVE_EXP_HOURLY);
  lastMoodPassiveExpAt = now;
  if (!response?.ok || !response?.pet) return;
  patchRosterPet(response.pet);
  refreshHoverMoodText();
  renderPetInventory();
  renderPetDetail();
  appendLog(
    t("moodPassiveExpLog", {
      petName: getPetDisplayName(response.pet),
      exp: MOOD_PASSIVE_EXP_HOURLY,
      current: response.currentExperience,
      required: LEVEL_UP_REQUIRED_EXPERIENCE
    })
  );
}

function ensureMoodPassiveTimer() {
  if (moodPassiveTickTimer) return;
  moodPassiveTickTimer = setInterval(() => {
    void maybeGrantMoodPassiveExperience();
  }, MOOD_PASSIVE_TICK_MS);
}

function clearMoodPassiveTimer() {
  if (!moodPassiveTickTimer) return;
  clearInterval(moodPassiveTickTimer);
  moodPassiveTickTimer = null;
}

function parseRuntimeTimestamp(input) {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return NaN;
  let parsed = Date.parse(raw);
  if (
    Number.isNaN(parsed) &&
    /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(raw)
  ) {
    parsed = Date.parse(raw.replace(" ", "T") + "+08:00");
  }
  return Number.isFinite(parsed) ? parsed : NaN;
}

function getFirstCompanionMomentText() {
  const activePet = getActivePet();
  const candidates = [authSession?.currentUser?.createdAt, activePet?.capturedAt];
  let minTs = Number.POSITIVE_INFINITY;
  let minRaw = "";
  for (const candidate of candidates) {
    const ts = parseRuntimeTimestamp(candidate);
    if (!Number.isFinite(ts)) continue;
    if (ts < minTs) {
      minTs = ts;
      minRaw = String(candidate);
    }
  }
  if (Number.isFinite(minTs) && minRaw) {
    return formatReportTime(minRaw);
  }
  return language === "zh" ? "刚刚认识" : "just met";
}

function pickAiTopicHint() {
  const pool = language === "zh" ? AI_TOPIC_HINTS_ZH : AI_TOPIC_HINTS_EN;
  if (!Array.isArray(pool) || pool.length === 0) {
    return language === "zh" ? "日常陪伴聊天" : "daily companion chat";
  }
  const hint = pool[aiTopicCursor % pool.length];
  aiTopicCursor += 1;
  return hint;
}

function buildAiPrompt(reason, activityHint) {
  const activePet = getActivePet();
  const petName = getPetDisplayName(activePet);
  const elementName = getElementText(activePet?.element || "metal");
  const moodValue = getPetMood(activePet);
  const firstMeetTime = getFirstCompanionMomentText();
  const topicHint = pickAiTopicHint();
  const reasonText = reason === "manual" ? "主动互动" : "定时陪伴";
  const activityText =
    activityHint === "busy"
      ? "主人看起来很忙碌。"
      : activityHint === "idle"
        ? "主人有一阵没和你互动了。"
        : "主人状态正常，可轻松闲聊。";
  const recentBattle = lastBattleState
    ? `最近一局结果：${
        lastBattleState.enemy?.hp <= 0 ? "赢了" : lastBattleState.player?.hp <= 0 ? "输了" : "未结束"
      }。`
    : "最近还没对战记录。";
  const localeHint =
    language === "zh"
      ? "请只用中文输出，1-2句，口吻可爱，有灵宠人设，避免长段落。"
      : "Please answer in English only, 1-2 short playful sentences with pet persona.";
  return [
    `你是桌宠《灵境》的灵宠：${petName}（属性：${elementName}）。`,
    `灵宠状态：心情 ${moodValue}/100，累计胜场 ${toNonNegativeInt(activePet?.winsTotal, 0)}。`,
    `你和主人的第一次相识时间：${firstMeetTime}。`,
    `触发来源：${reasonText}。`,
    activityText,
    recentBattle,
    `建议话题：${topicHint}。`,
    "如果系统提供了新闻标题，可自然地提及其中一条，不要像播报列表。",
    localeHint,
    "可参考语气：上一场没打赢好气哦；讲个冷笑话；吐槽一下今天；关心主人喝水休息。"
  ].join("\n");
}

function getAiFallbackBubble(activityHint) {
  const petName = getPetDisplayName(getActivePet());
  const firstMeetTime = getFirstCompanionMomentText();
  const linesZh = [
    `${petName}：我们从 ${firstMeetTime} 就认识啦，今天也一起加油。`,
    `${petName}：冷笑话时间到，为什么灵宠不怕冷？因为有灵气护体。`,
    `${petName}：刚才那局我有点不服气，下次我要帅气翻盘。`,
    `${petName}：主人，忙归忙，水杯先喝两口再冲。`
  ];
  const linesEn = [
    `${petName}: We've been partners since ${firstMeetTime}. Let's do great today.`,
    `${petName}: Tiny joke time - why don't spirit pets panic? We keep our aura cool.`,
    `${petName}: I'm still salty about that last round, but we'll bounce back.`,
    `${petName}: Busy is fine, but drink some water first, human.`
  ];
  if (activityHint === "busy") {
    return t("aiBubbleFallbackFocus", { petName });
  }
  if (activityHint === "idle") {
    return t("aiBubbleFallbackSlack", { petName });
  }
  const pool = language === "zh" ? linesZh : linesEn;
  if (pool.length === 0) {
    return t("aiBubbleFallbackIdle", { petName });
  }
  const line = pool[aiTopicCursor % pool.length];
  aiTopicCursor += 1;
  return line;
}

function getAiManualCooldownBubble(seconds) {
  const remain = Math.max(1, Math.ceil(Number(seconds) || 1));
  const petName = getPetDisplayName(getActivePet());
  if (language === "zh") {
    return `${petName}：等等我，${remain}秒后再聊一条。`;
  }
  return `${petName}: Give me ${remain}s, then we can chat again.`;
}

async function triggerAiBubble(reason = "timer") {
  if (aiRequestInFlight) return;
  if (petHiddenByDoubleClick) return;
  const now = Date.now();
  if (reason === "manual") {
    const elapsed = now - lastAiManualRequestAt;
    if (elapsed < AI_MANUAL_MIN_INTERVAL_MS) {
      const remainSec = Math.ceil((AI_MANUAL_MIN_INTERVAL_MS - elapsed) / 1000);
      showPetChatBubble(getAiManualCooldownBubble(remainSec), { durationMs: 1800 });
      return;
    }
    lastAiManualRequestAt = now;
  }
  const activityHint = getActivityHint();
  const fallbackText = getAiFallbackBubble(activityHint);
  if (!aiSettings || !aiSettings.apiKey) {
    showPetChatBubble(fallbackText, { durationMs: AI_BUBBLE_SHOW_MS });
    lastAiBubbleAt = Date.now();
    return;
  }

  aiRequestInFlight = true;
  try {
    const response = await window.petApi.aiChat({
      provider: aiSettings.provider,
      apiKey: aiSettings.apiKey,
      baseUrl: aiSettings.baseUrl,
      model: aiSettings.model,
      includeNews: true,
      locale: language,
      prompt: buildAiPrompt(reason, activityHint),
      temperature: 0.9,
      maxTokens: 140
    });
    if (!response?.ok || typeof response.text !== "string" || response.text.trim().length === 0) {
      appendLog(
        t("aiRequestFailedLog", {
          message: localizeAuthErrorMessage(response?.error || "ai request failed")
        })
      );
      showPetChatBubble(fallbackText, { durationMs: AI_BUBBLE_SHOW_MS });
      lastAiBubbleAt = Date.now();
      return;
    }
    showPetChatBubble(response.text.trim(), { durationMs: AI_BUBBLE_SHOW_MS });
    lastAiBubbleAt = Date.now();
  } catch (error) {
    appendLog(
      t("aiRequestFailedLog", {
        message: localizeAuthErrorMessage(error instanceof Error ? error.message : "ai request failed")
      })
    );
    showPetChatBubble(fallbackText, { durationMs: AI_BUBBLE_SHOW_MS });
    lastAiBubbleAt = Date.now();
  } finally {
    aiRequestInFlight = false;
  }
}

function restartAiBubbleScheduler() {
  if (aiSchedulerTimer) {
    clearInterval(aiSchedulerTimer);
    aiSchedulerTimer = null;
  }
  const intervalMs = getAiFrequencyMs();
  aiSchedulerTimer = setInterval(() => {
    const now = Date.now();
    if (now - lastAiBubbleAt < intervalMs) return;
    if (!panelElement.classList.contains("hidden")) return;
    if (battleMode || petHiddenByDoubleClick) return;
    if (isPetChatBubbleVisible()) return;
    void triggerAiBubble("timer");
  }, 15 * 1000);
}

function stopAiBubbleScheduler() {
  if (!aiSchedulerTimer) return;
  clearInterval(aiSchedulerTimer);
  aiSchedulerTimer = null;
}

function refreshCompanionRuntimeByAuth() {
  aiSettings = loadAiSettings();
  renderAiSettingsPanel();
  if (isCompanionOnlineAvailable()) {
    ensureMoodPassiveTimer();
    restartAiBubbleScheduler();
    return;
  }
  clearMoodPassiveTimer();
  stopAiBubbleScheduler();
  hidePetChatBubble();
}

function getModelByElement(element) {
  const key =
    typeof element === "string" && element.trim().length > 0 ? element.trim().toLowerCase() : "";
  return ONLINE_MODEL_BY_ELEMENT[key] || DEFAULT_PET_ROSTER[0].model;
}

function normalizePetNameToken(input) {
  if (typeof input !== "string") return "";
  return input.trim().toLowerCase();
}

function resolveModelByPetIdentity(petName, element, preferredModel = "") {
  if (typeof preferredModel === "string" && preferredModel.trim().length > 0) {
    return sanitizeModelSource(preferredModel, element);
  }

  const token = normalizePetNameToken(petName);
  const targetElement =
    typeof element === "string" && element.trim().length > 0 ? element.trim().toLowerCase() : "";
  const candidates = [...getRoster(), ...DEFAULT_PET_ROSTER];

  if (token) {
    const matches = candidates.filter((pet) => {
      const zh = normalizePetNameToken(pet?.name?.zh);
      const en = normalizePetNameToken(pet?.name?.en);
      return token === zh || token === en;
    });
    if (matches.length > 0) {
      const sameElement = matches.find(
        (pet) => pet?.element?.toLowerCase?.() === targetElement && typeof pet?.model === "string"
      );
      if (sameElement?.model) return sameElement.model;
      const anyMatch = matches.find((pet) => typeof pet?.model === "string" && pet.model.trim().length > 0);
      if (anyMatch?.model) return anyMatch.model;
    }
  }

  return getModelByElement(targetElement);
}

function resolveOnlineRoomSide(room) {
  const userId = authSession?.currentUser?.id || null;
  if (!room || typeof room !== "object" || !userId) return null;
  if (room.host_user_id === userId) return "host";
  if (room.guest_user_id === userId) return "guest";
  return null;
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
    model: resolveModelByPetIdentity(peerName, peerElement),
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
  const hasEnabled = typeof payload.enabled === "boolean";
  const hasAvailable = typeof payload.available === "boolean";
  const hasConfigured = typeof payload.configured === "boolean";
  const hasRoom = Object.prototype.hasOwnProperty.call(payload, "room");
  const hasSide = Object.prototype.hasOwnProperty.call(payload, "side");
  const hasSupabaseUrl = typeof payload.hasSupabaseUrl === "boolean";
  const hasSupabaseAnonKey = typeof payload.hasSupabaseAnonKey === "boolean";
  const hasAvailabilityError = typeof payload.availabilityError === "string";
  onlineDuelState = {
    enabled: hasEnabled ? Boolean(payload.enabled) : Boolean(onlineDuelState.enabled),
    available: hasAvailable ? Boolean(payload.available) : Boolean(onlineDuelState.available),
    configured: hasConfigured ? Boolean(payload.configured) : Boolean(onlineDuelState.configured),
    statusLoaded:
      onlineDuelState.statusLoaded || hasEnabled || hasAvailable || hasConfigured || hasSupabaseUrl || hasSupabaseAnonKey,
    availabilityError:
      hasAvailabilityError && payload.availabilityError.length > 0
        ? payload.availabilityError
        : hasAvailabilityError
          ? null
          : onlineDuelState.availabilityError,
    hasSupabaseUrl: hasSupabaseUrl ? Boolean(payload.hasSupabaseUrl) : Boolean(onlineDuelState.hasSupabaseUrl),
    hasSupabaseAnonKey: hasSupabaseAnonKey
      ? Boolean(payload.hasSupabaseAnonKey)
      : Boolean(onlineDuelState.hasSupabaseAnonKey),
    room: hasRoom
      ? payload.room && typeof payload.room === "object"
        ? { ...payload.room }
        : null
      : onlineDuelState.room
        ? { ...onlineDuelState.room }
        : null,
    side: hasSide
      ? typeof payload.side === "string"
        ? payload.side
        : null
      : onlineDuelState.side
  };
}

function isPanelVisible() {
  return Boolean(panelElement && !panelElement.classList.contains("hidden"));
}

function ensureDuelRequestToastElement() {
  if (duelRequestToastElement && duelRequestToastElement.isConnected) {
    return duelRequestToastElement;
  }
  const element = document.createElement("div");
  element.id = "duel-request-toast";
  element.className = "duel-request-toast";
  document.body.appendChild(element);
  duelRequestToastElement = element;
  return duelRequestToastElement;
}

function hideDuelRequestToast() {
  if (duelRequestToastTimer) {
    clearTimeout(duelRequestToastTimer);
    duelRequestToastTimer = null;
  }
  if (!duelRequestToastElement) return;
  duelRequestToastElement.classList.remove("show");
}

function showDuelRequestToast(message) {
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return;
  const toast = ensureDuelRequestToastElement();
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add("show");
  if (duelRequestToastTimer) {
    clearTimeout(duelRequestToastTimer);
  }
  duelRequestToastTimer = setTimeout(() => {
    if (duelRequestToastElement) {
      duelRequestToastElement.classList.remove("show");
    }
    duelRequestToastTimer = null;
  }, DUEL_REQUEST_TOAST_DURATION_MS);
}

function collectPendingInboundRequestIds(requests) {
  const idSet = new Set();
  const list = Array.isArray(requests) ? requests : [];
  for (const request of list) {
    if (!request || request.status !== "pending") continue;
    const id = typeof request.id === "string" ? request.id.trim() : "";
    if (!id) continue;
    idSet.add(id);
  }
  return idSet;
}

function getPendingInboundRequestCount() {
  const inbound = Array.isArray(duelRequests.inbound) ? duelRequests.inbound : [];
  let count = 0;
  for (const request of inbound) {
    if (request && request.status === "pending") {
      count += 1;
    }
  }
  return count;
}

function renderDuelRequestIndicator() {
  if (!duelRequestIndicatorElement) return;
  const pendingCount = getPendingInboundRequestCount();
  const shouldShow = pendingCount > 0 && !isPanelVisible();
  duelRequestIndicatorElement.classList.toggle("hidden", !shouldShow);
  duelRequestIndicatorElement.textContent = pendingCount > 99 ? "99+" : String(pendingCount);
  duelRequestIndicatorElement.title = currentI18n().authPendingRequestBadgeTitle;
}

function collectNewInboundPendingRequests(previousIdSet, currentInbound) {
  const baseline = previousIdSet instanceof Set ? previousIdSet : new Set();
  const list = Array.isArray(currentInbound) ? currentInbound : [];
  return list.filter((request) => {
    if (!request || request.status !== "pending") return false;
    const id = typeof request.id === "string" ? request.id.trim() : "";
    if (!id) return false;
    return !baseline.has(id);
  });
}

function notifyNewInboundDuelRequests(newRequests) {
  if (!Array.isArray(newRequests) || newRequests.length === 0) return;
  const focusTargetId = String(newRequests[0]?.id || "").trim();
  if (focusTargetId) {
    pendingDuelRequestFocusId = focusTargetId;
  }
  const accounts = Array.from(
    new Set(
      newRequests
        .map((request) => {
          const account = typeof request?.fromAccount === "string" ? request.fromAccount.trim() : "";
          return account || "-";
        })
        .filter(Boolean)
    )
  );

  appendLog(
    t("authInboundRequestLog", {
      accounts: accounts.join(", ")
    })
  );

  if (isPanelVisible()) {
    renderDuelRequestList();
    if (focusTargetId) {
      requestAnimationFrame(() => {
        if (scrollToDuelRequestById(focusTargetId, { expandIfNeeded: true })) {
          pendingDuelRequestFocusId = null;
        }
      });
    }
    return;
  }
  const toastText =
    accounts.length <= 1
      ? t("authInboundRequestToastSingle", { account: accounts[0] || "-" })
      : t("authInboundRequestToastMulti", { count: newRequests.length });
  showDuelRequestToast(toastText);
}

function maybeAutoEnterOnlineBattle(options = {}) {
  if (onlineBattleAutoEnterInFlight || battleMode) return;
  if (!isOnlineDuelReadyForBattle()) return;
  const room = onlineDuelState.room;
  if (!room?.id || room.status !== "active") return;

  onlineBattleAutoEnterInFlight = true;
  const silentLog = Boolean(options.silentLog);
  if (!silentLog) {
    appendLog(
      t("duelOnlineAutoEnterLog", {
        roomCode: room.room_code || "-"
      })
    );
  }
  appendOnlineSessionDiagnosticLog("auto-enter");

  void resetBattle().finally(() => {
    onlineBattleAutoEnterInFlight = false;
  });
}

function maybeHandleOnlineOpponentFled(room, previousStatus) {
  if (!room || typeof room !== "object") return;
  if (room.status !== "abandoned") return;
  if (previousStatus !== "active" && !battleMode) return;

  const localSide =
    onlineDuelState.side === "host" || onlineDuelState.side === "guest"
      ? onlineDuelState.side
      : resolveOnlineRoomSide(room);
  const winnerSide = room.winner_side || null;
  if (winnerSide && localSide && winnerSide !== localSide) return;

  const noticeKey = `${room.id || "-"}:${room.updated_at || "-"}:${room.last_resolved_round || 0}`;
  if (noticeKey === lastOpponentFledNoticeKey) return;
  lastOpponentFledNoticeKey = noticeKey;

  const noticeText = winnerSide ? t("duelOpponentFledWinLog") : t("duelOpponentLeftLog");
  appendLog(noticeText);
  showDuelRequestToast(noticeText);
  appendOnlineSessionDiagnosticLog("opponent-fled");
  void leaveOnlineDuelRoom("opponent_fled", { silent: true });
  if (!battleMode) return;

  clearActionCountdown();
  isRoundResolving = false;
  hideBattleSettlement();
  hideCaptureDecision();
  settlementExtraMessage = "";
  freeDodgeUsedBySide = { player: false, enemy: false };
  setActiveActionTag("");
  setBattleMode(false);
  syncActionButtons();
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
  inventoryListElement.style.height = "auto";
  const measuredScrollHeight = Math.ceil(inventoryListElement.scrollHeight);
  if (measuredScrollHeight > 0) {
    inventoryListElement.style.height = `${measuredScrollHeight + 2}px`;
    return;
  }

  const contentBottom = entries.reduce((max, entry) => Math.max(max, entry.offsetTop + entry.offsetHeight), 0);
  inventoryListElement.style.height = `${Math.ceil(contentBottom + 8)}px`;
}

function scheduleInventoryListHeightSync() {
  syncInventoryListHeight();
  requestAnimationFrame(() => {
    syncInventoryListHeight();
    requestAnimationFrame(() => syncInventoryListHeight());
  });
  if (inventoryListHeightSyncTimer) {
    clearTimeout(inventoryListHeightSyncTimer);
  }
  inventoryListHeightSyncTimer = setTimeout(() => {
    syncInventoryListHeight();
    inventoryListHeightSyncTimer = null;
  }, 90);
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

function setReleaseConfirmVisible(visible) {
  if (!releaseConfirmModalElement) return;
  if (visible) {
    releaseConfirmModalElement.classList.remove("hidden");
    positionReleaseConfirmPopover();
  } else {
    releaseConfirmModalElement.classList.add("hidden");
  }
}

function ensureReleaseConfirmAnchorParent() {
  if (!releaseConfirmModalElement) return;
  const targetParent = petInventoryLayoutElement || panelElement || document.body;
  if (releaseConfirmModalElement.parentElement !== targetParent) {
    targetParent.appendChild(releaseConfirmModalElement);
  }
}

function positionReleaseConfirmPopover() {
  if (
    !releaseConfirmModalElement ||
    releaseConfirmModalElement.classList.contains("hidden") ||
    !petInventoryLayoutElement
  ) {
    return;
  }
  const cardElement = releaseConfirmModalElement.querySelector(".release-confirm-card");
  if (!(cardElement instanceof HTMLElement)) return;

  const layoutRect = petInventoryLayoutElement.getBoundingClientRect();
  let anchorRect = null;
  if (petDetailPopoverElement && !petDetailPopoverElement.classList.contains("hidden")) {
    anchorRect = petDetailPopoverElement.getBoundingClientRect();
  } else {
    const selectedButton = getSelectedPetAvatarButton();
    if (selectedButton) {
      anchorRect = selectedButton.getBoundingClientRect();
    }
  }

  if (!anchorRect) {
    const centerLeft = Math.max(4, Math.round((layoutRect.width - cardElement.offsetWidth) / 2));
    const centerTop = Math.max(4, Math.round((layoutRect.height - cardElement.offsetHeight) / 2));
    releaseConfirmModalElement.style.left = `${centerLeft}px`;
    releaseConfirmModalElement.style.top = `${centerTop}px`;
    return;
  }

  const spacing = 10;
  const cardRect = cardElement.getBoundingClientRect();
  let left = anchorRect.right - layoutRect.left + spacing;
  if (left + cardRect.width > layoutRect.width - 4) {
    left = anchorRect.left - layoutRect.left - cardRect.width - spacing;
  }
  left = Math.max(4, Math.min(left, layoutRect.width - cardRect.width - 4));

  let top = anchorRect.top - layoutRect.top;
  if (top + cardRect.height > layoutRect.height - 4) {
    top = layoutRect.height - cardRect.height - 4;
  }
  top = Math.max(4, top);

  releaseConfirmModalElement.style.left = `${Math.round(left)}px`;
  releaseConfirmModalElement.style.top = `${Math.round(top)}px`;
}

function openReleaseConfirm(pet) {
  if (!pet || !pet.id) return;
  ensureReleaseConfirmAnchorParent();
  pendingReleasePet = {
    id: pet.id,
    name: getPetDisplayName(pet),
    serial: pet.serial || "-",
    capturedAt: pet.capturedAt || ""
  };

  if (releaseConfirmMessageElement) {
    releaseConfirmMessageElement.textContent = t("inventoryReleaseConfirmMessage", {
      petName: pendingReleasePet.name
    });
  }
  if (releaseConfirmSerialValueElement) {
    releaseConfirmSerialValueElement.textContent = pendingReleasePet.serial;
  }
  if (releaseConfirmCapturedValueElement) {
    releaseConfirmCapturedValueElement.textContent = formatReportTime(pendingReleasePet.capturedAt);
  }
  setReleaseConfirmVisible(true);
  requestAnimationFrame(() => {
    positionReleaseConfirmPopover();
  });
}

function closeReleaseConfirm() {
  pendingReleasePet = null;
  setReleaseConfirmVisible(false);
}

async function waitForActivePetUpdate(options = {}) {
  if (!activePetUpdatePromise) return;
  const timeoutMs = Math.max(300, Number(options?.timeoutMs) || 1800);
  try {
    await Promise.race([activePetUpdatePromise, sleep(timeoutMs)]);
  } catch {
    // Keep duel operations non-blocking.
  }
}

async function setActivePet(petId, options = {}) {
  const task = (async () => {
    const pet = getPetById(petId);
    if (!pet?.id) return;
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
    if (options.closeDetail) {
      selectedPetDetailId = null;
      hidePetDetailPopover();
    }
    renderPetInventory();
    if (options.closePanel) {
      selectedPetDetailId = null;
      hidePetDetailPopover();
      setPanelVisible(false);
    }
  })();

  activePetUpdatePromise = task;
  try {
    await task;
  } finally {
    if (activePetUpdatePromise === task) {
      activePetUpdatePromise = null;
    }
  }
}

async function releasePet(petId) {
  const pet = getPetById(petId);
  if (!pet?.id) {
    appendLog(
      t("inventoryReleaseFail", {
        message: localizeAuthErrorMessage("pet id not found")
      })
    );
    return;
  }
  if (getRoster().length <= 1) {
    appendLog(currentI18n().inventoryReleaseKeepOne);
    return;
  }
  openReleaseConfirm(pet);
}

async function confirmReleasePet() {
  if (!pendingReleasePet?.id) return;
  const releaseTarget = { ...pendingReleasePet };
  closeReleaseConfirm();

  const pet = getPetById(releaseTarget.id);
  if (!pet?.id) {
    appendLog(
      t("inventoryReleaseFail", {
        message: localizeAuthErrorMessage("pet id not found")
      })
    );
    return;
  }
  if (getRoster().length <= 1) {
    appendLog(currentI18n().inventoryReleaseKeepOne);
    return;
  }
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
  } catch (error) {
    appendLog(
      t("inventoryReleaseFail", {
        message: localizeAuthErrorMessage(error instanceof Error ? error.message : "release failed")
      })
    );
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
  if (!pet?.id) {
    selectedPetDetailId = null;
    hidePetDetailPopover();
    return;
  }
  const isActive = pet.id === activePetId;
  const elementName = getElementText(pet.element);
  const displayName = getPetDisplayName(pet);
  const statTags = renderStatTagHtml(pet.stats);
  const level = getPetLevel(pet);
  const experience = getPetExperience(pet);
  const mood = getPetMood(pet);
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
        <span class="pet-meta-chip exp">EXP ${experience}/${LEVEL_UP_REQUIRED_EXPERIENCE}</span>
        <span class="pet-meta-chip element element-${pet.element}">${elementName}</span>
      </div>
    </div>
    <div class="pet-detail-preview">
      <model-viewer id="pet-detail-model-viewer" class="pet-detail-model model-tint-${pet.element}" src="${pet.model}" autoplay disable-pan disable-zoom interaction-prompt="none"></model-viewer>
      <div class="pet-detail-relation">
        <span class="pet-relation-chip strong">${currentI18n().battleRelationAdvantage}: ${strongText}</span>
        <span class="pet-relation-chip weak">${currentI18n().battleRelationDisadvantage}: ${weakText}</span>
      </div>
    </div>
    <div class="pet-detail-meta">
      <span><b>${currentI18n().inventoryFieldSerial}:</b> ${pet.serial}</span>
      <span><b>${currentI18n().inventoryFieldCapturedAt}:</b> ${formatReportTime(pet.capturedAt)}</span>
      <span><b>${currentI18n().inventoryFieldLevel}:</b> ${formatLevelText(level)}</span>
      <span><b>${currentI18n().inventoryFieldExperience}:</b> ${experience}/${LEVEL_UP_REQUIRED_EXPERIENCE}</span>
      <span><b>${currentI18n().hoverMoodLabel}:</b> ${mood}</span>
      <span><b>${currentI18n().inventoryFieldWins}:</b> ${winsTotal}</span>
      <span><b>${currentI18n().inventoryFieldStats}:</b></span>
      <div class="pet-stat-chip-row">${statTags}</div>
    </div>
    <div class="pet-detail-actions">
      <button id="btn-close-pet-detail">${currentI18n().inventoryDetailClose}</button>
      <button id="btn-set-active-pet" ${isActive ? "disabled" : ""}>${currentI18n().inventorySetActive}</button>
      <button id="btn-release-pet">${currentI18n().inventoryRelease}</button>
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
      void setActivePet(pet.id, { closeDetail: true });
    });
  }

  const releaseBtn = document.getElementById("btn-release-pet");
  if (releaseBtn) {
    releaseBtn.addEventListener("click", () => {
      void releasePet(pet.id);
    });
  }

  const detailModelElement = document.getElementById("pet-detail-model-viewer");
  if (detailModelElement) {
    detailModelElement.addEventListener(
      "load",
      () => {
        applyDetailModelView(detailModelElement);
        playModelAnimation(detailModelElement, ["idle", "walk", "run", "survey"]);
      },
      { once: true }
    );
    requestAnimationFrame(() => {
      applyDetailModelView(detailModelElement);
      playModelAnimation(detailModelElement, ["idle", "walk", "run", "survey"]);
    });
  }

  requestAnimationFrame(() => {
    positionPetDetailPopover();
    positionReleaseConfirmPopover();
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
        isActive
          ? `<span class="pet-quick-active">${currentI18n().inventoryQuickActive}</span>`
          : `<button type="button" class="pet-quick-set">${currentI18n().inventoryQuickSet}</button>`
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

  scheduleInventoryListHeightSync();
  renderPetDetail();
  renderModelCalibrationPanel();
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
            const localizedNotes = localizeRoundNotes(round.notes);
            const notes = localizedNotes.join(language === "zh" ? "；" : "; ");
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
    appendLog(
      t("mapErrorLog", {
        message: localizeAuthErrorMessage(result?.error?.message || "unknown error")
      })
    );
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
            message: localizeAuthErrorMessage(result?.error?.message || "unknown error")
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
    name: { zh: capture.name?.zh || "流浪灵宠", en: capture.name?.en || "Wild Spirit Pet" },
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
  if (uiRefs.appTitleText) {
    uiRefs.appTitleText.textContent = currentI18n().appTitle;
  }
  if (uiRefs.appSlogan) {
    uiRefs.appSlogan.textContent = currentI18n().appSlogan;
  }
  uiRefs.battleTitle.textContent = currentI18n().battleTitle;
  const activePet = getActivePet();
  uiRefs.playerLabel.textContent = getPetDisplayName(activePet);
  uiRefs.enemyLabel.textContent = getPetDisplayName(enemyPetInBattle);
  battleResetBtn.textContent = currentI18n().resetBattle;
  endBattleBtn.textContent = currentI18n().endBattle;
  if (battleExitDoorBtn) {
    battleExitDoorBtn.title = currentI18n().battleExitDoorLabel;
    battleExitDoorBtn.setAttribute("aria-label", currentI18n().battleExitDoorLabel);
  }
  if (battleExitConfirmTextElement) {
    battleExitConfirmTextElement.textContent = currentI18n().battleExitConfirmText;
  }
  if (battleExitConfirmConfirmBtn) {
    battleExitConfirmConfirmBtn.textContent = currentI18n().battleExitConfirmSubmit;
  }
  if (battleExitConfirmCancelBtn) {
    battleExitConfirmCancelBtn.textContent = currentI18n().battleExitConfirmCancel;
  }
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
  if (uiRefs.duelAdvancedTitle) {
    uiRefs.duelAdvancedTitle.textContent = currentI18n().duelAdvancedTitle;
  }
  uiRefs.duelSearchLabel.textContent = currentI18n().authSearchLabel;
  if (uiRefs.duelOnlineRoomLabel) {
    uiRefs.duelOnlineRoomLabel.textContent = currentI18n().duelOnlineRoomLabel;
  }
  if (uiRefs.modelCalibrationTitle) {
    uiRefs.modelCalibrationTitle.textContent = currentI18n().modelCalibrationTitle;
  }
  if (uiRefs.modelCalibrationTip) {
    uiRefs.modelCalibrationTip.textContent = currentI18n().modelCalibrationTip;
  }
  if (uiRefs.modelCalibrationModelLabel) {
    uiRefs.modelCalibrationModelLabel.textContent = currentI18n().modelCalibrationModelLabel;
  }
  if (uiRefs.modelCalibrationIdleOrientationXLabel) {
    uiRefs.modelCalibrationIdleOrientationXLabel.textContent =
      currentI18n().modelCalibrationIdleOrientationXLabel;
  }
  if (uiRefs.modelCalibrationIdleOrientationYLabel) {
    uiRefs.modelCalibrationIdleOrientationYLabel.textContent =
      currentI18n().modelCalibrationIdleOrientationYLabel;
  }
  if (uiRefs.modelCalibrationBattleOrientationXLabel) {
    uiRefs.modelCalibrationBattleOrientationXLabel.textContent =
      currentI18n().modelCalibrationBattleOrientationXLabel;
  }
  if (uiRefs.modelCalibrationBattleOrientationYLabel) {
    uiRefs.modelCalibrationBattleOrientationYLabel.textContent =
      currentI18n().modelCalibrationBattleOrientationYLabel;
  }
  if (uiRefs.modelCalibrationIdleScaleLabel) {
    uiRefs.modelCalibrationIdleScaleLabel.textContent = currentI18n().modelCalibrationIdleScaleLabel;
  }
  if (uiRefs.modelCalibrationBattleScaleLabel) {
    uiRefs.modelCalibrationBattleScaleLabel.textContent = currentI18n().modelCalibrationBattleScaleLabel;
  }
  if (uiRefs.modelCalibrationPreviewLabel) {
    uiRefs.modelCalibrationPreviewLabel.textContent = currentI18n().modelCalibrationPreviewLabel;
  }
  if (uiRefs.modelCalibrationOriginTip) {
    uiRefs.modelCalibrationOriginTip.textContent = currentI18n().modelCalibrationOriginTip;
  }
  uiRefs.profileAccountLabel.textContent = currentI18n().profileAccountLabel;
  uiRefs.profileOldPasswordLabel.textContent = currentI18n().profileOldPasswordLabel;
  uiRefs.profileNewPasswordLabel.textContent = currentI18n().profileNewPasswordLabel;
  uiRefs.profileConfirmPasswordLabel.textContent = currentI18n().profileConfirmPasswordLabel;
  if (uiRefs.releaseConfirmTitle) {
    uiRefs.releaseConfirmTitle.textContent = currentI18n().inventoryReleaseConfirmTitle;
  }
  if (uiRefs.releaseConfirmSerialLabel) {
    uiRefs.releaseConfirmSerialLabel.textContent = currentI18n().inventoryReleaseConfirmSerial;
  }
  if (uiRefs.releaseConfirmCapturedLabel) {
    uiRefs.releaseConfirmCapturedLabel.textContent = currentI18n().inventoryReleaseConfirmCapturedAt;
  }
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
  if (hoverTrainBtn) {
    hoverTrainBtn.textContent = language === "zh" ? "战" : "B";
    hoverTrainBtn.title = currentI18n().hoverTrainBtn;
    hoverTrainBtn.setAttribute("aria-label", currentI18n().hoverTrainBtn);
  }
  if (hoverMoodBtn) {
    hoverMoodBtn.title = currentI18n().hoverMoodLabel;
    hoverMoodBtn.setAttribute("aria-label", currentI18n().hoverMoodLabel);
  }
  if (hoverInteractBtn) {
    hoverInteractBtn.textContent = "互";
    hoverInteractBtn.title = currentI18n().hoverInteractBtn;
    hoverInteractBtn.setAttribute("aria-label", currentI18n().hoverInteractBtn);
  }
  if (showPetBtn) showPetBtn.textContent = currentI18n().showPetBtn;
  refreshHoverMoodText();
  if (aiSettingsTitleElement) aiSettingsTitleElement.textContent = currentI18n().aiSettingsTitle;
  if (aiSettingsTipElement) aiSettingsTipElement.textContent = currentI18n().aiSettingsTip;
  if (aiProviderLabelElement) aiProviderLabelElement.textContent = currentI18n().aiProviderLabel;
  if (aiFrequencyLabelElement) aiFrequencyLabelElement.textContent = currentI18n().aiFrequencyLabel;
  if (aiApiKeyLabelElement) aiApiKeyLabelElement.textContent = currentI18n().aiApiKeyLabel;
  if (aiCustomMinutesLabelElement) {
    aiCustomMinutesLabelElement.textContent = currentI18n().aiCustomMinutesLabel;
  }
  if (aiBaseUrlLabelElement) aiBaseUrlLabelElement.textContent = currentI18n().aiBaseUrlLabel;
  if (aiModelLabelElement) aiModelLabelElement.textContent = currentI18n().aiModelLabel;
  if (aiSettingsTestBtn) aiSettingsTestBtn.textContent = currentI18n().aiSettingsTestBtn;
  if (aiSettingsSaveBtn) aiSettingsSaveBtn.textContent = currentI18n().aiSettingsSaveBtn;
  if (aiFrequencySelect) {
    const option30 = aiFrequencySelect.querySelector('option[value="30"]');
    const option60 = aiFrequencySelect.querySelector('option[value="60"]');
    const optionCustom = aiFrequencySelect.querySelector('option[value="custom"]');
    if (option30) option30.textContent = currentI18n().aiFrequency30;
    if (option60) option60.textContent = currentI18n().aiFrequency60;
    if (optionCustom) optionCustom.textContent = currentI18n().aiFrequencyCustom;
  }
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
  if (releaseConfirmCancelBtn) {
    releaseConfirmCancelBtn.textContent = currentI18n().inventoryReleaseConfirmCancel;
  }
  if (releaseConfirmOkBtn) {
    releaseConfirmOkBtn.textContent = currentI18n().inventoryReleaseConfirmSubmit;
  }
  if (profileModalStatusElement && profileModalElement?.classList.contains("hidden")) {
    profileModalStatusElement.textContent = currentI18n().profileHint;
    profileModalStatusElement.classList.remove("error", "success");
  }
  if (aiSettingsStatusElement && aiSettingsStatusElement.classList.contains("error") === false) {
    setAiSettingsStatus(
      aiSettings?.apiKey ? currentI18n().aiSettingsStatusSaved : currentI18n().aiSettingsStatusNoKey,
      aiSettings?.apiKey ? "success" : "normal"
    );
  }
  if (duelSearchBtn) duelSearchBtn.textContent = currentI18n().authSearchBtn;
  if (duelSearchKeywordInput) {
    duelSearchKeywordInput.placeholder = currentI18n().authSearchPlaceholder;
  }
  if (duelOnlineCreateBtn) duelOnlineCreateBtn.textContent = currentI18n().duelOnlineCreateBtn;
  if (duelOnlineJoinBtn) duelOnlineJoinBtn.textContent = currentI18n().duelOnlineJoinBtn;
  if (duelOnlineLeaveBtn) duelOnlineLeaveBtn.textContent = currentI18n().duelOnlineLeaveBtn;
  if (exportOnlineLogBtn) exportOnlineLogBtn.textContent = currentI18n().duelDiagnosticExportBtn;
  if (modelCalibrationApplyBtn) modelCalibrationApplyBtn.textContent = currentI18n().modelCalibrationApplyBtn;
  if (modelCalibrationResetBtn) modelCalibrationResetBtn.textContent = currentI18n().modelCalibrationResetBtn;
  syncCalibrationPreviewModeText();
  if (modelCalibrationStatusElement) {
    setModelCalibrationStatus(currentI18n().modelCalibrationStatusHint);
  }
  if (duelOnlineRoomInput) {
    duelOnlineRoomInput.placeholder = "ABC123";
  }
  if (runtimeElement) {
    runtimeElement.title = currentI18n().runtimeVersionHint;
  }
  if (versionHistoryTitleElement) {
    versionHistoryTitleElement.textContent = currentI18n().versionHistoryTitle;
  }
  if (versionHistoryHintElement) {
    versionHistoryHintElement.textContent = currentI18n().versionHistoryHint;
  }
  if (versionHistoryCloseBtn) {
    versionHistoryCloseBtn.textContent = currentI18n().versionHistoryClose;
  }
  if (versionHistoryModalElement && !versionHistoryModalElement.classList.contains("hidden")) {
    renderVersionHistory();
  }
  applyDuelAdvancedExpanded(duelAdvancedExpanded, { persist: false });
  refreshPanelSectionToggleLabels();
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
  if (pendingReleasePet && releaseConfirmMessageElement) {
    releaseConfirmMessageElement.textContent = t("inventoryReleaseConfirmMessage", {
      petName: pendingReleasePet.name
    });
    if (releaseConfirmSerialValueElement) {
      releaseConfirmSerialValueElement.textContent = pendingReleasePet.serial || "-";
    }
    if (releaseConfirmCapturedValueElement) {
      releaseConfirmCapturedValueElement.textContent = formatReportTime(pendingReleasePet.capturedAt);
    }
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
    runtimeElement.textContent = "v...";
  }
}

function renderRuntimeInfo() {
  if (!runtimeInfo) {
    runtimeElement.textContent = "v...";
    runtimeElement.title = currentI18n().runtimeVersionHint;
    return;
  }
  runtimeElement.textContent = t("runtimeInfo", {
    electron: runtimeInfo.electronVersion,
    platform: runtimeInfo.platform,
    app: runtimeInfo.appVersion
  });
  runtimeElement.title = currentI18n().runtimeVersionHint;
}

function getDuelRequestStatusText(status) {
  if (status === "accepted") return currentI18n().authRequestAccepted;
  if (status === "rejected") return currentI18n().authRequestRejected;
  if (status === "cancelled") return currentI18n().authRequestCancelled;
  return currentI18n().authRequestPending;
}

function getPendingDuelWithAccount(account) {
  const accountKey = typeof account === "string" ? account.toLowerCase() : "";
  if (!accountKey) return null;
  const inbound = Array.isArray(duelRequests.inbound) ? duelRequests.inbound : [];
  const outbound = Array.isArray(duelRequests.outbound) ? duelRequests.outbound : [];
  const all = [
    ...inbound.map((request) => ({ direction: "inbound", request })),
    ...outbound.map((request) => ({ direction: "outbound", request }))
  ];
  for (const item of all) {
    const request = item.request;
    if (request.status !== "pending") continue;
    const match = (
      String(request.fromAccount || "").toLowerCase() === accountKey ||
      String(request.toAccount || "").toLowerCase() === accountKey
    );
    if (match) return item;
  }
  return null;
}

function getResendCooldownSeconds(request) {
  if (!request || typeof request !== "object") return 0;
  const reference = Date.parse(String(request.updatedAt || request.createdAt || ""));
  if (!Number.isFinite(reference)) return 0;
  const elapsedMs = Date.now() - reference;
  if (elapsedMs >= DUEL_REQUEST_RESEND_INTERVAL_MS) return 0;
  return Math.ceil((DUEL_REQUEST_RESEND_INTERVAL_MS - elapsedMs) / 1000);
}

function parseRequestTimestamp(request) {
  const updated = Date.parse(String(request?.updatedAt || ""));
  if (Number.isFinite(updated)) return updated;
  const created = Date.parse(String(request?.createdAt || ""));
  if (Number.isFinite(created)) return created;
  return 0;
}

function buildMergedDuelRequests() {
  const inbound = Array.isArray(duelRequests.inbound) ? duelRequests.inbound : [];
  const outbound = Array.isArray(duelRequests.outbound) ? duelRequests.outbound : [];
  return [
    ...inbound.map((request) => ({ ...request, __direction: "inbound" })),
    ...outbound.map((request) => ({ ...request, __direction: "outbound" }))
  ].sort((a, b) => parseRequestTimestamp(b) - parseRequestTimestamp(a));
}

function markDuelRequestActionPending(requestId, action) {
  const id = typeof requestId === "string" ? requestId.trim() : "";
  if (!id) return;
  if (!action) {
    pendingDuelRequestActions.delete(id);
    return;
  }
  pendingDuelRequestActions.set(id, action);
}

function scrollToDuelRequestById(requestId, options = {}) {
  const id = typeof requestId === "string" ? requestId.trim() : "";
  if (!id || !duelRequestListElement) return false;
  let target = duelRequestListElement.querySelector(`.duel-request-item[data-request-id="${id}"]`);
  if (!target && options.expandIfNeeded && !duelRequestListExpanded) {
    duelRequestListExpanded = true;
    renderDuelRequestList();
    target = duelRequestListElement.querySelector(`.duel-request-item[data-request-id="${id}"]`);
  }
  if (!(target instanceof HTMLElement)) return false;
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  target.classList.add("highlight");
  setTimeout(() => target.classList.remove("highlight"), 1400);
  return true;
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
      const pendingRelation = getPendingDuelWithAccount(account);
      const pendingInbound = pendingRelation?.direction === "inbound";
      const pendingOutbound = pendingRelation?.direction === "outbound";
      const resendCooldown = pendingOutbound ? getResendCooldownSeconds(pendingRelation.request) : 0;
      const canResend = pendingOutbound && resendCooldown <= 0;
      const disabled = self || pendingInbound || (pendingOutbound && !canResend);
      const buttonLabel = pendingOutbound ? currentI18n().authSearchResend : currentI18n().authSearchSend;
      const statusText = self
        ? currentI18n().authSearchSelf
        : pendingOutbound
          ? resendCooldown > 0
            ? t("authSearchResendCooldown", { seconds: resendCooldown })
            : currentI18n().authRequestPending
          : pendingInbound
            ? currentI18n().authRequestPending
          : "";
      return `
        <article class="duel-result-item" data-account="${account}">
          <div class="duel-result-main">
            <span class="duel-account">${account}</span>
            <span class="duel-account-meta">${formatReportTime(user.createdAt)}</span>
          </div>
          <div class="duel-result-actions">
            <button class="duel-send-btn" data-resend="${pendingOutbound ? "1" : "0"}" ${disabled ? "disabled" : ""}>${buttonLabel}</button>
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
      const allowResend = button.getAttribute("data-resend") === "1";
      if (!account) return;
      void sendDuelRequest(account, { allowResend });
    });
  }
}

function renderDuelRequestList() {
  if (!duelRequestListElement) return;
  const currentUser = authSession?.currentUser || null;
  if (!currentUser) {
    duelRequestListElement.innerHTML = "";
    renderDuelRequestIndicator();
    return;
  }

  const merged = buildMergedDuelRequests();
  if (merged.length === 0) {
    duelRequestListElement.innerHTML = `<div class="duel-empty">${currentI18n().authRequestEmpty}</div>`;
    renderDuelRequestIndicator();
    return;
  }

  const normalizedList = merged.slice(0, 32);
  const previewCount = 2;
  const expanded = duelRequestListExpanded;
  const visibleItems = expanded ? normalizedList : normalizedList.slice(0, previewCount);
  const hiddenCount = Math.max(0, normalizedList.length - visibleItems.length);

  const itemsHtml = visibleItems
    .map((request) => {
      const fromAccount = String(request.fromAccount || "-");
      const toAccount = String(request.toAccount || "-");
      const peer = request.__direction === "inbound" ? fromAccount : toAccount;
      const pendingAction = pendingDuelRequestActions.get(request.id) || null;
      const pendingDisabled = Boolean(pendingAction);
      const actionButtons = [];
      if (request.status === "pending" && request.__direction === "inbound") {
        actionButtons.push(
          `<button class="duel-request-btn accept" data-request-id="${request.id}" data-action="accept" data-peer="${peer}" ${pendingDisabled ? "disabled" : ""}>${pendingAction === "accept" ? currentI18n().authRequestEntering : currentI18n().authRequestAcceptBtn}</button>`
        );
        actionButtons.push(
          `<button class="duel-request-btn reject" data-request-id="${request.id}" data-action="reject" data-peer="${peer}" ${pendingDisabled ? "disabled" : ""}>${pendingDisabled ? currentI18n().authRequestProcessing : currentI18n().authRequestRejectBtn}</button>`
        );
      } else if (request.status === "pending" && request.__direction === "outbound") {
        actionButtons.push(
          `<button class="duel-request-btn cancel" data-request-id="${request.id}" data-action="cancel" data-peer="${peer}" ${pendingDisabled ? "disabled" : ""}>${pendingDisabled ? currentI18n().authRequestProcessing : currentI18n().authRequestCancelBtn}</button>`
        );
      }
      const actionHtml =
        actionButtons.length > 0 ? `<div class="duel-request-actions">${actionButtons.join("")}</div>` : "";
      const roomMeta =
        request.status === "accepted" && request.roomCode
          ? `<span class="duel-account-meta">Room: ${String(request.roomCode).toUpperCase()}</span>`
          : "";
      const displayTime = request.status === "pending" ? request.updatedAt || request.createdAt : request.updatedAt;
      return `
        <article class="duel-request-item ${request.status}" data-request-id="${request.id}">
          <div class="duel-request-main">
            <span class="duel-account">${t("authRequestFlow", { from: fromAccount, to: toAccount })}</span>
            <span class="duel-send-state">${getDuelRequestStatusText(request.status)}</span>
          </div>
          <span class="duel-account-meta">${formatReportTime(displayTime || request.createdAt)}</span>
          ${roomMeta}
          ${actionHtml}
        </article>
      `;
    })
    .join("");

  const toggleHtml =
    hiddenCount > 0
      ? `<button type="button" class="duel-request-toggle" data-group="merged">${
          expanded ? currentI18n().authRequestCollapse : t("authRequestExpandMore", { count: hiddenCount })
        }</button>`
      : "";

  duelRequestListElement.innerHTML = `
    <div class="duel-request-group">
      <h3>${currentI18n().authRequestTitle} · ${normalizedList.length}</h3>
      ${itemsHtml}
      ${toggleHtml}
    </div>
  `;

  const toggleButton = duelRequestListElement.querySelector(".duel-request-toggle");
  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      duelRequestListExpanded = !duelRequestListExpanded;
      renderDuelRequestList();
    });
  }

  const actionButtons = duelRequestListElement.querySelectorAll(".duel-request-btn");
  for (const button of actionButtons) {
    button.addEventListener("click", () => {
      const action = button.getAttribute("data-action");
      const requestId = button.getAttribute("data-request-id");
      const peer = button.getAttribute("data-peer") || "-";
      if (!action || !requestId) return;
      if (action === "accept" || action === "reject") {
        void respondDuelRequest(requestId, action, peer);
        return;
      }
      if (action === "cancel") {
        void cancelDuelRequest(requestId, peer);
      }
    });
  }

  if (pendingDuelRequestFocusId && isPanelVisible()) {
    requestAnimationFrame(() => {
      if (scrollToDuelRequestById(pendingDuelRequestFocusId, { expandIfNeeded: true })) {
        pendingDuelRequestFocusId = null;
      }
    });
  }
  renderDuelRequestIndicator();
}

function getOnlineDuelStatusText() {
  if (!authSession?.currentUser) {
    return currentI18n().duelOnlineStatusNeedLogin;
  }
  if (!onlineDuelState.statusLoaded) {
    return currentI18n().duelOnlineStatusInitializing;
  }
  if (!onlineDuelState.available) {
    return currentI18n().duelOnlineStatusUnavailable;
  }
  if (!onlineDuelState.configured || !onlineDuelState.enabled) {
    const missingKeys = [];
    if (!onlineDuelState.hasSupabaseUrl) {
      missingKeys.push("SUPABASE_URL");
    }
    if (!onlineDuelState.hasSupabaseAnonKey) {
      missingKeys.push("SUPABASE_ANON_KEY");
    }
    if (missingKeys.length > 0) {
      return t("duelOnlineStatusDisabledDetail", {
        keys: missingKeys.join(" / ")
      });
    }
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
  const previousRoomId = onlineDuelState.room?.id || null;
  const previousRoomStatus = onlineDuelState.room?.status || null;
  if (!authSession?.currentUser) {
    onlineBattleAutoEnterInFlight = false;
    onlineDuelState = {
      enabled: false,
      available: false,
      configured: false,
      statusLoaded: false,
      availabilityError: null,
      hasSupabaseUrl: false,
      hasSupabaseAnonKey: false,
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
      if (response.room?.id && options.deepSync !== false) {
        const syncResponse = await window.petApi.syncOnlineDuelRoom({
          roomId: response.room.id,
          roundsLimit: 2
        });
        if (syncResponse?.ok) {
          applyOnlineDuelSnapshot(syncResponse);
        }
      }
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
  if (onlineDuelState.room?.id) {
    maybeHandleOnlineOpponentFled(onlineDuelState.room, previousRoomStatus);
  }
  if (onlineDuelState.room?.status === "active") {
    const silentLog = previousRoomId === onlineDuelState.room?.id && previousRoomStatus === "active";
    maybeAutoEnterOnlineBattle({ silentLog });
  }
  if (options.autoJoin !== false) {
    await maybeAutoJoinMatchedRoom();
  }
}

async function createOnlineDuelRoom() {
  if (!authSession?.currentUser) return;
  await waitForActivePetUpdate();
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
    appendOnlineSessionDiagnosticLog("create-room");
  } catch (error) {
    appendLog(
      t("duelOnlineActionFailLog", {
        message: localizeAuthErrorMessage(error instanceof Error ? error.message : "create room failed")
      })
    );
  }
}

async function joinOnlineDuelRoomByCode(roomCodeInput, options = {}) {
  if (!authSession?.currentUser) return false;
  await waitForActivePetUpdate();
  const roomCode = typeof roomCodeInput === "string" ? roomCodeInput.trim() : "";
  if (!roomCode) return false;
  const silent = Boolean(options.silent);
  const activePet = getActivePet();
  try {
    const response = await window.petApi.joinOnlineDuelRoom({
      roomCode,
      petElement: activePet.element,
      petName: getPetDisplayName(activePet)
    });
    if (!response?.ok) {
      if (!silent) {
        appendLog(
          t("duelOnlineActionFailLog", {
            message: localizeAuthErrorMessage(response?.error || "join room failed")
          })
        );
      }
      return false;
    }
    applyOnlineDuelSnapshot(response);
    if (duelOnlineRoomInput) {
      duelOnlineRoomInput.value = response.room?.room_code || roomCode;
    }
    renderOnlineDuelStatus();
    if (response.room?.status === "active") {
      maybeAutoEnterOnlineBattle({ silentLog: true });
    }
    if (!silent) {
      appendLog(
        t("duelOnlineJoinSuccessLog", {
          roomCode: response.room?.room_code || roomCode
        })
      );
      appendOnlineSessionDiagnosticLog("join-room");
    }
    return true;
  } catch (error) {
    if (!silent) {
      appendLog(
        t("duelOnlineActionFailLog", {
          message: localizeAuthErrorMessage(error instanceof Error ? error.message : "join room failed")
        })
      );
    }
    return false;
  }
}

async function joinOnlineDuelRoom() {
  const roomCode = duelOnlineRoomInput?.value?.trim() || "";
  await joinOnlineDuelRoomByCode(roomCode);
}

async function leaveOnlineDuelRoom(reason = "manual", options = {}) {
  const silent = Boolean(options?.silent);
  try {
    const response = await window.petApi.leaveOnlineDuelRoom(reason);
    if (!response?.ok) {
      if (!silent) {
        appendLog(
          t("duelOnlineActionFailLog", {
            message: localizeAuthErrorMessage(response?.error || "leave room failed")
          })
        );
      }
      return;
    }
    await refreshOnlineDuelStatus({ silent: true });
    onlineBattleAutoEnterInFlight = false;
    if (!silent) {
      appendLog(currentI18n().duelOnlineLeaveLog);
      appendOnlineSessionDiagnosticLog(`leave-room:${reason}`);
    }
  } catch (error) {
    if (!silent) {
      appendLog(
        t("duelOnlineActionFailLog", {
          message: localizeAuthErrorMessage(error instanceof Error ? error.message : "leave room failed")
        })
      );
    }
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
  renderDuelRequestIndicator();
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
  refreshCompanionRuntimeByAuth();

  if (authSession.currentUser) {
    await loadInventorySnapshot();
    syncActivePetPresentation();
    await refreshDuelRequests({ silent: true });
    await refreshOnlineDuelStatus({ silent: true });
  } else {
    hideDuelRequestToast();
    closeReleaseConfirm();
    duelRequestsInitialized = false;
    pendingInboundRequestIds = new Set();
    pendingDuelRequestFocusId = null;
    pendingDuelRequestActions.clear();
    duelRequestListExpanded = false;
    lastOpponentFledNoticeKey = "";
    onlineBattleAutoEnterInFlight = false;
    autoJoinHandledRequestIds.clear();
    duelRequests = { inbound: [], outbound: [] };
    onlineDuelState = {
      enabled: false,
      available: false,
      configured: false,
      statusLoaded: false,
      availabilityError: null,
      hasSupabaseUrl: false,
      hasSupabaseAnonKey: false,
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
  refreshCompanionRuntimeByAuth();
  if (authSession.currentUser) {
    await loadInventorySnapshot();
    syncActivePetPresentation();
    await refreshDuelRequests({ silent: true });
    await refreshOnlineDuelStatus({ silent: true });
  } else {
    hideDuelRequestToast();
    closeReleaseConfirm();
    duelRequestsInitialized = false;
    pendingInboundRequestIds = new Set();
    pendingDuelRequestFocusId = null;
    pendingDuelRequestActions.clear();
    duelRequestListExpanded = false;
    lastOpponentFledNoticeKey = "";
    onlineBattleAutoEnterInFlight = false;
    autoJoinHandledRequestIds.clear();
    authSearchResults = [];
    authSearchExecuted = false;
    duelRequests = { inbound: [], outbound: [] };
    onlineDuelState = {
      enabled: false,
      available: false,
      configured: false,
      statusLoaded: false,
      availabilityError: null,
      hasSupabaseUrl: false,
      hasSupabaseAnonKey: false,
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
    duelRequestsInitialized = false;
    pendingInboundRequestIds = new Set();
    duelRequests = { inbound: [], outbound: [] };
    renderDuelRequestList();
    return;
  }

  let newInboundRequests = [];
  try {
    const response = await window.petApi.listDuelRequests();
    if (response?.ok) {
      const inbound = Array.isArray(response.inbound) ? response.inbound : [];
      const outbound = Array.isArray(response.outbound) ? response.outbound : [];
      if (duelRequestsInitialized) {
        newInboundRequests = collectNewInboundPendingRequests(pendingInboundRequestIds, inbound);
      }
      duelRequests = {
        inbound,
        outbound
      };
      pendingInboundRequestIds = collectPendingInboundRequestIds(inbound);
      duelRequestsInitialized = true;
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
  notifyNewInboundDuelRequests(newInboundRequests);
  if (options.autoJoin !== false) {
    await maybeAutoJoinMatchedRoom();
  }
}

async function maybeAutoJoinMatchedRoom() {
  if (duelAutoJoinInFlight || !authSession?.currentUser) return;
  if (!onlineDuelState.available || !onlineDuelState.configured) return;

  const outbound = Array.isArray(duelRequests.outbound) ? duelRequests.outbound : [];
  let matched = null;
  for (const item of outbound) {
    if (!item || item.status !== "accepted") continue;
    if (typeof item.roomCode !== "string" || item.roomCode.trim().length === 0) continue;
    if (autoJoinHandledRequestIds.has(item.id)) continue;

    const requestTs = parseRequestTimestamp(item);
    const isExpired = requestTs > 0 && Date.now() - requestTs > DUEL_AUTO_JOIN_MAX_AGE_MS;
    if (isExpired) {
      autoJoinHandledRequestIds.add(item.id);
      continue;
    }
    matched = item;
    break;
  }
  if (!matched) return;

  const roomCode = String(matched.roomCode || "").trim().toUpperCase();
  if (!roomCode) return;
  const roomId = typeof matched.roomId === "string" ? matched.roomId.trim() : "";

  const existingRoom = onlineDuelState.room?.id ? onlineDuelState.room : null;
  if (existingRoom) {
    const existingCode = String(existingRoom.room_code || "").trim().toUpperCase();
    const sameRoom = Boolean(
      (roomId && existingRoom.id === roomId) ||
        (existingCode.length > 0 && existingCode === roomCode)
    );
    if (sameRoom) {
      if (existingRoom.status === "active") {
        maybeAutoEnterOnlineBattle({ silentLog: true });
      }
      return;
    }
    const hasActiveSeat = existingRoom.status === "waiting" || existingRoom.status === "active";
    if (hasActiveSeat) {
      appendLog(
        t("duelOnlineActionFailLog", {
          message: t("duelOnlineAutoJoinSwitchRoomLog", {
            fromCode: existingRoom.room_code || "-",
            toCode: roomCode
          })
        })
      );
      await leaveOnlineDuelRoom("auto_join_switch_room", { silent: true });
      await refreshOnlineDuelStatus({ silent: true, autoJoin: false, deepSync: false });
    }
  }

  duelAutoJoinInFlight = true;
  autoJoinHandledRequestIds.add(matched.id);
  try {
    if (duelOnlineRoomInput) {
      duelOnlineRoomInput.value = roomCode;
    }
    appendLog(t("authRequestAutoJoinLog", { roomCode }));
    const joined = await joinOnlineDuelRoomByCode(roomCode, { silent: true });
    if (joined) {
      appendLog(t("duelOnlineJoinSuccessLog", { roomCode }));
    } else {
      appendLog(t("duelOnlineAutoJoinStopRetryLog", { roomCode }));
    }
  } finally {
    duelAutoJoinInFlight = false;
  }
}

async function runDuelSyncPollingTick() {
  if (duelSyncPollingInFlight || !authSession?.currentUser) return;
  duelSyncPollingInFlight = true;
  try {
    await refreshDuelRequests({ silent: true });
    await refreshOnlineDuelStatus({ silent: true });
  } finally {
    duelSyncPollingInFlight = false;
  }
}

function startDuelSyncPolling() {
  if (duelSyncPollingTimer) return;
  void runDuelSyncPollingTick();
  duelSyncPollingTimer = setInterval(() => {
    void runDuelSyncPollingTick();
  }, DUEL_SYNC_POLL_INTERVAL_MS);
}

function stopDuelSyncPolling() {
  if (!duelSyncPollingTimer) return;
  clearInterval(duelSyncPollingTimer);
  duelSyncPollingTimer = null;
  duelSyncPollingInFlight = false;
}

async function sendDuelRequest(targetAccount, options = {}) {
  const account = typeof targetAccount === "string" ? targetAccount.trim() : "";
  if (!account) return;
  const allowResend = Boolean(options?.allowResend);
  const response = await window.petApi.sendDuelRequest(account, { allowResend });
  if (!response?.ok) {
    let message = localizeAuthErrorMessage(response?.error || "request failed");
    if (
      typeof response?.error === "string" &&
      response.error.toLowerCase().includes("resend too frequent") &&
      Number.isFinite(Number(response?.retryAfterSeconds))
    ) {
      message = `${message} (${t("authSearchResendCooldown", {
        seconds: Math.max(1, Number(response.retryAfterSeconds))
      })})`;
    }
    appendLog(
      t("authSendRequestFailLog", {
        message
      })
    );
    return;
  }
  if (response?.resent) {
    appendLog(t("authSendRequestResentLog", { account }));
  } else {
    appendLog(t("authSendRequestSuccessLog", { account }));
  }
  await refreshDuelRequests({ silent: true });
}

async function respondDuelRequest(requestId, decision, peerAccount) {
  const normalizedId = typeof requestId === "string" ? requestId.trim() : "";
  if (!normalizedId) return;
  if (pendingDuelRequestActions.has(normalizedId)) return;
  const normalizedDecision = decision === "accept" ? "accept" : "reject";
  markDuelRequestActionPending(normalizedId, normalizedDecision);
  renderDuelRequestList();
  const minimumDelayMs = normalizedDecision === "accept" ? 1200 : 320;
  const startedAt = Date.now();
  try {
    await waitForActivePetUpdate({ timeoutMs: 1800 });
    const response = await window.petApi.respondDuelRequest({
      requestId: normalizedId,
      decision: normalizedDecision
    });
    if (!response?.ok) {
      appendLog(
        t("authActionFailLog", {
          message: localizeAuthErrorMessage(response?.error || "respond request failed")
        })
      );
      return;
    }
    const decisionText =
      normalizedDecision === "accept"
        ? currentI18n().authRequestAccepted
        : currentI18n().authRequestRejected;
    appendLog(
      t("authRequestRespondSuccessLog", {
        account: peerAccount || "-",
        decision: decisionText
      })
    );
    if (normalizedDecision === "accept") {
      if (response.room && typeof response.room === "object") {
        applyOnlineDuelSnapshot(response);
        if (duelOnlineRoomInput && response.room.room_code) {
          duelOnlineRoomInput.value = response.room.room_code;
        }
        renderOnlineDuelStatus();
        appendLog(
          t("authRequestMatchedRoomLog", {
            roomCode: response.room.room_code || "-"
          })
        );
        appendOnlineSessionDiagnosticLog("request-accepted-room-created");
      }
      appendLog(currentI18n().authRequestAcceptedGuideLog);
    }
    await refreshDuelRequests({ silent: true });
  } catch (error) {
    appendLog(
      t("authActionFailLog", {
        message: localizeAuthErrorMessage(error instanceof Error ? error.message : "respond request failed")
      })
    );
  } finally {
    const elapsed = Date.now() - startedAt;
    if (elapsed < minimumDelayMs) {
      await sleep(minimumDelayMs - elapsed);
    }
    markDuelRequestActionPending(normalizedId, null);
    renderDuelRequestList();
  }
}

async function cancelDuelRequest(requestId, peerAccount) {
  const normalizedId = typeof requestId === "string" ? requestId.trim() : "";
  if (!normalizedId) return;
  if (pendingDuelRequestActions.has(normalizedId)) return;
  markDuelRequestActionPending(normalizedId, "cancel");
  renderDuelRequestList();
  try {
    const response = await window.petApi.cancelDuelRequest(normalizedId);
    if (!response?.ok) {
      appendLog(
        t("authActionFailLog", {
          message: localizeAuthErrorMessage(response?.error || "cancel request failed")
        })
      );
      return;
    }
    appendLog(
      t("authRequestCancelSuccessLog", {
        account: peerAccount || "-"
      })
    );
    await refreshDuelRequests({ silent: true });
  } finally {
    markDuelRequestActionPending(normalizedId, null);
    renderDuelRequestList();
  }
}

function getUserAvatarToken(input) {
  const text = typeof input === "string" ? input.trim() : "";
  if (!text) return "U";
  return text.slice(0, 1).toUpperCase();
}

async function logoutAccount() {
  closeUserMenu();
  setProfileModalVisible(false);
  closeReleaseConfirm();
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
  hideDuelRequestToast();
  duelRequestsInitialized = false;
  pendingInboundRequestIds = new Set();
  pendingDuelRequestFocusId = null;
  pendingDuelRequestActions.clear();
  duelRequestListExpanded = false;
  lastOpponentFledNoticeKey = "";
  onlineBattleAutoEnterInFlight = false;
  autoJoinHandledRequestIds.clear();
  duelRequests = { inbound: [], outbound: [] };
  onlineDuelState = {
    enabled: false,
    available: false,
    configured: false,
    statusLoaded: false,
    availabilityError: null,
    hasSupabaseUrl: false,
    hasSupabaseAnonKey: false,
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
    appendLog(
      t("wildRefreshFailLog", {
        message: localizeAuthErrorMessage(result?.error?.message || "resolve failed")
      })
    );
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
  if (active) {
    if (petHiddenByDoubleClick) {
      setPetHiddenState(false, { silent: true });
    }
    setHoverToolsVisible(false);
    hidePetChatBubble();
    applyBattleView();
  } else {
    applyIdleOrbit();
    applyEnemyIdleOrbit();
    syncIdleWindowSizeForCurrentPose({ force: true });
    battleFacingOffsetDeg = 0;
    battleCameraPitchDeg = 74;
  }
  roundFeedElement.classList.toggle("hidden", !active);
  lastRoundResultElement.classList.toggle("hidden", !active);
  enemyCard.classList.toggle("hidden", !active);
  enemyHudElement.classList.toggle("hidden", !active);
  battleActionTagsElement.classList.toggle("hidden", !active);
  if (battleExitDoorBtn) {
    battleExitDoorBtn.classList.toggle("hidden", !active);
  }
  if (!active) {
    closeBattleLeaveConfirm();
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
  syncPetOverlayVisibility();
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
  if (modelElement === playerModel || modelElement === enemyModel) {
    if (battleMode) {
      applyBattleView();
    } else if (modelElement === playerModel) {
      applyIdleOrbit();
      syncIdleWindowSizeForCurrentPose();
    } else {
      applyEnemyIdleOrbit();
    }
  } else {
    applyDetailModelView(modelElement);
  }
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
  await waitForActivePetUpdate();
  lastOpponentFledNoticeKey = "";
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
    const onlineReset = await window.petApi.onlineDuelReset({
      playerPetId: activePet.id
    });
    if (!onlineReset?.ok) {
      appendOnlineSessionDiagnosticLog("online-reset-failed");
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
    const currentRoom = onlineDuelState.room || {};
    const selfPrefix = onlineDuelState.side === "guest" ? "guest" : "host";
    const lockedElement = currentRoom[`${selfPrefix}_element`] || activePet.element;
    const lockedPetName = currentRoom[`${selfPrefix}_pet_name`] || getPetDisplayName(activePet);
    const preferredLocalModel =
      lockedElement === activePet.element && lockedPetName === getPetDisplayName(activePet)
        ? activePet.model
        : "";
    playerModel.src = resolveModelByPetIdentity(lockedPetName, lockedElement, preferredLocalModel);
    setModelElementTint(playerModel, lockedElement);
    if (lockedElement !== activePet.element || lockedPetName !== getPetDisplayName(activePet)) {
      appendLog(
        t("duelOnlinePetLockedLog", {
          petName: lockedPetName,
          element: getElementText(lockedElement)
        })
      );
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
    appendOnlineSessionDiagnosticLog("online-reset-ok");
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
  setPanelVisible(false);
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
    const localizedRoundNotes = localizeRoundNotes(round?.notes);
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

    if (localizedRoundNotes.length > 0) {
      appendLog(t("battleNotesLog", { notes: localizedRoundNotes.join("; ") }));
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
    if (localizedRoundNotes.length > 0) {
      tickerMessages.push(localizedRoundNotes.slice(0, 2).join(" | "));
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
        const gainedExp = toNonNegativeInt(
          result.progression.gainedExperience,
          round.winner === "player" ? BATTLE_WIN_EXPERIENCE : BATTLE_LOSE_EXPERIENCE
        );
        appendLog(
          t("battleExpGainLog", {
            petName: getPetDisplayName(result.progression.pet),
            exp: result.progression.currentExperience,
            required: LEVEL_UP_REQUIRED_EXPERIENCE
          })
        );
        if (gainedExp > 0) {
          enqueueRoundFeed([
            t("battleExpDeltaFeed", {
              petName: getPetDisplayName(result.progression.pet),
              exp: gainedExp
            })
          ]);
        }
        if (result.progression.leveledUp) {
          appendLog(
            t("battleLevelUpLog", {
              petName: getPetDisplayName(result.progression.pet),
              level: result.progression.currentLevel
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
    const now = Date.now();
    interactionActivity.lastMouseAt = now;
    pushActivityEvent(interactionActivity.mouseEvents, now);
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
        idleOrbitDeg -= deltaX * 0.55;
        applyIdleOrbit();
      }
    }
    window.__lastMouseX = event.clientX;
    window.__lastMouseY = event.clientY;
    syncPetHoverByPointer(event.clientX, event.clientY);
    reportHitState();
  });

  window.addEventListener("mouseup", () => {
    endWindowDrag();
    rotatePointerSession = null;
  });

  window.addEventListener("mouseleave", () => {
    window.__lastMouseX = -9999;
    window.__lastMouseY = -9999;
    cancelPetHoverHideDelay();
    isInteractive = false;
    frameMode = "idle";
    setHoverToolsVisible(false);
    updatePetClass();
  });

  playerCard.addEventListener("mouseenter", () => {
    const x = Number(window.__lastMouseX || 0);
    const y = Number(window.__lastMouseY || 0);
    syncPetHoverByPointer(x, y);
    frameMode = hoverToolsVisible ? "interacting" : "idle";
    updatePetClass();
  });

  playerCard.addEventListener("mouseleave", (event) => {
    const related = event.relatedTarget;
    if (
      related instanceof Node &&
      petHoverToolsElement &&
      !petHoverToolsElement.classList.contains("hidden") &&
      petHoverToolsElement.contains(related)
    ) {
      return;
    }
    isInteractive = false;
    frameMode = "idle";
    schedulePetHoverHideDelay();
    updatePetClass();
  });

  playerCard.addEventListener("click", () => {
    setBurstInteraction(t("petInteract"));
  });

  playerCard.addEventListener("dblclick", () => {
    if (battleMode) return;
    void window.petApi.hideWindow();
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

  petHoverToolsElement?.addEventListener("mouseenter", () => {
    cancelPetHoverHideDelay();
    isInteractive = true;
    frameMode = "interacting";
    updatePetClass();
  });

  petHoverToolsElement?.addEventListener("mouseleave", (event) => {
    const related = event.relatedTarget;
    if (related instanceof Node && playerCard.contains(related)) return;
    isInteractive = false;
    frameMode = "idle";
    schedulePetHoverHideDelay();
    updatePetClass();
  });

  showPetBtn?.addEventListener("click", () => {
    setPetHiddenState(false);
  });

  hoverTrainBtn?.addEventListener("click", () => {
    void startTrainingFromHover();
  });

  hoverInteractBtn?.addEventListener("click", async () => {
    if (hoverInteractBtn.disabled) return;
    hoverInteractBtn.disabled = true;
    setBurstInteraction(t("petInteract"));
    try {
      await applyPetMoodDelta(PET_INTERACT_MOOD_BOOST);
      await triggerAiBubble("manual");
    } finally {
      hoverInteractBtn.disabled = false;
      syncPetHoverByPointer(Number(window.__lastMouseX || -1), Number(window.__lastMouseY || -1));
    }
  });

  petChatBubbleElement?.addEventListener("mouseenter", () => {
    if (!isPetChatBubbleVisible()) return;
    chatBubbleHoverPinned = true;
    if (chatBubbleTimer) {
      clearTimeout(chatBubbleTimer);
      chatBubbleTimer = null;
    }
  });

  petChatBubbleElement?.addEventListener("mouseleave", () => {
    if (!isPetChatBubbleVisible()) return;
    chatBubbleHoverPinned = false;
    const now = Date.now();
    const remain = chatBubbleHideAt > 0 ? chatBubbleHideAt - now : 0;
    const nextDuration = Math.max(1200, remain);
    chatBubbleHideAt = now + nextDuration;
    if (chatBubbleTimer) {
      clearTimeout(chatBubbleTimer);
    }
    chatBubbleTimer = setTimeout(() => {
      if (chatBubbleHoverPinned) return;
      hidePetChatBubble();
    }, nextDuration);
  });

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
    const now = Date.now();
    interactionActivity.lastKeyboardAt = now;
    pushActivityEvent(interactionActivity.keyEvents, now);
    if (event.key !== "Escape") return;
    if (closeTopLayerByEsc()) {
      event.preventDefault();
    }
  });

  languageBtn.addEventListener("click", () => {
    toggleLanguage();
  });

  const readAiSettingsDraft = (options = {}) => {
    if (!aiSettings) {
      aiSettings = getDefaultAiSettings();
    }
    const previousProvider = aiSettings.provider;
    const provider = aiProviderSelect?.value || aiSettings.provider;
    const apiKey = aiApiKeyInput?.value?.trim() || "";
    const baseUrl = aiBaseUrlInput?.value?.trim() || "";
    const model = aiModelInput?.value?.trim() || "";
    const freqMode = aiFrequencySelect?.value || aiSettings.frequencyMode;
    const frequencyMode = freqMode === "30" || freqMode === "custom" ? freqMode : "60";
    const customMinutes = clampInt(
      aiCustomMinutesInput?.value,
      AI_CUSTOM_FREQ_MIN_MINUTES,
      AI_CUSTOM_FREQ_MAX_MINUTES
    );
    const defaultBaseUrl = provider === "openai" ? AI_DEFAULT_BASE_URL_OPENAI : AI_DEFAULT_BASE_URL_DEEPSEEK;
    const defaultModel = provider === "openai" ? "gpt-4o-mini" : "deepseek-chat";
    let nextBaseUrl = baseUrl;
    let nextModel = model;
    if (!baseUrl || (options.applyProviderDefault && provider !== previousProvider)) {
      nextBaseUrl = defaultBaseUrl;
    } else {
      nextBaseUrl = baseUrl.replace(/\/+$/, "");
    }
    if (!model || (options.applyProviderDefault && provider !== previousProvider)) {
      nextModel = defaultModel;
    } else {
      nextModel = model;
    }
    if (options.syncForm !== false) {
      if (aiBaseUrlInput) aiBaseUrlInput.value = nextBaseUrl;
      if (aiModelInput) aiModelInput.value = nextModel;
      if (aiCustomMinutesInput) aiCustomMinutesInput.disabled = frequencyMode !== "custom";
    }
    return normalizeAiSettings({
      ...aiSettings,
      provider,
      apiKey,
      baseUrl: nextBaseUrl,
      model: nextModel,
      frequencyMode,
      customMinutes
    });
  };

  const commitAiSettings = (options = {}) => {
    aiSettings = readAiSettingsDraft(options);
    if (options.persist === false) {
      setAiSettingsStatus(
        aiSettings.apiKey ? currentI18n().aiSettingsStatusSaved : currentI18n().aiSettingsStatusNoKey,
        aiSettings.apiKey ? "success" : "normal"
      );
      return aiSettings;
    }
    saveAiSettings(Boolean(options.silent));
    return aiSettings;
  };

  aiProviderSelect?.addEventListener("change", () => {
    commitAiSettings({ applyProviderDefault: true, persist: false, silent: true });
  });
  aiFrequencySelect?.addEventListener("change", () => {
    commitAiSettings({ persist: false, silent: true });
  });
  aiApiKeyInput?.addEventListener("change", () => {
    commitAiSettings({ persist: false, silent: true, syncForm: false });
  });
  aiBaseUrlInput?.addEventListener("change", () => {
    commitAiSettings({ persist: false, silent: true, syncForm: false });
  });
  aiModelInput?.addEventListener("change", () => {
    commitAiSettings({ persist: false, silent: true, syncForm: false });
  });
  aiCustomMinutesInput?.addEventListener("change", () => {
    commitAiSettings({ persist: false, silent: true, syncForm: false });
  });
  aiSettingsSaveBtn?.addEventListener("click", () => {
    commitAiSettings({ persist: true });
    if (!setPanelSectionExpandedByKey("ai-settings", false, { persist: true })) {
      setPanelSectionExpandedByKey("ai-settings-title", false, { persist: true });
    }
  });
  aiSettingsTestBtn?.addEventListener("click", async () => {
    const draft = readAiSettingsDraft({ syncForm: false });
    if (!draft.apiKey) {
      setAiSettingsStatus(currentI18n().aiSettingsStatusNoKey, "error");
      return;
    }
    aiSettingsTestBtn.disabled = true;
    setAiSettingsStatus(currentI18n().aiSettingsTesting, "normal");
    try {
      const response = await window.petApi.aiChat({
        provider: draft.provider,
        apiKey: draft.apiKey,
        baseUrl: draft.baseUrl,
        model: draft.model,
        includeNews: true,
        locale: language,
        prompt:
          language === "zh"
            ? "请只返回一句中文：连接测试成功。"
            : "Reply with one short sentence: connection test passed.",
        temperature: 0.2,
        maxTokens: 80
      });
      if (!response?.ok || typeof response.text !== "string" || response.text.trim().length === 0) {
        setAiSettingsStatus(
          t("aiSettingsTestFail", {
            message: localizeAuthErrorMessage(response?.error || "ai request failed")
          }),
          "error"
        );
        return;
      }
      setAiSettingsStatus(currentI18n().aiSettingsTestSuccess, "success");
      showPetChatBubble(response.text.trim(), { durationMs: AI_BUBBLE_SHOW_MS });
      lastAiBubbleAt = Date.now();
    } catch (error) {
      setAiSettingsStatus(
        t("aiSettingsTestFail", {
          message: localizeAuthErrorMessage(error instanceof Error ? error.message : "ai request failed")
        }),
        "error"
      );
    } finally {
      aiSettingsTestBtn.disabled = false;
    }
  });

  runtimeElement?.addEventListener("click", () => {
    setVersionHistoryVisible(true);
  });

  runtimeElement?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setVersionHistoryVisible(true);
  });

  versionHistoryCloseBtn?.addEventListener("click", () => {
    setVersionHistoryVisible(false);
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

  releaseConfirmCancelBtn?.addEventListener("click", () => {
    closeReleaseConfirm();
  });
  releaseConfirmOkBtn?.addEventListener("click", () => {
    void confirmReleasePet();
  });

  window.addEventListener("mousedown", (event) => {
    if (!isUserMenuOpen()) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const clickedInsideMenu = Boolean(target.closest(".user-menu-wrap"));
    if (!clickedInsideMenu) {
      closeUserMenu();
    }
  });

  window.addEventListener("mousedown", (event) => {
    if (!releaseConfirmModalElement || releaseConfirmModalElement.classList.contains("hidden")) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest(".release-confirm-card")) return;
    closeReleaseConfirm();
  });

  window.addEventListener("mousedown", (event) => {
    if (!versionHistoryModalElement || versionHistoryModalElement.classList.contains("hidden")) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest(".version-history-card")) return;
    if (target.closest("#runtime")) return;
    setVersionHistoryVisible(false);
  });

  window.addEventListener("mousedown", (event) => {
    if (!battleExitConfirmElement || battleExitConfirmElement.classList.contains("hidden")) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("#battle-exit-confirm")) return;
    if (target.closest("#btn-battle-exit-door")) return;
    closeBattleLeaveConfirm();
  });

  duelSearchBtn?.addEventListener("click", () => {
    void searchDuelTarget();
  });

  duelSearchKeywordInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void searchDuelTarget();
  });

  duelAdvancedToggleBtn?.addEventListener("click", () => {
    applyDuelAdvancedExpanded(!duelAdvancedExpanded, { persist: true });
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

  exportOnlineLogBtn?.addEventListener("click", () => {
    exportOnlineDiagnosticLog();
  });

  duelOnlineRoomInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void joinOnlineDuelRoom();
  });

  modelCalibrationModelSelect?.addEventListener("change", () => {
    selectedCalibrationModelFile = getModelSourceFileName(modelCalibrationModelSelect.value);
    fillModelCalibrationInputs(selectedCalibrationModelFile);
    applyModelCalibrationPreviewBox();
    setModelCalibrationStatus(currentI18n().modelCalibrationStatusHint);
  });

  modelCalibrationApplyBtn?.addEventListener("click", () => {
    saveModelCalibrationForSelectedModel();
  });

  modelCalibrationResetBtn?.addEventListener("click", () => {
    resetModelCalibrationForSelectedModel();
  });

  const handleCalibrationEnter = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    saveModelCalibrationForSelectedModel();
  };
  modelCalibrationIdleOrientationXInput?.addEventListener("keydown", handleCalibrationEnter);
  modelCalibrationIdleOrientationYInput?.addEventListener("keydown", handleCalibrationEnter);
  modelCalibrationBattleOrientationXInput?.addEventListener("keydown", handleCalibrationEnter);
  modelCalibrationBattleOrientationYInput?.addEventListener("keydown", handleCalibrationEnter);
  modelCalibrationIdleScaleInput?.addEventListener("keydown", handleCalibrationEnter);
  modelCalibrationBattleScaleInput?.addEventListener("keydown", handleCalibrationEnter);
  modelCalibrationIdleOrientationXInput?.addEventListener("input", () => {
    applyModelCalibrationPreviewBox({ playAnimation: false });
  });
  modelCalibrationIdleOrientationYInput?.addEventListener("input", () => {
    applyModelCalibrationPreviewBox({ playAnimation: false });
  });
  modelCalibrationBattleOrientationXInput?.addEventListener("input", () => {
    applyModelCalibrationPreviewBox({ playAnimation: false });
  });
  modelCalibrationBattleOrientationYInput?.addEventListener("input", () => {
    applyModelCalibrationPreviewBox({ playAnimation: false });
  });
  modelCalibrationIdleScaleInput?.addEventListener("input", () => {
    applyModelCalibrationPreviewBox({ playAnimation: false });
  });
  modelCalibrationBattleScaleInput?.addEventListener("input", () => {
    applyModelCalibrationPreviewBox({ playAnimation: false });
  });

  modelCalibrationPreviewModeBtn?.addEventListener("click", () => {
    calibrationPreviewMode = calibrationPreviewMode === "battle" ? "idle" : "battle";
    syncCalibrationPreviewModeText();
    applyModelCalibrationPreviewBox();
  });

  modelCalibrationPreviewModel?.addEventListener("load", () => {
    applyModelCalibrationPreviewBox();
  });

  modelCalibrationPreviewModel?.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const orientationInput = getCalibrationPreviewOrientationInput();
    const startOrientationX = readCalibrationNumber(orientationInput.x, -180, 180) ?? 0;
    const startOrientationY = readCalibrationNumber(orientationInput.y, -180, 180) ?? 0;
    calibrationPreviewDragSession = {
      startX: event.clientX,
      startY: event.clientY,
      startOrientationX,
      startOrientationY
    };
    modelCalibrationPreviewModel.classList.add("dragging");
  });

  window.addEventListener("mousemove", (event) => {
    if (!calibrationPreviewDragSession) return;
    event.preventDefault();
    const orientationInput = getCalibrationPreviewOrientationInput();
    if (!orientationInput?.x || !orientationInput?.y) return;
    let deltaX = event.clientX - calibrationPreviewDragSession.startX;
    let deltaY = event.clientY - calibrationPreviewDragSession.startY;
    if (Math.abs(deltaX) < CALIBRATION_DRAG_DEADZONE_PX) deltaX = 0;
    if (Math.abs(deltaY) < CALIBRATION_DRAG_DEADZONE_PX) deltaY = 0;

    const nextOrientationX = normalizeOrientationDegrees(
      calibrationPreviewDragSession.startOrientationX + deltaY * CALIBRATION_DRAG_VERTICAL_SENSITIVITY
    );
    const nextOrientationY = normalizeOrientationDegrees(
      calibrationPreviewDragSession.startOrientationY + deltaX * CALIBRATION_DRAG_HORIZONTAL_SENSITIVITY
    );
    orientationInput.x.value = formatCalibrationNumber(nextOrientationX, 0);
    orientationInput.y.value = formatCalibrationNumber(nextOrientationY, 0);
    applyModelCalibrationPreviewBox({ playAnimation: false });
  });

  window.addEventListener("mouseup", () => {
    if (!calibrationPreviewDragSession) return;
    calibrationPreviewDragSession = null;
    if (modelCalibrationPreviewModel) {
      modelCalibrationPreviewModel.classList.remove("dragging");
    }
    saveModelCalibrationForSelectedModel({ silent: true });
  });

  battleResetBtn.addEventListener("click", () => {
    void resetBattle();
  });

  endBattleBtn.addEventListener("click", () => {
    void endBattle(true);
  });

  battleExitDoorBtn?.addEventListener("click", () => {
    openBattleLeaveConfirm();
  });

  battleExitConfirmCancelBtn?.addEventListener("click", () => {
    closeBattleLeaveConfirm();
  });

  battleExitConfirmConfirmBtn?.addEventListener("click", () => {
    closeBattleLeaveConfirm();
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
    if (event?.type === "session-invalidated") {
      appendLog(currentI18n().authSessionInvalidatedLog);
      showDuelRequestToast(currentI18n().authSessionInvalidatedToast);
      void logoutAccount();
      return;
    }
    const room = event?.payload?.room;
    const side = event?.payload?.side;
    if (room && typeof room === "object") {
      const previousStatus = onlineDuelState.room?.status || null;
      onlineDuelState.room = { ...room };
      if (typeof side === "string" && side.length > 0) {
        onlineDuelState.side = side;
      }
      if (duelOnlineRoomInput && room.room_code) {
        duelOnlineRoomInput.value = room.room_code;
      }
      renderOnlineDuelStatus();
      const becameActive = room.status === "active" && previousStatus !== "active";
      if (becameActive) {
        appendLog(
          t("duelOnlineStatusActive", {
            roomCode: room.room_code || "-"
          })
        );
        appendLog(
          t("duelOnlineParticipantsLog", {
            hostName: String(room.host_pet_name || "-"),
            hostElement: getElementText(room.host_element || "metal"),
            guestName: String(room.guest_pet_name || "-"),
            guestElement: getElementText(room.guest_element || "metal")
          })
        );
        appendOnlineSessionDiagnosticLog("room-active-event");
      }
      maybeHandleOnlineOpponentFled(room, previousStatus);
      if (room.status === "active") {
        maybeAutoEnterOnlineBattle({ silentLog: true });
      }
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
      syncIdleWindowSizeForCurrentPose({ force: true });
    }
    if (hoverToolsVisible || isPetChatBubbleVisible()) {
      positionPetOverlays();
    }
    playModelAnimation(playerModel, ["survey", "idle", "walk"]);
  });

  enemyModel.addEventListener("load", () => {
    if (battleMode) {
      applyBattleView();
    } else {
      applyEnemyIdleOrbit();
    }
    updateBattleHudTop();
    playModelAnimation(enemyModel, ["idle", "walk", "run"]);
  });
}

async function bootstrap() {
  battleSceneElement?.style.setProperty("--idle-overlay-headroom", `${IDLE_OVERLAY_HEADROOM_PX}px`);
  await loadInventorySnapshot();
  const activePet = getActivePet();
  playerModel.src = activePet.model;
  enemyPetInBattle = chooseEnemyPetForBattle();
  enemyModel.src = enemyPetInBattle.model;
  setModelElementTint(playerModel, activePet.element);
  setModelElementTint(enemyModel, enemyPetInBattle.element);
  applyIdleOrbit();
  applyEnemyIdleOrbit();

  setupPanelSectionToggles();
  aiSettings = loadAiSettings();
  renderAiSettingsPanel();
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
  startDuelSyncPolling();
  ensureMoodPassiveTimer();
  restartAiBubbleScheduler();
  window.addEventListener("beforeunload", () => {
    stopDuelSyncPolling();
    clearMoodPassiveTimer();
    stopAiBubbleScheduler();
    hidePetChatBubble();
  });
  window.addEventListener("resize", () => {
    scheduleInventoryListHeightSync();
    positionPetDetailPopover();
    positionReleaseConfirmPopover();
    updateBattleHudTop();
    if (hoverToolsVisible || isPetChatBubbleVisible()) {
      positionPetOverlays();
    }
  });
  panelElement.addEventListener(
    "scroll",
    () => {
      positionPetDetailPopover();
      positionReleaseConfirmPopover();
    },
    { passive: true }
  );
  inventoryListElement.addEventListener(
    "scroll",
    () => {
      positionPetDetailPopover();
      positionReleaseConfirmPopover();
    },
    { passive: true }
  );
  updatePetClass();

  const battleState = await window.petApi.getBattleState();
  updateBattleBoard(battleState);
  setBattleMode(false);

  setInterval(() => {
    const now = Date.now();
    if (now - lastIdlePoseWindowSyncAt >= IDLE_POSE_WINDOW_SYNC_INTERVAL_MS) {
      lastIdlePoseWindowSyncAt = now;
      syncIdleWindowSizeForCurrentPose();
    }
    if (
      isPetChatBubbleVisible() &&
      chatBubbleHideAt > 0 &&
      !chatBubbleHoverPinned &&
      now >= chatBubbleHideAt + AI_BUBBLE_HIDE_GUARD_MS
    ) {
      hidePetChatBubble();
    }
    if (!isInteractive && !isPaused) {
      reportHitState();
    }
  }, 120);
}

bootstrap();
