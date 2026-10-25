// Deploy verify_jwt=false, then verify every protected request with 08's shared
// getUser/session/device/legacy-owner wrapper. No body session_token fallback.
import { withActor, createAdminClient } from '../_shared/lingjing-auth.ts';
import { createDiscoveryHandler } from './handler.mjs';
import { createDiscoveryStore } from './store.mjs';
import { createWildAuthority } from './authority.mjs';
import { awardBattle, createCapture } from './domain.mjs';

let store: ReturnType<typeof createDiscoveryStore> | undefined;
Deno.serve(withActor(async (request, actor) => {
  store ??= createDiscoveryStore(createAdminClient(), { awardBattle, createCapture });
  const policy = await store.location(actor, 'policy', {});
  const effectiveActor = Object.freeze(Object.defineProperty({ ...actor, allowSimulatedLocation: policy.allowSimulatedLocation === true,
    ...(policy.allowSimulatedLocation === true ? { scenarioId: policy.scenarioId } : {}) }, 'client', { value: actor.client, enumerable: false }));
  const projectRef = new URL(Deno.env.get('SUPABASE_URL') || '').hostname.split('.')[0];
  return createDiscoveryHandler({ requireActor: async () => effectiveActor, store, authority: createWildAuthority({ store, projectRef }) })(request);
}));
