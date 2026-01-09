/**
 * Workout logging module
 * Data model:
 * Workout = {
 *   date: 'YYYY-MM-DD',
 *   planDayIndex: number | null,
 *   exercises: [
 *     { exerciseId: string, sets: [ { reps: number, weight: number } ] }
 *   ]
 * }
 */

import { $, $$, h, toNumber, formatDateInputValue } from './utils.js';
import { Storage } from './storage.js';
import { getExercises, getExerciseById } from './exercises.js';

let state = {
  workout: createEmptyWorkout(formatDateInputValue())
};

export const WorkoutModule = {
  init() {
    // Initialize date to today if empty
    const dateEl = $('#workoutDate');
    if (!dateEl.value) dateEl.value = formatDateInputValue();

    // Populate plan days
    populatePlanDayOptions();

    // If a workout exists for today, load it
    const existing = findWorkoutByDate(dateEl.value);
    if (existing) {
      state.workout = structuredClone(existing);
    } else {
      state.workout = createEmptyWorkout(dateEl.value);
    }
    renderEditor();

    // Wire UI
    $('#btnLoadDay').addEventListener('click', onLoadPlanDay);
    $('#btnSaveWorkout').addEventListener('click', onSaveWorkout);
    $('#workoutDate').addEventListener('change', onDateChange);

    // Refresh plan day options when plan saved
    window.addEventListener('plan:saved', () => {
      populatePlanDayOptions();
      // Do not overwrite current workout content
    });
  },

  refreshAfterImport() {
    populatePlanDayOptions();
    // Reload current date workout if present
    const date = $('#workoutDate').value || formatDateInputValue();
    const existing = findWorkoutByDate(date);
    state.workout = existing ? structuredClone(existing) : createEmptyWorkout(date);
    renderEditor();
  }
};

// ---------------------- Helpers ----------------------

function createEmptyWorkout(date) {
  return { date, planDayIndex: null, exercises: [] };
}

function findWorkoutByDate(date) {
  return Storage.getWorkouts().find(w => w.date === date) || null;
}

function populatePlanDayOptions() {
  const sel = $('#workoutPlanDay');
  const plan = Storage.getPlan();
  const opts = (plan.days || []).map((d, i) => `<option value="${i}">${i + 1}. ${d.name}</option>`).join('');
  sel.innerHTML = opts || '<option value="">No plan days</option>';
}

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

function onLoadPlanDay() {
  const sel = $('#workoutPlanDay');
  const idx = parseInt(sel.value, 10);
  const plan = Storage.getPlan();
  if (!plan.days || !plan.days[idx]) return;
  const day = plan.days[idx];

  // Build workout from plan prescription
  const exList = day.exercises.map(pex => ({
    exerciseId: pex.exerciseId,
    // Create placeholder sets according to targetSets; reps/weight left blank until user fills
    sets: Array.from({ length: Math.max(1, pex.targetSets || 1) }, () => ({ reps: 0, weight: 0 }))
  }));

  state.workout = {
    date: $('#workoutDate').value || formatDateInputValue(),
    planDayIndex: idx,
    exercises: exList
  };
  renderEditor();
}

function onSaveWorkout() {
  const cleaned = pruneEmptySets(structuredClone(state.workout));
  Storage.upsertWorkout(cleaned);

  // Feedback
  const btn = $('#btnSaveWorkout');
  btn.textContent = 'Saved ✓';
  setTimeout(() => { btn.textContent = 'Save Workout'; }, 1200);

  // Notify others
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

// ---------------------- Rendering ----------------------

function renderEditor() {
  // Date reflect state
  const dateEl = $('#workoutDate');
  if (!dateEl.value) dateEl.value = state.workout.date;

  const wrap = $('#workoutExercises');
  wrap.innerHTML = '';

  // Render each exercise
  state.workout.exercises.forEach((wex, idx) => {
    wrap.appendChild(renderExerciseBlock(wex, idx));
  });

  // Add-exercise row
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
    h('span', { class: 'muted' }, 'Add exercise:'),
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
