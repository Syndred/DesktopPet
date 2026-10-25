// Shared, filesystem-free validation used by desktop and the verified Edge command.
export const ACTIONS = Object.freeze(['idle', 'blink', 'walk', 'wave', 'eat', 'attack_windup', 'attack_release', 'attack', 'hit', 'skill', 'victory', 'sleep']);
export const DEFAULT_CALIBRATION = Object.freeze({ scale: 1, rotationDeg: 0, verticalOffset: 0, mirrorX: false, anchorX: 0.5, anchorY: 0.85, fps: 0 });
export function createPreferenceValidators(fail=(code,message)=>{throw Object.assign(new Error(message),{code});}) {
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
function numeric(value, fallback, min, max, field) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail('INVALID_CALIBRATION', `${field} 超出允许范围`);
  return value;
}
function calibration(value = {}) {
  if (!plain(value)) fail('INVALID_CALIBRATION', '校准参数格式错误');
  if (value.mirrorX !== undefined && typeof value.mirrorX !== 'boolean') fail('INVALID_CALIBRATION', '翻转参数格式错误');
  if (typeof value.fps === 'number' && value.fps > 0 && value.fps < 1) fail('INVALID_CALIBRATION', '自定义帧率应为 1 到 60，或使用动作原始帧率');
  return {
    scale: numeric(value.scale, 1, 0.25, 3, '大小'),
    rotationDeg: numeric(value.rotationDeg ?? value.yawDeg, 0, -180, 180, '旋转'),
    verticalOffset: numeric(value.verticalOffset, 0, -0.5, 0.5, '垂直位置'),
    mirrorX: value.mirrorX ?? false,
    anchorX: numeric(value.anchorX, 0.5, 0, 1, '横向锚点'),
    anchorY: numeric(value.anchorY, 0.85, 0, 1, '纵向锚点'),
    fps: numeric(value.fps, 0, 0, 60, '播放帧率'),
  };
}
function calibrations(value = {}) {
  if (!plain(value)) fail('INVALID_CALIBRATION', '校准参数格式错误');
  return { desktop: calibration(value.desktop), battle: calibration(value.battle) };
}
function actionMap(value, clips, strict = false) {
  if (value !== undefined && !plain(value)) fail('INVALID_ACTION_MAP', '动作映射格式错误');
  const names = new Set(clips.map(clip => clip.name));
  const patterns = {
    idle: /idle|stand|静|待机/i, blink: /blink|眨眼/i, walk: /walk|run|move|走|跑/i, wave: /wave|greet|招手/i, eat: /eat|feed|chew|进食|吃/i,
    attack_windup: /attack[_ -]?(?:windup|start)|攻击起手|蓄势/i, attack_release: /attack[_ -]?(?:release|strike)|攻击释放/i, attack: /attack|bite|punch|攻击/i,
    hit: /hit|hurt|damage|受击/i, skill: /skill|cast|spell|技能/i, victory: /victory|win|dance|胜利/i, sleep: /sleep|rest|睡/i,
  };
  return Object.fromEntries(ACTIONS.map(action => {
    if (value && Object.hasOwn(value, action)) {
      const clip = value[action];
      if (clip !== null && (typeof clip !== 'string' || !names.has(clip))) {
        if (strict) fail('UNKNOWN_CLIP', `${action} 映射的动画不存在`);
        return [action, null];
      }
      return [action, clip];
    }
    const preferredIdle = action === 'idle' ? clips.find(clip => /(^|[|:_])idle(?:norm)?$/i.test(clip.name)) : null;
    return [action, clips.find(clip => clip.name === action)?.name ?? preferredIdle?.name ?? clips.find(clip => patterns[action].test(clip.name))?.name ?? (action === 'idle' ? clips[0]?.name ?? null : null)];
  }));
}
return {calibration,calibrations,actionMap};
}
