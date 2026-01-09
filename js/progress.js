/**
 * Progress analytics and charts
 * - Strength progression per exercise (estimated 1RM via Epley)
 * - Volume by muscle (last 30 days)
 * - Body metrics (weight, waist)
 */

import { $, h, formatDateInputValue } from './utils.js';
import { Storage } from './storage.js';
import { getExercises, getExerciseById, loadExercises } from './exercises.js';
import { lineChart, barChart, clearChart } from './charts.js';

export const ProgressModule = {
  async init() {
    await loadExercises();
    wireUI();

    // Initial renders
    populateExerciseSelect();
    renderStrengthChart();
    renderVolumeChart();
    initMetricsForm();
    renderMetricsCharts();

    // Refresh when workouts or plan change
    window.addEventListener('workouts:changed', () => {
      renderStrengthChart();
      renderVolumeChart();
      renderMetricsCharts();
    });
    window.addEventListener('plan:saved', () => {
      populateExerciseSelect(); // in case exercise library changed names or set expanded
      renderStrengthChart();
      renderVolumeChart();
    });
  },

  refreshAfterImport() {
    populateExerciseSelect();
    renderStrengthChart();
    renderVolumeChart();
    renderMetricsCharts();
  }
};

// ---------------------- UI wiring ----------------------

function wireUI() {
  const sel = $('#progressExercise');
  sel.addEventListener('change', renderStrengthChart);

  $('#btnSaveMetrics').addEventListener('click', onSaveMetrics);

  $('#btnExport').addEventListener('click', () => {
    const data = Storage.exportAll();
    const dt = new Date().toISOString().split('T')[0];
    downloadJSON(`gym-planner-backup-${dt}.json`, data);
  });

  const file = $('#importFile');
  file.addEventListener('change', onImportFile);
}

function populateExerciseSelect() {
  const sel = $('#progressExercise');
  const items = getExercises().slice().sort((a, b) => a.name.localeCompare(b.name));
  sel.innerHTML = items.map(e => `<option value="${e.id}">${e.name}</option>`).join('');

  // If previously selected not present, default to first
  if (!sel.value && items.length) sel.value = items[0].id;
}

// ---------------------- Strength progression ----------------------

function renderStrengthChart() {
  const canvas = $('#strengthChart');
  const sel = $('#progressExercise');

  if (!sel.value) {
    clearChart(canvas);
    return;
  }

  const series = strengthSeriesForExercise(sel.value);
  if (series.labels.length === 0) {
    clearChart(canvas);
    return;
  }

  lineChart(canvas, series.labels, series.values, {
    color: '#4f7cff',
    fill: true,
    yFormatter: (t) => {
      // map t (0..1) back to range
      // handled by charts default formatter if omitted; keep simple
      return '';
    },
    xTickCount: 8
  });
}

function strengthSeriesForExercise(exId) {
  const wos = Storage.getWorkouts().slice().sort((a, b) => a.date.localeCompare(b.date));
  const labels = [];
  const values = [];

  for (const w of wos) {
    const ex = (w.exercises || []).find(e => e.exerciseId === exId);
    if (!ex || !ex.sets?.length) continue;
    // take best set (max est 1RM)
    let best = 0;
    for (const s of ex.sets) {
      if (!Number.isFinite(s.weight) || !Number.isFinite(s.reps)) continue;
      const est = estimate1RM(s.weight, s.reps);
      if (est > best) best = est;
    }
    if (best > 0) {
      labels.push(w.date);
      values.push(Math.round(best * 10) / 10);
    }
  }
  return { labels, values };
}

function estimate1RM(weight, reps) {
  if (!reps || reps <= 1) return weight;
  // Epley
  return weight * (1 + reps / 30);
}

// ---------------------- Volume by muscle ----------------------

function renderVolumeChart() {
  const canvas = $('#volumeChart');
  const data = volumeByMuscleLastDays(30);
  const labels = data.map(d => d.muscle);
  const values = data.map(d => Math.round(d.volume));

  if (!labels.length) {
    clearChart(canvas);
    return;
  }

  barChart(canvas, labels, values, {
    color: '#27c093',
    xLabelRotation: 20,
    yFormatter: () => ''
  });
}

function volumeByMuscleLastDays(days = 30) {
  const cutoff = addDays(new Date(), -days);
  const byMuscle = new Map();

  for (const w of Storage.getWorkouts()) {
    const d = parseYMD(w.date);
    if (!d || d < cutoff) continue;

    for (const ex of w.exercises || []) {
      const meta = getExerciseById(ex.exerciseId);
      const muscle = meta ? meta.primaryMuscle : 'Unknown';
      const vol = (ex.sets || []).reduce((sum, s) => {
        const reps = Number(s.reps) || 0;
        const weight = Number(s.weight) || 0;
        return sum + reps * weight;
      }, 0);
      byMuscle.set(muscle, (byMuscle.get(muscle) || 0) + vol);
    }
  }

  const arr = Array.from(byMuscle.entries()).map(([muscle, volume]) => ({ muscle, volume }));
  arr.sort((a, b) => b.volume - a.volume);
  return arr.slice(0, 8);
}

// ---------------------- Body metrics ----------------------

function initMetricsForm() {
  const dateEl = $('#metricsDate');
  if (!dateEl.value) dateEl.value = formatDateInputValue();
}

function onSaveMetrics() {
  const date = $('#metricsDate').value;
  const weight = Number($('#bodyWeight').value);
  const waist = Number($('#waist').value);

  if (!date) return;
  const record = { date };
  if (Number.isFinite(weight) && weight > 0) record.weight = weight;
  if (Number.isFinite(waist) && waist > 0) record.waist = waist;

  // Merge with existing entry for the day
  const all = Storage.getMetrics();
  const idx = all.findIndex(m => m.date === date);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...record };
    Storage.saveMetrics(all);
  } else {
    Storage.addMetric(record);
  }

  // Feedback
  const btn = $('#btnSaveMetrics');
  btn.textContent = 'Saved ✓';
  setTimeout(() => { btn.textContent = 'Save Metrics'; }, 1200);

  renderMetricsCharts();
}

function renderMetricsCharts() {
  const weightCanvas = $('#weightChart');
  const waistCanvas = $('#waistChart');

  const metrics = Storage.getMetrics().slice().sort((a, b) => a.date.localeCompare(b.date));
  const labels = metrics.map(m => m.date);
  const weightVals = metrics.map(m => Number.isFinite(m.weight) ? m.weight : NaN);
  const waistVals = metrics.map(m => Number.isFinite(m.waist) ? m.waist : NaN);

  if (labels.length) {
    lineChart(weightCanvas, labels, weightVals, { color: '#4f7cff', fill: true, xTickCount: 8 });
    lineChart(waistCanvas, labels, waistVals, { color: '#ff8a4f', fill: true, xTickCount: 8 });
  } else {
    clearChart(weightCanvas);
    clearChart(waistCanvas);
  }
}

// ---------------------- Import / Export helpers ----------------------

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
    // let everyone refresh
    window.dispatchEvent(new CustomEvent('data:imported'));
  } catch (err) {
    console.warn('Import failed:', err);
    alert('Invalid JSON file.');
  } finally {
    // reset input so same file can be chosen again later
    e.target.value = '';
  }
}

// ---------------------- Date helpers ----------------------

function parseYMD(ymd) {
  if (!ymd || typeof ymd !== 'string') return null;
  const [y, m, d] = ymd.split('-').map(x => parseInt(x, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function addDays(dt, n) {
  const copy = new Date(dt.getTime());
  copy.setDate(copy.getDate() + n);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
