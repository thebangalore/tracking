/**
 * App bootstrap and SPA navigation
 * - Initializes modules (Plan, Workout, Progress)
 * - Handles simple hash-based navigation between views
 * - Registers Service Worker (on http/https only) for offline support
 * - Orchestrates cross-module refresh on data import
 */

import { $, $$ } from './utils.js';
import { PlanModule } from './plan.js';
import { WorkoutModule } from './workout.js';
import { ProgressModule } from './progress.js';

const VIEWS = ['plan', 'workout', 'progress'];

function showView(view) {
  if (!VIEWS.includes(view)) view = 'plan';

  // Toggle nav active
  $$('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  // Toggle sections
  VIEWS.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('hidden', v !== view);
  });

  // Update hash without scrolling
  if (location.hash !== `#${view}`) {
    history.replaceState(null, '', `#${view}`);
  }
}

function currentViewFromHash() {
  const h = (location.hash || '').replace('#', '');
  return VIEWS.includes(h) ? h : 'plan';
}

async function init() {
  // Wire nav buttons
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // Initialize modules
  await PlanModule.init();
  WorkoutModule.init();
  await ProgressModule.init();

  // Initial view
  showView(currentViewFromHash());

  // Hash change navigation
  window.addEventListener('hashchange', () => {
    showView(currentViewFromHash());
  });

  // Import event triggers cross-module refresh
  window.addEventListener('data:imported', () => {
    PlanModule.refreshAfterImport();
    WorkoutModule.refreshAfterImport();
    ProgressModule.refreshAfterImport();
  });

  // Register SW for offline support (only on http/https, not file://)
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    try {
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
      // Optional: console.log('Service worker registered');
    } catch (e) {
      console.warn('SW registration failed', e);
    }
  }
}

// DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
