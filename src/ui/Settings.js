const KEY = 'echoShift.settings';

export const DEFAULT_SETTINGS = Object.freeze({ master: 0.8, music: 0.6, sensitivity: 1.0 });

export function loadSettings(storage = globalThis.localStorage) {
  const s = { ...DEFAULT_SETTINGS };
  try {
    const raw = storage?.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const k of Object.keys(DEFAULT_SETTINGS)) {
        if (typeof parsed[k] === 'number' && Number.isFinite(parsed[k])) s[k] = parsed[k];
      }
    }
  } catch {
    /* corrupted or unavailable storage: fall back to defaults */
  }
  return s;
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage may be disabled (private mode); settings still apply for this session */
  }
}
