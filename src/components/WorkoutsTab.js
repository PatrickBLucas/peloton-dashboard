/**
 * Peloton Sync - Apps Script
 *
 * One-time setup in Project Settings > Script Properties:
 *   PELO_ACCESS_TOKEN  - Bearer token from browser (eyJhbGci...)
 *   PELO_REFRESH_TOKEN - v1.xxxx refresh token from browser
 *   PELO_USER_ID       - 92931c1c337540818157c01caf5649b3
 *   PELO_CLIENT_ID     - WVoJxVDdPoFx4RNewvvg6ch2mZ7bwnsM
 */

const PELO_SHEET_ID   = '1hJ_bHtAyoPoDr2QN1098L0frfIrh6aM-ykhlHtcnOgs';
const PELO_SHEET_NAME = 'Peloton';
const PELO_API        = 'https://api.onepeloton.com';
const PELO_AUTH_URL   = 'https://auth.onepeloton.com/oauth/token';
const PELO_PAGE_SIZE  = 100;
const TIME_LIMIT_MS   = 5 * 60 * 1000;

const PELO_COLUMNS = [
  'Date', 'Title', 'Type', 'Duration (min)',
  'Calories', 'Output (kJ)', 'Avg Cadence', 'Avg Resistance',
  'HR Z1 (min)', 'HR Z2 (min)', 'HR Z3 (min)', 'HR Z4 (min)', 'HR Z5 (min)',
  'Effort Score', 'Instructor', 'Workout ID'
];

const COL = {
  DATE:        1,
  TITLE:       2,
  TYPE:        3,
  DURATION:    4,
  CALORIES:    5,
  OUTPUT:      6,
  AVG_CADENCE: 7,
  AVG_RES:     8,
  HR_Z1:       9,
  HR_Z2:       10,
  HR_Z3:       11,
  HR_Z4:       12,
  HR_Z5:       13,
  EFFORT:      14,
  INSTRUCTOR:  15,
  WORKOUT_ID:  16,
};


// ── Entry points ──────────────────────────────────────────────────────────────

function syncPeloton() {
  const token  = getValidAccessToken();
  if (!token) return;

  const props  = PropertiesService.getScriptProperties();
  const userId = props.getProperty('PELO_USER_ID');

  const workouts = fetchAllWorkouts(token, userId);
  Logger.log(`Fetched ${workouts.length} workouts`);

  const newWorkouts = upsertToSheet(workouts);
  if (newWorkouts.length > 0) {
    Logger.log(`${newWorkouts.length} new workouts — flushing sheet then running backfill.`);
    // Flush all pending writes so backfillDetails reads fresh data
    SpreadsheetApp.flush();
    Utilities.sleep(500);
    backfillDetails(token, newWorkouts);
  } else {
    Logger.log('No new workouts to add.');
  }

  Logger.log('Peloton sync complete.');
}

function backfillPelotonDetails() {
  const token  = getValidAccessToken();
  if (!token) return;

  const props  = PropertiesService.getScriptProperties();
  const userId = props.getProperty('PELO_USER_ID');

  const workouts = fetchAllWorkouts(token, userId);
  backfillDetails(token, workouts);
}

// ── Debug: check what the API returns for a specific recent ride ──────────────
function debugRecentRide() {
  const token = getValidAccessToken();
  const workoutId = '8274792b8ed14de7a9cdc723af019039'; // 3/19 Rolling Hills Ride

  // Try performance graph with every_n=1 to get full resolution including HR segments
  Logger.log('=== PERFORMANCE GRAPH every_n=1 ===');
  const graph = pelotonGet(`/api/workout/${workoutId}/performance_graph?every_n=1`, token);
  Logger.log('Graph keys: ' + Object.keys(graph || {}).join(', '));
  const summaries = graph.summaries || [];
  summaries.forEach(s => Logger.log(`summary: ${s.slug} = ${s.value}`));

  // Check effort_zones and metrics
  Logger.log('effort_zones: ' + JSON.stringify(graph.effort_zones));
  Logger.log('metrics slugs: ' + JSON.stringify((graph.metrics || []).map(m => m.slug)));
  // Find heart rate metric
  const hrMetric = (graph.metrics || []).find(m => m.slug === 'heart_rate');
  if (hrMetric) Logger.log('heart_rate metric: ' + JSON.stringify(hrMetric).substring(0, 500));

  // Try the v2 workout endpoint
  Logger.log('=== V2 WORKOUT ===');
  const v2 = pelotonGet(`/api/v2/workout/${workoutId}`, token);
  Logger.log('V2 keys: ' + Object.keys(v2 || {}).join(', '));
  Logger.log('V2 zones: ' + JSON.stringify(v2.total_heart_rate_zone_durations));

  // Try workout segments
  Logger.log('=== SEGMENTS ===');
  const seg = pelotonGet(`/api/workout/${workoutId}/segments`, token);
  Logger.log('Segments keys: ' + Object.keys(seg || {}).join(', '));
}


// ── Backfill detail data (HR zones, duration, effort) ─────────────────────────

function backfillDetails(token, workouts) {
  const ss    = SpreadsheetApp.openById(PELO_SHEET_ID);
  const sheet = ss.getSheetByName(PELO_SHEET_NAME);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const startTime  = Date.now();
  let filled = 0, skipped = 0;

  // If specific workouts passed, only process those IDs
  const targetIds = workouts && workouts.length > 0
    ? new Set(workouts.map(w => w.id))
    : null;

  // When no specific targets, limit to last 7 days to avoid scanning old rows
  const cutoffDate = targetIds ? null : (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  })();

  // Always read fresh sheet data — never use stale pre-insert snapshot
  const freshLastRow = sheet.getLastRow();
  const sheetData    = sheet.getRange(2, 1, freshLastRow - 1, PELO_COLUMNS.length).getValues();

  // Process newest first (top of sheet) so recent rides always get filled first
  for (let i = 0; i < sheetData.length; i++) {
    const row        = sheetData[i];
    const workoutId  = row[COL.WORKOUT_ID - 1];
    const rowDate    = row[COL.DATE - 1];
    // Skip only if we have zones AND cadence AND resistance — all must be present
    const hasDetail = row[COL.HR_Z1 - 1] !== ''
                   && row[COL.AVG_CADENCE - 1] !== ''
                   && row[COL.AVG_RES - 1] !== '';

    // If targeting specific IDs, skip anything not in the list
    if (targetIds && !targetIds.has(workoutId)) { skipped++; continue; }
    // When scanning all, skip anything older than 7 days
    if (cutoffDate && rowDate && rowDate < cutoffDate) { skipped++; continue; }
    if (hasDetail || !workoutId) { skipped++; continue; }
    if (Date.now() - startTime > TIME_LIMIT_MS) {
      Logger.log(`Time limit hit after ${filled} fetches. Run backfillPelotonDetails to continue.`);
      break;
    }

    const detail = pelotonGet(`/api/workout/${workoutId}`, token);
    if (!detail || !detail.id) continue;

    const ride   = detail.ride || {};
    const rowNum = i + 2;

    const duration = ride.duration ? Math.round(ride.duration / 60) : '';
    const outputKj = detail.total_work ? Math.round(detail.total_work / 1000) : row[COL.OUTPUT - 1];

    // Fetch performance graph — zones now live in effort_zones, calories in summaries
    const graph     = pelotonGet(`/api/workout/${workoutId}/performance_graph?every_n=1`, token);
    const summaries = (graph && graph.summaries) ? graph.summaries : [];
    const calEntry  = summaries.find(s => s.slug === 'calories');
    const calories  = calEntry ? Math.round(calEntry.value) : '';

    // HR zones: try effort_zones first (newer API), fall back to detail field (older API)
    const effortZones = graph?.effort_zones?.heart_rate_zone_durations || detail.total_heart_rate_zone_durations || {};
    const effort      = graph?.effort_zones?.total_effort_points || detail.average_effort_score || '';

    const toMin = (secs) => secs ? Math.round(secs / 60 * 10) / 10 : '';
    const z1 = toMin(effortZones.heart_rate_z1_duration);
    const z2 = toMin(effortZones.heart_rate_z2_duration);
    const z3 = toMin(effortZones.heart_rate_z3_duration);
    const z4 = toMin(effortZones.heart_rate_z4_duration);
    const z5 = toMin(effortZones.heart_rate_z5_duration);

    // Avg cadence and resistance from performance graph average_summaries
    const avgSummaries = (graph && graph.average_summaries) ? graph.average_summaries : [];
    const getAvg = (slug) => {
      const entry = avgSummaries.find(s => s.slug === slug);
      return entry ? Math.round(entry.value * 10) / 10 : '';
    };
    const avgCadence    = getAvg('avg_cadence');
    const avgResistance = getAvg('avg_resistance');

    sheet.getRange(rowNum, COL.DURATION).setValue(duration);
    sheet.getRange(rowNum, COL.CALORIES).setValue(calories);
    sheet.getRange(rowNum, COL.OUTPUT).setValue(outputKj);
    sheet.getRange(rowNum, COL.AVG_CADENCE).setValue(avgCadence);
    sheet.getRange(rowNum, COL.AVG_RES).setValue(avgResistance);
    sheet.getRange(rowNum, COL.HR_Z1).setValue(z1);
    sheet.getRange(rowNum, COL.HR_Z2).setValue(z2);
    sheet.getRange(rowNum, COL.HR_Z3).setValue(z3);
    sheet.getRange(rowNum, COL.HR_Z4).setValue(z4);
    sheet.getRange(rowNum, COL.HR_Z5).setValue(z5);
    sheet.getRange(rowNum, COL.EFFORT).setValue(effort);

    filled++;
    Utilities.sleep(150);
  }

  Logger.log(`Backfill complete: ${filled} rows updated, ${skipped} skipped.`);
}



// ── Force re-fetch ALL zone data from effort_zones (fixes historically bad data) ──
// Safe to run multiple times. Overwrites HR zones and effort score on every row.
// Run this once to correct all existing data, then normal sync handles new rides.

function rebackfillAllZones() {
  const token = getValidAccessToken();
  if (!token) return;

  const ss    = SpreadsheetApp.openById(PELO_SHEET_ID);
  const sheet = ss.getSheetByName(PELO_SHEET_NAME);
  if (!sheet) return;

  const lastRow   = sheet.getLastRow();
  if (lastRow < 2) return;

  const sheetData = sheet.getRange(2, 1, lastRow - 1, PELO_COLUMNS.length).getValues();
  const startTime = Date.now();
  let updated = 0, skipped = 0;

  for (let i = 0; i < sheetData.length; i++) {
    const row       = sheetData[i];
    const workoutId = row[COL.WORKOUT_ID - 1];
    const type      = row[COL.TYPE - 1];

    // Only process cycling workouts — walking/meditation don't have HR zones
    if (!workoutId || type !== 'cycling') { skipped++; continue; }

    if (Date.now() - startTime > TIME_LIMIT_MS) {
      Logger.log(`Time limit hit after ${updated} updates. Run rebackfillAllZones again to continue.`);
      break;
    }

    const graph       = pelotonGet(`/api/workout/${workoutId}/performance_graph?every_n=1`, token);
    const effortZones = graph?.effort_zones?.heart_rate_zone_durations || {};
    const effort      = graph?.effort_zones?.total_effort_points || '';

    const avgSummaries  = (graph && graph.average_summaries) ? graph.average_summaries : [];
    const getAvg        = (slug) => {
      const entry = avgSummaries.find(s => s.slug === slug);
      return entry ? Math.round(entry.value * 10) / 10 : '';
    };
    const avgCadence    = getAvg('avg_cadence');
    const avgResistance = getAvg('avg_resistance');

    const toMin = (secs) => secs ? Math.round(secs / 60 * 10) / 10 : '';
    const z1 = toMin(effortZones.heart_rate_z1_duration);
    const z2 = toMin(effortZones.heart_rate_z2_duration);
    const z3 = toMin(effortZones.heart_rate_z3_duration);
    const z4 = toMin(effortZones.heart_rate_z4_duration);
    const z5 = toMin(effortZones.heart_rate_z5_duration);

    const rowNum = i + 2;
    sheet.getRange(rowNum, COL.AVG_CADENCE).setValue(avgCadence);
    sheet.getRange(rowNum, COL.AVG_RES).setValue(avgResistance);
    sheet.getRange(rowNum, COL.HR_Z1).setValue(z1);
    sheet.getRange(rowNum, COL.HR_Z2).setValue(z2);
    sheet.getRange(rowNum, COL.HR_Z3).setValue(z3);
    sheet.getRange(rowNum, COL.HR_Z4).setValue(z4);
    sheet.getRange(rowNum, COL.HR_Z5).setValue(z5);
    sheet.getRange(rowNum, COL.EFFORT).setValue(effort);

    updated++;
    Utilities.sleep(200);
  }

  Logger.log(`Zone rebackfill complete: ${updated} updated, ${skipped} skipped.`);
}

// ── Force-refresh calories from performance graph on all rows ─────────────────

function backfillCalories() {
  const token  = getValidAccessToken();
  if (!token) return;

  const ss    = SpreadsheetApp.openById(PELO_SHEET_ID);
  const sheet = ss.getSheetByName(PELO_SHEET_NAME);
  if (!sheet) return;

  const lastRow   = sheet.getLastRow();
  if (lastRow < 2) return;

  const sheetData = sheet.getRange(2, 1, lastRow - 1, PELO_COLUMNS.length).getValues();
  const startTime = Date.now();
  let updated = 0, skipped = 0;

  for (let i = 0; i < sheetData.length; i++) {
    const row       = sheetData[i];
    const workoutId = row[COL.WORKOUT_ID - 1];

    if (!workoutId) { skipped++; continue; }
    if (Date.now() - startTime > TIME_LIMIT_MS) {
      Logger.log(`Time limit hit after ${updated} updates. Run backfillCalories again to continue.`);
      break;
    }

    const graph    = pelotonGet(`/api/workout/${workoutId}/performance_graph?every_n=5`, token);
    const summaries = (graph && graph.summaries) ? graph.summaries : [];
    const calEntry  = summaries.find(s => s.slug === 'calories');
    const calories  = calEntry ? Math.round(calEntry.value) : '';

    if (calories !== '') {
      sheet.getRange(i + 2, COL.CALORIES).setValue(calories);
      updated++;
    }

    Utilities.sleep(150);
  }

  Logger.log(`Calorie backfill complete: ${updated} updated, ${skipped} skipped.`);
}


// ── Claude AI Nutrition Estimator ─────────────────────────────────────────────

function estimateNutrition(messages) {
  const props  = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in Script Properties');

  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: 'You are a nutrition estimator. Return ONLY a valid JSON object — no markdown, no explanation: {"description":"short clean meal name","calories":number,"protein":number,"carbs":number,"fat":number}. Use realistic average estimates. For photos, estimate based on visible portion sizes.',
      messages: messages,
    }),
    muteHttpExceptions: true,
  });

  const json = JSON.parse(response.getContentText());
  if (json.error) throw new Error(json.error.message || 'Anthropic API error');

  const text = json.content?.[0]?.text || '';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}


// ── Fetch all workouts (paginated) ────────────────────────────────────────────

function fetchAllWorkouts(token, userId) {
  const all = [];
  let page  = 0;

  while (true) {
    const path  = `/api/user/${userId}/workouts`
      + `?joins=ride,ride.instructor&limit=${PELO_PAGE_SIZE}&page=${page}`;
    const res   = pelotonGet(path, token);
    const batch = res.data || [];

    all.push(...batch);
    Logger.log(`Page ${page}: ${batch.length} workouts`);

    if (batch.length < PELO_PAGE_SIZE) break;
    page++;
  }

  return all;
}


// ── Format summary row ────────────────────────────────────────────────────────

function formatWorkoutRow(w) {
  const ride       = w.ride        || {};
  const instructor = ride.instructor || {};

  const date = w.start_time
    ? Utilities.formatDate(
        new Date(w.start_time * 1000),
        Session.getScriptTimeZone(),
        'yyyy-MM-dd'
      )
    : '';

  const outputKj = w.total_work ? Math.round(w.total_work / 1000) : '';
  const calories = '';

  const cumData  = w.v2_total_workout_cumulative_data || [];
  const getCum   = slug => cumData.find(d => d.slug === slug)?.value ?? '';

  return [
    date,
    ride.title || w.fitness_discipline || '',
    w.fitness_discipline || '',
    '',
    calories,
    outputKj,
    getCum('cadence'),
    getCum('resistance'),
    '', '', '', '', '',
    '',
    instructor.name || '',
    w.id || ''
  ];
}


// ── Write to sheet ────────────────────────────────────────────────────────────

function writeToSheet(rows) {
  const ss  = SpreadsheetApp.openById(PELO_SHEET_ID);
  let sheet = ss.getSheetByName(PELO_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(PELO_SHEET_NAME);

  sheet.clear();
  sheet.getRange(1, 1, 1, PELO_COLUMNS.length)
       .setValues([PELO_COLUMNS])
       .setFontWeight('bold');

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, PELO_COLUMNS.length).setValues(rows);
  }

  Logger.log(`Wrote ${rows.length} rows to "${PELO_SHEET_NAME}".`);
}

// Upsert: add only new workouts, preserve existing rows and their calorie/HR data
function upsertToSheet(workouts) {
  const ss  = SpreadsheetApp.openById(PELO_SHEET_ID);
  let sheet = ss.getSheetByName(PELO_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(PELO_SHEET_NAME);
    sheet.getRange(1, 1, 1, PELO_COLUMNS.length)
         .setValues([PELO_COLUMNS])
         .setFontWeight('bold');
  }

  const lastRow = sheet.getLastRow();
  const existingIds = new Set();

  if (lastRow >= 2) {
    const idCol = sheet.getRange(2, COL.WORKOUT_ID, lastRow - 1, 1).getValues();
    idCol.forEach(r => { if (r[0]) existingIds.add(r[0]); });
  }

  const newWorkouts = workouts.filter(w => w.id && !existingIds.has(w.id));

  if (newWorkouts.length === 0) return [];

  sheet.insertRowsBefore(2, newWorkouts.length);

  const newRows = newWorkouts.map(w => formatWorkoutRow(w));
  sheet.getRange(2, 1, newRows.length, PELO_COLUMNS.length).setValues(newRows);

  Logger.log(`Inserted ${newRows.length} new workouts into "${PELO_SHEET_NAME}".`);
  return newWorkouts;
}


// ── Auth ──────────────────────────────────────────────────────────────────────

function getValidAccessToken() {
  const props        = PropertiesService.getScriptProperties();
  const accessToken  = props.getProperty('PELO_ACCESS_TOKEN');
  const refreshToken = props.getProperty('PELO_REFRESH_TOKEN');
  const clientId     = props.getProperty('PELO_CLIENT_ID');

  if (!refreshToken || !clientId) {
    Logger.log('Missing PELO_REFRESH_TOKEN or PELO_CLIENT_ID in Script Properties.');
    return null;
  }

  if (accessToken && isTokenValid(accessToken)) {
    Logger.log('Access token still valid.');
    return accessToken;
  }

  Logger.log('Access token expired -- refreshing...');
  return refreshAccessToken(refreshToken, clientId);
}

function isTokenValid(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(Utilities.newBlob(
      Utilities.base64DecodeWebSafe(payload)
    ).getDataAsString());
    const now = Math.floor(Date.now() / 1000);
    return decoded.exp && decoded.exp > now + 60;
  } catch (e) {
    return false;
  }
}

function refreshAccessToken(refreshToken, clientId) {
  const res = UrlFetchApp.fetch(PELO_AUTH_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      grant_type:    'refresh_token',
      client_id:     clientId,
      refresh_token: refreshToken,
    }),
    muteHttpExceptions: true
  });

  const json = JSON.parse(res.getContentText());
  if (!json.access_token) {
    Logger.log('Token refresh failed: ' + res.getContentText());
    return null;
  }

  const props = PropertiesService.getScriptProperties();
  props.setProperty('PELO_ACCESS_TOKEN', json.access_token);
  if (json.refresh_token) {
    props.setProperty('PELO_REFRESH_TOKEN', json.refresh_token);
  }

  Logger.log('Access token refreshed successfully.');
  return json.access_token;
}


// ── HTTP helper ───────────────────────────────────────────────────────────────

function pelotonGet(path, token) {
  const res = UrlFetchApp.fetch(PELO_API + path, {
    method: 'get',
    headers: {
      'Authorization':          `Bearer ${token}`,
      'peloton-platform':       'web',
      'peloton-client-details': 'eyJEZXZpY2UgVHlwZSI6IldlYiIsIkFwcCBWZXJzaW9uIjoiMS4wLjAifQ=='
    },
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  if (code !== 200) {
    Logger.log(`API error ${code} on ${path}: ${res.getContentText()}`);
    return {};
  }

  return JSON.parse(res.getContentText());
}


// ── Debug: dump performance graph and summary for a workout ───────────────────

function debugWorkout() {
  const token     = getValidAccessToken();
  const workoutId = '8c346439142247d78eff854cf0c90e38';

  const graph = pelotonGet(`/api/workout/${workoutId}/performance_graph?every_n=5`, token);
  Logger.log('--- performance_graph summaries ---');
  const summaries = graph?.summaries || [];
  summaries.forEach(s => Logger.log(`summary: ${s.slug} = ${s.value} ${s.display_unit || ''}`));

  const avgSummaries = graph?.average_summaries || [];
  avgSummaries.forEach(s => Logger.log(`avg_summary: ${s.slug} = ${s.value} ${s.display_unit || ''}`));

  const summary = pelotonGet(`/api/workout/${workoutId}/summary`, token);
  Logger.log('--- workout summary ---');
  for (const key in summary) {
    const val = summary[key];
    if (typeof val !== 'object') Logger.log(`${key}: ${val}`);
  }
}


// ── Debug: test token refresh ─────────────────────────────────────────────────

function debugRefresh() {
  const props        = PropertiesService.getScriptProperties();
  const refreshToken = props.getProperty('PELO_REFRESH_TOKEN');
  const clientId     = props.getProperty('PELO_CLIENT_ID');

  Logger.log('Refresh token starts with: ' + refreshToken?.substring(0, 20));
  Logger.log('Client ID: ' + clientId);

  const res = UrlFetchApp.fetch(PELO_AUTH_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      grant_type:    'refresh_token',
      client_id:     clientId,
      refresh_token: refreshToken,
    }),
    muteHttpExceptions: true
  });

  Logger.log('Response code: ' + res.getResponseCode());
  Logger.log('Response body: ' + res.getContentText());
}


// ── Coach Report ──────────────────────────────────────────────────────────────

function weeklyCoachTrigger() {
  generateCoachReport();
}

function generateCoachReport() {
  const ss       = SpreadsheetApp.openById(PELO_SHEET_ID);
  const apiKey   = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in Script Properties');

  const cutoff   = new Date();
  cutoff.setDate(cutoff.getDate() - 28);
  const cutoffStr = Utilities.formatDate(cutoff, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const peloSheet  = ss.getSheetByName('Peloton');
  const peloData   = peloSheet ? peloSheet.getDataRange().getValues() : [];
  const peloRows   = peloData.slice(1).filter(r => {
    if (!r[0]) return false;
    // Handle both Date objects and date strings
    const dateStr = r[0] instanceof Date
      ? Utilities.formatDate(r[0], Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(r[0]).substring(0, 10);
    return dateStr >= cutoffStr;
  });

  const workouts = peloRows.map(r => ({
    date:     r[0] instanceof Date
      ? Utilities.formatDate(r[0], Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(r[0]).substring(0, 10),
    title:    r[1],
    type:     r[2],
    duration: r[3],
    calories: r[4],
    output:   r[5],
    effort:   r[13],
    z4:       r[11],
    z5:       r[12],
  }));

  const cyclingWorkouts = workouts.filter(w => w.type === 'cycling');
  const totalRides      = cyclingWorkouts.length;
  const totalCalsBurned = cyclingWorkouts.reduce((s, w) => s + (parseFloat(w.calories) || 0), 0);
  const avgOutput       = totalRides > 0
    ? Math.round(cyclingWorkouts.reduce((s, w) => s + (parseFloat(w.output) || 0), 0) / totalRides)
    : 0;
  const avgEffort       = totalRides > 0
    ? (cyclingWorkouts.reduce((s, w) => s + (parseFloat(w.effort) || 0), 0) / totalRides).toFixed(1)
    : 0;
  const totalZ4Z5       = cyclingWorkouts.reduce((s, w) =>
    s + (parseFloat(w.z4) || 0) + (parseFloat(w.z5) || 0), 0).toFixed(1);

  const rideDates = cyclingWorkouts.map(w => w.date).sort();
  let totalRestDays = 0;
  for (let i = 1; i < rideDates.length; i++) {
    const gap = (new Date(rideDates[i]) - new Date(rideDates[i-1])) / (1000 * 60 * 60 * 24);
    totalRestDays += gap - 1;
  }
  const avgRestBetweenRides = rideDates.length > 1
    ? (totalRestDays / (rideDates.length - 1)).toFixed(1)
    : 'N/A';

  const weightSheet = ss.getSheetByName('Weight');
  const weightData  = weightSheet ? weightSheet.getDataRange().getValues() : [];
  const weightRows  = weightData.slice(1).filter(r => r[0] && r[1]);
  const recentWeight = weightRows.slice(-1)[0];
  const fourWeeksAgoWeight = weightRows.find(r => {
    const dateStr = r[0] instanceof Date
      ? Utilities.formatDate(r[0], Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(r[0]).substring(0, 10);
    return dateStr >= cutoffStr;
  });
  const currentWeight  = recentWeight ? recentWeight[1] : 'unknown';
  const startWeight    = fourWeeksAgoWeight ? fourWeeksAgoWeight[1] : currentWeight;
  const weightChange   = (parseFloat(currentWeight) - parseFloat(startWeight)).toFixed(1);
  const goalWeight     = weightSheet.getRange('D1').getValue() || 'not set';

  const fitbitSheet = ss.getSheetByName('Fitbit Data');
  const fitbitData  = fitbitSheet ? fitbitSheet.getDataRange().getValues() : [];
  const fitbitHeader = fitbitData[3] || [];
  const dateIdx     = fitbitHeader.indexOf('Date');
  const burnIdx     = fitbitHeader.indexOf('Calories Burned');
  const eatIdx      = fitbitHeader.indexOf('Calories Consumed');

  const fitbitRows  = fitbitData.slice(4).filter(r => r[dateIdx] && r[dateIdx] >= cutoffStr);
  const avgBurned   = fitbitRows.length > 0
    ? Math.round(fitbitRows.reduce((s, r) => s + (parseFloat(r[burnIdx]) || 0), 0) / fitbitRows.length)
    : 0;
  const avgConsumed = fitbitRows.length > 0
    ? Math.round(fitbitRows.filter(r => r[eatIdx] > 0).reduce((s, r) => s + (parseFloat(r[eatIdx]) || 0), 0) /
        Math.max(1, fitbitRows.filter(r => r[eatIdx] > 0).length))
    : 0;
  const avgDeficit  = avgBurned && avgConsumed ? avgBurned - avgConsumed : 'unknown';

  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM d, yyyy');

  const prompt = `You are a personal fitness coach reviewing a 4-week performance summary for a male athlete (age 43, height 6'0"). Today is ${today}.

Here is their data for the last 4 weeks:

CYCLING WORKOUTS:
- Total rides: ${totalRides}
- Total calories burned from rides: ${Math.round(totalCalsBurned)} kcal
- Average output per ride: ${avgOutput} kJ
- Average effort score: ${avgEffort}
- Total Z4+Z5 time: ${totalZ4Z5} min
- Average rest days between rides: ${avgRestBetweenRides}
- Recent rides: ${cyclingWorkouts.slice(-5).map(w => `${w.date}: ${w.title} (${w.duration}min, ${w.calories}cal, ${w.output}kJ)`).join(' | ')}

WEIGHT:
- Current weight: ${currentWeight} lbs
- Weight 4 weeks ago: ${startWeight} lbs
- Change: ${weightChange} lbs
- Goal weight: ${goalWeight} lbs

CALORIE BALANCE (from Fitbit):
- Average daily calories burned: ${avgBurned} kcal
- Average daily calories consumed: ${avgConsumed} kcal
- Average daily deficit/surplus: ${avgDeficit} kcal

Write a structured weekly fitness report with these exact sections:
1. **This Week's Summary** — 2-3 sentences on overall performance
2. **Workout Performance** — trends in output, effort, HR zones
3. **Weight & Nutrition** — progress toward goal, calorie balance assessment
4. **Recovery** — ride frequency and rest day analysis
5. **Goals for Next Week** — 3 specific, actionable targets

Be direct, specific, and use the actual numbers. Do not be generic. Keep total length under 400 words.`;

  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
    muteHttpExceptions: true,
  });

  const json   = JSON.parse(response.getContentText());
  if (json.error) throw new Error(json.error.message || 'Anthropic API error');

  const report = json.content?.[0]?.text || '';
  const now    = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMM d, yyyy h:mm a');

  let coachSheet = ss.getSheetByName('Coach');
  if (!coachSheet) coachSheet = ss.insertSheet('Coach');
  coachSheet.clearContents();
  coachSheet.getRange('A1').setValue('report');
  coachSheet.getRange('B1').setValue(report);
  coachSheet.getRange('A2').setValue('updatedAt');
  coachSheet.getRange('B2').setValue(now);

  Logger.log('Coach report generated: ' + now);
  return { report, updatedAt: now };
}

function setupCoachTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'weeklyCoachTrigger')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('weeklyCoachTrigger')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();

  Logger.log('Weekly coach trigger set for Mondays at 9AM.');
}


// ── One-time login to get fresh tokens ───────────────────────────────────────
// Run this once when tokens expire. Stores new access + refresh tokens
// automatically in Script Properties.
// Set PELO_USERNAME and PELO_PASSWORD in Script Properties first,
// then delete them after running for security.

function pelotonLogin() {
  const props    = PropertiesService.getScriptProperties();
  const username = props.getProperty('PELO_USERNAME');
  const password = props.getProperty('PELO_PASSWORD');
  const clientId = props.getProperty('PELO_CLIENT_ID');

  if (!username || !password) {
    Logger.log('Set PELO_USERNAME and PELO_PASSWORD in Script Properties first.');
    return;
  }

  // Step 1: Get Auth0 authorize URL and extract state/nonce
  const authorizeUrl = `https://auth.onepeloton.com/authorize?` +
    `response_type=code` +
    `&client_id=${clientId}` +
    `&redirect_uri=https://members.onepeloton.com/login` +
    `&scope=openid%20peloton-api.members%3Adefault%20offline_access` +
    `&audience=https://api.onepeloton.com/` +
    `&state=login`;

  // Step 2: Use resource owner password grant (direct API login)
  const res = UrlFetchApp.fetch('https://auth.onepeloton.com/oauth/token', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      grant_type: 'password',
      client_id:  clientId,
      username:   username,
      password:   password,
      audience:   'https://api.onepeloton.com/',
      scope:      'openid peloton-api.members:default offline_access',
    }),
    muteHttpExceptions: true,
  });

  Logger.log('Response code: ' + res.getResponseCode());
  const json = JSON.parse(res.getContentText());

  if (!json.access_token) {
    Logger.log('Login failed: ' + res.getContentText());
    return;
  }

  props.setProperty('PELO_ACCESS_TOKEN', json.access_token);
  if (json.refresh_token) {
    props.setProperty('PELO_REFRESH_TOKEN', json.refresh_token);
    Logger.log('Refresh token saved: ' + json.refresh_token.substring(0, 20) + '...');
  }

  Logger.log('Login successful! Tokens saved.');
  Logger.log('Access token expires in: ' + json.expires_in + ' seconds');

  // Clean up credentials from Script Properties
  props.deleteProperty('PELO_PASSWORD');
  Logger.log('Password removed from Script Properties for security.');
}


// ── Peloton Token Auto-Capture ────────────────────────────────────────────────
// Serves a helper page that captures tokens from Peloton's localStorage
// and saves them to Script Properties automatically.
//
// Deploy this script as a Web App (Execute as: Me, Who has access: Anyone)
// and set REACT_APP_PELO_HELPER_URL in your .env to the web app URL.

function pelotonDoGet(e) {
  const props    = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('PELO_CLIENT_ID');
  const webAppUrl = ScriptApp.getService().getUrl();
  const code = e?.parameter?.code;

  // Step 2: Auth0 redirected back with a code — exchange it for tokens
  if (code) {
    try {
      const res = UrlFetchApp.fetch('https://auth.onepeloton.com/oauth/token', {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          grant_type:   'authorization_code',
          client_id:    clientId,
          code:         code,
          redirect_uri: webAppUrl,
        }),
        muteHttpExceptions: true,
      });

      const json = JSON.parse(res.getContentText());

      if (json.access_token) {
        props.setProperty('PELO_ACCESS_TOKEN',  json.access_token);
        props.setProperty('PELO_REFRESH_TOKEN', json.refresh_token);

        return HtmlService.createHtmlOutput(`<!DOCTYPE html>
<html>
<head><title>Reconnected!</title></head>
<body style="font-family:sans-serif;background:#1c1f26;color:#f4f5f7;padding:32px;text-align:center;margin:0">
<h2 style="color:#d4f000">✓ Peloton Reconnected!</h2>
<p style="color:#9aa0b0">Tokens saved successfully. You can close this window.</p>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'PELOTON_TOKENS_SAVED' }, '*');
  }
  setTimeout(() => window.close(), 2000);
<\/script>
</body>
</html>`).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      } else {
        throw new Error(json.error_description || json.error || 'Token exchange failed');
      }
    } catch(err) {
      return HtmlService.createHtmlOutput(`<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body style="font-family:sans-serif;background:#1c1f26;color:#f4f5f7;padding:32px;text-align:center;margin:0">
<h2 style="color:#d67f7f">Connection Failed</h2>
<p style="color:#9aa0b0">${err.message}</p>
<p style="color:#9aa0b0">Close this window and try again.</p>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'PELOTON_TOKENS_ERROR', error: '${err.message}' }, '*');
  }
<\/script>
</body>
</html>`).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  // Step 1: Redirect to Peloton Auth0 login
  const authUrl = 'https://auth.onepeloton.com/authorize'
    + '?response_type=code'
    + '&client_id=' + clientId
    + '&redirect_uri=' + encodeURIComponent(webAppUrl)
    + '&scope=' + encodeURIComponent('openid peloton-api.members:default offline_access')
    + '&audience=' + encodeURIComponent('https://api.onepeloton.com/');

  return HtmlService.createHtmlOutput(`<!DOCTYPE html>
<html>
<head><title>Connecting to Peloton...</title></head>
<body style="font-family:sans-serif;background:#1c1f26;color:#f4f5f7;padding:32px;text-align:center;margin:0">
<h2 style="color:#d4f000">Connecting to Peloton</h2>
<p style="color:#9aa0b0">Redirecting to Peloton login...</p>
<script>window.location.href = '${authUrl}';<\/script>
</body>
</html>`).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


function saveTokens(accessToken, refreshToken) {
  if (!accessToken || !refreshToken) throw new Error('Missing tokens');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('PELO_ACCESS_TOKEN', accessToken);
  props.setProperty('PELO_REFRESH_TOKEN', refreshToken);
  Logger.log('Tokens saved via auto-capture.');
  return { ok: true };
}