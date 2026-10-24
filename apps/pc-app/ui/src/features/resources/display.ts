import type { CharacterResource, ResourceAction, ResourceCalibration, ResourceClip, ResourceContext } from '../../../../../../packages/shared-types/src/features/resources';
export const ACTION_LABELS: Record<ResourceAction, string> = { idle: '待机', blink: '眨眼', walk: '行走', wave: '招手', eat: '吃东西', attack_windup: '攻击起手', attack_release: '攻击释放', attack: '普通攻击', hit: '受击', skill: '技能施放', victory: '胜利', sleep: '睡眠' };
export function resolveResourceClip(resource: CharacterResource, action: ResourceAction): { clip: ResourceClip | null; fallback: boolean } {
  const direct = resource.clips.find(clip => clip.name === resource.actions[action]);
  return { clip: direct ?? resource.clips.find(clip => clip.name === resource.actions.idle) ?? resource.clips[0] ?? null, fallback: !direct };
}
export function resolveResourceCalibration(resource: CharacterResource, context: ResourceContext, facing: 'left' | 'right' = 'right'): ResourceCalibration {
  const calibration = { ...resource.calibration[context] };
  if (facing === 'left') calibration.mirrorX = !calibration.mirrorX;
  return calibration;
}
export function resourceTransform(calibration: ResourceCalibration, kind: CharacterResource['kind']) {
  return `translateY(${calibration.verticalOffset * 100}%) scale(${calibration.scale * (calibration.mirrorX ? -1 : 1)}, ${calibration.scale})${kind === 'spritesheet' ? ` rotate(${calibration.rotationDeg ?? calibration.yawDeg ?? 0}deg)` : ''}`;
}

export interface ResourcePortraitView {
  frameName: string;
  assetKey: string;
  viewBox: string;
  imageWidth: number;
  imageHeight: number;
  imageTransform: string;
}
// Authored composition within the actual first idle frame, never within its padded logical canvas.
const PORTRAIT_FOCUS: Record<string, { x:number; y:number; width:number; height:number }> = {
  'builtin:lingjing-yuwan-v2': { x:.17,y:0,width:.80,height:.66 },
  'builtin:lingjing-xiaolan-v1': { x:.10,y:0,width:.84,height:.64 },
  'builtin:lingjing-fantuan-v1': { x:.05,y:0,width:.90,height:.65 },
  'builtin:lingjing-shiba-v2': { x:.27,y:0,width:.72,height:.73 },
  'builtin:lingjing-hatcat-v1': { x:.20,y:0,width:.78,height:.74 },
  'builtin:lingjing-xiaohu-v1': { x:.26,y:0,width:.73,height:.78 },
};
/** Same canonical image/idle frame, composed as a head-and-shoulders portrait. No new asset. */
export function resolveResourcePortrait(resource: CharacterResource, framing: 'portrait' | 'full' = 'portrait'): ResourcePortraitView | null {
  const atlas=resource.atlas;
  if(!atlas)return null;
  const clip=resolveResourceClip(resource,'idle').clip;
  const frameName=atlas.animations[clip?.name ?? 'idle']?.[0] ?? Object.keys(atlas.frames)[0];
  const entry=atlas.frames[frameName];
  if(!entry)return null;
  const frame=entry.frame;
  const focus=framing==='full' ? {x:0,y:0,width:1,height:1} : PORTRAIT_FOCUS[resource.id] ?? {x:.10,y:0,width:.85,height:.67};
  return { frameName,assetKey:resource.entryAsset,
    viewBox:[frame.w*focus.x,frame.h*focus.y,frame.w*focus.width,frame.h*focus.height].join(' '),
    imageWidth:atlas.meta.size.w,imageHeight:atlas.meta.size.h,
    imageTransform:entry.rotated ? `matrix(0 -1 1 0 ${-frame.y} ${frame.x+frame.h})` : `translate(${-frame.x} ${-frame.y})`,
  };
}
