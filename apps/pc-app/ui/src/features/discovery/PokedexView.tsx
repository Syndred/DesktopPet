import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui';
import { navigate } from '../../app/navigation';
import type { DiscoverySnapshot } from '../../../../../../packages/shared-types/src/features/discovery';
import { ResourcePortrait } from './ResourcePortrait';
import { elements } from './presentation';
export function PokedexView({ state }: { state: DiscoverySnapshot }) {
  return <div><Button variant="ghost" className="discovery-back" onClick={() => navigate('/discovery')}><ArrowLeft size={16}/>返回附近探索</Button><header className="discovery-heading"><span>每位伙伴，都有独一份相遇</span><h1>我的相遇图鉴</h1><p>收服记录与账号中的独立伙伴实例一一对应。</p></header><div className="discovery-pokedex">{state.captures.map(capture => {
    const resourceId = capture.resourceId || state.encounters.find(e => e.encounterId === capture.encounterId)?.spawn.resourceId || '';
    return <button className="discovery-pokedex-card" key={capture.petId} onClick={() => navigate(`/discovery/result/${capture.encounterId}`)}><ResourcePortrait resourceId={resourceId} instanceId={capture.petId} animate={false}/><h2>{capture.name}</h2><span className={`discovery-element element-${capture.element}`}>{elements[capture.element]}</span><p>{capture.placeLabel}</p><small>{new Date(capture.capturedAtMs).toLocaleDateString('zh-CN')}</small></button>;
  })}</div>{!state.captures.length ? <p className="discovery-empty">还没有相遇记录。赢得野外挑战，并确认邀请后，新伙伴会出现在这里。</p> : null}</div>;
}
