import { useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import { Button } from '../../components/ui';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import type { DiscoveryCapture, DiscoverySnapshot, WildEncounter } from '../../../../../../packages/shared-types/src/features/discovery';
import { navigate } from '../../app/navigation';
import type { useDiscovery } from './use-discovery';
export function CaptureDialog({ encounter, state, pending, run, close }: { encounter: WildEncounter; state: DiscoverySnapshot; pending: boolean; run: ReturnType<typeof useDiscovery>['run']; close: () => void }) {
  const [name, setName] = useState(encounter.spawn.name), [desktop, setDesktop] = useState(false);
  const actionId = useRef(crypto.randomUUID());
  const confirm = async () => {
    const result = await run<DiscoveryCapture>('confirm', { encounterId: encounter.encounterId, name, showOnDesktop: desktop, expectedRevision: encounter.revision, actionId: actionId.current });
    if (result) navigate(`/discovery/result/${encounter.encounterId}`);
  };
  return <Dialog open onOpenChange={open => { if (!open && !pending) close(); }}><DialogContent className="discovery-capture-dialog" onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onPointerDownOutside={event => { if (pending) event.preventDefault(); }}>
    <DialogHeader><DialogTitle>邀请{encounter.spawn.name}成为伙伴</DialogTitle><DialogDescription>名字、状态与相遇记忆将属于这只独立伙伴。</DialogDescription></DialogHeader>
    <label htmlFor="discovery-capture-name">昵称</label><Input id="discovery-capture-name" value={name} maxLength={24} onChange={event => setName(event.target.value)} disabled={pending}/>
    <div className="discovery-setting-row"><label htmlFor="discovery-capture-desktop">同时放到桌面</label><Switch id="discovery-capture-desktop" checked={desktop} onCheckedChange={setDesktop} disabled={pending}/></div>
    {state.location.status !== 'ready' ? <p className="discovery-caption">确认前请重新获取精度足够的系统位置。</p> : null}
    <div className="discovery-actions"><Button disabled={pending || !name.trim() || state.location.status !== 'ready'} onClick={() => void confirm()}><Heart size={17}/>{pending ? '正在邀请…' : '确认收服'}</Button><Button variant="ghost" disabled={pending} onClick={close}>稍后决定</Button></div>
  </DialogContent></Dialog>;
}
