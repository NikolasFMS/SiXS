// Unique project-isolated storage keys to prevent conflicts with any other apps on domain
export const STORAGE_PREFIX = 'sovpadenie_sixes_v1_';

export const STORAGE_KEYS = {
  STATE: `${STORAGE_PREFIX}gamestate`,
  SETTINGS: `${STORAGE_PREFIX}settings`,
  SAVED_ARCHIVE: `${STORAGE_PREFIX}archive`,
};

export const DEFAULT_SETTINGS = {
  language: 'ru',
  soundEnabled: true,
  vibrationEnabled: true,
  defaultTimerSeconds: 60,
  defaultStrictness: 'medium',
};

export function loadStoredState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STATE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.players) && parsed.players.length >= 2) {
      return parsed;
    }
    return null;
  } catch (err) {
    console.error('Failed to load game state from localStorage:', err);
    return null;
  }
}

export function saveStoredState(state) {
  try {
    if (!state) {
      localStorage.removeItem(STORAGE_KEYS.STATE);
    } else {
      const payload = {
        ...state,
        updatedAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(payload));
    }
  } catch (err) {
    console.error('Failed to save game state to localStorage:', err);
  }
}

export function loadStoredSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveStoredSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}
