// The same roster JSON and instance rules also execute in the cloud adapter.
const { BASE_STATS, listBuiltinTemplates } = require('./instance.mjs');
const TEMPLATES = listBuiltinTemplates();

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function listTemplates() { return clone(TEMPLATES); }
function findTemplate(id) { const item = TEMPLATES.find(template => template.templateId === id); return item ? clone(item) : null; }

module.exports = { listTemplates, findTemplate, BASE_STATS };
