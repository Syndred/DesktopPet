import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '../../components/ui';
import { navigate, usePath } from '../../app/navigation';
import type { WildEncounter } from '../../../../../../packages/shared-types/src/features/discovery';
import { useDiscovery, actionId } from './use-discovery';
import { LocationControl } from './LocationControl';
import { DiscoverySettings } from './DiscoverySettings';
import { ExploreView } from './ExploreView';
import { WildPreviewView } from './WildPreviewView';
import { EncounterView } from './EncounterView';
import { CaptureResultView } from './CaptureResultView';
import { PokedexView } from './PokedexView';
import { twoDimensional } from './presentation';
import './styles.css';

function DiscoveryPage() {
  const { data: state, pending, error, run, refresh } = useDiscovery();
  const path = usePath(), [selectedId, setSelectedId] = useState(''), [petId, setPetId] = useState('');
  const id = path.split('/')[3] || '';
  if (!state) return <div className="discovery-page"><h1>附近探索</h1><p role="status">{error || '正在读取探索进度…'}</p><Button variant="ghost" onClick={() => void refresh()}>重新连接</Button></div>;
  const selected = state.spawns.find(spawn => spawn.id === selectedId) || state.spawns[0];
  const pet = state.pets.find(p => p.petId === petId && twoDimensional(p.resource?.kind)) || state.pets.find(p => twoDimensional(p.resource?.kind));
  const spawn = state.spawns.find(s => s.id === id), encounter = state.encounters.find(e => e.encounterId === id), capture = state.captures.find(c => c.encounterId === id);
  if (path.startsWith('/discovery/encounter/') && encounter) return <EncounterView key={encounter.encounterId} encounter={encounter} state={state} pending={pending} run={run}/>;
  const begin = async () => {
    if (!spawn || !pet) return;
    const result = await run<WildEncounter>('begin', { spawnId: spawn.id, petId: pet.petId, actionId: actionId() });
    if (result) navigate(`/discovery/encounter/${result.encounterId}`);
  };
  const controls = <div className="discovery-header-controls"><LocationControl state={state} pending={pending} locate={() => void run('locate')}/><DiscoverySettings state={state} pending={pending} run={run}/></div>;
  const missing = <div className="discovery-empty"><h2>这次相遇暂时不在当前账号中</h2><p>附近伙伴可能已经刷新，已有记录始终按账号保留。</p><Button variant="ghost" onClick={() => navigate('/discovery')}>返回附近探索</Button></div>;
  return <div className="discovery-page">
    {path === '/discovery' ? <header className="discovery-main-heading"><div><h1>下楼走走，遇见新伙伴。</h1><p>附近伙伴 · 捕捉 · 领地</p></div>{controls}</header> : <div className="discovery-sub-controls">{controls}</div>}
    {error ? <div className="discovery-alert" role="alert"><ShieldAlert size={17}/>{error}</div> : null}
    {state.location.mode === 'demo' ? <div className="discovery-demo-banner">演示模式 · 示例位置与游戏点位，仅供浏览，不能收服或发放奖励。</div> : null}
    {state.location.lastError ? <p className="discovery-location-error" role="status">{state.location.lastError.message}</p> : null}
    {state.cloudStatus !== 'disabled' && state.cloudStatus !== 'ready' ? <p className="discovery-location-error">云端收服暂不可用；地图浏览与已有记录仍可访问。</p> : null}
    {path.startsWith('/discovery/result/') ? capture ? <CaptureResultView key={capture.petId} capture={capture} state={state}/> : missing
      : path.startsWith('/discovery/encounter/') ? encounter ? <EncounterView key={encounter.encounterId} encounter={encounter} state={state} pending={pending} run={run}/> : missing
      : path.startsWith('/discovery/wild/') ? spawn ? <WildPreviewView state={state} spawn={spawn} pet={pet} selectPet={setPetId} pending={pending} begin={() => void begin()}/> : missing
      : path === '/discovery/pokedex' ? <PokedexView state={state}/>
      : <ExploreView state={state} selected={selected} select={setSelectedId}/>}
  </div>;
}
export default { id: 'discovery', title: '附近探索', routes: [
  { path: '/discovery', title: '附近探索', component: DiscoveryPage },
  { path: '/discovery/wild/:spawnId', title: '野外遭遇', component: DiscoveryPage },
  { path: '/discovery/encounter/:encounterId', title: '野外挑战', component: DiscoveryPage },
  { path: '/discovery/result/:encounterId', title: '收服结果', component: DiscoveryPage },
  { path: '/discovery/pokedex', title: '相遇图鉴', component: DiscoveryPage }
] };
