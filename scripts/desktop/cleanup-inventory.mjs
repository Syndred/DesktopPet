import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve('.');
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const groups = [
  { paths: ['apps/pc-app/runtime/main.cjs'], replacement: 'apps/pc-app/runtime/main/index.ts + core/runtime-compat.cjs', decision: 'extract-required-services-then-delete', consumers: ['apps/pc-app/runtime/main/index.ts', 'apps/pc-app/runtime/features/companions/tests/electron.acceptance.mjs', 'tests/task-d001-pc-runnable-runtime.test.ts', 'tests/task-d008-pc-online-duel-runtime.test.ts', 'scripts/smoke/check-pc-runtime.mjs'] },
  { paths: ['apps/pc-app/runtime/main.mjs', 'apps/pc-app/runtime/preload.mjs', 'apps/pc-app/runtime/preload.cjs', 'apps/pc-app/runtime/package.json', 'scripts/desktop/run-electron.cjs'], replacement: 'root package main -> dist/main/index.cjs; runtime/preload/index.ts', decision: 'delete-obsolete-alternate-entry', consumers: ['package.json', 'tests/task-d001-pc-runnable-runtime.test.ts', 'tests/task-d008-pc-online-duel-runtime.test.ts', 'scripts/smoke/check-pc-runtime.mjs'] },
  { paths: ['apps/pc-app/runtime/renderer/', 'apps/pc-app/runtime/auth/'], replacement: 'apps/pc-app/ui/index.html + ui/src/app + registered feature routes', decision: 'delete-obsolete-html-renderer', consumers: ['apps/pc-app/runtime/main.cjs', 'apps/pc-app/runtime/main.mjs', 'tests/task-d001-pc-runnable-runtime.test.ts', 'tests/task-d008-pc-online-duel-runtime.test.ts', 'scripts/smoke/check-pc-runtime.mjs'] },
  { paths: ['apps/pc-app/runtime/assets/models/', 'apps/pc-app/runtime/features/resources/legacy/'], replacement: 'Canonical roster-v2 sprites; preserve original model strings only as historical aliases', decision: 'resources-owner-delivery-required-before-final-deletion', consumers: ['apps/pc-app/runtime/services/runtime-data-store.cjs', 'apps/pc-app/runtime/services/wild-pet-runtime.cjs', 'apps/pc-app/runtime/features/resources/service.cjs', 'tests/task-d001-pc-runnable-runtime.test.ts'] },
  { paths: ['apps/pc-app/runtime/services/runtime-data-store.cjs'], replacement: 'Retained formal compatibility capability, consumed by account archive/import adapters', decision: 'retain-required-data-reader', consumers: ['apps/pc-app/runtime/core/runtime-compat.cjs', 'apps/pc-app/runtime/features/accounts/legacy.cjs', 'apps/pc-app/runtime/features/companions/index.cjs', 'apps/pc-app/runtime/features/battle/service.cjs', 'apps/pc-app/runtime/features/conversations/index.cjs'] },
  { paths: ['apps/pc-app/runtime/services/map-runtime.cjs', 'apps/pc-app/runtime/services/online-duel-service.cjs', 'apps/pc-app/runtime/services/wild-pet-runtime.cjs'], replacement: 'Required map/online/domain services until approved cloud owners replace consumers', decision: 'retain-required-domain-services', consumers: ['apps/pc-app/runtime/features/discovery/map-adapter.cjs', 'apps/pc-app/runtime/features/discovery/server-authority.cjs', 'apps/pc-app/runtime/features/accounts/remote.cjs', 'apps/pc-app/runtime/features/battle/service.cjs', 'apps/pc-app/runtime/features/garden/cloud-authority.cjs'] },
  { paths: ['packages/game-engine/', 'apps/pc-app/src/', 'apps/supabase-edge/src/', 'scripts/release/build-mobile.mjs'], replacement: 'Formal desktop features and reviewed cloud functions/release pipeline', decision: 'audit-consumers-and-await-domain-replacement-before-deletion', consumers: ['tests/', 'apps/supabase-edge/src/', 'packages/game-engine/src/', '.github/workflows/release.yml', 'scripts/release/build-pc.mjs'] }
];
const texts = tracked.filter(file => /\.(?:[cm]?js|tsx?|json|ya?ml|md|txt)$/.test(file) && !file.startsWith('docs/implementation/evidence/') && existsSync(file));
const entries = [];
for (const group of groups) for (const file of tracked.filter(file => group.paths.some(prefix => prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix))) {
  const bytes = readFileSync(file), needle = file.startsWith('apps/pc-app/runtime/') ? file.slice('apps/pc-app/runtime/'.length) : file;
  const consumers = new Set(group.consumers.filter(path => existsSync(path)));
  for (const candidate of texts) {
    if (candidate === file) continue;
    const source = readFileSync(candidate, 'utf8');
    if (source.includes(file) || source.includes(needle)) consumers.add(candidate);
  }
  entries.push({ oldFile: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), replacement: group.replacement, consumers: [...consumers].sort(), decision: group.decision });
}
const proof = { schemaVersion: 1, at: new Date().toISOString(), source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  snapshot: 'artifacts/recovery/cloud-foundation-2026-10-25/pre-cleanup.bundle',
  policy: 'Only listed code/build/test consumers are candidates. User profiles, history, design sources and recovery backups are excluded. Runtime source removal follows service extraction; business-owner replacements wait for coordinator approval.',
  protected: ['docs/design/', 'artifacts/cloud-upgrade/2026-10-25/comparisontext-backup', 'C:/Users/Administrator/.codex/backups/DesktopPet/2026-10-25/comparisontext', 'User AppData and all save/profile/history/resource paths'], entries };
const output = resolve('docs/implementation/cleanup/cloud-foundation-inventory.json');
const previous = existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : {};
const retained = new Map((previous.entries || []).map(entry => [entry.oldFile, entry]));
for (const entry of entries) {
  const original = retained.get(entry.oldFile);
  retained.set(entry.oldFile, original ? { ...original, latestConsumerAudit: { at: proof.at, consumers: entry.consumers } } : entry);
}
// Preserve pre-deletion hashes, manual approval decisions and completed records.
const merged = { ...previous, ...proof, entries: [...retained.values()] };
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(merged, null, 2) + '\n');
console.log(JSON.stringify({ output, entries: merged.entries.length, decisions: Object.fromEntries([...new Set(merged.entries.map(x => x.decision))].map(decision => [decision, merged.entries.filter(x => x.decision === decision).length])) }));
