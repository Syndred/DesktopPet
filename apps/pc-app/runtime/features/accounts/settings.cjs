const { invariant } = require("./errors.cjs");

const DEFAULT_SETTINGS = Object.freeze({
  desktop: { alwaysOnTop: true, clickThrough: true, launchAtLogin: false, closeToTray: true,
    companionLimit: 3, interactionSounds: true, volume: 70, hideInFullscreen: true },
  notifications: { enabled: true, companions: true, battles: true, garden: true,
    quietEnabled: true, quietStart: "22:00", quietEnd: "08:00" },
  privacy: { locationAllowed: false, locationOnlyWhileExploring: true, emotionStatistics: false },
  sync: { enabled: false }
});

function defaultSettings() { return structuredClone(DEFAULT_SETTINGS); }
function validateSettings(input) {
  invariant(input && typeof input === "object" && !Array.isArray(input), "INVALID_SETTINGS", "设置内容无效。");
  const output = defaultSettings();
  const bools = {
    desktop: ["alwaysOnTop", "clickThrough", "launchAtLogin", "closeToTray", "interactionSounds", "hideInFullscreen"],
    notifications: ["enabled", "companions", "battles", "garden", "quietEnabled"],
    privacy: ["locationAllowed", "locationOnlyWhileExploring", "emotionStatistics"], sync: ["enabled"]
  };
  for (const [section, keys] of Object.entries(bools)) {
    const source = input[section];
    invariant(source && typeof source === "object" && !Array.isArray(source), "INVALID_SETTINGS", "设置分组缺失。");
    for (const key of keys) {
      invariant(typeof source[key] === "boolean", "INVALID_SETTINGS", "设置开关值无效。");
      output[section][key] = source[key];
    }
  }
  invariant(Number.isInteger(input.desktop.companionLimit) && input.desktop.companionLimit >= 1 && input.desktop.companionLimit <= 4,
    "INVALID_SETTINGS", "桌面伙伴数量需为 1–4。");
  invariant(Number.isInteger(input.desktop.volume) && input.desktop.volume >= 0 && input.desktop.volume <= 100,
    "INVALID_SETTINGS", "音量需为 0–100。");
  output.desktop.companionLimit = input.desktop.companionLimit;
  output.desktop.volume = input.desktop.volume;
  for (const key of ["quietStart", "quietEnd"]) {
    invariant(typeof input.notifications[key] === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.notifications[key]),
      "INVALID_SETTINGS", "安静时段格式无效。");
    output.notifications[key] = input.notifications[key];
  }
  return output;
}
function isQuiet(settings, now = new Date()) {
  const n = settings.notifications;
  if (!n.quietEnabled) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const parse = text => Number(text.slice(0, 2)) * 60 + Number(text.slice(3));
  const start = parse(n.quietStart), end = parse(n.quietEnd);
  if (start === end) return true;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}
function notificationPolicy(settings, kind, now) {
  if (!settings.notifications.enabled || settings.notifications[kind] !== true) return { allowed: false, reason: "disabled" };
  if (isQuiet(settings, now)) return { allowed: false, reason: "quiet-hours" };
  return { allowed: true, silent: !settings.desktop.interactionSounds || settings.desktop.volume === 0 };
}
module.exports = { DEFAULT_SETTINGS, defaultSettings, validateSettings, isQuiet, notificationPolicy };
