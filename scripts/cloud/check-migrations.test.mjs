import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkMigrationNames, legacyDrafts, manifest } from './check-migrations.mjs';
const expectedFiles=[...manifest.files,...(manifest.pendingReviewFiles||[])];

test('approved migration filenames exactly match the reviewed actual-ledger alignment', () => {
  const ledger = JSON.parse(readFileSync(new URL(`../../${manifest.ledgerEvidence}`, import.meta.url), 'utf8'));
  assert.deepEqual(manifest.files, ledger.entries.map(entry => entry.target.split('/').at(-1)).sort());
  const check=checkMigrationNames(expectedFiles);
  assert.equal(check.strict, true);
  assert.equal(check.deployedMigrationCount,ledger.entries.length);
  assert.deepEqual(check.pendingReviewFiles,manifest.pendingReviewFiles||[]);
});

test('retired drafts are rejected even when all modern migrations are present', () => {
  for (const draft of legacyDrafts) assert.throws(() => checkMigrationNames([...expectedFiles, draft]), /Migration filename gate failed/);
  const transition = checkMigrationNames([...expectedFiles, ...legacyDrafts], { allowLegacyDrafts: true });
  assert.equal(transition.strict, false);
  assert.equal(transition.legacyDrafts.length, 9);
});

test('a missing, renamed or unexpected migration cannot silently replace the deployed filename', () => {
  assert.throws(() => checkMigrationNames(expectedFiles.slice(1)), /Migration filename gate failed/);
  assert.throws(() => checkMigrationNames([...expectedFiles.slice(1), '20261025015844_preserve_comparisontext_before_lingjing.sql']), /Migration filename gate failed/);
  assert.throws(() => checkMigrationNames([...expectedFiles, '20261026000000_unreviewed.sql'], { allowLegacyDrafts: true }), /Migration filename gate failed/);
});
