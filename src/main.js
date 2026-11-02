import { initApp } from './app.js';

// Pure HTML5, CSS, and Vanilla JavaScript entry point
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

