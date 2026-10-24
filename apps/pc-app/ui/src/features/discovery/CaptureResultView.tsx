import { useState } from 'react';
import { Check, Heart, MapPin, Pencil } from 'lucide-react';
import { Button, Card } from '../../components/ui';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { request } from '../../app/bridge';
import type { DiscoveryCapture, DiscoverySnapshot } from '../../../../../../packages/shared-types/src/features/discovery';
import { ResourcePortrait } from './ResourcePortrait';
import { ResultActions } from './ResultActions';
import { elements } from './presentation';
import lake from './assets/wild-lake-v1.png';
function ResultPreferences({ capture }: { capture: DiscoveryCapture }) {
  const [open, setOpen] = useState(false), [name, setName] = useState(capture.name), [pending, setPending] = useState(false), [error, setError] = useState('');
  const save = async (command: 'rename' | 'desktop', input: object) => {
    if (pending) return; setPending(true); setError('');
    try { await request('companions', command, { petId: capture.petId, actionId: crypto.randomUUID(), ...input }); setOpen(false); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setPending(false); }
  };
  return <><div className="discovery-result-preference"><span>昵称</span><strong>{capture.name}</strong><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="ghost" aria-label="修改新伙伴昵称"><Pencil size={15}/></Button></DialogTrigger><DialogContent className="discovery-capture-dialog"><DialogHeader><DialogTitle>给伙伴起个名字</DialogTitle><DialogDescription>只修改这只独立伙伴的昵称。</DialogDescription></DialogHeader><label htmlFor="discovery-rename">昵称</label><Input id="discovery-rename" value={name} maxLength={24} onChange={event => setName(event.target.value)}/><Button disabled={pending || !name.trim()} onClick={() => void save('rename', { name })}>保存昵称</Button></DialogContent></Dialog></div>
    <div className="discovery-result-preference"><div><strong>设为桌面显示</strong><p>每位伙伴都有独立的状态和回忆。</p></div><Switch aria-label="新伙伴在桌面显示" checked={capture.showOnDesktop} disabled={pending} onCheckedChange={visible => void save('desktop', { visible })}/></div>{error ? <p className="discovery-error-text" role="alert">{error}</p> : null}</>;
}
export function CaptureResultView({ capture, state }: { capture: DiscoveryCapture; state: DiscoverySnapshot }) {
  const encounter = state.encounters.find(e => e.encounterId === capture.encounterId);
  const currentPet = state.pets.find(pet => pet.petId === capture.petId);
  const resourceId = currentPet?.resource.resourceId || capture.resourceId || encounter?.spawn.resourceId || '';
  return <div className="discovery-result"><section className="discovery-result-hero"><span className="discovery-eyebrow">附近探索 / 收服结果</span><h1>从今天起，多一位伙伴。</h1><div className="discovery-success"><Check size={25}/>新伙伴已加入</div><div className="discovery-postcard"><ResourcePortrait resourceId={resourceId} instanceId={capture.petId} victory/><p>欢迎加入，{capture.name}。</p></div></section>
    <section className="discovery-result-details"><Card className="discovery-result-profile"><div className="discovery-profile-top"><ResourcePortrait resourceId={resourceId} instanceId={capture.petId} compact/><div><h2>{capture.name}</h2><span className={`discovery-element element-${capture.element}`}>Lv.{String(currentPet?.level || 1).padStart(2,'0')} · {elements[capture.element]}</span></div></div><dl><div><dt>伙伴编号</dt><dd>{capture.serial}</dd></div><div><dt>相遇于</dt><dd>{capture.placeLabel}</dd></div><div><dt>相遇时间</dt><dd>{new Date(capture.capturedAtMs).toLocaleString('zh-CN')}</dd></div></dl><ResultPreferences capture={capture}/></Card>
      {capture.memoryTags.map(tag => <Card className="discovery-memory" key={tag.id}><img src={lake} alt="湖畔相遇插画"/><div><h3>{tag.title}</h3><small><Heart size={13}/>{new Date(tag.createdAt).toLocaleDateString('zh-CN')}<MapPin size={13}/>{tag.placeLabel}</small><p>{tag.text}</p></div></Card>)}
      <p className="discovery-caption">{capture.validation === 'cloud' ? '云端已验证，本机存档已保存。' : '已保存在本机，尚未同步到云端。'}</p><ResultActions capture={capture}/>
    </section>
  </div>;
}
