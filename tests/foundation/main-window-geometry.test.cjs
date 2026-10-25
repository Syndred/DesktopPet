// SIMULATED geometry fixtures only. No Windows app, mouse, DPI setting or user profile is operated.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mainWindowDisplayProbe, fitMainWindowBounds } = require('../../apps/pc-app/runtime/core/main-window-geometry.cjs');

test('SIMULATED: valid saved size and position stay unchanged', () => {
  const saved = { x: 100, y: 80, width: 1280, height: 800 };
  assert.deepEqual(fitMainWindowBounds(saved, { x: 0, y: 0, width: 1920, height: 1040 }), { ...saved, minWidth: 960, minHeight: 700 });
  assert.deepEqual(mainWindowDisplayProbe(saved), { x: 100, y: 80, width: 100, height: 100 });
});

test('SIMULATED: a short high-DPI work area cannot conflict with the native minimum', () => {
  const result = fitMainWindowBounds({ x: 50, y: 30, width: 1320, height: 900 }, { x: 0, y: 0, width: 1280, height: 680 });
  assert.deepEqual(result, { x: 0, y: 0, width: 1280, height: 680, minWidth: 960, minHeight: 680 });
});

test('SIMULATED: both minima fit a small secondary work area with a negative origin', () => {
  assert.deepEqual(fitMainWindowBounds({ x: -1500, y: -100, width: 1320, height: 900 }, { x: -1280, y: -40, width: 800, height: 560 }), {
    x: -1280, y: -40, width: 800, height: 560, minWidth: 800, minHeight: 560,
  });
});

test('SIMULATED: a disconnected display only clamps position when the saved size still fits', () => {
  assert.deepEqual(fitMainWindowBounds({ x: 4000, y: 2000, width: 1200, height: 800 }, { x: 0, y: 0, width: 1920, height: 1040 }), {
    x: 720, y: 240, width: 1200, height: 800, minWidth: 960, minHeight: 700,
  });
});

test('SIMULATED: absent or invalid coordinates use a safe display probe and centered defaults', () => {
  for (const saved of [undefined, null, [], { x: Infinity, y: NaN }, { x: 1e100, y: 0 }]) assert.equal(mainWindowDisplayProbe(saved), null);
  assert.deepEqual(fitMainWindowBounds(null, { x: 0, y: 0, width: 1920, height: 1040 }), {
    x: 300, y: 70, width: 1320, height: 900, minWidth: 960, minHeight: 700,
  });
  assert.deepEqual(mainWindowDisplayProbe({ x: '-1200', y: '40' }), { x: -1200, y: 40, width: 100, height: 100 });
});

test('SIMULATED: legacy numeric values are preserved without mutating the saved document or display', () => {
  const saved = { x: '100', y: '80', width: '1280', height: '800', untouched: { history: true } };
  const area = { x: 0, y: 0, width: 1920, height: 1040 }, before = structuredClone({ saved, area });
  assert.deepEqual(fitMainWindowBounds(saved, area), { x: 100, y: 80, width: 1280, height: 800, minWidth: 960, minHeight: 700 });
  assert.deepEqual({ saved, area }, before);
});

test('SIMULATED: work-area matrix keeps position, size and minima inside the selected DIP rectangle', () => {
  for (const [width, height] of [[1920, 1040], [1536, 824], [1280, 680], [960, 500], [800, 560], [683, 344]]) {
    for (const [x, y] of [[0, 0], [-1600, -120], [1920, 40]]) {
      const area = { x, y, width, height };
      for (const saved of [{}, { x: -9999, y: 9999, width: 5000, height: 5000 }, { x: 100, y: 100, width: 1, height: 1 }, { width: NaN, height: Infinity }]) {
        const result = fitMainWindowBounds(saved, area);
        assert.ok(result.minWidth <= result.width && result.width <= area.width);
        assert.ok(result.minHeight <= result.height && result.height <= area.height);
        assert.ok(result.x >= area.x && result.x + result.width <= area.x + area.width);
        assert.ok(result.y >= area.y && result.y + result.height <= area.y + area.height);
      }
    }
  }
});

test('SIMULATED: invalid display rectangles are rejected instead of producing non-finite native bounds', () => {
  for (const area of [null, { x: 0, y: 0, width: 0, height: 700 }, { x: NaN, y: 0, width: 1000, height: 700 }]) {
    assert.throws(() => fitMainWindowBounds({}, area), /finite positive display work area/);
  }
});
