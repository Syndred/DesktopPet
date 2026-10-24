import { useEffect, useState } from 'react';
import { RESOURCE_ACTIONS, type ResourceAction } from '../../../../../../packages/shared-types/src/features/resources';

interface Playback {
  ownerAccountId: string;
  petId: string;
  resourceId: string;
  action: string;
  actionId: string;
  expiresAt: number;
}
function isPlayback(value: unknown): value is Playback {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<Playback>;
  return typeof event.ownerAccountId === 'string' && typeof event.petId === 'string' && typeof event.resourceId === 'string' && typeof event.action === 'string' && typeof event.actionId === 'string' && Boolean(event.actionId) && typeof event.expiresAt === 'number' && Number.isFinite(event.expiresAt);
}

/** A short domain event selects a clip; the public Pixi stage owns its frames/timing. */
export function useCompanionPlayback(ownerAccountId: string | undefined, petId: string, resourceId: string, enabled = true) {
  const [current, setCurrent] = useState<{ identity: string; action: ResourceAction; playbackKey: string; expiresAt: number } | null>(null);
  const identity = JSON.stringify([ownerAccountId, petId, resourceId]);
  useEffect(() => {
    if (!enabled || !ownerAccountId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => { clearTimeout(timer); setCurrent(null); };
    const off = window.lingjing.subscribe('companions:action', event => {
      if (!isPlayback(event)) return;
      if (event.ownerAccountId !== ownerAccountId || event.petId !== petId || event.resourceId !== resourceId || event.expiresAt <= Date.now()) return;
      const action = RESOURCE_ACTIONS.find(value => value === event.action);
      if (!action) return;
      clearTimeout(timer); setCurrent({ identity, action, playbackKey: event.actionId, expiresAt: event.expiresAt });
      timer = setTimeout(() => setCurrent(null), Math.min(6000, event.expiresAt - Date.now()));
    });
    const offSession = window.lingjing.subscribe('app:session', clear);
    return () => { clearTimeout(timer); off(); offSession(); };
  }, [enabled, ownerAccountId, petId, resourceId, identity]);
  return enabled && current?.identity === identity && current.expiresAt > Date.now() ? current : null;
}
