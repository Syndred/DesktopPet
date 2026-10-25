import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const manifest = JSON.parse(readFileSync(new URL('./migration-manifest.json', import.meta.url), 'utf8'));
export const legacyDrafts = [
  '0001_core_schema.sql',
  '0002_pet_inventory_battle_reports.sql',
  '0003_duel_realtime_schema.sql',
  '0004_runtime_cloud_auth_duel_requests.sql',
  '0005_runtime_single_login_session.sql',
  '20261024_accounts_save_sync.sql',
  '20261024_discovery_authority.sql',
  '20261024_garden_authority.sql',
  '20261024_lingjing_battle_atomic_rounds.sql',
];

export function checkMigrationNames(files, { allowLegacyDrafts = false, approvedManifest = manifest } = {}) {
  const deployed = approvedManifest.files, pendingReview = approvedManifest.pendingReviewFiles || [];
  const expected = [...deployed, ...pendingReview];
  if (approvedManifest.schemaVersion !== 1 || !Number.isSafeInteger(approvedManifest.expectedDeployedCount)
    || approvedManifest.expectedDeployedCount < 1 || deployed.length !== approvedManifest.expectedDeployedCount || new Set(expected).size !== expected.length ||
    expected.some(name => !/^\d{14}_[a-z0-9_]+\.sql$/.test(name)) ||
    new Set(expected.map(name => name.slice(0, 14))).size !== expected.length ||
    expected.join('\n') !== [...expected].sort().join('\n')) throw new Error('Invalid approved migration manifest');
  const missing = expected.filter(name => !files.includes(name));
  const legacy = files.filter(name => legacyDrafts.includes(name)).sort();
  const unexpected = files.filter(name => !expected.includes(name) && !(allowLegacyDrafts && legacyDrafts.includes(name))).sort();
  if (missing.length || unexpected.length) {
    throw new Error(`Migration filename gate failed: ${JSON.stringify({ missing, unexpected, legacyDrafts: legacy })}`);
  }
  return { passed: true, strict: !allowLegacyDrafts, migrationCount: expected.length, deployedMigrationCount: deployed.length,
    pendingReviewFiles: pendingReview, legacyDrafts: legacy, files: expected };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const flags = process.argv.slice(2);
    if (flags.some(flag => flag !== '--allow-legacy-drafts')) throw new Error('Unknown migration check argument');
    const directory = new URL('../../infra/supabase/migrations/', import.meta.url);
    const files = readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isFile() && /\.sql$/i.test(entry.name)).map(entry => entry.name);
    console.log(JSON.stringify(checkMigrationNames(files, { allowLegacyDrafts: flags.includes('--allow-legacy-drafts') })));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
