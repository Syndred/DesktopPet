import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import type { CompanionPet } from '../../../../../../packages/shared-types/src/features/companions';
import { RESOURCE_ACTIONS, type ResourceAction, type ResourceDisplay } from '../../../../../../packages/shared-types/src/features/resources';
import { Button, Card } from '../../components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { CompanionPortrait } from './CompanionPortrait';
import type { Controller } from './components';

const labels: Record<string, string> = { wave: '招手', eat: '吃饭', hit: '受击', attack: '普通攻击', attack_windup: '攻击起手', attack_release: '攻击释放', skill: '元素技能', victory: '庆祝', walk: '行走', blink: '眨眼', sleep: '休息' };

export function ActionPreview({ pet, controller }: { pet: CompanionPet; controller: Controller }) {
  const [available, setAvailable] = useState<ResourceAction[]>([]);
  const [selected, setSelected] = useState('wave');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true; setAvailable([]); setError('');
    void window.lingjing.invoke<ResourceDisplay>('resources', 'resolve', { resourceId: pet.resource.resourceId, petId: pet.petId, context: 'desktop', action: 'idle' }).then(result => {
      if (!active) return;
      if (!result.ok) { setError(result.message); return; }
      const resource = result.data.resource;
      if (resource.availability !== 'ready') { setError('角色文件暂不可用'); return; }
      setAvailable(RESOURCE_ACTIONS.filter(action => labels[action] && resource.clips.some(clip => clip.name === resource.actions[action])));
    }).catch(() => { if (active) setError('动作暂时无法加载'); });
    return () => { active = false; };
  }, [pet.ownerAccountId, pet.petId, pet.resource.resourceId]);
  const action = available.find(candidate => candidate === selected) || available[0];
  return <Card className="cp-action-preview"><h3>动作预览</h3><div className="cp-action-preview-layout"><div className="cp-action-preview-art"><CompanionPortrait ownerAccountId={pet.ownerAccountId} petId={pet.petId} resource={pet.resource} name={pet.name} animate/></div><div className="cp-action-preview-controls">
    {action ? <><label htmlFor="cp-preview-action">想看它做什么</label><Select value={action} onValueChange={setSelected}><SelectTrigger id="cp-preview-action" aria-label={`${pet.name}的预览动作`}><SelectValue/></SelectTrigger><SelectContent>{available.map(value => <SelectItem key={value} value={value}>{labels[value]}</SelectItem>)}</SelectContent></Select><Button disabled={controller.busy} onClick={() => controller.petAction('perform', pet, { action })}><Play size={15}/>播放动作</Button><small>只预览动作。喂食请从背包选择食物。</small></> : <p className="muted">{error || '正在读取角色动作…'}</p>}
  </div></div></Card>;
}
