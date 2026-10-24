import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { MARKER, SCENARIO } = require('../../apps/pc-app/runtime/core/qa-scenario.cjs');
const runId = randomUUID();
const root = resolve('artifacts/qa/unified-battle');
mkdirSync(root, { recursive: true });
const profilePath = join(root, `qa-${Date.now()}-${runId.slice(0, 8)}`);
mkdirSync(profilePath); // Never add a QA marker to an existing save directory.
const marker = { schemaVersion: 1, application: 'lingjing', scenario: SCENARIO, runId, isolated: true, profilePath: realpathSync(profilePath), createdAt: new Date().toISOString() };
writeFileSync(join(profilePath, MARKER), JSON.stringify(marker, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ ...marker, env: { LINGJING_QA_SCENARIO: SCENARIO, PET_USER_DATA_DIR: marker.profilePath } }, null, 2));
