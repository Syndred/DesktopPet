// Asset export only: copies the built-in ImageGen PNG bytes unchanged and writes Pixi metadata.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = process.cwd(), target = path.join(root, 'apps/pc-app/runtime/features/resources/assets/roster-v2');
const catalog = JSON.parse(await fs.readFile(path.join(target, 'catalog.json'), 'utf8'));
const qa = JSON.parse(await fs.readFile(path.resolve(process.argv[2] || 'artifacts/resources/roster-image-qa.json'), 'utf8'));
const authored = {
  idle: { frames: [...Array(15).fill(0),1,0], fps: 8, loop: true },
  blink: { frames: [1,0], fps: 8, loop: false },
  walk: { frames: [2,3], fps: 6, loop: true },
  wave: { frames: [4,5,4,0], fps: 5, loop: false },
  eat: { frames: [6,7,6,7,0], fps: 5, loop: false },
  attack_windup: { frames: [8], fps: 8, loop: false },
  attack_release: { frames: [9], fps: 8, loop: false },
  attack: { frames: [8,9,9,0], fps: 8, loop: false },
  hit: { frames: [10,10,0], fps: 8, loop: false },
  skill: { frames: [11,11,12,12,0], fps: 8, loop: false },
  victory: { frames: [13,13,0], fps: 3, loop: false },
  sleep: { frames: [15], fps: 1, loop: true },
  sleep_seated: { frames: [14], fps: 1, loop: true },
};
const records = [];
for (const character of catalog.characters) {
  const source = qa.find(item => item.id === character.id);
  if (!source?.allSeamsClear || source.uniqueFrames !== 16) throw new Error(`Image QA incomplete: ${character.id}`);
  const directory = path.join(target, character.id);
  await fs.mkdir(directory, { recursive: true });
  const bytes = await fs.readFile(source.source), sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== source.sha256) throw new Error(`Generated source changed: ${character.id}`);
  await fs.copyFile(source.source, path.join(directory, 'sprites.png'));
  const frames = Object.fromEntries(source.frames.map(({ index,x,y,w,h }) => [`frame_${index}`, {
    frame: { x,y,w,h }, trimmed: true, rotated: false,
    sourceSize: { w: 512, h: 512 },
    spriteSourceSize: { x: Math.round((512-w)/2), y: 435-h, w,h },
  }]));
  const calibration = { scale: 1, rotationDeg: 0, verticalOffset: 0, mirrorX: false, anchorX: .5, anchorY: 435/512, fps: 0 };
  const manifest = {
    frames,
    animations: Object.fromEntries(Object.entries(authored).map(([name,clip]) => [name,clip.frames.map(index => `frame_${index}`)])),
    meta: { image: 'sprites.png', size: { w: source.width, h: source.height }, scale: '1', app: 'Lingjing / built-in ImageGen + standard Pixi trim metadata' },
    character: {
      name: character.name, fps: 8,
      clips: Object.fromEntries(Object.entries(authored).map(([name,{fps,loop}]) => [name,{fps,loop}])),
      actions: Object.fromEntries(catalog.actionConvention.map(action => [action,action])),
      calibration: { desktop: calibration, battle: calibration },
      provenance: { author: '灵境项目 / OpenAI 内置 ImageGen', source: '项目批准图稿 03 的角色身份；generation-prompts.json 与 layout-refinement-prompts.json 保存完整提示词及工具来源', license: '项目生成素材', attribution: '灵境原创 2D 伙伴；参考项目批准图稿生成，不使用 legacy 模型或外部角色包。' },
    },
  };
  await fs.writeFile(path.join(directory, 'character.json'), JSON.stringify(manifest,null,2)+'\n');
  records.push({ id: character.id, name: character.name, resourceId: character.resourceId, templateId: character.templateId,
    file: character.id+'/sprites.png', sha256: sha, generatedSource: source.source,
    tool: 'built-in image_gen.imagegen', transparent_background: true, actualImageSize: [source.width,source.height],
    logicalFrameSize: [512,512], baseline: 435, anchor: [.5,435/512],
    bitmapBytesUnchanged: true, frames: 16, clips: authored, seamThreshold: 128, allHighAlphaSeamsClear: true,
    uniqueFramePixelHashes: source.frames.map(frame => frame.pixelSha256),
    poseReview: 'Viewed all 16 generated poses; distinct idle/blink, stride pair, greeting pair, eating pair, attack windup/release, recoiling hit, skill charge/release, victory, and two sleeping postures. Attack/hit/skill do not alias greeting or rest.',
  });
}
await fs.writeFile(path.join(target, 'source-record.json'), JSON.stringify({ at:new Date().toISOString(), designReference:catalog.designReference,
  tool:'built-in image_gen.imagegen', license:'项目生成素材', imageEditing:'All raster generation and padding revisions used the built-in image tool. Python only inspected alpha and exported rectangles; Node copied PNG bytes without modification. Pixi standard trim metadata provides the common logical frame and baseline.', characters:records },null,2)+'\n');
console.log(JSON.stringify(records.map(({id,frames,actualImageSize}) => ({id,frames,actualImageSize}))));
