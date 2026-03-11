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
  // Sheets returns dates as strings like "2/3/2025" or "2025-02-03"
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

// ── Peloton Log (detailed ride metrics) ─────────────────────────────────────
export async function fetchPelotonLog(accessToken) {
  const rows = await fetchRange(accessToken, 'Peloton Log!A2:P1000');
  return rows
    .filter(r => r[0])
    .map(r => ({
      date: parseDate(r[0]),
      liveOnDemand: r[1] || '',
      instructor: r[2] || '',
      lengthMin: toNum(r[3]),
      discipline: r[4] || '',
      type: r[5] || '',
      title: r[6] || '',
      totalOutput: toNum(r[8]),
      avgWatts: toNum(r[9]),
      avgResistance: toNum(r[10]),
      avgCadence: toNum(r[11]),
      avgSpeed: toNum(r[12]),
      distanceMi: toNum(r[13]),
      caloriesBurned: toNum(r[14]),
      avgHeartrate: toNum(r[15]),
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

// ── Stats At A Glance (computed values) ──────────────────────────────────────
export async function fetchStats(accessToken) {
  const rows = await fetchRange(accessToken, 'Stats At A Glance!A1:H15');
  // Parse key values by row label
  const find = (label) => {
    const row = rows.find(r => r[0] && r[0].toString().toLowerCase().includes(label.toLowerCase()));
    return row ? { total: toNum(row[1]), max: toNum(row[2]), min: toNum(row[3]), avg: toNum(row[4]) } : null;
  };

  // Pull yesterday/today calorie info from cols H/I rows 2-3
  const yesterdayConsumed = toNum(rows[1]?.[7]);
  const yesterdayBurned = toNum(rows[1]?.[8]);
  const todayConsumed = toNum(rows[2]?.[7]);
  const todayBurned = toNum(rows[2]?.[8]);

  // BMR row 8, Exp Date row 9, Goal Weight row 10, Start row 11
  const bmr = toNum(rows[7]?.[7]);
  const expDateRaw = rows[8]?.[7];
  const goalWeight = toNum(rows[9]?.[1]);
  const weightLost = toNum(rows[7]?.[1]);
  const poundsToGo = rows[8] ? rows[8][1] : null;
  const steps = toNum(rows[4]?.[7]);
  const rides = toNum(rows[5]?.[7]);

  return {
    caloriesBurned: find('Calories Burned'),
    distance: find('Total Distance'),
    totalOutput: find('Total Output'),
    heartRate: find('Heart Rate'),
    weightLost: toNum(weightLost),
    poundsToGo: toNum(poundsToGo),
    goalWeight,
    bmr,
    expDate: expDateRaw,
    steps,
    rides,
    yesterdayConsumed,
    yesterdayBurned,
    todayConsumed,
    todayBurned,
  };
}

// ── Apps Script triggers ─────────────────────────────────────────────────────
const SCRIPT_ID = '1dgNJX1OurqvcdZAQm-5B779AnMf4Wr1QPsX9zooThThq_FZ-qwU5ZPZQ';
const DEPLOYMENT_ID = 'AKfycbzOR3mrCPG5jBUB4MOQz0LXZ_qrnialOk1RB5R7_mfRdYf4ce5ggzNUE2IjvR36fSx0';

export async function triggerSync(accessToken, functionName) {
  const url = `https://script.googleapis.com/v1/scripts/${SCRIPT_ID}:run`;
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