const DEFAULT_WIDTH = 1320;
const DEFAULT_HEIGHT = 900;
const MIN_WIDTH = 960;
const MIN_HEIGHT = 700;

function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function finite(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

/** A finite native rectangle for display selection; invalid saved coordinates use the primary display. */
function mainWindowDisplayProbe(saved) {
  const bounds = record(saved), x = finite(bounds.x), y = finite(bounds.y);
  if (x === null || y === null || [x, y].some(value => value < -2147483648 || value > 2147483547)) return null;
  return { x: Math.round(x), y: Math.round(y), width: 100, height: 100 };
}

/** All arguments/results are Electron DIP. No window, display, database or user state is accessed. */
function fitMainWindowBounds(saved, workArea) {
  if (!workArea || ['x', 'y', 'width', 'height'].some(key => !Number.isFinite(workArea[key])) || workArea.width < 1 || workArea.height < 1) {
    throw new TypeError('A finite positive display work area is required');
  }
  const bounds = record(saved), areaWidth = Math.floor(workArea.width), areaHeight = Math.floor(workArea.height);
  const minWidth = Math.min(MIN_WIDTH, areaWidth), minHeight = Math.min(MIN_HEIGHT, areaHeight);
  const savedWidth = finite(bounds.width), savedHeight = finite(bounds.height);
  const width = clamp(Math.round(savedWidth !== null && savedWidth > 0 ? savedWidth : DEFAULT_WIDTH), minWidth, areaWidth);
  const height = clamp(Math.round(savedHeight !== null && savedHeight > 0 ? savedHeight : DEFAULT_HEIGHT), minHeight, areaHeight);
  const savedX = finite(bounds.x), savedY = finite(bounds.y);
  const x = clamp(Math.round(savedX ?? workArea.x + (areaWidth - width) / 2), workArea.x, workArea.x + areaWidth - width);
  const y = clamp(Math.round(savedY ?? workArea.y + (areaHeight - height) / 2), workArea.y, workArea.y + areaHeight - height);
  return { x, y, width, height, minWidth, minHeight };
}

module.exports = { mainWindowDisplayProbe, fitMainWindowBounds };
