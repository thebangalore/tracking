/**
 * Workout logging module (no planner)
 * Model:
 * Workout = {
 *   date: 'YYYY-MM-DD',
 *   exercises: [
 *     { exerciseId: string, sets: [ { reps: number, weight: number } ] }
 *   ]
 * }
 */

import { $, $$, h, toNumber, formatDateInputValue, debounce } from './utils.js';
import { Storage } from './storage.js';
import {
  getExercises,
  getExerciseById,
  uniqueMuscles,
  uniqueEquipment,
  uniquePatterns,
  filterExercises
} from './exercises.js';

let state = {
  workout: createEmptyWorkout(formatDateInputValue())
};

export const WorkoutModule = {
  init() {
    // Initialize date to today if empty
    const dateEl = $('#workoutDate');
    if (!dateEl.value) dateEl.value = formatDateInputValue();

    // If a workout exists for today, load it
    const existing = findWorkoutByDate(dateEl.value);
    if (existing) {
      state.workout = structuredClone(existing);
    } else {
      state.workout = createEmptyWorkout(dateEl.value);
    }

    renderLibraryFilters();
    wireLibraryEvents();
    renderExerciseLibrary();

    renderEditor();

    // Wire UI
    $('#btnSaveWorkout').addEventListener('click', onSaveWorkout);
    $('#workoutDate').addEventListener('change', onDateChange);

    // Backup handlers (workout view)
    const exportBtn = $('#btnExport');
    if (exportBtn) exportBtn.addEventListener('click', onExport);
    const importFile = $('#importFile');
    if (importFile) importFile.addEventListener('change', onImportFile);
  },

  refreshAfterImport() {
    // Reload current date workout if present
    const date = $('#workoutDate').value || formatDateInputValue();
    const existing = findWorkoutByDate(date);
    state.workout = existing ? structuredClone(existing) : createEmptyWorkout(date);

    renderLibraryFilters();
    renderExerciseLibrary();
    renderEditor();
  }
};

// ---------------------- Helpers ----------------------

function createEmptyWorkout(date) {
  return { date, exercises: [] };
}

function findWorkoutByDate(date) {
  return Storage.getWorkouts().find(w => w.date === date) || null;
}

// ---------------------- Date / Save ----------------------

function onDateChange(e) {
  const date = e.target.value;
  const existing = findWorkoutByDate(date);
  if (existing) {
    state.workout = structuredClone(existing);
  } else {
    state.workout = createEmptyWorkout(date);
  }
  renderEditor();
}

function onSaveWorkout() {
  const cleaned = pruneEmptySets(structuredClone(state.workout));
  Storage.upsertWorkout(cleaned);

  // Feedback
  const btn = $('#btnSaveWorkout');
  btn.textContent = 'Saved ✓';
  setTimeout(() => { btn.textContent = 'Save Workout'; }, 1200);

  // Notify history to refresh
  window.dispatchEvent(new CustomEvent('workouts:changed'));
}

function pruneEmptySets(workout) {
  workout.exercises = workout.exercises
    .map(ex => ({
      exerciseId: ex.exerciseId,
      sets: (ex.sets || []).filter(s => Number.isFinite(s.reps) && s.reps > 0)
    }))
    .filter(ex => ex.sets.length > 0);
  return workout;
}

// ---------------------- Library UI ----------------------

function renderLibraryFilters() {
  // Muscles
  const muscles = uniqueMuscles();
  const selM = $('#libMuscle');
  if (selM) selM.innerHTML = '<option value="">All</option>' + muscles.map(m => `<option value="${m}">${m}</option>`).join('');

  // Equipment
  const eqs = uniqueEquipment();
  const selE = $('#libEquipment');
  if (selE) selE.innerHTML = '<option value="">All</option>' + eqs.map(m => `<option value="${m}">${m}</option>`).join('');

  // Patterns
  const pats = uniquePatterns();
  const selP = $('#libPattern');
  if (selP) selP.innerHTML = '<option value="">All</option>' + pats.map(m => `<option value="${m}">${m}</option>`).join('');
}

function wireLibraryEvents() {
  const search = $('#libSearch');
  const mus = $('#libMuscle');
  const eq = $('#libEquipment');
  const pat = $('#libPattern');

  if (search) search.addEventListener('input', debounce(renderExerciseLibrary, 200));
  if (mus) mus.addEventListener('change', renderExerciseLibrary);
  if (eq) eq.addEventListener('change', renderExerciseLibrary);
  if (pat) pat.addEventListener('change', renderExerciseLibrary);
}

function renderExerciseLibrary() {
  const list = $('#exerciseList');
  if (!list) return;
  const q = ($('#libSearch')?.value) || '';
  const muscle = ($('#libMuscle')?.value) || '';
  const equipment = ($('#libEquipment')?.value) || '';
  const pattern = ($('#libPattern')?.value) || '';
  const results = filterExercises({ search: q, muscle, equipment, pattern });

  list.innerHTML = '';
  if (!results.length) {
    list.appendChild(h('div', { class: 'muted' }, 'No exercises match.'));
    return;
  }

  for (const ex of results) {
    const row = h('div', { class: 'item' },
      h('div', { class: 'title' }, ex.name),
      h('div', { class: 'meta' },
        h('span', { class: 'badge' }, ex.primaryMuscle),
        h('span', { class: 'badge' }, ex.equipment),
        h('span', { class: 'badge' }, ex.pattern)
      ),
      h('div', { class: 'row' },
        h('button', {
          class: 'small secondary',
          onclick: () => {
            addExerciseToCurrent(ex.id);
          }
        }, 'Add')
      )
    );
    list.appendChild(row);
  }
}

function addExerciseToCurrent(exerciseId) {
  state.workout.exercises.push({ exerciseId, sets: [ { reps: 0, weight: 0 } ] });
  renderEditor();
}

// ---------------------- Editor rendering ----------------------

function renderEditor() {
  // Date reflect state
  const dateEl = $('#workoutDate');
  if (!dateEl.value) dateEl.value = state.workout.date;

  const wrap = $('#workoutExercises');
  if (!wrap) return;
  wrap.innerHTML = '';

  // Render each exercise
  state.workout.exercises.forEach((wex, idx) => {
    wrap.appendChild(renderExerciseBlock(wex, idx));
  });

  // Add-exercise row (quick add)
  wrap.appendChild(renderAddExerciseRow());
}

function renderExerciseBlock(wex, idx) {
  const ex = getExerciseById(wex.exerciseId);
  const title = ex ? ex.name : 'Unknown Exercise';

  const header = h('div', { class: 'w-ex-header' },
    h('strong', {}, title),
    h('div', { class: 'row' },
      h('button', { class: 'small ghost', onclick: () => moveExercise(idx, -1) }, '↑'),
      h('button', { class: 'small ghost', onclick: () => moveExercise(idx, +1) }, '↓'),
      h('button', { class: 'small danger', onclick: () => removeExercise(idx) }, 'Remove')
    )
  );

  // Sets
  const setsWrap = h('div', { class: 'w-sets' });
  wex.sets.forEach((set, sIdx) => {
    const row = h('div', { class: 'w-set-row' },
      h('span', {}, `Set ${sIdx + 1}`),
      h('input', {
        type: 'number', min: '0', placeholder: 'Reps',
        value: String(set.reps ?? ''),
        oninput: (e) => updateSet(idx, sIdx, { reps: Math.max(0, toNumber(e.target.value, 0)) })
      }),
      h('input', {
        type: 'number', step: '0.5', min: '0', placeholder: 'Weight',
        value: String(set.weight ?? ''),
        oninput: (e) => updateSet(idx, sIdx, { weight: Math.max(0, toNumber(e.target.value, 0)) })
      }),
      h('button', { class: 'small danger', onclick: () => removeSet(idx, sIdx) }, 'Delete')
    );
    setsWrap.appendChild(row);
  });

  const actions = h('div', { class: 'w-ex-actions' },
    h('button', { class: 'small secondary', onclick: () => addSet(idx) }, 'Add Set'),
    renderExerciseSelect(idx)
  );

  return h('div', { class: 'w-exercise' }, header, setsWrap, actions);
}

function renderExerciseSelect(idx) {
  const allOptions = getExercises()
    .map(e => `<option value="${e.id}" ${e.id === state.workout.exercises[idx].exerciseId ? 'selected' : ''}>${e.name}</option>`)
    .join('');
  return h('select', {
    innerHTML: allOptions,
    onchange: (e) => {
      state.workout.exercises[idx].exerciseId = e.target.value;
      renderEditor(); // rerender title
    }
  });
}

function renderAddExerciseRow() {
  const select = h('select', {
    innerHTML: getExercises().map(e => `<option value="${e.id}">${e.name}</option>`).join('')
  });
  const btn = h('button', { class: 'small secondary', onclick: () => {
    const id = select.value;
    state.workout.exercises.push({ exerciseId: id, sets: [ { reps: 0, weight: 0 } ] });
    renderEditor();
  } }, 'Add Exercise');
  return h('div', { class: 'row', style: { marginTop: '8px' } },
    h('span', { class: 'muted' }, 'Quick add:'),
    select,
    btn
  );
}

// ---------------------- Mutators ----------------------

function moveExercise(idx, dir) {
  const to = idx + dir;
  if (to < 0 || to >= state.workout.exercises.length) return;
  const [it] = state.workout.exercises.splice(idx, 1);
  state.workout.exercises.splice(to, 0, it);
  renderEditor();
}

function removeExercise(idx) {
  state.workout.exercises.splice(idx, 1);
  renderEditor();
}

function addSet(exIdx) {
  state.workout.exercises[exIdx].sets.push({ reps: 0, weight: 0 });
  renderEditor();
}

function removeSet(exIdx, setIdx) {
  state.workout.exercises[exIdx].sets.splice(setIdx, 1);
  renderEditor();
}

function updateSet(exIdx, setIdx, patch) {
  const set = state.workout.exercises[exIdx].sets[setIdx];
  Object.assign(set, patch);
}

// ---------------------- Backup (workout view) ----------------------

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
