// Unique project-isolated storage keys to prevent conflicts with any other apps on domain (e.g. GitHub Pages)
export const STORAGE_PREFIX = 'sovpadenie_sixes_v1_';

export const STORAGE_KEYS = {
  STATE: `${STORAGE_PREFIX}gamestate`,
  SETTINGS: `${STORAGE_PREFIX}settings`,
  SAVED_ARCHIVE: `${STORAGE_PREFIX}archive`,
  PAST_PLAYERS: `${STORAGE_PREFIX}past_players`,
  LAST_PARTY: `${STORAGE_PREFIX}last_party`,
  USED_CARDS: `${STORAGE_PREFIX}used_cards`,
};

export const DEFAULT_SETTINGS = {
  language: 'ru',
  soundEnabled: true,
  vibrationEnabled: true,
  screenWakeEnabled: true,
  defaultTimerSeconds: 60,
  defaultStrictness: 'medium',
};

export function isDefaultPlayerName(name) {
  if (typeof name !== 'string') return true;
  const clean = name.trim();
  if (!clean) return true;
  return /^(Игрок|Player)\s*\d+$/i.test(clean);
}

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
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      soundEnabled: typeof parsed?.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
      vibrationEnabled: typeof parsed?.vibrationEnabled === 'boolean' ? parsed.vibrationEnabled : true,
      screenWakeEnabled: typeof parsed?.screenWakeEnabled === 'boolean' ? parsed.screenWakeEnabled : true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveStoredSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

export function loadPastPlayers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PAST_PLAYERS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((n) => (typeof n === 'string' ? n.trim() : ''))
        .filter((n) => n.length > 0 && !isDefaultPlayerName(n));
    }
    return [];
  } catch (err) {
    console.error('Failed to load past players:', err);
    return [];
  }
}

export function savePastPlayers(names) {
  try {
    if (!Array.isArray(names)) return;
    const current = loadPastPlayers();
    // Prepend new non-default names while removing duplicates (case-insensitive)
    const set = new Set();
    const result = [];

    // Add new custom names first (never save default names like "Игрок 1" / "Player 1")
    for (const name of names) {
      const clean = typeof name === 'string' ? name.trim() : '';
      if (!clean || isDefaultPlayerName(clean)) continue;
      const key = clean.toLowerCase();
      if (!set.has(key)) {
        set.add(key);
        result.push(clean);
      }
    }

    // Add older historical names
    for (const name of current) {
      const clean = typeof name === 'string' ? name.trim() : '';
      if (!clean || isDefaultPlayerName(clean)) continue;
      const key = clean.toLowerCase();
      if (!set.has(key)) {
        set.add(key);
        result.push(clean);
      }
    }

    // Keep up to 24 recent player names
    const trimmed = result.slice(0, 24);
    localStorage.setItem(STORAGE_KEYS.PAST_PLAYERS, JSON.stringify(trimmed));
  } catch (err) {
    console.error('Failed to save past players:', err);
  }
}

export function loadLastPartyPlayers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LAST_PARTY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const cleaned = parsed
        .map((n) => (typeof n === 'string' ? n.trim() : ''))
        .filter((n) => n.length > 0);
      return cleaned.length >= 3 ? cleaned.slice(0, 8) : [];
    }
    return [];
  } catch (err) {
    console.error('Failed to load last party players:', err);
    return [];
  }
}

export function saveLastPartyPlayers(names) {
  try {
    if (!Array.isArray(names)) return;
    const cleaned = names
      .map((n) => (typeof n === 'string' ? n.trim() : ''))
      .filter((n) => n.length > 0)
      .slice(0, 8);
    if (cleaned.length >= 3) {
      localStorage.setItem(STORAGE_KEYS.LAST_PARTY, JSON.stringify(cleaned));
    }
  } catch (err) {
    console.error('Failed to save last party players:', err);
  }
}

export function removePastPlayer(nameToRemove) {
  try {
    const current = loadPastPlayers();
    const key = nameToRemove.trim().toLowerCase();
    const filtered = current.filter((n) => n.toLowerCase() !== key);
    localStorage.setItem(STORAGE_KEYS.PAST_PLAYERS, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to remove past player:', err);
  }
}

export function loadUsedCards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USED_CARDS);
    if (!raw) return { owl: [], lark: [], blitz: [] };
    const parsed = JSON.parse(raw);
    return {
      owl: Array.isArray(parsed?.owl) ? parsed.owl.filter((x) => typeof x === 'number') : [],
      lark: Array.isArray(parsed?.lark) ? parsed.lark.filter((x) => typeof x === 'number') : [],
      blitz: Array.isArray(parsed?.blitz) ? parsed.blitz.filter((x) => typeof x === 'number') : [],
    };
  } catch {
    return { owl: [], lark: [], blitz: [] };
  }
}

export function saveUsedCards(used) {
  try {
    localStorage.setItem(STORAGE_KEYS.USED_CARDS, JSON.stringify(used));
  } catch (err) {
    console.error('Failed to save used cards:', err);
  }
}

export function resetUsedCards(type = null) {
  try {
    if (type) {
      const used = loadUsedCards();
      used[type] = [];
      saveUsedCards(used);
    } else {
      saveUsedCards({ owl: [], lark: [], blitz: [] });
    }
  } catch (err) {
    console.error('Failed to reset used cards:', err);
  }
}

export function markCardAsUsed(type, cardIndex, totalCards = 108) {
  try {
    if (!type || typeof cardIndex !== 'number' || cardIndex < 0) return;
    const used = loadUsedCards();
    const currentList = Array.isArray(used[type]) ? [...used[type]] : [];
    if (!currentList.includes(cardIndex)) {
      currentList.push(cardIndex);
    }
    // If all cards in this deck have been completed, reset for the next fresh cycle
    if (currentList.length >= totalCards) {
      used[type] = [];
    } else {
      used[type] = currentList;
    }
    saveUsedCards(used);
  } catch (err) {
    console.error('Failed to mark card as used:', err);
  }
}
