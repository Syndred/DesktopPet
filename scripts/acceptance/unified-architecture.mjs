import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const root = resolve('.');
const output = resolve(process.argv.find(value => value.endsWith('.json')) || 'artifacts/foundation/unified-battle/architecture.json');
const ui = resolve('apps/pc-app/ui/src/features');
const runtime = resolve('apps/pc-app/runtime/features');
const tracked = ['BattleScreen', 'BattleArena', 'BattleMoves', 'useBattleSession', 'useBattleAnimation', 'useEncounterPose'];
const definitions = Object.fromEntries(tracked.map(name => [name, []]));
const jsx = Object.fromEntries(tracked.map(name => [name, []]));
const oldArenas = [], oldRuleImports = [], legacyFallbacks = [], nonDesktopFallbacks = [], activeRuntime = new Set();
const portable = file => relative(root, file).replaceAll('\\', '/');
function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? /^(tests|verification|assets)$/.test(entry.name) ? [] : files(join(path, entry.name)) : [join(path, entry.name)]);
}
function traceRuntime(file) {
  if (activeRuntime.has(file) || !existsSync(file) || !/\.[cm]?js$/.test(file)) return;
  activeRuntime.add(file);
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text.startsWith('.')) {
      try { traceRuntime(createRequire(file).resolve(node.arguments[0].text)); } catch { /* Missing dependencies are caught by build/runtime acceptance. */ }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
for (const entry of readdirSync(runtime, { withFileTypes: true }).filter(entry => entry.isDirectory())) traceRuntime(join(runtime, entry.name, 'index.cjs'));
for (const file of files(ui).filter(file => /\.[tj]sx?$/.test(file))) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const walk = node => {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name && ts.isIdentifier(node.name) && tracked.includes(node.name.text)) definitions[node.name.text].push(portable(file));
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && ts.isIdentifier(node.tagName) && tracked.includes(node.tagName.text)) jsx[node.tagName.text].push(portable(file));
    if (ts.isStringLiteral(node) && /\bdiscovery-(arena|combatants|battle-actions|round-log)\b/.test(node.text)) oldArenas.push({ file: portable(file), value: node.text });
    ts.forEachChild(node, walk);
  };
  walk(source);
}
for (const file of files(runtime).filter(file => /\.cjs$/.test(file) && !/\.test\.cjs$/.test(file))) {
  const text = readFileSync(file, 'utf8');
  if (activeRuntime.has(file) && /require\([^)]*packages[\\/](?:game-engine|game-core)/.test(text)) oldRuleImports.push(portable(file));
  if (/new\s+LegacyWildBattleAdapter\s*\(/.test(text)) (activeRuntime.has(file) ? legacyFallbacks : nonDesktopFallbacks).push(portable(file));
}
const catalog = JSON.parse(readFileSync('apps/pc-app/runtime/features/resources/assets/roster-v2/catalog.json', 'utf8'));
const elements = Object.fromEntries(['metal', 'wood', 'water', 'fire', 'earth'].map(element => [element, catalog.characters.filter(character => character.element === element).map(character => ({ templateId: character.templateId, resourceId: character.resourceId }))]));
const checks = [];
const add = (id, passed, detail) => checks.push({ id, passed, detail });
for (const name of tracked.filter(name => name !== 'useEncounterPose')) add(`single-definition:${name}`, definitions[name].length === 1, definitions[name]);
add('one-arena-mount', jsx.BattleArena.length === 1 && jsx.BattleArena[0].endsWith('/battle/BattleScreen.tsx'), jsx.BattleArena);
add('one-moves-mount', jsx.BattleMoves.length === 1 && jsx.BattleMoves[0].endsWith('/battle/BattleArena.tsx'), jsx.BattleMoves);
add('no-separate-wild-animation-or-arena', definitions.useEncounterPose.length === 0 && oldArenas.length === 0, { definitions: definitions.useEncounterPose, oldArenas });
add('no-active-legacy-wild-fallback', legacyFallbacks.length === 0, legacyFallbacks);
add('no-active-legacy-package-rules', oldRuleImports.length === 0, oldRuleImports);
add('complete-five-element-roster', Object.values(elements).every(characters => characters.length > 0), elements);
add('eight-distinct-canonical-appearances', catalog.characters.length >= 8 && new Set(catalog.characters.map(character => character.resourceId)).size === catalog.characters.length, catalog.characters.map(character => ({ id: character.id, element: character.element, resourceId: character.resourceId })));
const board = 'docs/design/2026-10-24/full-ui/02-exploration-and-battle.png';
const proof = { at: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceDirtyFiles: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean), scope: 'Source architecture preflight only; actual Electron four-entry flow and visual/animation acceptance are separate requirements. Active runtime follows static local requires from the desktop feature registry; server-only compatibility is recorded separately.', board: { path: board, sha256: createHash('sha256').update(readFileSync(board)).digest('hex') }, activeRuntime: [...activeRuntime].map(portable).sort(), nonDesktopFallbacks, definitions, jsx, checks, passed: checks.every(check => check.passed) };
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(proof, null, 2));
console.log(JSON.stringify({ output, passed: proof.passed, checks: checks.map(({ id, passed }) => ({ id, passed })) }));
if (process.argv.includes('--require-pass') && !proof.passed) process.exitCode = 1;
