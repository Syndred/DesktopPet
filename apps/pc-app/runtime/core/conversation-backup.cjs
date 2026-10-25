// Compatibility entry for foundation's existing startup and backup tests.
// The domain implementation is owned by conversations; 01 may remove this bridge
// after switching consumers to services.get('conversations').createBackupAdapter().
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS compatibility entry.
module.exports = require('../features/conversations/backup.cjs');
