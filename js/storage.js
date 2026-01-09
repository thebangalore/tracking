/**
 * Storage abstraction for Gym Planner & Tracker
 * - Uses localStorage, with simple schema versioning and namespacing
 * - Provides export/import for backups
 * - All getters return sane defaults
 */

const NS = 'gp.v1';

const KEYS = {
  plan: `${NS}.plan`,
  workouts: `${NS}.workouts`,
  metrics: `${NS}.metrics`,
  settings: `${NS}.settings`,
  exercisesCache: `${NS}.exercisesCache` // cache of exercises.json to allow offline + file:// fallback
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(fallback);
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Storage read error for', key, e);
    return structuredClone(fallback);
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Storage write error for', key, e);
  }
}

export const Storage = {
  // Plan
  getPlan() {
    return read(KEYS.plan, { name: 'My Plan', days: [], meta: { goal: 'hypertrophy', daysPerWeek: 3, equipment: [] } });
  },
  savePlan(plan) {
    write(KEYS.plan, plan);
  },

  // Workouts
  getWorkouts() {
    // workouts stored as array of {date: 'YYYY-MM-DD', planDayIndex, exercises: [{exerciseId, sets:[{reps, weight}]}]}
    return read(KEYS.workouts, []);
  },
  saveWorkouts(workouts) {
    write(KEYS.workouts, workouts);
  },
  upsertWorkout(workout) {
    const all = this.getWorkouts();
    const idx = all.findIndex(w => w.date === workout.date);
    if (idx >= 0) all[idx] = workout;
    else all.push(workout);
    this.saveWorkouts(all);
  },
  deleteWorkoutByDate(date) {
    const all = this.getWorkouts().filter(w => w.date !== date);
    this.saveWorkouts(all);
  },

  // Body metrics
  getMetrics() {
    // [{date, weight, waist}]
    return read(KEYS.metrics, []);
  },
  saveMetrics(metrics) {
    write(KEYS.metrics, metrics);
  },
  addMetric(metric) {
    const all = this.getMetrics();
    const idx = all.findIndex(m => m.date === metric.date);
    if (idx >= 0) all[idx] = metric;
    else all.push(metric);
    // sort by date asc
    all.sort((a, b) => a.date.localeCompare(b.date));
    this.saveMetrics(all);
  },

  // Settings
  getSettings() {
    return read(KEYS.settings, { theme: 'dark' });
  },
  saveSettings(settings) {
    write(KEYS.settings, settings);
  },

  // Exercises cache
  getExercisesCache() {
    return read(KEYS.exercisesCache, { updatedAt: null, items: [] });
  },
  saveExercisesCache(cache) {
    write(KEYS.exercisesCache, cache);
  },

  // Export / Import
  exportAll() {
    const payload = {
      version: NS,
      exportedAt: new Date().toISOString(),
      plan: this.getPlan(),
      workouts: this.getWorkouts(),
      metrics: this.getMetrics(),
      settings: this.getSettings()
      // exercises.json is static and not required for export; user can restore it by redeploying files
    };
    return payload;
  },

  importAll(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid import payload');
    if (!payload.version || !String(payload.version).startsWith('gp.v')) {
      console.warn('Importing data with unknown version, attempting best-effort restore.');
    }
    if (payload.plan) this.savePlan(payload.plan);
    if (Array.isArray(payload.workouts)) this.saveWorkouts(payload.workouts);
    if (Array.isArray(payload.metrics)) this.saveMetrics(payload.metrics);
    if (payload.settings) this.saveSettings(payload.settings);
    // Do not overwrite exercises cache from import; it is derived from bundled JSON.
  }
};
