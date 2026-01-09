/**
 * Storage abstraction (Workout-only version)
 * Namespace bumped to wt.v1 to keep data isolated from prior version.
 * Data persisted in localStorage.
 *
 * Models:
 * Workout = {
 *   date: 'YYYY-MM-DD',
 *   exercises: [{ exerciseId: string, sets: [{ reps:number, weight:number }] }]
 * }
 */

const NS = 'wt.v1';

const KEYS = {
  workouts: `${NS}.workouts`,
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
  // Workouts
  getWorkouts() {
    // workouts stored as array of {date: 'YYYY-MM-DD', exercises: [{exerciseId, sets:[{reps, weight}]}]}
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
    // keep sorted by date asc
    all.sort((a, b) => a.date.localeCompare(b.date));
    this.saveWorkouts(all);
  },
  deleteWorkoutByDate(date) {
    const all = this.getWorkouts().filter(w => w.date !== date);
    this.saveWorkouts(all);
  },

  // Exercises cache (for exercises.json offline fallback)
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
      workouts: this.getWorkouts()
    };
    return payload;
  },

  importAll(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid import payload');
    if (!payload.version || !String(payload.version).startsWith('wt.v')) {
      console.warn('Importing data with unknown version, attempting best-effort restore.');
    }
    if (Array.isArray(payload.workouts)) this.saveWorkouts(payload.workouts);
  }
};
