const { createSession, getBattleRules } = require('../../services/battle-runtime.cjs');

/** Read the existing battle authority; do not reproduce its constants in the UI. */
function companionCombatProfile(pet, rules = getBattleRules()) {
  const actor = createSession(pet.element, pet.element).player;
  return {
    petId: pet.petId,
    resourceId: pet.resource.resourceId,
    growthStats: { ...pet.growth.stats },
    training: { initialHp: actor.hp, maxHp: rules.maxHp, initialAnger: actor.anger, normalized: rules.vitalPolicy === 'normalized' },
    rules,
    authority: 'battle.getRules / battle-runtime.getBattleRules'
  };
}

module.exports = { companionCombatProfile };
