import { SlidersHorizontal } from 'lucide-react';
import { Button } from '../../components/ui';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import type { DiscoverySnapshot } from '../../../../../../packages/shared-types/src/features/discovery';
import type { useDiscovery } from './use-discovery';
export function DiscoverySettings({ state, pending, run }: { state: DiscoverySnapshot; pending: boolean; run: ReturnType<typeof useDiscovery>['run'] }) {
  return <Popover><PopoverTrigger asChild><Button variant="ghost" aria-label="探索设置" className="discovery-icon-button"><SlidersHorizontal size={20}/></Button></PopoverTrigger>
    <PopoverContent className="discovery-settings-popover" align="end"><h3>探索与位置</h3>
      <label id="discovery-provider-label">地图服务</label><Select value={state.map.id} onValueChange={providerId => void run('setProvider', { providerId })} disabled={pending}>
        <SelectTrigger aria-label="底图" aria-labelledby="discovery-provider-label"><SelectValue/></SelectTrigger>
        <SelectContent>{state.map.providers.map(provider => <SelectItem key={provider.id} value={provider.id}>{provider.name}{provider.available ? '' : '（尚未配置）'}</SelectItem>)}</SelectContent>
      </Select>
      <div className="discovery-setting-row"><label htmlFor="discovery-demo">演示模式</label><Switch id="discovery-demo" aria-label="演示模式" checked={state.location.mode === 'demo'} disabled={pending} onCheckedChange={enabled => void run('setDemo', { enabled })}/></div>
      <div className="discovery-setting-row"><label htmlFor="discovery-watch">探索时持续更新位置</label><Switch id="discovery-watch" aria-label="探索时持续更新位置" checked={state.location.watching} disabled={pending || state.location.mode === 'demo'} onCheckedChange={enabled => void run(enabled ? 'watch' : 'stopWatch')}/></div>
      <p>演示坐标只供浏览。离开探索页或收起窗口后，持续定位会停止。</p>
    </PopoverContent>
  </Popover>;
}
