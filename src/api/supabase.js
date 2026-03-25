// src/api/supabase.js
// All data access via Supabase

import { supabase } from '../lib/supabase';

const KG_TO_LBS = 2.20462;
const HEIGHT_CM = 182.88;
const BIRTHDAY  = new Date('1982-08-25');
const DEFAULT_GOAL_WEIGHT = 180;

function parseDate(val) {
  if (!val) return null;
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(val);
  return isNaN(d) ? null : d;
}

function getAge() {
  const today = new Date();
  let age = today.getFullYear() - BIRTHDAY.getFullYear();
  const m = today.getMonth() - BIRTHDAY.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < BIRTHDAY.getDate())) age--;
  return age;
}

function lbsToKg(lbs) { return lbs * 0.453592; }

function toDateStr(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

// ── Workouts ──────────────────────────────────────────────────────────────────
export async function fetchWorkouts(userId) {
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(r => ({
    id:          r.id,
    date:        parseDate(r.date),
    title:       r.title || '',
    type:        r.type || '',
    durationMin: r.duration_min,
    calories:    r.calories,
    outputKj:    r.output_kj,
    avgCadence:  r.avg_cadence,
    avgRes:      r.avg_resistance,
    hrZ1:        r.hr_z1,
    hrZ2:        r.hr_z2,
    hrZ3:        r.hr_z3,
    hrZ4:        r.hr_z4,
    hrZ5:        r.hr_z5,
    effortScore: r.effort_score,
    instructor:  r.instructor || '',
    workoutId:   r.strava_id  || '',
  }));
}

// ── Fitbit daily data ─────────────────────────────────────────────────────────
export async function fetchFitbitData(userId) {
  const { data, error } = await supabase
    .from('fitbit_daily')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(r => ({
    date:             parseDate(r.date),
    caloriesOut:      r.calories_out,
    steps:            r.steps,
    fairlyActiveMin:  r.fairly_active_min,
    lightlyActiveMin: r.lightly_active_min,
    veryActiveMin:    r.very_active_min,
    weight:           r.weight_kg ? Math.round(r.weight_kg * KG_TO_LBS * 10) / 10 : null,
    weightKg:         r.weight_kg,
    bmi:              r.bmi,
    minutesAsleep:    r.minutes_asleep,
    minutesAwake:     r.minutes_awake,
    timeInBed:        r.time_in_bed,
    efficiency:       r.efficiency,
    restlessCount:    r.restless_count,
    restlessDuration: r.restless_duration,
    caloriesConsumed: null, // food comes from food_log, not Fitbit
  }));
}

// ── Weight (derived from fitbit_daily) ────────────────────────────────────────
export async function fetchWeight(userId) {
  const { data, error } = await supabase
    .from('fitbit_daily')
    .select('date, weight_kg')
    .eq('user_id', userId)
    .not('weight_kg', 'is', null)
    .order('date', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(r => ({
    date:   parseDate(r.date),
    weight: Math.round(r.weight_kg * KG_TO_LBS * 10) / 10,
  }));
}

// ── Goal weight ───────────────────────────────────────────────────────────────
export async function fetchGoalWeight(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('goal_weight_lbs')
    .eq('id', userId)
    .single();
  if (error) return DEFAULT_GOAL_WEIGHT;
  return data?.goal_weight_lbs ?? DEFAULT_GOAL_WEIGHT;
}

export async function saveGoalWeight(userId, goalWeight) {
  const { error } = await supabase
    .from('users')
    .upsert({ id: userId, goal_weight_lbs: goalWeight }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

// ── 10-8 tracker ──────────────────────────────────────────────────────────────
export async function fetch108(userId) {
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const { data, error } = await supabase
    .from('tracker_log')
    .select('*')
    .eq('user_id', userId)
    .gte('date', firstOfMonth)
    .order('date', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(r => ({
    date:        parseDate(r.date),
    description: r.description || '',
    minutes:     r.minutes,
  }));
}

// ── Food log ──────────────────────────────────────────────────────────────────
export async function fetchFoodLog(userId) {
  const { data, error } = await supabase
    .from('food_log')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(r => ({
    id:          r.id,
    date:        r.date,
    time:        r.time || '',
    description: r.description || '',
    calories:    r.calories,
    protein:     r.protein,
    carbs:       r.carbs,
    fat:         r.fat,
    source:      r.source || '',
  }));
}

export async function appendFoodEntry(userId, entry) {
  const { error } = await supabase
    .from('food_log')
    .insert({
      user_id:     userId,
      date:        entry.date,
      time:        entry.time || null,
      description: entry.description,
      calories:    entry.calories || 0,
      protein:     entry.protein  || 0,
      carbs:       entry.carbs    || 0,
      fat:         entry.fat      || 0,
      source:      entry.source   || null,
    });
  if (error) throw new Error(error.message);
}

export async function deleteFoodEntry(entryId) {
  const { error } = await supabase
    .from('food_log')
    .delete()
    .eq('id', entryId);
  if (error) throw new Error(error.message);
}

// ── Saved meals ───────────────────────────────────────────────────────────────
export async function fetchSavedMeals(userId) {
  const { data, error } = await supabase
    .from('saved_meals')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(r => ({
    id:       r.id,
    name:     r.name,
    calories: r.calories,
    protein:  r.protein,
    carbs:    r.carbs,
    fat:      r.fat,
    notes:    r.notes || '',
  }));
}

export async function saveMeal(userId, meal) {
  const { error } = await supabase
    .from('saved_meals')
    .insert({
      user_id:  userId,
      name:     meal.name,
      calories: meal.calories || 0,
      protein:  meal.protein  || 0,
      carbs:    meal.carbs    || 0,
      fat:      meal.fat      || 0,
      notes:    meal.notes    || null,
    });
  if (error) throw new Error(error.message);
}

export async function deleteSavedMeal(mealId) {
  const { error } = await supabase
    .from('saved_meals')
    .delete()
    .eq('id', mealId);
  if (error) throw new Error(error.message);
}

export async function updateSavedMeal(mealId, meal) {
  const { error } = await supabase
    .from('saved_meals')
    .update({
      name:     meal.name,
      calories: meal.calories,
      protein:  meal.protein,
      carbs:    meal.carbs,
      fat:      meal.fat,
      notes:    meal.notes || null,
    })
    .eq('id', mealId);
  if (error) throw new Error(error.message);
}

// ── Food library (shared) ─────────────────────────────────────────────────────
export async function fetchFoodLibrary() {
  const { data, error } = await supabase
    .from('food_library')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(r => ({
    id:       r.id,
    name:     r.name,
    unit:     r.unit || '1 serving',
    calories: r.calories,
    protein:  r.protein,
    carbs:    r.carbs,
    fat:      r.fat,
  }));
}

export async function saveFoodLibraryItem(userId, item) {
  const { error } = await supabase
    .from('food_library')
    .insert({
      name:       item.name,
      unit:       item.unit,
      calories:   item.calories,
      protein:    item.protein,
      carbs:      item.carbs,
      fat:        item.fat,
      created_by: userId,
    });
  if (error) throw new Error(error.message);
}

export async function deleteFoodLibraryItem(itemId) {
  const { error } = await supabase
    .from('food_library')
    .delete()
    .eq('id', itemId);
  if (error) throw new Error(error.message);
}

// ── Coach report ──────────────────────────────────────────────────────────────
export async function fetchCoachReport(userId) {
  const { data, error } = await supabase
    .from('coach_reports')
    .select('report, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error) return { report: null, updatedAt: null };
  return { report: data.report, updatedAt: data.created_at };
}

export async function saveCoachReport(userId, report) {
  const { error } = await supabase
    .from('coach_reports')
    .insert({ user_id: userId, report });
  if (error) throw new Error(error.message);
}

// ── Stats computation (pure, no DB calls) ─────────────────────────────────────
export function computeStats(weightEntries, fitbitData, workouts, goalWeight = DEFAULT_GOAL_WEIGHT, foodLog = []) {
  const latestWeight = weightEntries.filter(w => w.weight).slice(-1)[0];
  const startWeight  = weightEntries.filter(w => w.weight)[0];
  const currentWeightLbs = latestWeight?.weight ?? null;
  const age = getAge();

  let bmr = null, tdee = null, activityFactor = 1.55, activityLevel = 'Moderate';

  if (currentWeightLbs) {
    const kg = lbsToKg(currentWeightLbs);
    bmr = Math.round((10 * kg) + (6.25 * HEIGHT_CM) - (5 * age) + 5);

    const now = new Date();
    const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentFitbit = fitbitData.filter(d => d.date >= sevenDaysAgo);

    const avgSteps = recentFitbit.length > 0
      ? recentFitbit.reduce((s, d) => s + (d.steps || 0), 0) / recentFitbit.length : 0;
    const avgActiveMin = recentFitbit.length > 0
      ? recentFitbit.reduce((s, d) => s + (d.veryActiveMin || 0) + (d.fairlyActiveMin || 0), 0) / recentFitbit.length : 0;
    const recentRides = workouts.filter(w => w.type === 'cycling' && w.date >= sevenDaysAgo).length;

    let score = 0;
    if (avgSteps >= 12500) score += 3; else if (avgSteps >= 10000) score += 2; else if (avgSteps >= 7500) score += 1;
    if (avgActiveMin >= 60) score += 3; else if (avgActiveMin >= 45) score += 2; else if (avgActiveMin >= 30) score += 1;
    if (recentRides >= 4) score += 3; else if (recentRides >= 3) score += 2; else if (recentRides >= 2) score += 1;

    if      (score >= 7) { activityFactor = 1.725; activityLevel = 'Very Active'; }
    else if (score >= 5) { activityFactor = 1.65;  activityLevel = 'Active'; }
    else if (score >= 3) { activityFactor = 1.55;  activityLevel = 'Moderate'; }
    else if (score >= 1) { activityFactor = 1.375; activityLevel = 'Light'; }
    else                 { activityFactor = 1.2;   activityLevel = 'Sedentary'; }

    tdee = Math.round(bmr * activityFactor);
  }

  const weightLost = (startWeight && latestWeight)
    ? Math.round((startWeight.weight - latestWeight.weight) * 10) / 10 : null;
  const poundsToGo = currentWeightLbs
    ? Math.round((currentWeightLbs - goalWeight) * 10) / 10 : null;

  const now = new Date();
  const todayStr     = toDateStr(now);
  const yest         = new Date(now); yest.setDate(yest.getDate() - 1);
  const yesterdayStr = toDateStr(yest);

  const todayData     = fitbitData.find(d => toDateStr(d.date) === todayStr);
  const yesterdayData = fitbitData.find(d => toDateStr(d.date) === yesterdayStr);

  const totalMinutes = workouts.reduce((s, w) => s + (w.durationMin || 0), 0);

  const todayFoodCals = foodLog
    .filter(e => e.date === todayStr)
    .reduce((s, e) => s + (e.calories || 0), 0);
  const yesterdayFoodCals = foodLog
    .filter(e => e.date === yesterdayStr)
    .reduce((s, e) => s + (e.calories || 0), 0);

  return {
    bmr, tdee, activityFactor, activityLevel, age, goalWeight,
    currentWeight:    currentWeightLbs,
    weightLost,
    poundsToGo,
    rides:            workouts.length,
    todayBurned:      todayData?.caloriesOut      ?? null,
    todayConsumed:    todayFoodCals               || null,
    todaySteps:       todayData?.steps            ?? null,
    yesterdayBurned:  yesterdayData?.caloriesOut  ?? null,
    yesterdayConsumed: yesterdayFoodCals          || null,
    yesterdaySteps:   yesterdayData?.steps        ?? null,
    totalMinutes,
  };
}

// ── Sleep stats (7-day rolling averages, pure) ────────────────────────────────
export function computeSleepStats(fitbitData) {
  const now = new Date();
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recent = fitbitData.filter(d => d.date >= sevenDaysAgo && d.minutesAsleep > 0);
  if (recent.length === 0) return { avgHours: null, avgEfficiency: null, avgRestlessCount: null, sampleDays: 0 };

  const avgMinutesAsleep = recent.reduce((s, d) => s + (d.minutesAsleep || 0), 0) / recent.length;
  const avgHours = Math.round(avgMinutesAsleep / 60 * 10) / 10;

  const withEfficiency = recent.filter(d => d.efficiency > 0);
  const avgEfficiency = withEfficiency.length > 0
    ? Math.round(withEfficiency.reduce((s, d) => s + d.efficiency, 0) / withEfficiency.length) : null;

  const withRestless = recent.filter(d => d.restlessCount !== null);
  const avgRestlessCount = withRestless.length > 0
    ? Math.round(withRestless.reduce((s, d) => s + (d.restlessCount || 0), 0) / withRestless.length * 10) / 10 : null;

  return { avgHours, avgEfficiency, avgRestlessCount, sampleDays: recent.length };
}

// ── Claude AI nutrition estimate ──────────────────────────────────────────────
// Calls the Anthropic API directly from the browser (no Apps Script proxy needed)
export async function estimateNutrition(messages) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(
    'https://hmtevflfryjkudkcpmac.supabase.co/functions/v1/claude-proxy',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdGV2Zmxmcnlqa3Vka2NwbWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzA3NzgsImV4cCI6MjA4OTk0Njc3OH0.9riWHdjPggS9so5VXzcOmlQ-gsAREzZhfRmNAEEe2Rw',
      },
      body: JSON.stringify({
        messages,
        system: 'You are a nutrition expert. When given a food description or photo, respond with a JSON object containing: description (string), calories (number), protein (number in grams), carbs (number in grams), fat (number in grams). Respond with JSON only, no other text.',
        max_tokens: 500,
      }),
    }
  );

  if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
  const data = await res.json();

  try {
    const clean = data.text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    throw new Error('Failed to parse nutrition estimate');
  }
}