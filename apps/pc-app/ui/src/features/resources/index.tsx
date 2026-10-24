import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { ResourcesClient } from '../../../../../../packages/shared-types/src/features/resources';
import { Button } from '../../components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { resourcesClient } from './client';
import { useResources } from './useResources';
import { ResourceLibrary } from './ResourceLibrary';
import { ResourceEditor } from './ResourceEditor';
import brandMark from './brand-mark.png';
import './resources.css';

export { ResourceStage } from './ResourceStage';
export { resourceAssetUrl, resourcesClient } from './client';
export { resolveResourceCalibration, resolveResourceClip } from './display';
const tabs = [['library', '角色资源'], ['actions', '动作配置'], ['calibration', '动作校准']] as const;
export function ResourcesPage({ client = resourcesClient }: { client?: ResourcesClient }) {
  const state = useResources(client), [tab, setTab] = useState('library');
  return <main className="resources-page">
    <header className="resources-heading"><div><p className="resources-breadcrumb">设置 / 2D 角色资源</p><h1>让喜欢的角色，来到桌面。</h1><p>导入图集、映射动作，为每一份陪伴找到合适的姿态。</p></div><img className="resources-brand" src={brandMark} alt="灵境四芒星" /></header>
    <Tabs value={tab} onValueChange={setTab} className="resources-tabs-root"><TabsList className="resources-tabs" aria-label="2D 角色资源配置">{tabs.map(([value,label]) => <TabsTrigger key={value} value={value}>{label}</TabsTrigger>)}</TabsList>
      <div className="resources-layout"><ResourceLibrary resources={state.resources} selectedId={state.selectedId} choose={state.choose} client={client} loading={state.loading} importing={state.operation === 'import'} onImport={metadata => void state.importResource(metadata)} />
        {tabs.map(([value]) => <TabsContent value={value} key={value} className="resources-tab-content">{state.draft ? <ResourceEditor resource={state.draft} mode={value} client={client} edit={state.edit} dirty={state.dirty} saving={state.operation === 'save'} save={() => void state.save()} discard={state.discard} /> : <section className="resources-preview resources-panel resources-empty"><img src={brandMark} alt="" /><p>选择一个 2D 角色，开始预览。</p><Button variant="secondary" onClick={() => void state.reload()}><RotateCcw size={14} />重新载入资源库</Button></section>}</TabsContent>)}
      </div>
    </Tabs>
    <p className="resources-status" role="status" aria-live="polite">{state.message || (state.dirty ? '动作与显示设置尚未保存。' : state.loading ? '正在读取 2D 角色资源…' : '仅显示 2D 角色。既有用户文件、存档与导入历史完整保留。')}</p>
  </main>;
}
export const feature = { id: 'resources', title: '2D 角色资源', routes: [{ path: '/resources', title: '2D 角色资源', component: ResourcesPage }, { path: '/settings/resources', title: '2D 角色资源', component: ResourcesPage }] };
export default feature;
