/**
 * Exercises loading and helpers
 * - Loads from exercises.json (works on GitHub Pages/https)
 * - Falls back to cached copy (Storage.exercisesCache)
 * - If both fail (e.g., file:// restrictions on first load), uses a tiny built-in fallback list
 */

import { Storage } from './storage.js';

const FALLBACK = [
  { id: 'bb_squat', name: 'Barbell Back Squat', primaryMuscle: 'Quads', equipment: 'Barbell', pattern: 'Squat' },
  { id: 'bb_deadlift', name: 'Barbell Deadlift', primaryMuscle: 'Hamstrings', equipment: 'Barbell', pattern: 'Hinge' },
  { id: 'bb_bench', name: 'Barbell Bench Press', primaryMuscle: 'Chest', equipment: 'Barbell', pattern: 'Horizontal Push' },
  { id: 'bb_ohp', name: 'Barbell Overhead Press', primaryMuscle: 'Shoulders', equipment: 'Barbell', pattern: 'Vertical Push' },
  { id: 'bb_row', name: 'Barbell Row', primaryMuscle: 'Back', equipment: 'Barbell', pattern: 'Horizontal Pull' },
  { id: 'pu', name: 'Pull-up', primaryMuscle: 'Back', equipment: 'Bodyweight', pattern: 'Vertical Pull' },
  { id: 'db_curl', name: 'Dumbbell Curl', primaryMuscle: 'Biceps', equipment: 'Dumbbell', pattern: 'Accessory' },
  { id: 'db_lateral', name: 'Dumbbell Lateral Raise', primaryMuscle: 'Shoulders', equipment: 'Dumbbell', pattern: 'Accessory' },
  { id: 'leg_press', name: 'Leg Press', primaryMuscle: 'Quads', equipment: 'Machine', pattern: 'Squat' },
  { id: 'cable_row', name: 'Cable Row', primaryMuscle: 'Back', equipment: 'Cable', pattern: 'Horizontal Pull' },
  { id: 'pushup', name: 'Push-up', primaryMuscle: 'Chest', equipment: 'Bodyweight', pattern: 'Horizontal Push' },
  { id: 'kb_swing', name: 'Kettlebell Swing', primaryMuscle: 'Hamstrings', equipment: 'Kettlebell', pattern: 'Hinge' },
  { id: 'hip_thrust', name: 'Barbell Hip Thrust', primaryMuscle: 'Glutes', equipment: 'Barbell', pattern: 'Hinge' },
  { id: 'db_incline', name: 'Dumbbell Incline Press', primaryMuscle: 'Chest', equipment: 'Dumbbell', pattern: 'Horizontal Push' },
  { id: 'lat_pulldown', name: 'Lat Pulldown', primaryMuscle: 'Back', equipment: 'Machine', pattern: 'Vertical Pull' },
];

let EXERCISES = [];
let LOADED = false;

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function loadExercises() {
  if (LOADED) return EXERCISES;
  // Try network first
  try {
    const data = await fetchJson('./exercises.json');
    if (Array.isArray(data) && data.length) {
      EXERCISES = normalize(data);
      Storage.saveExercisesCache({ updatedAt: new Date().toISOString(), items: EXERCISES });
      LOADED = true;
      return EXERCISES;
    }
  } catch (e) {
    console.warn('Network load of exercises.json failed, trying cache.', e);
  }
  // Fallback to cache
  const cache = Storage.getExercisesCache();
  if (Array.isArray(cache.items) && cache.items.length) {
    EXERCISES = normalize(cache.items);
    LOADED = true;
    return EXERCISES;
  }
  // Built-in tiny fallback
  EXERCISES = normalize(FALLBACK);
  LOADED = true;
  return EXERCISES;
}

function normalize(items) {
  return items.map(it => ({
    id: String(it.id),
    name: String(it.name),
    primaryMuscle: String(it.primaryMuscle),
    equipment: String(it.equipment),
    pattern: String(it.pattern)
  }));
}

export function getExercises() {
  return EXERCISES.slice();
}

export function getExerciseById(id) {
  return EXERCISES.find(e => e.id === id) || null;
}

export function uniqueMuscles() {
  return Array.from(new Set(EXERCISES.map(e => e.primaryMuscle))).sort();
}

export function uniqueEquipment() {
  return Array.from(new Set(EXERCISES.map(e => e.equipment))).sort();
}

export function uniquePatterns() {
  return Array.from(new Set(EXERCISES.map(e => e.pattern))).sort();
}

export function filterExercises({ search = '', muscle = '', equipment = '', pattern = '' } = {}) {
  const q = search.trim().toLowerCase();
  return EXERCISES.filter(e => {
    if (q && !e.name.toLowerCase().includes(q)) return false;
    if (muscle && e.primaryMuscle !== muscle) return false;
    if (equipment && e.equipment !== equipment) return false;
    if (pattern && e.pattern !== pattern) return false;
    return true;
  });
}

/**
 * Returns a list filtered by allowed equipment set (array of strings).
 * If allowedEquip is empty, no filtering by equipment.
 */
export function byEquipmentAvailability(allowedEquip = []) {
  const set = new Set(allowedEquip);
  if (!set.size) return getExercises();
  return EXERCISES.filter(e => set.has(e.equipment));
}
