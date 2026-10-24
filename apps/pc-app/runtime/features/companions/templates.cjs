const BASE_STATS = Object.freeze({
  fire: { hp: 118, atk: 33, def: 20, spd: 22 },
  water: { hp: 124, atk: 28, def: 24, spd: 20 },
  wood: { hp: 130, atk: 26, def: 26, spd: 18 },
  metal: { hp: 136, atk: 30, def: 30, spd: 13 },
  earth: { hp: 142, atk: 24, def: 34, spd: 11 }
});

const TEMPLATES = [
  ['big-fish-gentle', '鱼丸', 'big-fish', '安静温柔，喜欢陪你度过日常。', 'water', '2d', 'builtin:lingjing-yuwan-v1'],
  ['big-fish-cheerful', '小蓝', 'big-fish', '活泼开朗，总能带来好心情。', 'water', '2d', 'builtin:lingjing-yuwan-v1'],
  ['big-fish-foodie', '饭团', 'big-fish', '对美食毫无抵抗力，也珍惜每一份陪伴。', 'water', '2d', 'builtin:lingjing-yuwan-v1']
].map(([templateId, name, category, description, element, kind, resourceId, legacyModel]) => ({
  templateId, name, category, description, element,
  resource: { resourceId, kind, ...(legacyModel ? { legacyModel } : {}) },
  baseStats: { ...BASE_STATS[element] }
}));

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function listTemplates() { return clone(TEMPLATES); }
function findTemplate(id) { const item = TEMPLATES.find(template => template.templateId === id); return item ? clone(item) : null; }

module.exports = { listTemplates, findTemplate, BASE_STATS };
