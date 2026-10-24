import { ArrowRight, BookOpen, ChevronRight, Compass, MapPin, PawPrint } from 'lucide-react';
import { Button } from '../../components/ui';
import { AnimatedList } from '../../components/motion';
import { navigate } from '../../app/navigation';
import type { DiscoverySnapshot, WildSpawn } from '../../../../../../packages/shared-types/src/features/discovery';
import { NearbyMap } from './NearbyMap';
import { ResourcePortrait } from './ResourcePortrait';
import { elements } from './presentation';
export function ExploreView({ state, selected, select }: { state: DiscoverySnapshot; selected?: WildSpawn; select: (id: string) => void }) {
  const active = state.encounters.find(encounter => ['challenging', 'won'].includes(encounter.status));
  return <>
    {active ? <div className="discovery-resume"><Compass size={18}/><span>与{active.spawn.name}的{active.status === 'won' ? '邀请' : '挑战'}还在等待你，进度已保存。</span><Button variant="secondary" onClick={() => navigate(`/discovery/encounter/${active.encounterId}`)}>继续<ArrowRight size={16}/></Button></div> : null}
    <div className="discovery-explore-grid"><NearbyMap state={state} selectedId={selected?.id} onSelect={spawn => select(spawn.id)}/>
      <aside className="discovery-nearby-panel">
        {selected ? <><div className="discovery-selected-hero"><span className="discovery-chip">附近的伙伴</span><ResourcePortrait resourceId={selected.resourceId} instanceId={selected.id}/><div className="discovery-selected-copy"><h2>{selected.name}</h2><span className={`discovery-element element-${selected.element}`}>Lv.01 · {elements[selected.element]}</span><strong className="discovery-distance"><MapPin size={15}/>距离你约 {selected.distanceMeters} m</strong><p>{selected.inRange ? '已经进入互动范围，和她打个招呼吧。' : '移动到附近，可以发起野外挑战。'}</p></div></div>
          <Button className="discovery-full" onClick={() => navigate(`/discovery/wild/${selected.id}`)}><MapPin size={17}/>{selected.captureState === 'captured' ? '查看这次相遇' : selected.inRange ? '和她打个招呼' : '前往附近'}</Button>
        </> : <div className="discovery-empty"><Compass size={35}/><h2>附近的相遇，正在等你</h2><p>先获取位置，再看看身边的游戏伙伴。</p></div>}
        <Button variant="ghost" className="discovery-full discovery-pokedex-button" onClick={() => navigate('/discovery/pokedex')}><BookOpen size={17}/>查看相遇图鉴</Button>
        <div className="discovery-nearby-heading"><h3>附近发现</h3><span>{state.spawns.length} 位伙伴</span></div>
        <AnimatedList className="discovery-nearby-list">{state.spawns.filter(spawn => spawn.id !== selected?.id).slice(0, 3).map(spawn => <button key={spawn.id} className="discovery-nearby-row" onClick={() => select(spawn.id)}>
          <ResourcePortrait resourceId={spawn.resourceId} instanceId={spawn.id} compact/><span><strong>{spawn.name}</strong><small>Lv.01 · {elements[spawn.element]}</small></span><span>{spawn.distanceMeters} m</span><ChevronRight size={15}/>
        </button>)}</AnimatedList>
        <p className="discovery-walk-note"><PawPrint size={17}/>移动到附近，和伙伴打个招呼。</p>
      </aside>
    </div>
  </>;
}
