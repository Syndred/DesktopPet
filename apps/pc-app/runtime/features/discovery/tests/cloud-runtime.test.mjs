import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as cloud from '../../../../../../infra/supabase/functions/discovery/_generated/runtime.mjs';
const require = createRequire(import.meta.url), current = require('../../../services/battle-runtime.cjs');
const spawns = require('../spawns.cjs');
test('self-contained cloud distribution matches the current authoritative rules, presentation and all25 ordered element pairs', () => {
  assert.deepEqual(cloud.getBattleRules(), current.getBattleRules());
  for (const playerElement of ['metal', 'wood', 'water', 'fire', 'earth']) for (const enemyElement of ['metal', 'wood', 'water', 'fire', 'earth']) {
    const base = new current.BattleRuntimeService().reset({ playerElement, enemyElement });
    for (const action of ['normal_attack', 'element_attack', 'dodge', 'ultimate']) {
      const actual = structuredClone(base), expected = structuredClone(base); actual.player.anger = expected.player.anger = 100;
      assert.deepEqual(cloud.executeRound(actual, action, 'normal_attack'), current.executeRound(expected, action, 'normal_attack'));
      assert.deepEqual(actual, expected);
    }
  }
  for (const position of [{ lat: 31.2, lng: 121.4 }, { lat: 22.5, lng: 114.1 }, { lat: 51.5, lng: -.1 }]) assert.deepEqual(cloud.nearbySpawns(position, 1792895000000), spawns.nearbySpawns(position, 1792895000000));
});
test('cloud bundle records exact source hashes and all eight canonical resources', () => {
  const proof = JSON.parse(readFileSync('infra/supabase/functions/discovery/_generated/provenance.json', 'utf8'));
  const code = readFileSync('infra/supabase/functions/discovery/_generated/runtime.mjs', 'utf8');
  assert.equal(proof.coreImport, '../../_shared/battle-core.js');
  assert.match(code, /from "\.\.\/\.\.\/_shared\/battle-core\.js"/);
  assert.doesNotMatch(code, /function executeRound|class BattleRuntimeService|BASE_DAMAGE\s*=/);
  for (const [file, expected] of Object.entries(proof.sourceFiles)) assert.equal(createHash('sha256').update(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex'), expected);
  assert.equal(proof.catalog.length, 8); assert.equal(new Set(proof.catalog.map(t => t.element)).size, 5);
});
