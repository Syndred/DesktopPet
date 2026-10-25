// Deploy verify_jwt=false, then verify every protected request with 08's shared
// getUser/session/device/legacy-owner wrapper. No body session_token fallback.
import { withActor, createAdminClient } from '../_shared/lingjing-auth.ts';
import { createDiscoveryHandler } from './handler.mjs';
import { createDiscoveryStore } from './store.mjs';

let store: ReturnType<typeof createDiscoveryStore> | undefined;
Deno.serve(withActor(async (request, actor) => {
  store ??= createDiscoveryStore(createAdminClient());
  const policy = await store.location(actor, 'policy', {});
  const effectiveActor = Object.freeze({ ...actor, allowSimulatedLocation: policy.allowSimulatedLocation === true,
    ...(policy.allowSimulatedLocation === true ? { scenarioId: policy.scenarioId } : {}) });
  return createDiscoveryHandler({ requireActor: async () => effectiveActor, store })(request);
}));
