import type { CharacterResource, ResourceAction, ResourceCalibration, ResourceClip, ResourceContext } from '../../../../../../packages/shared-types/src/features/resources';
export const ACTION_LABELS: Record<ResourceAction, string> = { idle: '待机', walk: '行走', attack: '攻击', hit: '受击', skill: '技能', victory: '胜利', sleep: '睡眠' };
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
