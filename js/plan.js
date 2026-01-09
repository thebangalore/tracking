/**
 * Plan generation and editing
 * Data model:
 * Plan = {
 *   name: string,
 *   meta: { goal: 'hypertrophy'|'strength', daysPerWeek: number, equipment: string[] },
 *   days: [
 *     {
 *       name: string,
 *       exercises: [
 *         { exerciseId: string, targetSets: number, repRange: [number, number] }
 *       ]
 *     }
 *   ]
 * }
 */

import { $, $$, h, debounce, toNumber } from './utils.js';
import { Storage } from './storage.js';
import {
  loadExercises,
  getExercises,
  getExerciseById,
  uniqueMuscles,
  uniqueEquipment,
  uniquePatterns,
  filterExercises,
  byEquipmentAvailability
} from './exercises.js';

const COMPOUND_PATTERNS = new Set([
  'Squat', 'Hinge', 'Horizontal Push', 'Vertical Push', 'Horizontal Pull', 'Vertical Pull'
]);

let state = {
  plan: Storage.getPlan(),
  selectedEquip: [] // for generator equipment filter
};

export const PlanModule = {
  async init() {
    await loadExercises();
    // Seed generator equipment chips from stored plan meta if present
    state.selectedEquip = Array.isArray(state.plan?.meta?.equipment) ? state.plan.meta.equipment.slice() : [];

    // Populate generator form with stored values
    $('#goal').value = state.plan?.meta?.goal || 'hypertrophy';
    $('#daysPerWeek').value = String(state.plan?.meta?.daysPerWeek || 3);

    // Build UI parts
    renderEquipmentChips();
    wireGeneratorActions();
    populateLibraryFilters();
    wireLibraryEvents();
    renderExerciseLibrary(); // initial

    // Render plan summary from saved plan
    renderPlanSummary();
  },

  getPlan() {
    return state.plan;
  },

  refreshAfterImport() {
    // Reload plan from storage and rerender
    state.plan = Storage.getPlan();
    $('#goal').value = state.plan?.meta?.goal || 'hypertrophy';
    $('#daysPerWeek').value = String(state.plan?.meta?.daysPerWeek || 3);
    state.selectedEquip = Array.isArray(state.plan?.meta?.equipment) ? state.plan.meta.equipment.slice() : [];
    renderEquipmentChips();
    renderPlanSummary();
    renderExerciseLibrary();
  }
};

// ---------------------- Generator ----------------------

function renderEquipmentChips() {
  const holder = $('#equipmentOptions');
  holder.innerHTML = '';
  const all = uniqueEquipment();
  if (!all.length) {
    holder.appendChild(h('span', { class: 'muted' }, 'No equipment detected.'));
    return;
  }
  for (const eq of all) {
    const chip = h('span', {
      class: `chip ${state.selectedEquip.includes(eq) ? 'active' : ''}`,
      onclick: () => {
        const i = state.selectedEquip.indexOf(eq);
        if (i >= 0) state.selectedEquip.splice(i, 1);
        else state.selectedEquip.push(eq);
        renderEquipmentChips();
      }
    }, eq);
    holder.appendChild(chip);
  }
}

function wireGeneratorActions() {
  $('#btnGeneratePlan').addEventListener('click', () => {
    const goal = $('#goal').value;
    const dpw = parseInt($('#daysPerWeek').value, 10);
    const equipment = state.selectedEquip.slice();
    const generated = generatePlan({ goal, daysPerWeek: dpw, equipment });
    state.plan = generated;
    renderPlanSummary();
  });

  $('#btnSavePlan').addEventListener('click', () => {
    // Normalize plan meta from UI
    state.plan.meta.goal = $('#goal').value;
    state.plan.meta.daysPerWeek = parseInt($('#daysPerWeek').value, 10);
    state.plan.meta.equipment = state.selectedEquip.slice();
    Storage.savePlan(state.plan);
    // Simple feedback
    $('#btnSavePlan').textContent = 'Saved ✓';
    setTimeout(() => { $('#btnSavePlan').textContent = 'Save Active Plan'; }, 1200);
    // Dispatch event to let other modules refresh their views that depend on plan
    window.dispatchEvent(new CustomEvent('plan:saved'));
  });
}

// ---------------------- Library ----------------------

function populateLibraryFilters() {
  // Muscles
  const muscles = uniqueMuscles();
  const selM = $('#libMuscle');
  selM.innerHTML = '<option value="">All</option>' + muscles.map(m => `<option value="${m}">${m}</option>`).join('');

  // Equipment
  const eqs = uniqueEquipment();
  const selE = $('#libEquipment');
  selE.innerHTML = '<option value="">All</option>' + eqs.map(m => `<option value="${m}">${m}</option>`).join('');

  // Patterns
  const pats = uniquePatterns();
  const selP = $('#libPattern');
  selP.innerHTML = '<option value="">All</option>' + pats.map(m => `<option value="${m}">${m}</option>`).join('');
}

function wireLibraryEvents() {
  $('#libSearch').addEventListener('input', debounce(renderExerciseLibrary, 200));
  $('#libMuscle').addEventListener('change', renderExerciseLibrary);
  $('#libEquipment').addEventListener('change', renderExerciseLibrary);
  $('#libPattern').addEventListener('change', renderExerciseLibrary);
}

function renderExerciseLibrary() {
  const list = $('#exerciseList');
  const q = $('#libSearch').value || '';
  const muscle = $('#libMuscle').value || '';
  const equipment = $('#libEquipment').value || '';
  const pattern = $('#libPattern').value || '';
  const results = filterExercises({ search: q, muscle, equipment, pattern });

  list.innerHTML = '';
  if (!results.length) {
    list.appendChild(h('div', { class: 'muted' }, 'No exercises match.'));
    return;
  }

  const dayOptions = state.plan.days.map((d, idx) => `<option value="${idx}">${idx + 1}. ${d.name}</option>`).join('');

  for (const ex of results) {
    const row = h('div', { class: 'item' },
      h('div', { class: 'title' }, ex.name),
      h('div', { class: 'meta' },
        h('span', { class: 'badge' }, ex.primaryMuscle),
        h('span', { class: 'badge' }, ex.equipment),
        h('span', { class: 'badge' }, ex.pattern)
      ),
      h('div', { class: 'row' },
        h('select', { class: 'add-to-day-select' , 'aria-label': 'Add to day' , innerHTML: dayOptions }),
        h('button', { class: 'small secondary', onclick: (e) => {
          const select = e.currentTarget.previousSibling;
          const dayIndex = parseInt(select.value, 10);
          addExerciseToDay(dayIndex, ex.id);
        } }, 'Add')
      )
    );
    list.appendChild(row);
  }
}

function addExerciseToDay(dayIndex, exerciseId) {
  if (!state.plan.days[dayIndex]) return;
  const day = state.plan.days[dayIndex];
  const defaults = defaultPrescriptionForExercise(exerciseId, state.plan.meta.goal);
  day.exercises.push({ exerciseId, ...defaults });
  renderPlanSummary();
}

// ---------------------- Plan summary editing ----------------------

function renderPlanSummary() {
  const wrap = $('#planSummary');
  wrap.innerHTML = '';

  if (!state.plan || !state.plan.days?.length) {
    wrap.appendChild(h('div', { class: 'muted' }, 'No active plan. Use the generator to create one.'));
    return;
  }

  state.plan.days.forEach((day, dayIdx) => {
    const dayEl = h('div', { class: 'plan-day' });

    // Header with editable day name
    const nameInput = h('input', {
      type: 'text',
      value: day.name,
      oninput: (e) => {
        state.plan.days[dayIdx].name = e.target.value;
      }
    });
    const header = h('div', { class: 'plan-day-header' },
      h('div', { class: 'row' },
        h('strong', {}, `Day ${dayIdx + 1}`),
        h('span', { class: 'space' }),
      ),
      h('div', { class: 'row' },
        nameInput
      )
    );
    dayEl.appendChild(header);

    // Exercises list
    const exWrap = h('div', { class: 'plan-exercises' });
    day.exercises.forEach((pex, exIdx) => {
      const ex = getExerciseById(pex.exerciseId);
      const allOptions = getExercises().map(e => `<option value="${e.id}" ${e.id === pex.exerciseId ? 'selected' : ''}>${e.name}</option>`).join('');

      const row = h('div', { class: 'plan-ex-row' },
        h('select', {
          innerHTML: allOptions,
          onchange: (e) => {
            state.plan.days[dayIdx].exercises[exIdx].exerciseId = e.target.value;
          }
        }),
        h('input', {
          type: 'number', min: '1', value: String(pex.targetSets),
          oninput: (e) => state.plan.days[dayIdx].exercises[exIdx].targetSets = Math.max(1, toNumber(e.target.value, 1))
        }),
        h('input', {
          type: 'text', value: `${pex.repRange[0]}-${pex.repRange[1]}`,
          oninput: (e) => {
            const parts = String(e.target.value).split('-').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n));
            if (parts.length === 2) state.plan.days[dayIdx].exercises[exIdx].repRange = [Math.min(...parts), Math.max(...parts)];
          }
        }),
        h('div', { class: 'row' },
          h('button', { class: 'small ghost', onclick: () => moveExercise(dayIdx, exIdx, -1) }, '↑'),
          h('button', { class: 'small ghost', onclick: () => moveExercise(dayIdx, exIdx, +1) }, '↓'),
          h('button', { class: 'small danger', onclick: () => removeExercise(dayIdx, exIdx) }, 'Remove')
        )
      );
      exWrap.appendChild(row);
    });
    dayEl.appendChild(exWrap);

    // Add row
    const addSelect = h('select', { innerHTML: getExercises().map(e => `<option value="${e.id}">${e.name}</option>`).join('') });
    const addSets = h('input', { type: 'number', min: '1', value: '3' });
    const addRange = h('input', { type: 'text', value: state.plan.meta.goal === 'strength' ? '3-5' : '8-12' });
    const addRow = h('div', { class: 'add-row' },
      h('span', { class: 'muted' }, 'Add exercise:'),
      addSelect,
      addSets,
      addRange,
      h('button', { class: 'small secondary', onclick: () => {
        const id = addSelect.value;
        const sets = Math.max(1, toNumber(addSets.value, 3));
        const parts = String(addRange.value).split('-').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n));
        const repRange = parts.length === 2 ? [Math.min(...parts), Math.max(...parts)] : (state.plan.meta.goal === 'strength' ? [3,5] : [8,12]);
        state.plan.days[dayIdx].exercises.push({ exerciseId: id, targetSets: sets, repRange });
        renderPlanSummary();
      } }, 'Add')
    );
    dayEl.appendChild(addRow);

    wrap.appendChild(dayEl);
  });

  // Rebuild "Add to Day" selects in library section to reflect updated day names/count
  renderExerciseLibrary();
}

function moveExercise(dayIdx, exIdx, dir) {
  const day = state.plan.days[dayIdx];
  const to = exIdx + dir;
  if (to < 0 || to >= day.exercises.length) return;
  const [it] = day.exercises.splice(exIdx, 1);
  day.exercises.splice(to, 0, it);
  renderPlanSummary();
}

function removeExercise(dayIdx, exIdx) {
  state.plan.days[dayIdx].exercises.splice(exIdx, 1);
  renderPlanSummary();
}

// ---------------------- Generation logic ----------------------

function generatePlan({ goal, daysPerWeek, equipment }) {
  const avail = byEquipmentAvailability(equipment);
  const byPat = groupByPattern(avail);

  const split = splitForDays(daysPerWeek);
  const dayReqs = patternsForSplit(split, daysPerWeek);

  const days = dayReqs.map((req, i) => {
    const chosen = chooseExercisesForDay(req, byPat);
    const exList = chosen.map(ex => ({
      exerciseId: ex.id,
      ...defaultPrescriptionForExercise(ex.id, goal)
    }));
    return {
      name: req.name || defaultDayName(split, i),
      exercises: dedupeExercises(exList)
    };
  });

  return {
    name: 'My Plan',
    meta: { goal, daysPerWeek, equipment: equipment.slice() },
    days
  };
}

function defaultDayName(split, idx) {
  if (split === 'full') return ['Full Body A', 'Full Body B', 'Full Body C'][idx] || `Full Body ${idx+1}`;
  if (split === 'ul') return ['Upper A', 'Lower A', 'Upper B', 'Lower B'][idx] || `Day ${idx+1}`;
  if (split === 'ppl') return ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B'][idx] || `Day ${idx+1}`;
  return `Day ${idx+1}`;
}

function splitForDays(d) {
  if (d === 3) return 'full';
  if (d === 4) return 'ul';
  if (d === 5 || d === 6) return 'ppl';
  return 'full';
}

function patternsForSplit(split, daysPerWeek) {
  if (split === 'full') {
    return [
      { name: 'Full Body A', patterns: ['Squat', 'Horizontal Push', 'Horizontal Pull', 'Accessory'] },
      { name: 'Full Body B', patterns: ['Hinge', 'Vertical Push', 'Vertical Pull', 'Accessory'] },
      { name: 'Full Body C', patterns: ['Squat', 'Horizontal Push', 'Vertical Pull', 'Accessory'] }
    ].slice(0, daysPerWeek);
  }
  if (split === 'ul') {
    return [
      { name: 'Upper A', patterns: ['Horizontal Push', 'Horizontal Pull', 'Vertical Push', 'Vertical Pull', 'Accessory'] },
      { name: 'Lower A', patterns: ['Squat', 'Hinge', 'Accessory'] },
      { name: 'Upper B', patterns: ['Horizontal Push', 'Horizontal Pull', 'Vertical Push', 'Vertical Pull', 'Accessory'] },
      { name: 'Lower B', patterns: ['Squat', 'Hinge', 'Accessory'] }
    ];
  }
  // ppl
  const base = [
    { name: 'Push A', patterns: ['Horizontal Push', 'Vertical Push', 'Accessory'] },
    { name: 'Pull A', patterns: ['Horizontal Pull', 'Vertical Pull', 'Accessory'] },
    { name: 'Legs A', patterns: ['Squat', 'Hinge', 'Accessory'] },
    { name: 'Push B', patterns: ['Horizontal Push', 'Vertical Push', 'Accessory'] },
    { name: 'Pull B', patterns: ['Horizontal Pull', 'Vertical Pull', 'Accessory'] },
    { name: 'Legs B', patterns: ['Squat', 'Hinge', 'Accessory'] }
  ];
  return base.slice(0, daysPerWeek);
}

function groupByPattern(list) {
  const map = new Map();
  for (const ex of list) {
    const key = ex.pattern || 'Accessory';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(ex);
  }
  // Sort exercises by name for deterministic selection
  for (const arr of map.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
  return map;
}

function chooseExercisesForDay(req, byPat) {
  const chosen = [];
  const usedIds = new Set();

  for (const pat of req.patterns) {
    const pool = byPat.get(pat) || [];
    // pick first not used, else allow duplicates
    let pick = pool.find(e => !usedIds.has(e.id)) || pool[0];
    if (!pick) {
      // if nothing in equipment pool, fallback to any exercise with that pattern
      const any = getExercises().filter(e => e.pattern === pat).sort((a,b)=>a.name.localeCompare(b.name));
      pick = any.find(e => !usedIds.has(e.id)) || any[0];
    }
    if (pick) {
      chosen.push(pick);
      usedIds.add(pick.id);
    }
  }
  // If still empty (extreme edge), fallback to first few library items
  if (!chosen.length) {
    chosen.push(...getExercises().slice(0, 3));
  }
  return chosen;
}

function defaultPrescriptionForExercise(exerciseId, goal) {
  const ex = getExerciseById(exerciseId);
  const isCompound = ex ? COMPOUND_PATTERNS.has(ex.pattern) : true;
  if (goal === 'strength') {
    return { targetSets: isCompound ? 5 : 3, repRange: isCompound ? [3,5] : [6,8] };
  }
  // hypertrophy
  return { targetSets: isCompound ? 3 : 3, repRange: isCompound ? [8,12] : [12,15] };
}

function dedupeExercises(exList) {
  const seen = new Set();
  const out = [];
  for (const e of exList) {
    if (seen.has(e.exerciseId)) continue;
    seen.add(e.exerciseId);
    out.push(e);
  }
  return out;
}
