const ELEMENT_ADVANTAGE_CHAIN = {
  metal: "wood",
  wood: "earth",
  earth: "water",
  water: "fire",
  fire: "metal"
};

const BASE_DAMAGE = {
  normal_attack: 10,
  element_attack: 12,
  dodge: 0,
  ultimate: 20
};

const ACTIONS = ["normal_attack", "element_attack", "dodge", "ultimate"];
const ELEMENTS = ["metal", "wood", "earth", "water", "fire"];
const ULTIMATE_ANGER_THRESHOLD = 50;
const ULTIMATE_ANGER_COST = 50;
const ELEMENT_STATUS_DURATION = 3;
const ULTIMATE_FIXED_HEAL = 20;
const BURN_CURRENT_HP_RATIO_PER_STACK = 0.08;

class BattleRuntimeService {
  constructor() {
    this.session = null;
    this.reset();
  }

  reset(config = {}) {
    const playerElement = normalizeElement(config.playerElement) || "metal";
    const enemyElement = normalizeElement(config.enemyElement) || "wood";
    this.session = createSession(playerElement, enemyElement);
    return this.snapshot();
  }

  snapshot() {
    const session = this.session;
    return {
      round: session.round,
      player: cloneCombatant(session.player),
      enemy: cloneCombatant(session.enemy)
    };
  }

  act(playerActionInput) {
    if (!this.session) this.reset();
    const session = this.session;
    const playerAction = normalizeActionInput(playerActionInput);
    const enemyAction = chooseEnemyAction(session, playerAction);
    const roundResult = executeRound(session, playerAction, enemyAction);
    return {
      playerAction,
      enemyAction,
      roundResult,
      state: this.snapshot()
    };
  }
}

function createSession(playerElement, enemyElement) {
  return {
    round: 0,
    player: createCombatant("player", playerElement),
    enemy: createCombatant("enemy", enemyElement)
  };
}

function createCombatant(id, element) {
  return {
    id,
    element,
    hp: 120,
    maxHp: 120,
    anger: 0,
    freeDodgeUsed: false,
    statuses: []
  };
}

function executeRound(session, playerInputAction, enemyInputAction) {
  session.round += 1;
  const notes = [];
  let firstDefeated = null;
  const damageTaken = {
    player: 0,
    enemy: 0
  };
  const directDamage = {
    player: 0,
    enemy: 0
  };
  const dotDamageEvents = {
    player: [],
    enemy: []
  };
  const healEvents = {
    player: [],
    enemy: []
  };

  let playerAction = normalizeAction(session.player, playerInputAction, notes);
  let enemyAction = normalizeAction(session.enemy, enemyInputAction, notes);

  if (playerAction === "dodge") {
    spendDodgeAnger(session.player, notes);
  }

  if (enemyAction === "dodge") {
    spendDodgeAnger(session.enemy, notes);
  }

  const bothDodged = playerAction === "dodge" && enemyAction === "dodge";
  const playerDodgedEnemyNormal = playerAction === "dodge" && enemyAction === "normal_attack";
  const enemyDodgedPlayerNormal = enemyAction === "dodge" && playerAction === "normal_attack";

  if (playerAction !== "stunned" && playerAction !== "dodge") {
    if (doesActionHit(playerAction, enemyAction)) {
      const damage = computeDamage(playerAction, session.player, session.enemy);
      applyDamage(session.enemy, damage, (defeatedId) => {
        if (!firstDefeated) firstDefeated = defeatedId;
      });
      damageTaken.enemy += damage;
      directDamage.enemy += damage;
      if (playerAction !== "ultimate") {
        gainAngerOnHit(session.player, session.player.element, session.enemy.element);
      }
      const statusResult = applyAttackStatus(playerAction, session.player, session.enemy, notes);
      if (!statusResult.preventHurtAngerGain) {
        gainAngerOnHurt(session.enemy, damage);
      }
      if (playerAction === "ultimate") {
        applyFixedUltimateHeal(session.player, healEvents, notes);
      }
    } else {
      notes.push("player action missed");
    }
  }

  if (enemyAction !== "stunned" && enemyAction !== "dodge") {
    if (doesActionHit(enemyAction, playerAction)) {
      const damage = computeDamage(enemyAction, session.enemy, session.player);
      applyDamage(session.player, damage, (defeatedId) => {
        if (!firstDefeated) firstDefeated = defeatedId;
      });
      damageTaken.player += damage;
      directDamage.player += damage;
      if (enemyAction !== "ultimate") {
        gainAngerOnHit(session.enemy, session.enemy.element, session.player.element);
      }
      const statusResult = applyAttackStatus(enemyAction, session.enemy, session.player, notes);
      if (!statusResult.preventHurtAngerGain) {
        gainAngerOnHurt(session.player, damage);
      }
      if (enemyAction === "ultimate") {
        applyFixedUltimateHeal(session.enemy, healEvents, notes);
      }
    } else {
      notes.push("enemy action missed");
    }
  }

  if (!bothDodged && playerDodgedEnemyNormal) {
    refundDodgeAnger(session.player, notes);
  }

  if (!bothDodged && enemyDodgedPlayerNormal) {
    refundDodgeAnger(session.enemy, notes);
  }

  applyRoundEndStatusEffects(session, damageTaken, dotDamageEvents, healEvents, notes, {
    onDefeated: (defeatedId) => {
      if (!firstDefeated) firstDefeated = defeatedId;
    }
  });
  reduceStatusDuration(session.player);
  reduceStatusDuration(session.enemy);

  let winner = null;
  if (session.player.hp <= 0 && session.enemy.hp <= 0) {
    if (firstDefeated === "player") {
      winner = "enemy";
    } else if (firstDefeated === "enemy") {
      winner = "player";
    } else {
      winner = "enemy";
    }
  } else if (session.player.hp <= 0) {
    winner = "enemy";
  } else if (session.enemy.hp <= 0) {
    winner = "player";
  }

  return {
    round: session.round,
    actions: {
      player: playerAction,
      enemy: enemyAction
    },
    damageTaken,
    directDamage,
    dotDamageEvents,
    healEvents,
    hpAfter: {
      player: session.player.hp,
      enemy: session.enemy.hp
    },
    angerAfter: {
      player: session.player.anger,
      enemy: session.enemy.anger
    },
    statusesAfter: {
      player: session.player.statuses.map(cloneStatus),
      enemy: session.enemy.statuses.map(cloneStatus)
    },
    winner,
    notes
  };
}

function normalizeActionInput(action) {
  if (!ACTIONS.includes(action)) return "normal_attack";
  return action;
}

function chooseEnemyAction(session, playerAction) {
  const enemy = session.enemy;
  if (enemy.anger >= 100 && Math.random() < 0.35) {
    return "ultimate";
  }

  if (playerAction === "element_attack" && Math.random() < 0.45) {
    return "normal_attack";
  }

  if (playerAction === "normal_attack" && Math.random() < 0.35) {
    return "dodge";
  }

  const dice = Math.random();
  if (dice < 0.25) return "element_attack";
  if (dice < 0.55) return "normal_attack";
  return "dodge";
}

function normalizeAction(player, action, notes) {
  const normalized = normalizeActionInput(action);
  if (normalized === "dodge" && player.anger <= 0 && player.freeDodgeUsed) {
    notes.push(player.id + " dodge downgraded to normal_attack (anger <= 0)");
    return "normal_attack";
  }
  if (normalized === "dodge") {
    player.freeDodgeUsed = true;
  }
  if (normalized === "ultimate" && player.anger < ULTIMATE_ANGER_THRESHOLD) {
    notes.push(
      player.id + " ultimate downgraded to normal_attack (anger < " + ULTIMATE_ANGER_THRESHOLD + ")"
    );
    return "normal_attack";
  }
  if (normalized === "ultimate") {
    player.anger = Math.max(0, player.anger - ULTIMATE_ANGER_COST);
  }
  return normalized;
}

function doesActionHit(attackerAction, defenderAction) {
  if (attackerAction === "dodge") return false;
  if (attackerAction === "ultimate") return true;
  if (defenderAction === "stunned") return true;

  if (attackerAction === "normal_attack" && defenderAction === "dodge") return false;
  if (attackerAction === "element_attack" && defenderAction === "normal_attack") return false;
  return true;
}

function computeDamage(action, attacker, defender) {
  let damage =
    action === "ultimate" ? BASE_DAMAGE.normal_attack * 2 : BASE_DAMAGE[action] ?? BASE_DAMAGE.normal_attack;
  damage *= getElementMultiplier(attacker.element, defender.element);
  const vulnerability = getStatus(defender, "vulnerability");
  if (vulnerability) {
    const stacks = Math.max(1, vulnerability.stacks || 1);
    damage *= Math.pow(1.5, stacks);
  }
  const dulled = getStatus(attacker, "petrify");
  if (dulled) {
    const stacks = Math.max(1, dulled.stacks || 1);
    damage *= Math.pow(0.5, stacks);
  }
  return Math.max(0, Math.round(damage));
}

function getElementMultiplier(attacker, defender) {
  if (ELEMENT_ADVANTAGE_CHAIN[attacker] === defender) return 1.2;
  if (ELEMENT_ADVANTAGE_CHAIN[defender] === attacker) return 0.8;
  return 1;
}

function applyAttackStatus(action, attacker, defender, notes) {
  if (action !== "element_attack" && action !== "ultimate") {
    return { preventHurtAngerGain: false };
  }

  const result = { preventHurtAngerGain: false };

  if (attacker.element === "fire") {
    const status = addOrRefreshStatus(defender, {
      type: "burn",
      duration: ELEMENT_STATUS_DURATION,
      stacks: 1,
      stackable: true,
      sourceId: attacker.id
    });
    notes.push(`enemy burned x${status.stacks || 1}`);
  }
  if (attacker.element === "water") {
    const angerBefore = defender.anger;
    const angerAfter = Math.max(0, Math.floor(angerBefore * 0.5));
    defender.anger = angerAfter;
    notes.push(`enemy anger halved by freeze (${angerBefore}->${angerAfter})`);
    result.preventHurtAngerGain = true;
  }
  if (attacker.element === "wood") {
    const status = addOrRefreshStatus(defender, {
      type: "parasite",
      duration: ELEMENT_STATUS_DURATION,
      potency: 2,
      stacks: 1,
      stackable: true,
      sourceId: attacker.id
    });
    notes.push(`enemy parasitized x${status.stacks || 1}`);
  }
  if (attacker.element === "metal") {
    const status = addOrRefreshStatus(defender, {
      type: "vulnerability",
      duration: ELEMENT_STATUS_DURATION,
      stacks: 1,
      stackable: true,
      sourceId: attacker.id
    });
    notes.push(`enemy vulnerable x${status.stacks || 1}`);
  }
  if (attacker.element === "earth") {
    const status = addOrRefreshStatus(defender, {
      type: "petrify",
      duration: ELEMENT_STATUS_DURATION,
      stacks: 1,
      stackable: true,
      sourceId: attacker.id
    });
    notes.push(`enemy dulled x${status.stacks || 1}`);
  }

  return result;
}

function gainAngerOnHurt(player, damage) {
  player.anger = Math.min(100, player.anger + Math.floor(damage * 0.5));
}

function gainAngerOnHit(player, attackerElement, defenderElement) {
  const advantage = getElementMultiplier(attackerElement, defenderElement) > 1;
  if (advantage) {
    player.anger = Math.min(100, player.anger + 20);
  }
}

function spendDodgeAnger(player, notes) {
  if (player.anger > 0) {
    player.anger = Math.max(0, player.anger - 20);
    notes.push(`${player.id} spends 20 anger on dodge`);
    return;
  }
  notes.push(`${player.id} uses first free dodge`);
}

function refundDodgeAnger(player, notes) {
  player.anger = Math.min(100, player.anger + 30);
  notes.push(`${player.id} dodged normal attack and refunded 30 anger`);
}

function applyRoundEndStatusEffects(
  session,
  damageTaken,
  dotDamageEvents,
  healEvents,
  notes,
  options = {}
) {
  const players = [session.player, session.enemy];
  const onDefeated =
    options && typeof options.onDefeated === "function" ? options.onDefeated : () => {};
  for (const player of players) {
    for (const status of player.statuses) {
      if (status.type === "burn") {
        const burnDamage = Math.max(
          1,
          Math.round(player.hp * BURN_CURRENT_HP_RATIO_PER_STACK * Math.max(1, status.stacks || 1))
        );
        applyDamage(player, burnDamage, onDefeated);
        damageTaken[player.id] += burnDamage;
        dotDamageEvents[player.id].push({ type: "burn", amount: burnDamage });
        notes.push(player.id + " takes burn damage");
      }
      if (status.type === "parasite" && status.potency && status.sourceId) {
        const parasiteDamage = status.potency * Math.max(1, status.stacks || 1);
        applyDamage(player, parasiteDamage, onDefeated);
        damageTaken[player.id] += parasiteDamage;
        dotDamageEvents[player.id].push({ type: "parasite", amount: parasiteDamage });
        const source = players.find((item) => item.id === status.sourceId);
        if (source) {
          const hpBefore = source.hp;
          source.hp = Math.min(source.maxHp, source.hp + parasiteDamage);
          const healAmount = source.hp - hpBefore;
          if (healAmount > 0) {
            healEvents[source.id].push({ type: "parasite", amount: healAmount });
            notes.push(source.id + " healed by parasite");
          }
        }
        notes.push(player.id + " takes parasite damage");
      }
    }
  }
}

function applyFixedUltimateHeal(player, healEvents, notes) {
  const hpBefore = player.hp;
  player.hp = Math.min(player.maxHp, player.hp + ULTIMATE_FIXED_HEAL);
  const healAmount = player.hp - hpBefore;
  if (healAmount <= 0) return;
  healEvents[player.id].push({ type: "ultimate", amount: healAmount });
  notes.push(player.id + " healed by ultimate");
}

function addOrRefreshStatus(player, next) {
  const idx = player.statuses.findIndex((status) => status.type === next.type);
  if (idx === -1) {
    const inserted = { ...next };
    player.statuses.push(inserted);
    return inserted;
  }
  const current = player.statuses[idx];
  const stackable = Boolean(next.stackable);
  const nextStacks = stackable ? Math.min(5, Math.max(1, (current.stacks || 1) + 1)) : 1;
  const addDuration = Math.max(1, Number(next.duration) || 1);
  const mergedDuration = stackable
    ? Math.min(12, Math.max(1, Number(current.duration) || 0) + addDuration)
    : Math.max(Math.max(1, Number(current.duration) || 1), addDuration);
  const merged = {
    ...current,
    ...next,
    stacks: nextStacks,
    duration: mergedDuration
  };
  player.statuses[idx] = merged;
  return merged;
}

function hasStatus(player, type) {
  return player.statuses.some((status) => status.type === type);
}

function getStatus(player, type) {
  return player.statuses.find((status) => status.type === type) || null;
}

function reduceStatusDuration(player) {
  player.statuses = player.statuses
    .map((status) => ({ ...status, duration: status.duration - 1 }))
    .filter((status) => status.duration > 0);
}

function applyDamage(player, damage, onDefeated = null) {
  const wasAlive = player.hp > 0;
  player.hp = Math.max(0, player.hp - damage);
  if (wasAlive && player.hp <= 0 && typeof onDefeated === "function") {
    onDefeated(player.id);
  }
}

function cloneCombatant(player) {
  return {
    ...player,
    statuses: player.statuses.map(cloneStatus)
  };
}

function cloneStatus(status) {
  return { ...status };
}

function normalizeElement(element) {
  if (!ELEMENTS.includes(element)) return null;
  return element;
}

module.exports = {
  BattleRuntimeService,
  createSession,
  getElementMultiplier
};
