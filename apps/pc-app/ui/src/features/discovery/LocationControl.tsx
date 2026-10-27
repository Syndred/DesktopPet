import { useId } from 'react';
import { Crosshair, FlaskConical, MapPin } from 'lucide-react';
import { Button } from '../../components/ui';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import type { DiscoverySnapshot } from '../../../../../../packages/shared-types/src/features/discovery';
import { navigate } from '../../app/navigation';
import { locationLabels } from './presentation';
export function LocationControl({ state, pending, locate, cooldownSeconds = 0 }: { state: DiscoverySnapshot; pending: boolean; locate: () => void; cooldownSeconds?: number }) {
  const countdownId = useId();
  const fix = state.location.fix;
  const qa = state.scenario === 'qa' || fix?.provider === 'controlled-test-fixture';
  const demo = state.location.mode === 'demo';
  const Icon = pending ? Crosshair : qa || demo ? FlaskConical : MapPin;
  return <TooltipProvider><Tooltip><TooltipTrigger asChild>
    <Button variant="ghost" className={`discovery-location-pill ${demo || qa ? 'demo' : ''}`} aria-label={qa ? '更新场景位置' : '获取系统位置'} aria-describedby={cooldownSeconds > 0 ? countdownId : undefined} disabled={pending || cooldownSeconds > 0} onClick={locate}>
      <Icon size={21}/><span><strong>{qa ? 'QA' : demo ? '演示' : locationLabels[state.location.status]}</strong>{cooldownSeconds > 0 ? <small id={countdownId} role="timer">{cooldownSeconds} 秒后可更新</small> : fix ? <small>±{Math.round(fix.accuracyMeters)} m</small> : null}</span>
    </Button>
  </TooltipTrigger><TooltipContent><p>{qa ? '隔离 QA 场景 · 模拟位置' : demo ? '示例位置 · 仅供浏览' : state.location.lastError?.message || '更新系统位置'}</p></TooltipContent></Tooltip>
    {state.location.status === 'privacy_disabled' ? <Button variant="ghost" onClick={() => navigate('/settings')}>打开隐私设置</Button> : null}
  </TooltipProvider>;
}
