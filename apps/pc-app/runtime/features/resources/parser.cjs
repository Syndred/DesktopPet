const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const ACTIONS = Object.freeze(['idle', 'walk', 'attack', 'hit', 'skill', 'victory', 'sleep']);
const LIMITS = Object.freeze({ file: 128 * 1024 * 1024, total: 256 * 1024 * 1024, json: 4 * 1024 * 1024, files: 128, pixels: 4096 * 4096 });
const DEFAULT_CALIBRATION = Object.freeze({ scale: 1, yawDeg: 0, pitchDeg: 0, verticalOffset: 0, mirrorX: false });
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
  return {
    scale: numeric(value.scale, 1, 0.25, 3, '大小'),
    yawDeg: numeric(value.yawDeg, 0, -180, 180, '朝向'),
    pitchDeg: numeric(value.pitchDeg, 0, -90, 90, '俯仰'),
    verticalOffset: numeric(value.verticalOffset, 0, -0.5, 0.5, '垂直位置'),
    mirrorX: value.mirrorX ?? false,
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
    idle: /idle|stand|静|待机/i, walk: /walk|run|move|走|跑/i, attack: /attack|bite|punch|攻击/i,
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
    return [action, clips.find(clip => patterns[action].test(clip.name))?.name ?? (action === 'idle' ? clips[0]?.name ?? null : null)];
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
  return fs.readFile(filePath);
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
function parseGlb(bytes) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) fail('INVALID_GLB', 'GLB 文件头或长度错误');
  let offset = 12, document, binary;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail('INVALID_GLB', 'GLB 数据块损坏');
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8, end = start + length;
    if (length % 4 !== 0 || end > bytes.length) fail('INVALID_GLB', 'GLB 数据块越界');
    if (offset === 12 && type !== 0x4e4f534a) fail('INVALID_GLB', 'GLB 缺少首个 JSON 数据块');
    if (type === 0x4e4f534a) { if (document) fail('INVALID_GLB', 'GLB 含重复描述'); document = parseJson(bytes.subarray(start, end)); }
    if (type === 0x004e4942) { if (binary) fail('INVALID_GLB', 'GLB 含重复二进制块'); binary = bytes.subarray(start, end); }
    offset = end;
  }
  return { document, binary };
}
async function parseModel(bytes, filename, loadFile) {
  const glb = /\.glb$/i.test(filename);
  const { document, binary } = glb ? parseGlb(bytes) : { document: parseJson(bytes) };
  if (!plain(document) || !/^2\./.test(document.asset?.version) || !Array.isArray(document.scenes) || !document.scenes.length || !Array.isArray(document.nodes) || !document.nodes.length) fail('INVALID_GLTF', '模型必须包含 glTF 2.x 场景与节点');
  const bufferLengths = [];
  for (const [index, item] of (document.buffers ?? []).entries()) {
    if (!Number.isInteger(item.byteLength) || item.byteLength < 0 || item.byteLength > LIMITS.file) fail('INVALID_GLTF', '模型缓冲区长度错误');
    let data;
    if (typeof item.uri === 'string') {
      if (item.uri.startsWith('data:')) {
        if (!/^data:application\/(octet-stream|gltf-buffer);base64,[A-Za-z0-9+/=]+$/.test(item.uri)) fail('UNSAFE_URI', '模型内嵌缓冲区格式不支持');
        data = Buffer.from(item.uri.slice(item.uri.indexOf(',') + 1), 'base64');
      } else data = await loadFile(safeRelative(item.uri));
    } else if (index === 0 && binary) data = binary;
    else fail('MISSING_ASSET', '模型缺少缓冲区');
    if (data.length < item.byteLength || data.length > LIMITS.file) fail('INVALID_GLTF', '模型缓冲区内容不完整');
    bufferLengths.push(item.byteLength);
  }
  for (const view of document.bufferViews ?? []) {
    if (!Number.isInteger(view.buffer) || bufferLengths[view.buffer] === undefined || !Number.isInteger(view.byteLength) || view.byteLength < 0 || !Number.isInteger(view.byteOffset ?? 0) || (view.byteOffset ?? 0) < 0 || (view.byteOffset ?? 0) + view.byteLength > bufferLengths[view.buffer]) fail('INVALID_GLTF', '模型缓冲视图越界');
  }
  for (const img of document.images ?? []) {
    if (typeof img.uri === 'string') {
      if (img.uri.startsWith('data:')) {
        if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(img.uri)) fail('UNSAFE_URI', '内嵌贴图格式不支持');
      } else {
        safeRelative(img.uri);
        if (!/\.(png|jpe?g|webp|ktx2)$/i.test(img.uri)) fail('UNSAFE_URI', '模型贴图格式不支持');
        await loadFile(img.uri);
      }
    } else if (!Number.isInteger(img.bufferView) || !document.bufferViews?.[img.bufferView]) fail('INVALID_GLTF', '模型贴图缺少有效内容');
  }
  const names = new Set();
  const clips = (document.animations ?? []).map((item, index) => {
    const name = text(item.name, 200) || `animation_${index}`;
    if (names.has(name)) fail('DUPLICATE_CLIP', '模型动画名称重复，请先重命名');
    names.add(name); return { name, loop: true };
  });
  return { clips, warnings: clips.length ? [] : ['模型没有动画，将显示静态姿势'] };
}
async function parseCharacterFile(filePath, metadata = {}) {
  const actualPath = await fs.realpath(filePath).catch(() => fail('MISSING_ASSET', '所选文件不可用'));
  const root = path.dirname(actualPath), filename = path.basename(actualPath);
  const ext = path.extname(filename).toLowerCase();
  if (!['.json', '.glb', '.gltf'].includes(ext)) fail('UNSUPPORTED_FORMAT', '支持角色包 JSON、GLB、GLTF；压缩包请先解压后选择角色描述');
  const entryBytes = await readBounded(actualPath, ext === '.json' || ext === '.gltf' ? LIMITS.json : LIMITS.file);
  const files = new Map(); let total = entryBytes.length;
  const loadFile = async name => {
    safeRelative(name);
    if (files.has(name)) return files.get(name);
    if (files.size >= LIMITS.files) fail('TOO_MANY_FILES', '角色包文件数超过 128');
    const bytes = await readPackageFile(root, name);
    total += bytes.length;
    if (total > LIMITS.total) fail('PACKAGE_TOO_LARGE', '角色包超过 256 MiB');
    files.set(name, bytes); return bytes;
  };
  let descriptor = {}, kind = 'model3d', entryAsset = filename, sheet, clips, warnings = [];
  if (ext === '.json') {
    descriptor = parseJson(entryBytes);
    if (!plain(descriptor) || descriptor.format !== 'lingjing.character' || descriptor.version !== 1) fail('INVALID_MANIFEST', '请选择灵境角色包 v1 描述文件');
    if (!['spritesheet', 'model3d'].includes(descriptor.kind)) fail('UNSUPPORTED_FORMAT', '此角色包类型尚不支持');
    kind = descriptor.kind;
    if (kind === 'spritesheet') {
      entryAsset = safeRelative(descriptor.image);
      const bytes = await loadFile(entryAsset), size = imageSize(bytes, entryAsset);
      sheet = descriptor.sheet;
      if (!plain(sheet) || ['width', 'height', 'columns', 'rows'].some(key => !Number.isInteger(sheet[key]) || sheet[key] <= 0) || sheet.columns * sheet.rows > 4096 || sheet.width * sheet.columns !== size.width || sheet.height * sheet.rows !== size.height) fail('INVALID_SHEET', '精灵图尺寸与帧网格不一致');
      if (!plain(descriptor.clips) || Object.keys(descriptor.clips).length < 1 || Object.keys(descriptor.clips).length > 128) fail('INVALID_CLIPS', '角色包应包含 1 到 128 组动画');
      clips = Object.entries(descriptor.clips).map(([name, clip]) => {
        if (!text(name, 200) || name.length > 200 || !plain(clip) || !Array.isArray(clip.frames) || !clip.frames.length || clip.frames.length > 1024 || clip.frames.some(frame => !Number.isInteger(frame) || frame < 0 || frame >= sheet.columns * sheet.rows) || !Number.isFinite(clip.fps) || clip.fps < 1 || clip.fps > 60 || (clip.loop !== undefined && typeof clip.loop !== 'boolean')) fail('INVALID_CLIPS', '动画帧、帧率或循环参数无效');
        return { name, frames: clip.frames, fps: clip.fps, loop: clip.loop ?? true };
      });
    } else {
      entryAsset = safeRelative(descriptor.model);
      if (!/\.(glb|gltf)$/i.test(entryAsset)) fail('UNSUPPORTED_FORMAT', '3D 角色包必须引用 GLB/GLTF');
      const modelDirectory = path.posix.dirname(entryAsset);
      const result = await parseModel(await loadFile(entryAsset), entryAsset, name => loadFile(modelDirectory === '.' ? name : `${modelDirectory}/${name}`));
      clips = result.clips; warnings = result.warnings;
    }
    files.set(filename, entryBytes);
  } else {
    files.set(filename, entryBytes);
    const result = await parseModel(entryBytes, filename, loadFile); clips = result.clips; warnings = result.warnings;
  }
  const origin = provenance({ ...descriptor.provenance, ...metadata });
  if (origin.license === '授权未确认') warnings.push('素材许可未确认，请补充作者与许可记录');
  const hash = createHash('sha256');
  for (const [key, data] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) hash.update(key).update('\0').update(data);
  return {
    resource: { name: text(descriptor.name, 100) || filename.replace(/\.(glb|gltf|json)$/i, ''), kind, origin: 'import',
      provenance: origin, entryAsset, sheet, clips, actions: actionMap(descriptor.actions, clips, true),
      calibration: calibrations(descriptor.calibration), contentHash: hash.digest('hex'), warnings, availability: 'ready' },
    files, sourceFilename: filename,
  };
}
function resolveAction(resource, action = 'idle') {
  if (!ACTIONS.includes(action)) fail('INVALID_ACTION', '不支持的动作');
  const mapped = resource.actions[action];
  const direct = resource.clips.find(clip => clip.name === mapped);
  const fallback = resource.clips.find(clip => clip.name === resource.actions.idle) ?? resource.clips[0] ?? null;
  return { clip: direct ?? fallback, fallback: !direct, warning: direct ? undefined : fallback ? '该动作不可用，已回退待机动画' : '此资源无动画，显示静态姿势' };
}
module.exports = { ACTIONS, LIMITS, DEFAULT_CALIBRATION, ResourceError, fail, plain, text, provenance, calibration, calibrations, actionMap, safeRelative, isWithin, readBounded, parseCharacterFile, resolveAction };
