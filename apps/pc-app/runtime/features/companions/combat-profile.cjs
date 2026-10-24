const { createSession } = require('../../services/battle-runtime.cjs');

/** Read the existing battle authority; do not reproduce its constants in the UI. */
function companionCombatProfile(pet) {
  const actor = createSession(pet.element, pet.element).player;
  return {
    petId: pet.petId,
    resourceId: pet.resource.resourceId,
    growthStats: { ...pet.growth.stats },
    training: { initialHp: actor.hp, maxHp: actor.maxHp, initialAnger: actor.anger, normalized: true },
    authority: 'battle-runtime.createSession'
  };
}

module.exports = { companionCombatProfile };
