import type { CharacterResource, ResourceAction, ResourceContext } from '../../../../../../packages/shared-types/src/features/resources';
import { RESOURCE_ACTIONS } from '../../../../../../packages/shared-types/src/features/resources';
import { Slider } from '../../components/ui/slider';
import { Switch } from '../../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Button } from '../../components/ui';
import { ACTION_LABELS } from './display';

export function ActionSelect({ label, value, onValueChange, resource }: { label: string; value: ResourceAction; onValueChange(action: ResourceAction): void; resource: CharacterResource }) {
  return <Select value={value} onValueChange={next => onValueChange(next as ResourceAction)}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{RESOURCE_ACTIONS.map(action => <SelectItem key={action} value={action}>{ACTION_LABELS[action]}{!resource.actions[action] ? ' · 回退待机' : ''}</SelectItem>)}</SelectContent></Select>;
}
function CalibrationSlider({ label, value, min, max, step, onChange, suffix = '' }: { label: string; value: number; min: number; max: number; step: number; onChange(value: number): void; suffix?: string }) {
  return <div className="resource-slider" role="group" aria-label={label}><span>{label}</span><Slider aria-label={label} value={[value]} min={min} max={max} step={step} onValueChange={next => onChange(next[0])} /><output>{step < 1 ? value.toFixed(2) : value}{suffix}</output></div>;
}
export function ResourceCalibrationControls({ resource, context, edit }: { resource: CharacterResource; context: ResourceContext; edit(resource: CharacterResource): void }) {
  const value = resource.calibration[context];
  const update = (key: string, next: number | boolean) => edit({ ...resource, calibration: { ...resource.calibration, [context]: { ...value, [key]: next } } });
  return <section className="resource-calibration"><h3>动作与显示校准</h3>
    <CalibrationSlider label="大小" value={value.scale} min={0.25} max={3} step={0.01} onChange={next => update('scale',next)} />
    <CalibrationSlider label="锚点 X" value={value.anchorX ?? .5} min={0} max={1} step={0.01} onChange={next => update('anchorX',next)} />
    <CalibrationSlider label="锚点 Y" value={value.anchorY ?? .85} min={0} max={1} step={0.01} onChange={next => update('anchorY',next)} />
    <CalibrationSlider label="垂直位置" value={value.verticalOffset} min={-.5} max={.5} step={.01} onChange={next => update('verticalOffset',next)} />
    <CalibrationSlider label="旋转" value={value.rotationDeg ?? 0} min={-180} max={180} step={1} suffix="°" onChange={next => update('rotationDeg',next)} />
    <div className="resource-switch-row"><label htmlFor="resource-mirror">水平翻转</label><Switch id="resource-mirror" aria-label="水平翻转" checked={value.mirrorX} onCheckedChange={next => update('mirrorX', next)} /></div>
  </section>;
}
export function ResourceFrameRate({ resource, context, action, edit }: { resource: CharacterResource; context: ResourceContext; action: ResourceAction; edit(resource: CharacterResource): void }) {
  const clip = resource.clips.find(clip => clip.name === resource.actions[action]) ?? resource.clips[0], original = clip?.fps ?? 8, fps = resource.calibration[context].fps || original;
  const setRate = (value: number) => edit({ ...resource, calibration: { ...resource.calibration, [context]: { ...resource.calibration[context], fps: value } } });
  return <div className="resource-fps"><CalibrationSlider label="播放帧率" value={fps} min={1} max={60} step={1} suffix="fps" onChange={setRate} /><Button variant="ghost" onClick={() => setRate(0)}>使用动作原始帧率 · {original}fps</Button></div>;
}
export function ResourceActionMapping({ resource, edit }: { resource: CharacterResource; edit(resource: CharacterResource): void }) {
  return <section className="resource-mapping"><h3>动作映射</h3><p>未提供的动作会回退待机，每个伙伴仍独立播放。</p><div>{RESOURCE_ACTIONS.map(action => <label key={action}>{ACTION_LABELS[action]}<Select value={resource.actions[action] ?? 'unmapped'} onValueChange={value => edit({ ...resource, actions: { ...resource.actions, [action]: value === 'unmapped' ? null : value } })}><SelectTrigger aria-label={`${ACTION_LABELS[action]}映射`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unmapped">未提供 · 回退待机</SelectItem>{resource.clips.map(clip => <SelectItem key={clip.name} value={clip.name}>{clip.name}</SelectItem>)}</SelectContent></Select></label>)}</div></section>;
}
