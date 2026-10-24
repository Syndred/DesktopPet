import { ArrowLeft, MapPin, ShieldQuestion, Swords } from 'lucide-react';
import { Button, Card } from '../../components/ui';
import { navigate } from '../../app/navigation';
import type { DiscoveryPet, DiscoverySnapshot, WildSpawn } from '../../../../../../packages/shared-types/src/features/discovery';
import { NearbyMap } from './NearbyMap';
import { PetPicker } from './PetPicker';
import { ResourcePortrait } from './ResourcePortrait';
import { elements } from './presentation';
import lake from './assets/wild-lake-v1.png';

export function WildPreviewView({ state, spawn, pet, selectPet, pending, begin }: {
  state: DiscoverySnapshot; spawn: WildSpawn; pet?: DiscoveryPet; selectPet: (id: string) => void; pending: boolean; begin: () => void;
}) {
  const active = state.encounters.some(encounter => ['challenging', 'won'].includes(encounter.status));
  return <div className="discovery-wild-view">
    <div className="discovery-wild-heading"><div><Button variant="ghost" className="discovery-back" onClick={() => navigate('/discovery')}><ArrowLeft size={15}/>附近探索 / 野外遭遇</Button><h1>在附近，遇见了{spawn.name}。</h1><p>距离约 {spawn.distanceMeters} m · {spawn.demo ? '正在浏览演示相遇' : spawn.inRange ? '已进入互动范围' : '尚未进入互动范围'}</p></div><div className="discovery-mini-map"><NearbyMap state={state} mini/><small>位置仅用于附近互动</small></div></div>
    <div className="discovery-wild-grid"><section className="discovery-wild-scene" style={{ backgroundImage: `url("${lake}")` }} aria-label="湖畔相遇插画">
      {pet ? <div className="discovery-scene-player"><ResourcePortrait resourceId={pet.resource.resourceId} instanceId={pet.petId}/></div> : null}
      <div className="discovery-scene-wild"><ResourcePortrait resourceId={spawn.resourceId} instanceId={spawn.id} facing="left"/></div>
      <small className="discovery-scene-caption">相遇插画 · 非定位实景</small>
    </section><Card className="discovery-wild-profile"><div className="discovery-profile-top"><ResourcePortrait resourceId={spawn.resourceId} instanceId={spawn.id} compact/><div><h2>{spawn.name}</h2><span className={`discovery-element element-${spawn.element}`}>Lv.01 · {elements[spawn.element]}</span></div></div><p>{spawn.description}</p><div className="discovery-place"><MapPin size={17}/><span>相遇地点</span><strong>{spawn.placeLabel}</strong></div><h3><ShieldQuestion size={17}/>待发现的特征</h3>{['喜欢的食物', '特别的习惯', '喜欢的事物'].map(label => <div className="discovery-unknown" key={label}><span>?</span>{label}<strong>？？？</strong></div>)}</Card></div>
    <div className="discovery-preview-bottom"><div><PetPicker pets={state.pets} value={pet?.petId} onChange={selectPet} disabled={pending}/><p className="discovery-caption">桌面、聊天与出战伙伴分别选择。</p></div><div className="discovery-invitation"><blockquote>“先切磋一下，再邀请她加入吧。”</blockquote><div className="discovery-actions"><Button disabled={pending || !state.signedIn || !pet || !spawn.inRange || spawn.demo || active || (state.cloudStatus !== 'disabled' && state.cloudStatus !== 'ready')} onClick={begin}><Swords size={19}/>开始挑战</Button><Button variant="ghost" onClick={() => navigate('/discovery')}>先离开</Button></div></div></div>
  </div>;
}
