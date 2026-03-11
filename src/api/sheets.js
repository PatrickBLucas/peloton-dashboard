// src/api/sheets.js
// All Google Sheets data access

const SHEET_ID = '1hJ_bHtAyoPoDr2QN1098L0frfIrh6aM-ykhlHtcnOgs';
const BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

async function fetchRange(accessToken, range) {
  const url = `${BASE_URL}/${SHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Sheets API error: ${res.status}`);
  const data = await res.json();
  return data.values || [];
}

function parseDate(val) {
  if (!val) return null;
  // If it's already a YYYY-MM-DD string, parse without timezone shift
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-').map(Number);
    return new Date(y, m - 1, d); // local time, no UTC shift
  }
  const d = new Date(val);
  return isNaN(d) ? null : d;
}

function toNum(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

// ── Peloton workouts from Strava Data sheet ──────────────────────────────────
export async function fetchWorkouts(accessToken) {
  // Strava Data: Start Date | Name | Type | Distance (m) | Moving Time (min) | Elapsed Time (s) | Calories
  const rows = await fetchRange(accessToken, 'Strava Data!A2:G1000');
  return rows
    .filter(r => r[0])
    .map(r => ({
      date: parseDate(r[0]),
      name: r[1] || '',
      type: r[2] || '',
      distanceM: toNum(r[3]),
      movingTimeMin: toNum(r[4]),
      elapsedTimeSec: toNum(r[5]),
      calories: toNum(r[6]),
    }))
    .filter(w => w.date);
}

// ── Fitbit daily data ────────────────────────────────────────────────────────
// Row 4 is header, data starts row 5
// Col indices (0-based): 0=Date, 2=activityCalories, 3=caloriesBMR, 4=caloriesOut,
// 6=fairlyActiveMinutes, 8=lightlyActiveMinutes, 11=steps, 12=veryActiveMinutes,
// 13=bmi, 14=weight, 22=minutesAsleep, 28=timeInBed, 29=calories(food),
// 30=carbs, 32=fiber, 33=protein
export async function fetchFitbitData(accessToken) {
  const rows = await fetchRange(accessToken, 'Fitbit Data!A5:AJ1000');
  return rows
    .filter(r => r[0])
    .map(r => ({
      date: parseDate(r[0]),
      activityCalories: toNum(r[2]),
      caloriesBMR: toNum(r[3]),
      caloriesOut: toNum(r[4]),
      fairlyActiveMin: toNum(r[6]),
      lightlyActiveMin: toNum(r[8]),
      steps: toNum(r[11]),
      veryActiveMin: toNum(r[12]),
      bmi: toNum(r[13]),
      weight: toNum(r[14]),
      minutesAsleep: toNum(r[22]),
      timeInBed: toNum(r[28]),
      caloriesConsumed: toNum(r[29]),
      carbs: toNum(r[30]),
      fat: toNum(r[31]),
      fiber: toNum(r[32]),
      protein: toNum(r[33]),
    }))
    .filter(d => d.date);
}

// ── Weight log ───────────────────────────────────────────────────────────────
export async function fetchWeight(accessToken) {
  const rows = await fetchRange(accessToken, 'Weight!A2:B1000');
  return rows
    .filter(r => r[0] && r[1])
    .map(r => ({
      date: parseDate(r[0]),
      weight: toNum(r[1]),
    }))
    .filter(w => w.date && w.weight);
}

// ── Goal weight (Weight!D1) ───────────────────────────────────────────────────
export async function fetchGoalWeight(accessToken) {
  const rows = await fetchRange(accessToken, 'Weight!D1');
  const val = toNum(rows?.[0]?.[0]);
  return val ?? 180;
}

export async function saveGoalWeight(accessToken, goalWeight) {
  const url = `${BASE_URL}/${SHEET_ID}/values/${encodeURIComponent('Weight!D1')}?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [[goalWeight]] }),
  });
  if (!res.ok) throw new Error(`Failed to save goal weight: ${res.status}`);
  return await res.json();
}


// Mifflin-St Jeor for men: BMR = (10 × kg) + (6.25 × cm) - (5 × age) + 5
const HEIGHT_CM = 182.88; // 6 feet
const BIRTHDAY = new Date('1982-08-25');
const GOAL_WEIGHT = 180; // fallback default

function getAge() {
  const today = new Date();
  let age = today.getFullYear() - BIRTHDAY.getFullYear();
  const m = today.getMonth() - BIRTHDAY.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < BIRTHDAY.getDate())) age--;
  return age;
}

function lbsToKg(lbs) { return lbs * 0.453592; }

export function computeStats(weightEntries, fitbitData, workouts, goalWeight = GOAL_WEIGHT) {
  const latestWeight = weightEntries.filter(w => w.weight).slice(-1)[0];
  const startWeight = weightEntries.filter(w => w.weight)[0];
  const currentWeightLbs = latestWeight?.weight ?? null;
  const age = getAge();

  let bmr = null;
  let tdee = null;
  if (currentWeightLbs) {
    const kg = lbsToKg(currentWeightLbs);
    bmr = Math.round((10 * kg) + (6.25 * HEIGHT_CM) - (5 * age) + 5);
    tdee = Math.round(bmr * 1.55); // moderate activity
  }

  const weightLost = (startWeight && latestWeight)
    ? Math.round((startWeight.weight - latestWeight.weight) * 10) / 10
    : null;
  const poundsToGo = currentWeightLbs
    ? Math.round((currentWeightLbs - goalWeight) * 10) / 10
    : null;

  // Today and yesterday from Fitbit
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  const yesterdayStr = `${yest.getFullYear()}-${String(yest.getMonth()+1).padStart(2,'0')}-${String(yest.getDate()).padStart(2,'0')}`;

  const toDateStr = (d) => {
    const dt = d instanceof Date ? d : new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  };

  const todayData = fitbitData.find(d => toDateStr(d.date) === todayStr);
  const yesterdayData = fitbitData.find(d => toDateStr(d.date) === yesterdayStr);

  const totalMinutes = workouts.reduce((s, w) => s + (w.movingTimeMin || 0), 0);

  return {
    bmr,
    tdee,
    age,
    goalWeight: goalWeight,
    currentWeight: currentWeightLbs,
    weightLost,
    poundsToGo,
    rides: workouts.length,
    todayBurned: todayData?.caloriesOut ?? null,
    todayConsumed: todayData?.caloriesConsumed ?? null,
    todaySteps: todayData?.steps ?? null,
    yesterdayBurned: yesterdayData?.caloriesOut ?? null,
    yesterdayConsumed: yesterdayData?.caloriesConsumed ?? null,
    yesterdaySteps: yesterdayData?.steps ?? null,
    totalMinutes,
  };
}

// ── Apps Script triggers ─────────────────────────────────────────────────────
const SCRIPT_ID = '1dgNJX1OurqvcdZAQm-5B779AnMf4Wr1QPsX9zooThThq_FZ-qwU5ZPZQ';
const DEPLOYMENT_ID = 'AKfycbzOR3mrCPG5jBUB4MOQz0LXZ_qrnialOk1RB5R7_mfRdYf4ce5ggzNUE2IjvR36fSx0';

export async function triggerSync(accessToken, functionName) {
  const url = `https://script.googleapis.com/v1/scripts/${DEPLOYMENT_ID}:run`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      function: functionName,
      devMode: false,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `Script API error: ${res.status}`);
  }
  return await res.json();
}

// ── 10-8 monthly activity (P. Lucas Master) ──────────────────────────────────
export async function fetch108(accessToken) {
  const rows = await fetchRange(accessToken, 'P. Lucas Master!A5:C40');
  return rows
    .filter(r => r[0] && r[2])
    .map(r => ({
      date: parseDate(r[0]),
      description: r[1] || '',
      minutes: toNum(r[2]),
    }))
    .filter(r => r.date);
}