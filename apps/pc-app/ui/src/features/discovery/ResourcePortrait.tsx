import { useEffect, useState, type ComponentType } from 'react';
import { request } from '../../app/bridge';

type StageProps = { resource: Record<string, unknown>; petId: string; context: 'battle'; action: 'idle' | 'victory'; playing: boolean };
const stageModules = import.meta.glob('../resources/ResourceStage.tsx');
const stageLoader = Object.values(stageModules)[0];
/** The resources feature retains rendering and model ownership; no copied model library. */
export function ResourcePortrait({ resourceId, instanceId, victory = false, fallback }: { resourceId: string; instanceId: string; victory?: boolean; fallback: React.ReactNode }) {
  const [display, setDisplay] = useState<Record<string, unknown> | null>(null), [Stage, setStage] = useState<ComponentType<StageProps> | null>(null);
  useEffect(() => {
    let active = true; setDisplay(null);
    if (!stageLoader) return;
    void Promise.all([stageLoader(), request<{ resource: Record<string, unknown> }>('resources', 'resolve', { resourceId, petId: instanceId, context: 'battle', action: victory ? 'victory' : 'idle' })]).then(([module, result]) => {
      if (active) { setStage(() => (module as { ResourceStage: ComponentType<StageProps> }).ResourceStage); setDisplay(result.resource); }
    }).catch(() => { if (active) setDisplay(null); });
    return () => { active = false; };
  }, [resourceId, instanceId, victory]);
  return Stage && display ? <div className="discovery-resource-portrait"><Stage resource={display} petId={instanceId} context="battle" action={victory ? 'victory' : 'idle'} playing/></div> : <>{fallback}</>;
}
