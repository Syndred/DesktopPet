import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const source = resolve(process.argv[2]), fixture = JSON.parse(readFileSync(resolve(process.argv[3]), 'utf8')), output = resolve(process.argv[4]); mkdirSync(output, { recursive: true });
const { _electron: electron } = createRequire(join(source, 'package.json'))('playwright');
const old = fixture.sessions.find(session => session.player === 'metal' && session.status === 'abandoned'), finished = fixture.sessions.find(session => session.status === 'finished'); assert.ok(old && finished);
const readStored = () => { const db = new DatabaseSync(join(fixture.profile, 'lingjing.sqlite'), { readOnly: true }); try { return { sessions: db.prepare('SELECT id,data_json FROM battle_sessions ORDER BY id').all(), reports: db.prepare('SELECT id,data_json FROM battle_reports ORDER BY id').all() }; } finally { db.close(); } };
const before = readStored(), saved = JSON.parse(before.sessions.find(row => row.id === old.id).data_json);
const proof = { at: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(), profile: fixture.profile, ordinaryHistoricalFixture: true, sessionId: old.id, reportId: finished.id, checks: [], errors: [] };
const save = () => writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2));
const check = (id, passed, detail) => { proof.checks.push({ id, passed: Boolean(passed), detail }); save(); assert.ok(passed, id); };
const env = { ...process.env, PET_USER_DATA_DIR: fixture.profile }; delete env.ELECTRON_RUN_AS_NODE; delete env.LINGJING_QA_SCENARIO; delete env.PET_RUNTIME_DATA_FILE;
const app = await electron.launch({ args: [source], cwd: source, env }); let page;
try {
  page = await app.firstWindow(); page.on('pageerror', error => proof.errors.push(error.message)); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 844));
  await page.waitForFunction(() => Boolean(window.lingjing)); await page.getByRole('navigation', { name: '主导航' }).waitFor();
  const invoke = async (command, payload = {}) => { const result = await page.evaluate(input => window.lingjing.invoke('battle', input.command, input.payload), { command, payload }); assert.equal(result.ok, true, JSON.stringify(result)); return result.data; };
  const session = await invoke('snapshot', { sessionId: old.id });
  check('legacy-same-version-display-metadata', session.rules.id === saved.rules.id && session.rules.elementEffects?.metal?.label === '易伤' && session.rules.advantage?.fire === 'metal', session.rules);
  assert.deepEqual(session.snapshot, saved.snapshot); assert.deepEqual(session.rules.baseDamage, saved.rules.baseDamage);
  check('legacy-numbers-and-outcome-preserved', session.status === saved.status && session.winner === saved.winner && session.rules.maxHp === saved.rules.maxHp && session.rules.ultimateCost === saved.rules.ultimateCost, { status: session.status, round: session.snapshot.round, before: saved.snapshot, after: session.snapshot });
  await page.evaluate(id => { location.hash = `#/battle/session/${id}`; }, old.id);
  await page.locator(`[data-session-id="${old.id}"]`).waitFor(); await page.waitForFunction(() => document.querySelectorAll('.battle-stage .resource-stage[data-status="ready"]').length === 2);
  check('legacy-visible-affinity-correct', await page.locator('.battle-affinity').getAttribute('aria-label') === '受制 ×0.8' && await page.locator('[data-animation-phase]').getAttribute('data-animation-phase') === 'rest', { affinity: await page.locator('.battle-affinity').getAttribute('aria-label') });
  await page.screenshot({ path: join(output, 'legacy-session.png') });
  const report = await invoke('getReport', { reportId: finished.id });
  check('legacy-report-display-metadata', report.rules?.elementEffects?.metal?.label === '易伤' && report.rules.advantage?.metal === 'wood' && report.rounds.length === fixture.sessions.find(session => session.id === finished.id).round, { rules: report.rules, rounds: report.rounds.length });
  await page.evaluate(id => { location.hash = `#/battle/reports/${id}`; }, finished.id); await page.waitForTimeout(550); await page.screenshot({ path: join(output, 'legacy-report.png') });
  check('read-projection-does-not-rewrite-history', JSON.stringify(readStored()) === JSON.stringify(before), { sessionCount: before.sessions.length, reportCount: before.reports.length });
  check('no-renderer-errors', proof.errors.length === 0, proof.errors); proof.passed = true; proof.completedAt = new Date().toISOString(); save(); console.log(JSON.stringify({ passed: true, checks: proof.checks.length, output }, null, 2));
} catch (error) { proof.passed = false; proof.failure = String(error); save(); await page?.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); throw error; }
finally { await app.close(); }
