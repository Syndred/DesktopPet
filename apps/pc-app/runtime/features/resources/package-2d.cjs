const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const guards = require('./validation.cjs');
const { fail, plain, text, safeRelative, isWithin, readBounded, parseJson, imageSize, LIMITS, provenance, calibrations, actionMap, ACTIONS } = guards;
const validName = name => typeof name === 'string' && name.trim() && name.length <= 200 && !['__proto__', 'constructor', 'prototype'].includes(name);

/** Convert only our grid metadata; Pixi's Spritesheet owns actual texture parsing and playback. */
function atlasFromGrid(sheet, clips, image) {
  const frames = Object.fromEntries(Array.from({ length: sheet.columns * sheet.rows }, (_, index) => [`frame_${index}`, { frame: { x: index % sheet.columns * sheet.width, y: Math.floor(index / sheet.columns) * sheet.height, w: sheet.width, h: sheet.height }, sourceSize: { w: sheet.width, h: sheet.height }, spriteSourceSize: { x: 0, y: 0, w: sheet.width, h: sheet.height } }]));
  return { frames, animations: Object.fromEntries(clips.map(clip => [clip.name, clip.frames.map(index => `frame_${index}`)])), meta: { image, scale: '1', size: { w: sheet.width * sheet.columns, h: sheet.height * sheet.rows } } };
}
function normalizeAtlas(data, size) {
  if (!plain(data.frames) || !Object.keys(data.frames).length || Object.keys(data.frames).length > 4096) fail('INVALID_ATLAS', '图集应包含 1 到 4096 个帧');
  if (data.meta?.related_multi_packs?.length) fail('MULTIPACK_UNSUPPORTED', '请先导出单张图集，暂不支持多图集关联');
  const frames = {};
  for (const [name, value] of Object.entries(data.frames)) {
    const r = value?.frame;
    if (!validName(name) || !plain(r) || ['x','y','w','h'].some(key => !Number.isFinite(r[key])) || r.x < 0 || r.y < 0 || r.w <= 0 || r.h <= 0 || r.x + (value.rotated ? r.h : r.w) > size.width || r.y + (value.rotated ? r.w : r.h) > size.height) fail('INVALID_ATLAS', '图集帧名称、尺寸或边界无效');
    const source = value.sourceSize ?? { w: r.w, h: r.h }, trim = value.spriteSourceSize ?? { x: 0, y: 0, w: source.w, h: source.h };
    if (['w','h'].some(key => !Number.isFinite(source[key]) || source[key] <= 0 || source[key] > 8192) || ['x','y','w','h'].some(key => !Number.isFinite(trim[key]) || trim[key] < 0) || trim.x + trim.w > source.w || trim.y + trim.h > source.h) fail('INVALID_ATLAS', '裁剪帧或原始尺寸无效');
    frames[name] = { frame: r, sourceSize: source, spriteSourceSize: trim, rotated: value.rotated === true, trimmed: value.trimmed === true };
  }
  const rawAnimations = data.animations ?? { idle: Object.keys(frames) }, animations = {};
  if (!plain(rawAnimations) || !Object.keys(rawAnimations).length || Object.keys(rawAnimations).length > 128) fail('INVALID_CLIPS', '图集动画结构无效');
  for (const [name, sequence] of Object.entries(rawAnimations)) {
    if (!validName(name) || !Array.isArray(sequence) || !sequence.length || sequence.length > 1024 || sequence.some(frame => typeof frame !== 'string' || !Object.hasOwn(frames, frame))) fail('INVALID_CLIPS', '动画引用了不存在的图集帧');
    animations[name] = sequence;
  }
  return { frames, animations, meta: { image: data.meta.image, scale: '1', size: { w: size.width, h: size.height } } };
}
async function parseCharacterFile(filePath, metadata = {}) {
  if (typeof filePath !== 'string' || path.extname(filePath).toLowerCase() !== '.json') fail('TWO_D_ONLY', '本版仅导入 2D 角色包或 PixiJS 图集 JSON');
  const actualPath = await fs.realpath(filePath).catch(() => fail('MISSING_ASSET', '所选文件不可用'));
  const root = path.dirname(actualPath), filename = path.basename(actualPath), entryBytes = await readBounded(actualPath, LIMITS.json), descriptor = parseJson(entryBytes);
  if (!plain(descriptor)) fail('INVALID_MANIFEST', '角色包描述格式错误');
  const grid = descriptor.format === 'lingjing.character';
  if (grid && (descriptor.version !== 1 || descriptor.kind !== 'spritesheet')) fail('TWO_D_ONLY', '本版仅支持 2D 图集角色包 v1');
  if (!grid && (!plain(descriptor.frames) || !plain(descriptor.meta))) fail('INVALID_MANIFEST', '请选择灵境 2D 包或 PixiJS / TexturePacker 图集 JSON');
  const entryAsset = safeRelative(grid ? descriptor.image : descriptor.meta.image), actualImage = await fs.realpath(path.resolve(root, entryAsset)).catch(() => fail('MISSING_ASSET', `缺少图集：${entryAsset}`));
  if (!isWithin(root, actualImage)) fail('UNSAFE_PATH', '图集越过了包目录（含符号链接）');
  const image = await readBounded(actualImage), size = imageSize(image, entryAsset), options = grid ? descriptor : descriptor.character ?? {};
  let sheet, clips, atlas;
  if (grid) {
    sheet = descriptor.sheet;
    if (!plain(sheet) || ['width','height'].some(key => !Number.isFinite(sheet[key]) || sheet[key] <= 0) || ['columns','rows'].some(key => !Number.isInteger(sheet[key]) || sheet[key] <= 0) || sheet.columns * sheet.rows > 4096 || Math.abs(sheet.width * sheet.columns - size.width) > 0.01 || Math.abs(sheet.height * sheet.rows - size.height) > 0.01) fail('INVALID_SHEET', '图集尺寸与帧网格不一致');
    if (!plain(descriptor.clips) || !Object.keys(descriptor.clips).length || Object.keys(descriptor.clips).length > 128) fail('INVALID_CLIPS', '角色包应包含 1 到 128 组动画');
    clips = Object.entries(descriptor.clips).map(([name, clip]) => {
      if (!validName(name) || !plain(clip) || !Array.isArray(clip.frames) || !clip.frames.length || clip.frames.length > 1024 || clip.frames.some(frame => !Number.isInteger(frame) || frame < 0 || frame >= sheet.columns * sheet.rows) || !Number.isFinite(clip.fps) || clip.fps < 1 || clip.fps > 60 || (clip.loop !== undefined && typeof clip.loop !== 'boolean')) fail('INVALID_CLIPS', '动画帧或帧率无效');
      return { name, frames: clip.frames, fps: clip.fps, loop: clip.loop !== false };
    });
    atlas = atlasFromGrid(sheet, clips, entryAsset);
  } else {
    atlas = normalizeAtlas(descriptor, size);
    const fps = options.fps === undefined ? 8 : options.fps;
    if (!Number.isFinite(fps) || fps < 1 || fps > 60) fail('INVALID_CLIPS', '动画帧率无效');
    clips = Object.entries(atlas.animations).map(([name, frameNames]) => ({ name, frameNames, fps, loop: true }));
  }
  const supplied = Object.fromEntries(Object.entries(metadata).filter(([, value]) => typeof value === 'string' && value.trim()));
  const origin = provenance({ ...options.provenance, ...supplied }), warnings = origin.license === '授权未确认' ? ['素材许可未确认，请补充作者与许可记录'] : [];
  const files = new Map([[filename, entryBytes], [entryAsset, image]]), hash = createHash('sha256');
  for (const [key, bytes] of [...files].sort(([a],[b]) => a.localeCompare(b))) hash.update(key).update('\0').update(bytes);
  return { resource: { name: text(options.name, 100) || filename.replace(/\.json$/i, ''), kind: 'spritesheet', origin: 'import', provenance: origin, entryAsset, sheet, atlas, clips, actions: actionMap(options.actions, clips, true), calibration: calibrations(options.calibration), contentHash: hash.digest('hex'), warnings, availability: 'ready' }, files, sourceFilename: filename };
}
function normalize2DResource(resource) {
  if (resource.kind !== 'spritesheet') fail('TWO_D_ONLY', '本版仅显示 2D 角色，历史资源记录与文件已保留');
  return { ...resource, calibration: calibrations(resource.calibration), atlas: resource.atlas ?? (resource.sheet ? atlasFromGrid(resource.sheet, resource.clips, resource.entryAsset) : undefined) };
}
function resolveAction(resource, action = 'idle') {
  if (!ACTIONS.includes(action)) fail('INVALID_ACTION', '不支持的动作');
  const direct = resource.clips.find(clip => clip.name === resource.actions[action]), fallback = resource.clips.find(clip => clip.name === resource.actions.idle) ?? resource.clips[0] ?? null;
  return { clip: direct ?? fallback, fallback: !direct, warning: direct ? undefined : '该动作不可用，已回退待机动画' };
}
module.exports = { ...guards, parseCharacterFile, normalize2DResource, atlasFromGrid, resolveAction };
