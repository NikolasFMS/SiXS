import { initApp } from './app.js';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    try {
      navigator.serviceWorker
        .register('./sw.js', { scope: './', updateViaCache: 'none' })
        .then((reg) => {
          reg.update().catch(() => {});
        })
        .catch(() => {
          // Ignore registration errors in restricted preview contexts
        });
    } catch {
      // ignore
    }
  });
}

// Pure HTML5, CSS, and Vanilla JavaScript entry point
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
