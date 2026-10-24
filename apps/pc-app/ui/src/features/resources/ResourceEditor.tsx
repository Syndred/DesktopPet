import { useEffect, useState } from 'react';
import { Check, Copy, Info, Pause, Play, RotateCcw, Save } from 'lucide-react';
import type { CharacterResource, ResourceAction, ResourceContext, ResourcesClient } from '../../../../../../packages/shared-types/src/features/resources';
import { Button } from '../../components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { ResourceStage } from './ResourceStage';
import { ActionSelect, ResourceActionMapping, ResourceCalibrationControls, ResourceFrameRate } from './ResourceControls';

export function ResourceEditor({ resource, client, mode, edit, dirty, saving, save, discard, motionEnabled = true }: { resource: CharacterResource; client: ResourcesClient; mode: string; edit(resource: CharacterResource): void; dirty: boolean; saving: boolean; save(): void; discard(): void; motionEnabled?: boolean }) {
  const [context, setContext] = useState<ResourceContext>('desktop'), [action, setAction] = useState<ResourceAction>('idle');
  const [playing, setPlaying] = useState(true), [comparison, setComparison] = useState(false), [rightAction, setRightAction] = useState<ResourceAction>('walk');
  useEffect(() => { setAction('idle'); setComparison(false); }, [resource.id]);
  function resetView() { edit({ ...resource, calibration: { ...resource.calibration, [context]: { scale: 1, rotationDeg: 0, verticalOffset: 0, mirrorX: false, anchorX: .5, anchorY: .85, fps: 0 } } }); }
  return <section className="resources-preview resources-panel" aria-labelledby="resource-preview-title">
    <div className="resources-panel-heading"><h2 id="resource-preview-title">角色预览 · {resource.name}</h2><Button variant="ghost" onClick={resetView}><RotateCcw size={13} />重置视角</Button></div>
    <div className={comparison ? 'resource-stage-pair' : ''}>
      <ResourceStage resource={resource} petId="resource-preview-a" context={context} action={action} playing={playing} motionEnabled={motionEnabled} assetUrl={client.assetUrl} />
      {comparison ? <ResourceStage resource={resource} petId="resource-preview-b" context={context} action={rightAction} facing="left" motionEnabled={motionEnabled} assetUrl={client.assetUrl} /> : null}
    </div>
    <div className="resource-preview-toolbar"><span>{Object.keys(resource.atlas?.frames ?? {}).length} 帧 · {resource.clips.length} 组动作</span><Button variant="ghost" aria-pressed={comparison} onClick={() => setComparison(value => !value)}><Copy size={12} />{comparison ? '收起双实例对照' : '双实例对照'}</Button>
      <Select value={context} onValueChange={value => setContext(value as ResourceContext)}><SelectTrigger aria-label="显示场景"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="desktop">桌面</SelectItem><SelectItem value="battle">战斗</SelectItem></SelectContent></Select>
    </div>
    {comparison ? <div className="resource-comparison"><span>右侧实例独立播放</span><ActionSelect label="右侧独立动作" value={rightAction} onValueChange={setRightAction} resource={resource} /></div> : null}
    <div className="resources-controls"><ResourceCalibrationControls resource={resource} context={context} edit={edit} /><section className="resource-animation"><h3>预览动作</h3><div className="resource-play-row"><ActionSelect label="预览动作" value={action} onValueChange={setAction} resource={resource} /><Button variant="secondary" aria-label={playing ? '暂停动画' : '播放动画'} aria-pressed={playing} onClick={() => setPlaying(value => !value)}>{playing ? <Pause size={16} /> : <Play size={16} />}</Button></div><ResourceFrameRate resource={resource} context={context} action={action} edit={edit} />
      <div className="resource-info-heading"><h3>资源信息</h3><Popover><PopoverTrigger asChild><Button variant="ghost" aria-label="查看完整资源资料"><Info size={13} /></Button></PopoverTrigger><PopoverContent className="resource-metadata-popover"><h3>素材来源与权属记录</h3><p>{resource.provenance.source}</p><p>{resource.provenance.attribution}</p><p>{resource.provenance.status === 'project-original' ? '项目生成素材，来源记录随项目保存。' : '用户本机导入记录，许可仍需按素材来源核对。'}</p>{resource.warnings.map(warning => <p key={warning}>{warning}</p>)}</PopoverContent></Popover></div>
      <dl className="resource-provenance"><dt>图集</dt><dd>{resource.sheet ? `${resource.sheet.columns} × ${resource.sheet.rows} 网格` : 'PixiJS 标准图集'}</dd><dt>作者</dt><dd>{resource.provenance.author}</dd><dt>许可</dt><dd>{resource.provenance.license}</dd></dl>
    </section></div>
    {mode === 'actions' ? <ResourceActionMapping resource={resource} edit={edit} /> : null}
    {mode === 'calibration' ? <p className="resources-calibration-tip">锚点以帧的原始尺寸为基准；裁剪帧与旋转帧交由 PixiJS 解析。桌面和战斗分别保存缩放、锚点及帧率。</p> : null}
    <div className="resource-save-row"><Button className="resource-primary" disabled={saving || !dirty} onClick={save}>{saving ? <Save size={16} /> : <Check size={17} />}{saving ? '正在保存…' : '保存动作与显示设置'}</Button>{dirty ? <Button variant="ghost" disabled={saving} onClick={discard}>放弃修改</Button> : null}</div>
  </section>;
}
