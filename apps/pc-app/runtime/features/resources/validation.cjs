const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const ACTIONS = Object.freeze(['idle', 'blink', 'walk', 'wave', 'eat', 'attack_windup', 'attack_release', 'attack', 'hit', 'skill', 'victory', 'sleep']);
const LIMITS = Object.freeze({ file: 128 * 1024 * 1024, total: 256 * 1024 * 1024, json: 4 * 1024 * 1024, files: 128, pixels: 4096 * 4096 });
const DEFAULT_CALIBRATION = Object.freeze({ scale: 1, rotationDeg: 0, verticalOffset: 0, mirrorX: false, anchorX: 0.5, anchorY: 0.85, fps: 0 });
class ResourceError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'ResourceError'; this.code = code; this.details = details; }
}
function fail(code, message) { throw new ResourceError(code, message); }
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function text(value, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
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
function provenance(value = {}, trustedStatus = 'unverified') {
  return {
    author: text(value.author, 120) || '未提供作者', source: text(value.source, 1000) || '本地导入',
    license: text(value.license, 240) || '授权未确认', licenseUrl: text(value.licenseUrl, 1000),
    attribution: text(value.attribution, 2000), status: trustedStatus,
  };
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
function safeRelative(value) {
  if (typeof value !== 'string' || value.length > 500 || !value || /[\\\x00-\x1f:%?#]/.test(value)) fail('UNSAFE_PATH', '资源路径必须是包内相对路径');
  const parts = value.split('/');
  if (path.isAbsolute(value) || parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part))) fail('UNSAFE_PATH', '资源路径不能越过包目录');
  return value;
}
function isWithin(root, file) { const relative = path.relative(root, file); return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative); }
async function readBounded(filePath, max = LIMITS.file) {
  const stat = await fs.stat(filePath).catch(() => fail('MISSING_ASSET', '资源文件不存在或无法读取'));
  if (!stat.isFile()) fail('INVALID_FILE', '请选择资源文件');
  if (stat.size < 1 || stat.size > max) fail('FILE_TOO_LARGE', '资源文件为空或超过大小限制');
  const bytes = await fs.readFile(filePath);
  if (bytes.length < 1 || bytes.length > max) fail('FILE_TOO_LARGE', '资源文件在读取时已变更或超过大小限制');
  return bytes;
}
async function readPackageFile(root, relative) {
  safeRelative(relative);
  const actual = await fs.realpath(path.resolve(root, relative)).catch(() => fail('MISSING_ASSET', `缺少资源：${relative}`));
  if (!isWithin(root, actual)) fail('UNSAFE_PATH', '关联文件越过了包目录（含符号链接）');
  return readBounded(actual);
}
function parseJson(bytes) {
  if (bytes.length > LIMITS.json) fail('MANIFEST_TOO_LARGE', '资源描述超过 4 MiB');
  try { return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); } catch { fail('INVALID_JSON', '资源描述不是有效的 JSON'); }
}
function imageSize(bytes, name) {
  let width, height;
  if (/\.png$/i.test(name) && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.length >= 33) {
    if (bytes.toString('ascii', 12, 16) !== 'IHDR') fail('INVALID_IMAGE', 'PNG 头损坏');
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else if (/\.webp$/i.test(name) && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const type = bytes.toString('ascii', 12, 16);
    if (type === 'VP8X' && bytes.length >= 30) { width = bytes.readUIntLE(24, 3) + 1; height = bytes.readUIntLE(27, 3) + 1; }
    else if (type === 'VP8L' && bytes.length >= 25) { const bits = bytes.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >> 14) & 0x3fff) + 1; }
    else if (type === 'VP8 ' && bytes.length >= 30 && bytes.subarray(23, 26).equals(Buffer.from([0x9d, 1, 0x2a]))) { width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff; }
  }
  if (!width || !height || width * height > LIMITS.pixels || width > 8192 || height > 8192) fail('INVALID_IMAGE', '精灵图必须是有效的 PNG/WebP，且不超过 1600 万像素');
  return { width, height };
}
module.exports = { ACTIONS, LIMITS, DEFAULT_CALIBRATION, ResourceError, fail, plain, text, provenance, calibration, calibrations, actionMap, safeRelative, isWithin, readBounded, parseJson, imageSize };
