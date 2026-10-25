import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const flags = process.argv.slice(2);
if (flags.some(flag => flag !== '--allow-legacy-drafts')) throw new Error('Unknown cloud source check argument');
const allowLegacyDrafts = flags.includes('--allow-legacy-drafts');
const npmCli = process.env.npm_execpath;
if (!npmCli || !existsSync(npmCli)) throw new Error('Run this entry through npm run verify:cloud');
const runId = `run-${Date.now()}`;
const directory = resolve(root, 'artifacts/foundation/cloud-engineering/cloud-source-check', runId);
const reportFile = resolve(directory, '../../cloud-source-check.json');
mkdirSync(directory, { recursive: true });

// No cloud endpoint, key, session, profile, actor override or Node preload is
// inherited by these local fixture checks. Public npm packages may be fetched.
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  !/SUPABASE|SECRET|TOKEN|PASSWORD|CREDENTIAL|^LINGJING_|^ACCOUNTS_|^PET_USER_DATA_DIR$|^ELECTRON_|^NODE_OPTIONS$|^NODE_PATH$/i.test(name)));
Object.assign(env, { NO_COLOR: '1', DENO_NO_UPDATE_CHECK: '1' });
const report = {
  schemaVersion: 1,
  runId,
  at: new Date().toISOString(),
  platform: process.platform,
  nodeVersion: process.versions.node,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceChanges: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trimEnd().split(/\r?\n/).filter(Boolean),
  provenance: 'local-source-comparison-and-explicit-PostgreSQL-WASM-SQLite-Deno-fixtures',
  realCloudVerified: false,
  fullPostgisResetVerified: false,
  requiresCloudCredentials: false,
  requiresDocker: false,
  strictMigrationGate: !allowLegacyDrafts,
  denoVersion: '2.9.6',
  stages: [],
  passed: false,
};

async function run(name, executable, args) {
  const log = resolve(directory, `${name}.log`), started = Date.now();
  writeFileSync(log, '');
  console.log(`\n[cloud source] ${name}`);
  const result = await new Promise(resolveResult => {
    const child = spawn(executable, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let problem;
    const append = chunk => { appendFileSync(log, chunk); process.stdout.write(chunk); };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', error => { problem = error.message; });
    child.on('close', (code, signal) => resolveResult({ code, signal, ...(problem ? { error: problem } : {}) }));
  });
  const stage = { name, ...result, durationMs: Date.now() - started, log: `cloud-source-check/${runId}/${name}.log`, passed: result.code === 0 };
  report.stages.push(stage);
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  if (!stage.passed) throw new Error(`Cloud source stage failed: ${name}; see ${stage.log}`);
}

const generatedFiles = [
  'apps/pc-app/runtime/features/battle/core.generated.cjs',
  'infra/supabase/functions/lingjing-battle/runtime.generated.mjs',
  'infra/supabase/functions/lingjing-battle/runtime.generated.json',
  'infra/supabase/functions/_shared/garden-runtime.bundle.mjs',
  'infra/supabase/functions/_shared/garden-runtime.sources.json',
  'infra/supabase/functions/discovery/_generated/runtime.mjs',
  'infra/supabase/functions/discovery/_generated/provenance.json',
];
const snapshot = () => generatedFiles.map(file => ({ path: file, mtimeMs: statSync(resolve(root, file)).mtimeMs,
  sha256: createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex') }));

// Deliberate allow-list: excludes old draft-contract tests, live HTTPS, physical
// location and business UI acceptance. PGlite files run one at a time.
const tests = [
  'scripts/cloud/check-migrations.test.mjs',
  'scripts/cloud/migration-preservation-replay.test.mjs',
  'apps/pc-app/runtime/features/accounts/tests/cloud-identity-sql.test.mjs',
  'apps/pc-app/runtime/features/accounts/tests/cloud-session-upgrade-sql.test.mjs',
  'apps/pc-app/runtime/features/accounts/tests/cloud-service-actor-sql.test.mjs',
  'apps/pc-app/runtime/features/accounts/tests/cloud-save-sql.test.mjs',
  'apps/pc-app/runtime/features/accounts/tests/global-serial-sql.test.mjs',
  'apps/pc-app/runtime/features/companions/tests/cloud-command-sql.test.mjs',
  'apps/pc-app/runtime/features/companions/tests/cloud-domain.test.mjs',
  'apps/pc-app/runtime/features/companions/tests/cloud-growth.test.mjs',
  'apps/pc-app/runtime/features/discovery/tests/cloud-authority.test.mjs',
  'apps/pc-app/runtime/features/discovery/tests/cloud-actor-guard.test.mjs',
  'apps/pc-app/runtime/features/discovery/tests/cloud-game-sql.test.mjs',
  'apps/pc-app/runtime/features/discovery/tests/cloud-handler.test.mjs',
  'apps/pc-app/runtime/features/discovery/tests/cloud-protocol.test.mjs',
  'apps/pc-app/runtime/features/discovery/tests/cloud-location-sql.test.mjs',
  'apps/pc-app/runtime/features/discovery/tests/cloud-runtime.test.mjs',
  'apps/pc-app/runtime/features/discovery/tests/global-serial.test.mjs',
  'apps/pc-app/runtime/features/battle/tests/cloud-battle-sql.test.mjs',
  'apps/pc-app/runtime/features/battle/tests/invite-expiry-sql.test.mjs',
  'apps/pc-app/runtime/features/battle/tests/serial-views-sql.test.mjs',
  'apps/pc-app/runtime/features/battle/tests/authority-save.test.mjs',
  'apps/pc-app/runtime/features/battle/tests/trusted-pet.test.mjs',
  'apps/pc-app/runtime/features/resources/verification/storage-rls-sql.test.mjs',
  'scripts/acceptance/cloud-territory/save-cas.test.mjs',
  'scripts/acceptance/cloud-territory/receipt-expression.test.mjs',
  'scripts/acceptance/cloud-territory/serial-views-sql.test.mjs',
  'scripts/acceptance/cloud-territory/serial-views.test.mjs',
];

try {
  await run('migration-filenames', process.execPath, ['scripts/cloud/check-migrations.mjs', ...flags]);
  const before = snapshot();
  for (const [name, script] of [
    ['battle-core', 'scripts/battle/build-core.mjs'],
    ['battle-cloud', 'scripts/battle/build-cloud.mjs'],
    ['garden-cloud', 'scripts/acceptance/cloud-territory/build-edge.mjs'],
    ['discovery-cloud', 'apps/pc-app/runtime/features/discovery/verification/build-cloud.mjs'],
  ]) await run(name, process.execPath, [script, '--check']);
  if (JSON.stringify(before) !== JSON.stringify(snapshot())) throw new Error('A generation --check modified a checked-in distribution');
  report.generatedFilesUnchanged = before;
  report.nodeTestFiles = tests;
  await run('modern-sql-authority', process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', ...tests]);
  await run('deno-version', process.execPath, [npmCli, 'exec', '--yes', '--package=deno@2.9.6', '--', 'deno', '--version']);
  await run('resource-deno', process.execPath, [npmCli, 'exec', '--yes', '--package=deno@2.9.6', '--',
    'deno', 'test', '--no-config', '--node-modules-dir=none',
    '--lock=infra/supabase/functions/lingjing-resources/deno.lock', '--frozen', '--no-prompt', `--allow-read=${root}`,
    'infra/supabase/functions/lingjing-resources/package.test.ts']);
  await run('battle-display-deno', process.execPath, [npmCli, 'exec', '--yes', '--package=deno@2.9.6', '--',
    'deno', 'test', '--no-config', '--node-modules-dir=none',
    '--lock=infra/supabase/functions/_shared/deno.lock', '--frozen', '--no-prompt',
    'infra/supabase/functions/lingjing-battle/handler.test.ts',
    'infra/supabase/functions/lingjing-battle/serial-views.test.ts']);
  report.passed = true;
  console.log(`Cloud source checks passed (${tests.length} Node test files and local Deno validators; strict migrations: ${!allowLegacyDrafts}).`);
} catch (error) {
  report.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  console.log(`Evidence: ${reportFile}`);
}
