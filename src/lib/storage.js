const KEY = 'poker-night-v1';
// The last table settings used, so the next table opens with them.
const SETTINGS_KEY = 'poker-nights-settings';

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the game keeps working in memory.
  }
}

export function loadState(fallback) {
  return { ...fallback, ...load(KEY, {}) };
}

export function saveState(state) {
  save(KEY, state);
}

export function loadSettings(fallback) {
  return load(SETTINGS_KEY, fallback);
}

export function saveSettings(settings) {
  save(SETTINGS_KEY, settings);
}
