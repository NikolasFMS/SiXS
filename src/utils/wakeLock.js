// Screen Wake Lock API wrapper
// Keeps the display awake while the app / game is running

let wakeLockSentinel = null;
let isScreenLockRequested = true;
let inFlightRequest = null;
let lastAttemptAt = 0;
let listenersBound = false;

export function isWakeLockSupported() {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

export function isWakeLockActive() {
  return !!(wakeLockSentinel && !wakeLockSentinel.released);
}

export async function requestWakeLock(force = false) {
  if (!isScreenLockRequested || !isWakeLockSupported()) {
    return false;
  }
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return false;
  }
  if (isWakeLockActive()) {
    return true;
  }
  if (inFlightRequest) {
    return inFlightRequest;
  }

  const now = Date.now();
  if (!force && now - lastAttemptAt < 800) {
    return false;
  }
  lastAttemptAt = now;

  inFlightRequest = (async () => {
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      if (!isScreenLockRequested) {
        try {
          await sentinel.release();
        } catch {}
        wakeLockSentinel = null;
        return false;
      }
      wakeLockSentinel = sentinel;
      sentinel.addEventListener('release', () => {
        if (wakeLockSentinel === sentinel) {
          wakeLockSentinel = null;
        }
      });
      return true;
    } catch {
      wakeLockSentinel = null;
      return false;
    } finally {
      inFlightRequest = null;
    }
  })();

  return inFlightRequest;
}

export async function releaseWakeLock() {
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {}
    wakeLockSentinel = null;
  }
}

export async function ensureWakeLock() {
  if (!isScreenLockRequested) return false;
  return requestWakeLock(true);
}

export function setWakeLockRequested(enabled) {
  isScreenLockRequested = !!enabled;
  if (isScreenLockRequested) {
    return requestWakeLock(true);
  }
  return releaseWakeLock();
}

export function getWakeLockRequested() {
  return isScreenLockRequested;
}

export function initWakeLock(initialEnabled = true) {
  isScreenLockRequested = !!initialEnabled;
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  if (isScreenLockRequested) {
    requestWakeLock(true);
  }

  if (listenersBound) return;
  listenersBound = true;

  const reacquireOnResume = () => {
    if (document.visibilityState === 'visible' && isScreenLockRequested) {
      requestWakeLock(true);
    }
  };

  // Re-acquire lock when user switches tabs, unlocks phone, or returns to PWA
  document.addEventListener('visibilitychange', reacquireOnResume);
  window.addEventListener('focus', () => {
    if (isScreenLockRequested) requestWakeLock(true);
  });
  window.addEventListener('pageshow', () => {
    if (isScreenLockRequested) requestWakeLock(true);
  });

  // Mobile browsers often reject Wake Lock before the first user gesture or drop it;
  // re-acquire transparently on any user interaction whenever it is not currently active.
  const reacquireOnGesture = () => {
    if (isScreenLockRequested && !isWakeLockActive()) {
      requestWakeLock(false);
    }
  };

  ['pointerdown', 'touchstart', 'click', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, reacquireOnGesture, { passive: true });
  });
}
