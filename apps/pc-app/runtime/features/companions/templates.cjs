const BASE_STATS = Object.freeze({
  fire: { hp: 118, atk: 33, def: 20, spd: 22 },
  water: { hp: 124, atk: 28, def: 24, spd: 20 },
  wood: { hp: 130, atk: 26, def: 26, spd: 18 },
  metal: { hp: 136, atk: 30, def: 30, spd: 13 },
  earth: { hp: 142, atk: 24, def: 34, spd: 11 }
});

// The shared roster is the sole template-to-appearance association across adoption and battle.
const { listRosterTemplates } = require('../resources/roster.cjs');
const TEMPLATES = listRosterTemplates().map(template => ({ ...template, baseStats: { ...BASE_STATS[template.element] } }));

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function listTemplates() { return clone(TEMPLATES); }
function findTemplate(id) { const item = TEMPLATES.find(template => template.templateId === id); return item ? clone(item) : null; }

module.exports = { listTemplates, findTemplate, BASE_STATS };
