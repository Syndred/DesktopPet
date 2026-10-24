"use strict";
// Test utility reuses the production registration adapter against the real service.
function companionAdapter(service, db) {
  const { companionAdapter: adapter } = require('./index.cjs');
  return adapter({ db, get: name => name === 'companions' ? service : null });
}
module.exports = { companionAdapter };
