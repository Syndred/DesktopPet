import { useEffect, useState, type ComponentType } from 'react';
import type { GardenPet } from '../../../../../../packages/shared-types/src/features/garden';
const stages = import.meta.glob('../resources/ResourceStage.tsx');
type Stage = ComponentType<Record<string, unknown>>;
interface ResourceBridge { invoke<T>(feature: string, command: string, payload: unknown): Promise<{ ok: true; data: T } | { ok: false }> }
export function PetPortrait({ pet }: { pet: GardenPet }) {
  const [view, setView] = useState<{ resource: Record<string, unknown>; Stage: Stage } | null>(null);
  const resourceId = pet.resource?.resourceId;
  useEffect(() => {
    let live = true; setView(null);
    const load = stages['../resources/ResourceStage.tsx'];
    if (!load || !resourceId) return () => { live = false; };
    const bridge = (window as unknown as { lingjing: ResourceBridge }).lingjing;
    void bridge.invoke<{ resource: Record<string, unknown> }>('resources', 'resolve', { petId: pet.petId, resourceId, context: 'desktop', action: 'idle' }).then(async result => {
      if (!result.ok || result.data.resource.kind !== 'sprite2d') return;
      const module = await load() as { ResourceStage: Stage };
      if (live) setView({ resource: result.data.resource, Stage: module.ResourceStage });
    }).catch(() => { /* Initial is retained while a resource is unavailable. */ });
    return () => { live = false; };
  }, [pet.petId, resourceId]);
  if (view) return <view.Stage resource={view.resource} petId={pet.petId} context="desktop" action="idle" playing={false} className="garden-resource-portrait" />;
  return pet.resource?.previewUrl || pet.resource?.thumbnail ? <img src={pet.resource.previewUrl || pet.resource.thumbnail} alt="" /> : <span className="garden-builtin-art" style={{backgroundImage:"url('./illustrations/yuwan-sprites-v1.png')"}} />;
}
