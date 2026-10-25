import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Read-only requests against the actual deployed project. No user credentials,
// service keys, database fixture or simulated transport are accepted here.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const configText = readFileSync(resolve(root, 'config/lingjing-cloud-public.json'), 'utf8');
const config = JSON.parse(configText);
assert.match(config.publishableKey, /^sb_publishable_/);
assert.equal(new URL(config.url).protocol, 'https:');
const checks = [
  { name: 'managed Auth health', path: '/auth/v1/health', statuses: [200] },
  { name: 'anonymous actor refused', path: '/functions/v1/lingjing-auth', body: { op: 'actor' }, statuses: [401], code: 'AUTH_REQUIRED' },
  { name: 'anonymous save refused', path: '/functions/v1/lingjing-save', body: { op: 'read' }, statuses: [401], code: 'AUTH_REQUIRED' },
  { name: 'anonymous accounts hidden', path: '/rest/v1/lingjing_accounts?select=owner_id', statuses: [401, 403], code: '42501' },
  { name: 'anonymous saves hidden', path: '/rest/v1/lingjing_saves?select=owner_id', statuses: [401, 403], code: '42501' },
  { name: 'authority RPC is server-only', path: '/rest/v1/rpc/lingjing_commit_authority', body: { p_owner_id: 'untrusted-public-probe', p_action_id: 'public-probe-authority', p_fragments: { garden: { module: { version: 1, data: { coins: 999 } } } } }, statuses: [401, 403], code: '42501' },
  { name: 'old public application table unavailable', path: '/rest/v1/user?select=id', statuses: [404], code: 'PGRST205' },
  { name: 'private archive not an exposed schema', path: '/rest/v1/user?select=id', headers: { 'Accept-Profile': 'comparisontext_archive_20261025' }, statuses: [406], code: 'PGRST106' },
];
const evidence = {
  at: new Date().toISOString(), projectRef: config.projectRef,
  kind: 'read-only actual HTTPS public boundary on deployed Supabase; no simulation',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  publicConfigSha256: createHash('sha256').update(configText).digest('hex'),
  credentialsIncluded: false,
  checks: await Promise.all(checks.map(async check => {
    const response = await fetch(config.url + check.path, {
      method: check.body ? 'POST' : 'GET',
      headers: { apikey: config.publishableKey, ...(check.body ? { 'Content-Type': 'application/json' } : {}), ...check.headers },
      ...(check.body ? { body: JSON.stringify(check.body) } : {}), signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json().catch(() => ({}));
    return { name: check.name, status: response.status, ...(result.code ? { code: result.code } : {}),
      passed: check.statuses.includes(response.status) && (!check.code || result.code === check.code) };
  })),
};
evidence.passed = evidence.checks.every(check => check.passed);
const output = resolve(root, 'artifacts/cloud-upgrade/2026-10-25/public-boundary-http.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ passed: evidence.passed, output, checks: evidence.checks }, null, 2));
if (!evidence.passed) process.exitCode = 1;
