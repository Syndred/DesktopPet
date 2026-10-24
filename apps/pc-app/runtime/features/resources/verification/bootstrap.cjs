// Verification-only pre-ready wrapper around the real built foundation application.
// Production integration: foundation calls registerResourceScheme(protocol) before app.ready.
const path = require('node:path');
const { protocol } = require('electron');
require('../index.cjs').registerResourceScheme(protocol);
require(path.resolve(__dirname, '../../../../dist/main/index.cjs'));
