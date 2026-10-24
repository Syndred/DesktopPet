const PREVIEW_ACTIONS = new Set(['wave', 'eat', 'hit', 'attack', 'attack_windup', 'attack_release', 'skill', 'victory', 'walk', 'blink', 'sleep', 'idle']);

function unavailable(message = '这个形象还没有提供该动作') {
  return Object.assign(new Error(message), { code: 'ACTION_UNAVAILABLE' });
}

/** Routes one verified pet's transient actions to the shared resource/Pixi renderer. */
function createCompanionPlayback({ services, service }) {
  let active = true;
  async function resolve(owner, pet, action) {
    if (!PREVIEW_ACTIONS.has(action) || pet.resource.kind !== '2d') throw unavailable();
    const resources = services.get('resources');
    if (!resources) throw unavailable('角色资源服务尚未就绪');
    await resources.ready;
    const display = await resources.resolve(owner, { petId: pet.petId, resourceId: pet.resource.resourceId, context: 'desktop', action });
    if (display.resource.availability !== 'ready' || display.fallback || !display.clip) throw unavailable();
    if (!active || services.session.getOwnerAccountId() !== owner) throw Object.assign(new Error('账号已切换，请重新操作'), { code: 'SESSION_CHANGED' });
    if (service.requirePet(owner, pet.petId).resource.resourceId !== pet.resource.resourceId) throw unavailable('伙伴形象已改变，请重新选择动作');
    return display;
  }
  function publish(owner, pet, display, action, actionId) {
    const startedAt = Date.now();
    const frames = display.clip.frameNames?.length || display.clip.frames?.length || 1;
    const durationMs = display.clip.loop ? 2400 : Math.max(800, Math.min(6000, frames / (display.clip.fps || 8) * 1000));
    const event = { ownerAccountId: owner, petId: pet.petId, resourceId: pet.resource.resourceId, action, actionId, startedAt, expiresAt: startedAt + durationMs };
    services.events.emit('companions:action', event);
    return event;
  }
  async function play(owner, pet, action, actionId) {
    const display = await resolve(owner, pet, action);
    return publish(owner, pet, display, action, actionId);
  }
  async function perform(owner, payload) {
    if (typeof payload?.actionId === 'string' && services.db.prepare('SELECT 1 FROM companion_actions WHERE owner_account_id=? AND action_id=?').get(owner, payload.actionId)) {
      // The domain action runner validates the full hash even on a receipt replay.
      return service.action(owner, 'perform', payload, () => { throw new Error('Missing recorded action result'); });
    }
    const pet = service.requirePet(owner, payload.petId);
    if (payload.resourceId !== undefined && payload.resourceId !== pet.resource.resourceId) throw unavailable('伙伴形象已改变，请重新选择动作');
    const display = await resolve(owner, pet, payload.action);
    const result = service.action(owner, 'perform', payload, () => {
      // Preview does not mutate growth/position. A concurrent position save
      // must not invalidate it; resource identity is the relevant stale guard.
      const current = service.requirePet(owner, payload.petId);
      if (current.resource.resourceId !== pet.resource.resourceId) throw unavailable('伙伴形象已改变，请重新选择动作');
      return { pet: current, selections: service.selections(owner) };
    });
    if (!result.duplicate) publish(owner, result.data.pet, display, payload.action, payload.actionId);
    return result;
  }
  function afterGrowthCommit(owner, input, result) {
    if (result.duplicate || !(input.effect?.satiety > 0)) return;
    // A garden outer transaction can still roll back after this adapter returns.
    // Only a receipt that survives to the microtask boundary can cause eating.
    queueMicrotask(() => {
      if (!active) return;
      const committed = services.db.prepare('SELECT 1 FROM companion_actions WHERE owner_account_id=? AND action_id=?').get(owner, input.actionId);
      if (committed) void play(owner, result.data.pet, 'eat', input.actionId).catch(() => {});
    });
  }
  return { perform, play, afterGrowthCommit, dispose() { active = false; } };
}

module.exports = { createCompanionPlayback };
