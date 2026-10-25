import { useState } from 'react';
import { Check, CloudCheck, FlaskConical, HardDrive, Heart, MapPin } from 'lucide-react';
import { Card } from '../../components/ui';
import { Switch } from '../../components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { request } from '../../app/bridge';
import type { DiscoveryCapture, DiscoverySnapshot } from '../../../../../../packages/shared-types/src/features/discovery';
import { ResourcePortrait } from './ResourcePortrait';
import { ResultActions } from './ResultActions';
import { elements } from './presentation';
import { companionIdentity } from '../companions/identity';
import lake from './assets/wild-lake-v1.png';
function ResultPreferences({ capture }: { capture: DiscoveryCapture }) {
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const save = async (visible: boolean) => {
    if (pending) return; setPending(true); setError('');
    try { await request('companions', 'desktop', { petId: capture.petId, actionId: crypto.randomUUID(), visible }); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setPending(false); }
  };
  return <><div className="discovery-result-preference"><strong>桌面显示</strong><Switch aria-label="新伙伴在桌面显示" checked={capture.showOnDesktop} disabled={pending} onCheckedChange={visible => void save(visible)}/></div>{error ? <p className="discovery-error-text" role="alert">{error}</p> : null}</>;
}
export function CaptureResultView({ capture, state }: { capture: DiscoveryCapture; state: DiscoverySnapshot }) {
  const encounter = state.encounters.find(e => e.encounterId === capture.encounterId);
  const currentPet = state.pets.find(pet => pet.petId === capture.petId);
  const identity = companionIdentity(currentPet ? { ...currentPet, globalSerial: currentPet.globalSerial ?? capture.globalSerial } : capture);
  const resourceId = currentPet?.resource.resourceId || capture.resourceId || encounter?.spawn.resourceId || '';
  const storage = capture.scenario === 'qa' ? 'QA 场景存档' : capture.validation === 'cloud' ? '已校验' : '本机存档';
  const StorageIcon = capture.scenario === 'qa' ? FlaskConical : capture.validation === 'cloud' ? CloudCheck : HardDrive;
  return <div className="discovery-result" data-pet-id={capture.petId}><section className="discovery-result-hero"><span className="discovery-eyebrow">附近探索 / 收服结果</span><h1>从今天起，多一位伙伴。</h1><div className="discovery-success"><Check size={25}/>新伙伴已加入</div><div className="discovery-postcard"><ResourcePortrait resourceId={resourceId} instanceId={capture.petId} victory/><p>欢迎加入，{identity.roleName}。</p><code className="discovery-instance-number">编号 {identity.instanceNumber}</code></div></section>
    <section className="discovery-result-details"><Card className="discovery-result-profile"><div className="discovery-profile-top"><ResourcePortrait resourceId={resourceId} instanceId={capture.petId} compact/><div><h2>{identity.roleName}</h2><span className={`discovery-element element-${capture.element}`}>Lv.{String(currentPet?.level || 1).padStart(2,'0')} · {elements[capture.element]}</span></div></div><dl><div><dt>实例编号</dt><dd><code className="discovery-instance-number">{identity.instanceNumber}</code></dd></div><div><dt>捕捉时昵称</dt><dd>{capture.name}</dd></div><div><dt>相遇于</dt><dd>{capture.placeLabel}</dd></div><div><dt>相遇时间</dt><dd>{new Date(capture.capturedAtMs).toLocaleString('zh-CN')}</dd></div></dl><ResultPreferences capture={capture}/></Card>
      {capture.memoryTags.map(tag => <Card className="discovery-memory" key={tag.id}><img src={lake} alt="湖畔相遇插画"/><div><h3>{tag.title}</h3><small><Heart size={13}/>{new Date(tag.createdAt).toLocaleDateString('zh-CN')}<MapPin size={13}/>{tag.placeLabel}</small><p>{tag.text}</p></div></Card>)}
      <TooltipProvider><Tooltip><TooltipTrigger asChild><span className="discovery-save-mark" aria-label={storage} tabIndex={0}><StorageIcon size={16}/></span></TooltipTrigger><TooltipContent>{storage}</TooltipContent></Tooltip></TooltipProvider><ResultActions capture={capture}/>
    </section>
  </div>;
}
