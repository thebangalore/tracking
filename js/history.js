/**
 * History view: list, edit, and delete logged workouts
 */

import { $, h } from './utils.js';
import { Storage } from './storage.js';
import { getExerciseById } from './exercises.js';

export const HistoryModule = {
  init() {
    renderHistory();

    // Backup handlers (history view)
    const exportBtn = $('#btnExport2');
    if (exportBtn) exportBtn.addEventListener('click', onExport);
    const importFile = $('#importFile2');
    if (importFile) importFile.addEventListener('change', onImportFile);

    // Refresh when workouts change or data imported
    window.addEventListener('workouts:changed', renderHistory);
    window.addEventListener('data:imported', renderHistory);
  },

  refreshAfterImport() {
    renderHistory();
  }
};

function renderHistory() {
  const wrap = $('#historyList');
  if (!wrap) return;
  wrap.innerHTML = '';

  const workouts = Storage.getWorkouts().slice().sort((a, b) => b.date.localeCompare(a.date));

  if (!workouts.length) {
    wrap.appendChild(h('div', { class: 'muted' }, 'No workouts logged yet.'));
    return;
  }

  for (const w of workouts) {
    const stats = summarizeWorkout(w);
    const title = h('div', { class: 'title' }, w.date);
    const meta = h('div', { class: 'meta' },
      h('span', { class: 'badge' }, `${stats.exerciseCount} exercises`),
      h('span', { class: 'badge' }, `${stats.setCount} sets`),
      h('span', { class: 'badge' }, `Vol ${Math.round(stats.totalVolume)}`)
    );

    const actions = h('div', { class: 'row' },
      h('button', { class: 'small secondary', onclick: () => openForEdit(w.date) }, 'Edit'),
      h('button', { class: 'small danger', onclick: () => onDelete(w.date) }, 'Delete')
    );

    // Exercise preview lines
    const preview = h('div', { class: 'list', style: { marginTop: '6px' } });
    for (const ex of (w.exercises || []).slice(0, 4)) {
      const metaEx = getExerciseById(ex.exerciseId);
      const name = metaEx ? metaEx.name : ex.exerciseId;
      const setsTxt = (ex.sets || [])
        .map(s => `${Number(s.reps) || 0}x${Number(s.weight) || 0}`)
        .join(', ')
        || '—';
      preview.appendChild(h('div', { class: 'muted' }, `${name}: ${setsTxt}`));
    }
    if ((w.exercises || []).length > 4) {
      preview.appendChild(h('div', { class: 'muted' }, `+ ${w.exercises.length - 4} more...`));
    }

    const item = h('div', { class: 'item' }, title, meta, actions);
    item.appendChild(preview);
    wrap.appendChild(item);
  }
}

function summarizeWorkout(w) {
  let totalVolume = 0;
  let setCount = 0;
  const exercises = w.exercises || [];
  for (const ex of exercises) {
    for (const s of (ex.sets || [])) {
      const reps = Number(s.reps) || 0;
      const weight = Number(s.weight) || 0;
      totalVolume += reps * weight;
      setCount += reps > 0 ? 1 : 0;
    }
  }
  return {
    totalVolume,
    setCount,
    exerciseCount: exercises.length
  };
}

function openForEdit(date) {
  // Navigate to workout view and load that date
  const input = document.getElementById('workoutDate');
  if (input) {
    input.value = date;
    input.dispatchEvent(new Event('change'));
  }
  location.hash = '#workout';
}

function onDelete(date) {
  if (!confirm(`Delete workout on ${date}? This cannot be undone.`)) return;
  Storage.deleteWorkoutByDate(date);
  window.dispatchEvent(new CustomEvent('workouts:changed'));
}

// Backup functions (history view)

function onExport() {
  const data = Storage.exportAll();
  const dt = new Date().toISOString().split('T')[0];
  downloadJSON(`workout-tracker-backup-${dt}.json`, data);
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

async function onImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    Storage.importAll(data);
    window.dispatchEvent(new CustomEvent('data:imported'));
  } catch (err) {
    console.warn('Import failed:', err);
    alert('Invalid JSON file.');
  } finally {
    e.target.value = '';
  }
}
