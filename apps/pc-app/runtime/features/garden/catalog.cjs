"use strict";
// Shared by local SQLite settlement and the authoritative cloud reducer.
// Original balance data; no third-party game code or artwork is bundled.
const catalog = require('./catalog.json');
module.exports = Object.freeze(catalog);
