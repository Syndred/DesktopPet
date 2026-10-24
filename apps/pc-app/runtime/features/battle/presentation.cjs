const { getBattleRules } = require('../../services/battle-runtime.cjs');
/** Presentation events describe the committed result; they never resolve combat. */
function visualEvents(round, participants) {
  const events = [];
  const add = (side, phase, kind, data = {}) => events.push({ id: `${round.round}:${side}:${phase}:${kind}:${events.length}`, side, phase, kind, ...data });
  for (const side of ['player', 'enemy']) {
    const action = round.actions[side];
    const target = side === 'player' ? 'enemy' : 'player';
    add(side, 'windup', 'action', { action });
    add(side, 'release', 'action', { action, element: participants[side].element });
    const direct = round.directDamage?.[target];
    if (direct > 0) add(target, 'impact', 'damage', { amount: direct });
    else if (action === 'normal_attack' && round.actions[target] === 'dodge') add(target, 'impact', 'dodge');
    else if (action === 'element_attack' && round.actions[target] === 'normal_attack') add(side, 'impact', 'interrupt');
    for (const event of round.dotDamageEvents?.[side] || []) add(side, 'effects', 'dot', { amount: event.amount, status: event.type });
    for (const event of round.healEvents?.[side] || []) add(side, 'effects', 'heal', { amount: event.amount, status: event.type });
    if (['element_attack', 'ultimate'].includes(action) && direct > 0) {
      if (participants[side].element === 'water') {
        add(target, 'effects', 'anger', { amount: round.angerAfter?.[target] ?? round.state?.[target]?.anger, element: 'water' });
      } else {
        const type = { fire: 'burn', wood: 'parasite', metal: 'vulnerability', earth: 'petrify' }[participants[side].element];
        const applied = (round.statusesAfter?.[target] || round.state?.[target]?.statuses || []).find(status => status.type === type && (!status.sourceId || status.sourceId === side));
        if (applied) add(target, 'effects', 'status', { status: applied.type, element: participants[side].element });
      }
    }
  }
  return events;
}
function presentSession(session) {
  if (!session?.snapshot || !Array.isArray(session.rounds)) return session;
  return { ...session, rules: session.rules || getBattleRules(), rounds: session.rounds.map(round => ({ ...round, visualEvents: visualEvents(round, session) })) };
}
module.exports = { visualEvents, presentSession };
