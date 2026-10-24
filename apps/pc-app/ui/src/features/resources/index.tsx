import { useCallback, useEffect, useRef, useState } from 'react';
import type { CharacterResource, ResourceAction, ResourceContext, ResourceProvenance, ResourcesClient } from '../../../../../../packages/shared-types/src/features/resources';
import { RESOURCE_ACTIONS } from '../../../../../../packages/shared-types/src/features/resources';
import { resourcesClient } from './client';
import { ACTION_LABELS } from './display';
import { ResourceStage } from './ResourceStage';
import brandMark from './brand-mark.png';
import './resources.css';

export { ResourceStage } from './ResourceStage';
export { resourceAssetUrl, resourcesClient } from './client';
export { resolveResourceCalibration, resolveResourceClip } from './display';
type Tab = 'library' | 'actions' | 'calibration';
function ResourceThumbnail({ resource, client }: { resource: CharacterResource; client: ResourcesClient }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [resource.id]);
  if (resource.kind === 'spritesheet' && resource.sheet && !failed && resource.availability === 'ready') {
    const sheet = resource.sheet;
    return <div className="resource-card-art resource-sheet-thumb" style={{ backgroundImage: `url("${client.assetUrl(resource.id, resource.entryAsset)}")`, backgroundSize: `${sheet.columns * 100}% ${sheet.rows * 100}%` }}>
      <img hidden alt="" src={client.assetUrl(resource.id, resource.entryAsset)} onError={() => setFailed(true)} />
    </div>;
  }
  return <div className="resource-card-art resource-model-thumb" aria-hidden="true"><svg viewBox="0 0 120 100"><path d="M24 42 30 15 48 32 77 32 94 15 99 46Q109 82 65 86 20 84 24 42Z" fill="#bed2ee" stroke="#8da8d4" strokeWidth="2"/><ellipse cx="62" cy="66" rx="25" ry="16" fill="#f4f8ff"/><circle cx="47" cy="51" r="4" fill="#52638d"/><circle cx="78" cy="51" r="4" fill="#52638d"/><path d="m58 61 6 4 6-4" fill="none" stroke="#8da8d4" strokeWidth="2"/></svg><span>{resource.availability === 'ready' ? '3D 模型' : '文件待修复'}</span></div>;
}
export function ResourcesPage({ client = resourcesClient }: { client?: ResourcesClient }) {
  const [resources, setResources] = useState<CharacterResource[]>([]), [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<CharacterResource | null>(null), [tab, setTab] = useState<Tab>('library');
  const [context, setContext] = useState<ResourceContext>('desktop'), [action, setAction] = useState<ResourceAction>('idle');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false), [playing, setPlaying] = useState(true), [search, setSearch] = useState('');
  const [metadata, setMetadata] = useState<Partial<ResourceProvenance>>({});
  const alive = useRef(true), loadSequence = useRef(0);
  const reload = useCallback(async (selectId?: string) => {
    const sequence = ++loadSequence.current; setLoading(true);
    try {
      // Read only the known legacy key. Keep it intact for the old renderer.
      if (client.importLegacyCalibration) {
        try {
          const raw = localStorage.getItem('qp_model_view_calibration_v3');
          if (raw) { const migrated = await client.importLegacyCalibration(JSON.parse(raw)); if (!migrated.ok) setMessage(migrated.error.message); }
        } catch { /* Invalid legacy JSON does not prevent access to the resource library. */ }
      }
      const result = await client.list();
      if (!alive.current || sequence !== loadSequence.current) return;
      if (!result.ok) { setMessage(result.error.message); return; }
      setResources(result.data);
      setSelectedId(current => selectId && result.data.some(resource => resource.id === selectId) ? selectId : result.data.some(resource => resource.id === current) ? current : result.data[0]?.id ?? '');
    } finally { if (alive.current && sequence === loadSequence.current) setLoading(false); }
  }, [client]);
  useEffect(() => { alive.current = true; void reload(); return () => { alive.current = false; ++loadSequence.current; }; }, [reload]);
  const selected = resources.find(resource => resource.id === selectedId);
  useEffect(() => { setDraft(selected ? structuredClone(selected) : null); setDirty(false); setAction('idle'); }, [selected]);
  function choose(resource: CharacterResource) {
    if (dirty) { setMessage('请先保存当前显示设置，或点击“放弃修改”。'); return; }
    setSelectedId(resource.id); setMessage('');
  }
  function updateCalibration(key: keyof CharacterResource['calibration']['desktop'], value: number | boolean) {
    if (!draft) return;
    setDraft({ ...draft, calibration: { ...draft.calibration, [context]: { ...draft.calibration[context], [key]: value } } }); setDirty(true);
  }
  async function save() {
    if (!draft || busy) return; setBusy(true); setMessage('');
    try {
      const result = await client.save({ resourceId: draft.id, expectedRevision: draft.revision, calibration: draft.calibration, actions: draft.actions });
      if (!result.ok) { setMessage(result.error.message); return; }
      setResources(current => current.map(resource => resource.id === result.data.id ? result.data : resource));
      setDirty(false); setMessage('显示设置已保存。桌面与战斗将使用同一份角色资源。');
    } finally { setBusy(false); }
  }
  async function importResource() {
    if (busy) return;
    if (dirty) { setMessage('请先保存当前显示设置，或放弃修改后再导入。'); return; }
    setBusy(true); setMessage('');
    try {
      const result = await client.importResource(metadata);
      if (!result.ok) { setMessage(result.error.message); return; }
      if (!result.data) { setMessage('已取消导入。'); return; }
      await reload(result.data.resource.id);
      setMessage(result.data.duplicate ? '这个角色已在资源库，已保留本次导入记录。' : '角色导入成功，可以预览并校准显示。');
    } finally { setBusy(false); }
  }
  const visible = resources.filter(resource => resource.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <main className="resources-page">
    <div className="resources-heading"><div><p className="resources-breadcrumb">设置 / 角色资源</p><h1>让喜欢的角色，来到桌面。</h1><p>一份形象，多位独立伙伴。保存你的动画与显示方式。</p></div><img className="resources-brand" src={brandMark} alt="灵境四芒星" /></div>
    <div className="resources-tabs" role="tablist" aria-label="角色资源配置">
      {([['library', '角色资源'], ['actions', '动作配置'], ['calibration', '显示校准']] as const).map(([value, label]) => <button type="button" role="tab" key={value} aria-selected={tab === value} onClick={() => setTab(value)}>{label}</button>)}
    </div>
    <div className="resources-layout">
      <section className="resources-library resources-panel" aria-labelledby="resources-library-title"><div className="resources-panel-heading"><h2 id="resources-library-title">我的角色资源</h2><span>{resources.length} 个形象</span></div>
        <label className="resource-search"><span className="resource-sr-only">搜索角色</span><input type="search" placeholder="搜索角色名称" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className="resources-grid" aria-busy={loading}>
          {visible.map(resource => <button type="button" key={resource.id} className={`resource-card ${selectedId === resource.id ? 'is-selected' : ''}`} aria-pressed={selectedId === resource.id} onClick={() => choose(resource)}>
            <span className={`resource-dimension ${resource.kind === 'spritesheet' ? 'is-2d' : ''}`}>{resource.kind === 'spritesheet' ? '2D' : '3D'}</span>{selectedId === resource.id ? <span className="resource-selected-mark" aria-hidden="true">✓</span> : null}
            <ResourceThumbnail resource={resource} client={client} /><strong>{resource.name}</strong><span>{resource.kind === 'spritesheet' ? '动画角色包' : 'GLB / GLTF'} · {resource.origin === 'import' ? '本地导入' : resource.origin === 'legacy' ? '原有模型' : '项目原创'}</span>
          </button>)}
          {!visible.length ? <p className="resources-empty">{loading ? '正在读取资源…' : resources.length ? '没有匹配的角色。' : '资源库暂不可用。请重新载入或导入角色。'}</p> : null}
        </div>
        <div className="resources-import"><span className="resource-import-symbol" aria-hidden="true">↥</span><strong>带上喜欢的角色</strong><p>选择角色包 JSON、GLB 或 GLTF。<br />角色包与贴图请先解压到同一目录。</p><details><summary>导入来源与许可</summary><label>作者<input value={metadata.author ?? ''} onChange={event => setMetadata({ ...metadata, author: event.target.value })} placeholder="未提供作者" maxLength={120} /></label><label>来源<input value={metadata.source ?? ''} onChange={event => setMetadata({ ...metadata, source: event.target.value })} placeholder="本地导入或原始来源链接" maxLength={1000} /></label><label>许可<input value={metadata.license ?? ''} onChange={event => setMetadata({ ...metadata, license: event.target.value })} placeholder="未知时保留“授权未确认”" maxLength={240} /></label></details><button type="button" className="resource-primary" disabled={busy} onClick={() => void importResource()}>{busy ? '正在处理…' : '＋ 选择文件并导入'}</button></div>
      </section>
      <section className="resources-preview resources-panel" aria-labelledby="resources-preview-title"><div className="resources-panel-heading"><h2 id="resources-preview-title">{draft ? `角色预览 · ${draft.name}` : '角色预览'}</h2><button type="button" disabled={busy || dirty} onClick={() => void reload()}>↻ 重新载入</button></div>
        {draft ? <>
          <ResourceStage resource={draft} petId="resource-preview" context={context} action={action} playing={playing} assetUrl={client.assetUrl} />
          <div className="resources-context"><span>显示场景</span><button type="button" aria-pressed={context === 'desktop'} onClick={() => setContext('desktop')}>桌面</button><button type="button" aria-pressed={context === 'battle'} onClick={() => setContext('battle')}>战斗</button><span className="resources-context-note">{context === 'desktop' ? '桌面与详情共用' : '出战独立校准'}</span></div>
          <div className="resources-controls">
            <section className="resource-calibration"><h3>显示校准</h3>{([
              ['scale', '大小', 0.25, 3, 0.01], ['yawDeg', draft.kind === 'spritesheet' ? '旋转' : '朝向', -180, 180, 1],
              ['verticalOffset', '垂直位置', -0.5, 0.5, 0.01], ...(draft.kind === 'model3d' ? [['pitchDeg', '俯仰', -90, 90, 1] as const] : []),
            ] as const).map(([key, label, min, max, step]) => <label className="resource-slider" key={key}><span>{label}</span><input aria-label={label} type="range" min={min} max={max} step={step} value={draft.calibration[context][key]} onChange={event => updateCalibration(key, Number(event.target.value))} /><output>{Number(draft.calibration[context][key]).toFixed(key === 'yawDeg' || key === 'pitchDeg' ? 0 : 2)}{key === 'yawDeg' || key === 'pitchDeg' ? '°' : ''}</output></label>)}<label className="resource-checkbox"><input type="checkbox" checked={draft.calibration[context].mirrorX} onChange={event => updateCalibration('mirrorX', event.target.checked)} />水平翻转</label><button type="button" onClick={() => { setDraft({ ...draft, calibration: { ...draft.calibration, [context]: { scale: 1, yawDeg: 0, pitchDeg: 0, verticalOffset: 0, mirrorX: false } } }); setDirty(true); }}>恢复此场景默认值</button></section>
            <section className="resource-animation"><h3>预览动作</h3><div className="resource-play-row"><select aria-label="预览动作" value={action} onChange={event => setAction(event.target.value as ResourceAction)}>{RESOURCE_ACTIONS.map(value => <option key={value} value={value}>{ACTION_LABELS[value]}{!draft.actions[value] ? '（回退待机）' : ''}</option>)}</select><button type="button" aria-label={playing ? '暂停动画' : '播放动画'} aria-pressed={playing} onClick={() => setPlaying(value => !value)}>{playing ? 'Ⅱ' : '▶'}</button></div><h3>资源信息</h3><dl className="resource-provenance"><dt>来源</dt><dd>{draft.provenance.source}</dd><dt>作者</dt><dd>{draft.provenance.author}</dd><dt>许可</dt><dd>{draft.provenance.license}</dd><dt>记录</dt><dd>{draft.provenance.status === 'project-original' ? '项目原创，附源文件' : draft.provenance.status === 'recorded' ? '沿用原有许可台账' : '本机记录，授权待核对'}</dd></dl></section>
          </div>
          {tab === 'actions' ? <section className="resource-mapping"><h3>动作映射</h3><p>未提供的动作会回退到待机；静态模型保持原姿势。</p><div>{RESOURCE_ACTIONS.map(value => <label key={value}>{ACTION_LABELS[value]}<select aria-label={`${ACTION_LABELS[value]}映射`} value={draft.actions[value] ?? ''} onChange={event => { setDraft({ ...draft, actions: { ...draft.actions, [value]: event.target.value || null } }); setDirty(true); }}><option value="">未提供 · 回退待机</option>{draft.clips.map(clip => <option key={clip.name} value={clip.name}>{clip.name}</option>)}</select></label>)}</div></section> : null}
          {tab === 'calibration' ? <p className="resources-calibration-tip">大小与垂直位置按舞台比例保存。朝向与水平翻转会由桌面、详情和战斗共用的显示组件读取；不会修改原始模型文件。</p> : null}
          {draft.warnings.length ? <details className="resource-warnings"><summary>资源提示（{draft.warnings.length}）</summary>{draft.warnings.map((warning, index) => <p key={index}>{warning}</p>)}{draft.provenance.attribution ? <p>{draft.provenance.attribution}</p> : null}</details> : draft.provenance.attribution ? <p className="resource-attribution">{draft.provenance.attribution}</p> : null}
          <div className="resource-save-row"><button type="button" className="resource-primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? '正在保存…' : '✓ 保存显示设置'}</button>{dirty ? <button type="button" disabled={busy} onClick={() => { setDraft(selected ? structuredClone(selected) : null); setDirty(false); setMessage('已放弃未保存修改。'); }}>放弃修改</button> : null}</div>
        </> : <div className="resources-empty resources-preview-empty"><img src={brandMark} alt="" /><p>选择一个角色，开始预览。</p><button type="button" onClick={() => void reload()}>重新载入资源库</button></div>}
      </section>
    </div>
    <p className="resources-status" role="status" aria-live="polite">{message || (dirty ? '显示设置尚未保存。' : loading ? '正在载入资源库…' : '角色资源与伙伴实例分别保存。原有模型和导入历史完整保留。')}</p>
  </main>;
}
export const feature = { id: 'resources', title: '角色资源', routes: [{ path: '/resources', title: '角色资源', component: ResourcesPage }, { path: '/settings/resources', title: '角色资源', component: ResourcesPage }] };
export default feature;
