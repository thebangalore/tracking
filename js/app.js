/**
 * Workout Tracker (no planner) - App bootstrap and SPA navigation
 * - Initializes modules (Workout, History)
 * - Handles simple hash-based navigation between views
 * - Registers Service Worker (on http/https only) for offline support
 */

import { $, $$ } from './utils.js';
import { WorkoutModule } from './workout.js';
import { HistoryModule } from './history.js';
import { loadExercises } from './exercises.js';

const VIEWS = ['workout', 'history'];

function showView(view) {
  if (!VIEWS.includes(view)) view = 'workout';

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
  return VIEWS.includes(h) ? h : 'workout';
}

async function init() {
  // Wire nav buttons
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // Load exercises first (for filters and add UI)
  await loadExercises();

  // Initialize modules
  WorkoutModule.init();
  HistoryModule.init();

  // Initial view
  showView(currentViewFromHash());

  // Hash change navigation
  window.addEventListener('hashchange', () => {
    showView(currentViewFromHash());
  });

  // Cross-module refresh after data import
  window.addEventListener('data:imported', () => {
    WorkoutModule.refreshAfterImport();
    HistoryModule.refreshAfterImport();
  });

  // Register SW for offline support (only on http/https, not file://)
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    try {
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
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
