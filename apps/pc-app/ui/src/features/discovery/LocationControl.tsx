import { Crosshair, MapPin, Navigation } from 'lucide-react';
import { Button } from '../../components/ui';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import type { DiscoverySnapshot } from '../../../../../../packages/shared-types/src/features/discovery';
import { navigate } from '../../app/navigation';
import { locationLabels } from './presentation';
export function LocationControl({ state, pending, locate }: { state: DiscoverySnapshot; pending: boolean; locate: () => void }) {
  const fix = state.location.fix;
  return <TooltipProvider><Tooltip><TooltipTrigger asChild>
    <Button variant="ghost" className={`discovery-location-pill ${state.location.mode === 'demo' ? 'demo' : ''}`} aria-label="获取系统位置" disabled={pending} onClick={locate}>
      {pending ? <Crosshair size={22}/> : <MapPin size={23}/>}<span><strong>{locationLabels[state.location.status]}</strong><small>{fix ? `${fix.source === 'demo' ? '示例位置' : fix.provider === 'windows-geolocator' ? 'Windows 系统位置' : fix.provider} · ±${Math.round(fix.accuracyMeters)} m` : '位置只用于附近互动'}</small></span><Navigation size={18}/>
    </Button>
  </TooltipTrigger><TooltipContent><p>{state.location.lastError?.message || '点击重新获取 Windows 系统位置。'}</p></TooltipContent></Tooltip>
    {state.location.status === 'privacy_disabled' ? <Button variant="ghost" onClick={() => navigate('/settings')}>打开隐私设置</Button> : null}
  </TooltipProvider>;
}
