// Local embedded PostgreSQL/SQLite checks for the current JWT/actor-bound protocol.
// This entry point deliberately does not load archived runtime_accounts/duel SQL.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';

await import('./tests/cloud-battle-sql.test.mjs');
await import('./tests/authority-save.test.mjs');
const files=['artifacts/battle/cloud/sql-evidence.json','artifacts/battle/cloud/authority-save-evidence.json'];
const suites=files.map(file=>({file,...JSON.parse(readFileSync(file,'utf8'))}));
assert.ok(suites.every(suite=>suite.passed===true&&suite.realCloudVerified===false));
const evidence={at:new Date().toISOString(),provenance:'local-actual-modern-JWT-PGlite-and-canonical-SQLite-only',realCloudVerified:false,archivedProtocolLoaded:false,checks:suites.flatMap(suite=>suite.checks),suites:suites.map(({file,checks})=>({file,checks:checks.length})),passed:true};
writeFileSync('artifacts/battle/postgres-evidence.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify({passed:true,checks:evidence.checks.length,archivedProtocolLoaded:false}));
