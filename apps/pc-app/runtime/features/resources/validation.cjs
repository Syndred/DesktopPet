const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { ACTIONS, DEFAULT_CALIBRATION, createPreferenceValidators } = require('./preferences.mjs');
const LIMITS = Object.freeze({ file: 128 * 1024 * 1024, total: 256 * 1024 * 1024, json: 4 * 1024 * 1024, files: 128, pixels: 4096 * 4096 });

class ResourceError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'ResourceError'; this.code = code; this.details = details; }
}
function fail(code, message) { throw new ResourceError(code, message); }
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function text(value, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
const { calibration, calibrations, actionMap } = createPreferenceValidators(fail);
function provenance(value = {}, trustedStatus = 'unverified') {
  return {
    author: text(value.author, 120) || '未提供作者', source: text(value.source, 1000) || '本地导入',
    license: text(value.license, 240) || '授权未确认', licenseUrl: text(value.licenseUrl, 1000),
    attribution: text(value.attribution, 2000), status: trustedStatus,
  };
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
