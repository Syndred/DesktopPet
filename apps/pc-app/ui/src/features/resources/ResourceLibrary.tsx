import { useState } from 'react';
import { Check, FileImage, FolderUp, Search } from 'lucide-react';
import type { CharacterResource, ResourcesClient } from '../../../../../../packages/shared-types/src/features/resources';
import { Button } from '../../components/ui';
import { AnimatedList } from '../../components/motion';
import { Input } from '../../components/ui/input';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import type { ResourceProvenance } from '../../../../../../packages/shared-types/src/features/resources';
import { resolveResourceClip } from './display';

export function ResourceThumbnail({ resource, client }: { resource: CharacterResource; client: ResourcesClient }) {
  const clip = resolveResourceClip(resource, 'idle').clip;
  const frameName = resource.atlas?.animations[clip?.name ?? 'idle']?.[0];
  const frame = frameName ? resource.atlas?.frames[frameName] : null;
  return <div className="resource-card-art">
    {frame && resource.atlas && resource.availability === 'ready' ? <svg viewBox={`${frame.frame.x} ${frame.frame.y} ${frame.frame.w} ${frame.frame.h}`} aria-hidden="true" style={{ transform: frame.rotated ? 'rotate(-90deg)' : undefined }}><image href={client.assetUrl(resource.id, resource.entryAsset)} width={resource.atlas.meta.size.w} height={resource.atlas.meta.size.h} /></svg> : <FileImage aria-hidden="true" />}
  </div>;
}
export function ResourceLibrary({ resources, selectedId, choose, client, loading, importing, onImport }: { resources: CharacterResource[]; selectedId: string; choose(resource: CharacterResource): void; client: ResourcesClient; loading: boolean; importing: boolean; onImport(metadata: Partial<ResourceProvenance>): void }) {
  const [search, setSearch] = useState(''), [metadata, setMetadata] = useState<Partial<ResourceProvenance>>({});
  const visible = resources.filter(resource => resource.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <section className="resources-library resources-panel" aria-labelledby="resource-library-title">
    <div className="resources-panel-heading"><h2 id="resource-library-title">我的角色资源</h2><span>{resources.length} 个 2D 形象</span></div>
    <label className="resource-search"><Search size={14} aria-hidden="true" /><Input aria-label="搜索角色" placeholder="搜索角色名称" value={search} onChange={event => setSearch(event.target.value)} /></label>
    <ScrollArea className="resources-library-scroll"><AnimatedList className="resources-grid">
      {visible.map(resource => <Button variant="ghost" key={resource.id} data-resource-id={resource.id} className={`resource-card ${selectedId === resource.id ? 'is-selected' : ''}`} aria-pressed={selectedId === resource.id} onClick={() => choose(resource)}>
        <span className="resource-dimension is-2d">2D</span>{selectedId === resource.id ? <span className="resource-selected-mark"><Check size={12} /></span> : null}
        <ResourceThumbnail resource={resource} client={client} /><strong>{resource.name}</strong><span>{Object.keys(resource.atlas?.frames ?? {}).length} 帧 · {resource.origin === 'import' ? '本地导入' : '项目角色'}</span>
      </Button>)}
      {!visible.length ? <p className="resources-empty">{loading ? '正在读取角色…' : '没有匹配的 2D 角色。'}</p> : null}
    </AnimatedList></ScrollArea>
    <div className="resources-import"><FolderUp size={27} aria-hidden="true" /><strong>带上喜欢的 2D 角色</strong><p>支持角色包与 PixiJS / TexturePacker 图集。<br />选择解压目录内的 JSON 描述文件。</p>
      <Popover><PopoverTrigger asChild><Button variant="ghost" className="resource-import-metadata">填写来源与许可</Button></PopoverTrigger><PopoverContent className="resource-metadata-popover" side="right"><h3>导入来源与许可</h3><p>包中已有资料会保留，空白项不会覆盖原记录。</p>{([['author','作者'],['source','来源'],['license','许可']] as const).map(([key,label]) => <label key={key}>{label}<Input aria-label={`导入${label}`} value={metadata[key] ?? ''} onChange={event => setMetadata({ ...metadata, [key]: event.target.value })} maxLength={key === 'author' ? 120 : 1000} /></label>)}</PopoverContent></Popover>
      <Button className="resource-primary" disabled={importing} onClick={() => onImport(metadata)}><FolderUp size={16} />{importing ? '正在选择与导入…' : '选择文件并导入'}</Button>
    </div>
  </section>;
}
