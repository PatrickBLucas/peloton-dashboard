#!/usr/bin/env node
// migrate.js — One-time migration from Google Sheets to Supabase
//
// Usage:
//   node migrate.js <google_access_token>
//
// Get your Google access token from the running app:
//   Open DevTools console → localStorage.getItem('gtoken')

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL      = 'https://hmtevflfryjkudkcpmac.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdGV2Zmxmcnlqa3Vka2NwbWFjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM3MDc3OCwiZXhwIjoyMDg5OTQ2Nzc4fQ._Lpk0YscE9JEu7B0Z-dtg4yCOZnKA_ss5f3d7LtSgqk';
const USER_ID           = '9d0f37ce-1726-4651-a262-ba5d8cc8b9ac';
const SHEET_ID          = '1hJ_bHtAyoPoDr2QN1098L0frfIrh6aM-ykhlHtcnOgs';
const SHEETS_BASE       = 'https://sheets.googleapis.com/v4/spreadsheets';
const KG_TO_LBS         = 2.20462;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const gtoken = process.argv[2];
if (!gtoken) {
  console.error('Usage: node migrate.js <google_access_token>');
  process.exit(1);
}

// ── Sheets helpers ────────────────────────────────────────────────────────────

async function fetchRange(range) {
  const url = `${SHEETS_BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${gtoken}` } });
  if (!res.ok) throw new Error(`Sheets API error ${res.status} for range ${range}`);
  const data = await res.json();
  return data.values || [];
}

function parseDate(val) {
  if (!val) return null;
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  if (isNaN(d)) return null;
  return d.toISOString().split('T')[0];
}

function toNum(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function upsertInChunks(table, rows, conflictCol) {
  if (rows.length === 0) { console.log(`  No rows to insert for ${table}`); return; }
  const batches = chunk(rows, 500);
  let total = 0;
  for (const batch of batches) {
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: conflictCol, ignoreDuplicates: true });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
    total += batch.length;
    process.stdout.write(`\r  ${table}: ${total}/${rows.length} rows inserted`);
  }
  console.log(`\r  ${table}: ${total} rows inserted ✓`);
}

// ── Migrate workouts (Peloton sheet) ─────────────────────────────────────────

async function migrateWorkouts() {
  console.log('\n📊 Migrating workouts...');
  const rows = await fetchRange('Peloton!A2:P2000');
  const valid = rows.filter(r => r[0] && r[2]);

  const records = valid.map(r => ({
    user_id:       USER_ID,
    date:          parseDate(r[0]),
    title:         r[1] || null,
    type:          r[2] || null,
    duration_min:  toNum(r[3]),
    calories:      toNum(r[4]),
    output_kj:     toNum(r[5]),
    avg_cadence:   toNum(r[6]),
    avg_resistance: toNum(r[7]),
    hr_z1:         toNum(r[8]),
    hr_z2:         toNum(r[9]),
    hr_z3:         toNum(r[10]),
    hr_z4:         toNum(r[11]),
    hr_z5:         toNum(r[12]),
    effort_score:  toNum(r[13]),
    instructor:    r[14] || null,
    strava_id:     r[15] || null,
  })).filter(r => r.date);

  await upsertInChunks('workouts', records, 'strava_id');
}

// ── Migrate Fitbit data ───────────────────────────────────────────────────────

async function migrateFitbit() {
  console.log('\n📊 Migrating Fitbit data...');
  // Row 4 is header, data starts row 5
  const rows = await fetchRange('Fitbit Data!A5:AJ2000');
  const valid = rows.filter(r => r[0]);

  const records = valid.map(r => {
    const weightKg = toNum(r[14]);
    return {
      user_id:          USER_ID,
      date:             parseDate(r[0]),
      calories_out:     toNum(r[4]),
      steps:            toNum(r[11]) ? Math.round(toNum(r[11])) : null,
      fairly_active_min: toNum(r[6]),
      very_active_min:  toNum(r[12]),
      lightly_active_min: toNum(r[8]),
      sedentary_min:    toNum(r[10]),
      weight_kg:        weightKg,
      bmi:              toNum(r[13]),
      efficiency:       toNum(r[19]),
      minutes_asleep:   toNum(r[22]),
      minutes_awake:    toNum(r[23]),
      time_in_bed:      toNum(r[28]),
      restless_count:   toNum(r[25]) ? Math.round(toNum(r[25])) : null,
      restless_duration: toNum(r[26]),
      sleep_start_time: r[27] || null,
      sleep_end_time:   r[20] || null,
    };
  }).filter(r => r.date);

  await upsertInChunks('fitbit_daily', records, 'user_id,date');
}

// ── Migrate food log ──────────────────────────────────────────────────────────

async function migrateFoodLog() {
  console.log('\n📊 Migrating food log...');
  const rows = await fetchRange('Food Log!A2:H2000');
  const valid = rows.filter(r => r[0] && r[2]);

  const records = valid.map(r => ({
    user_id:     USER_ID,
    date:        parseDate(r[0]),
    time:        r[1] || null,
    description: r[2],
    calories:    toNum(r[3]) || 0,
    protein:     toNum(r[4]) || 0,
    carbs:       toNum(r[5]) || 0,
    fat:         toNum(r[6]) || 0,
    source:      r[7] || null,
  })).filter(r => r.date);

  // Food log has no natural unique key so just insert
  const batches = chunk(records, 500);
  let total = 0;
  for (const batch of batches) {
    const { error } = await supabase.from('food_log').insert(batch);
    if (error) throw new Error(`food_log insert failed: ${error.message}`);
    total += batch.length;
    process.stdout.write(`\r  food_log: ${total}/${records.length} rows inserted`);
  }
  console.log(`\r  food_log: ${total} rows inserted ✓`);
}

// ── Migrate saved meals ───────────────────────────────────────────────────────

async function migrateSavedMeals() {
  console.log('\n📊 Migrating saved meals...');
  const rows = await fetchRange('Saved Meals!A2:F500');
  const valid = rows.filter(r => r[0]);

  const records = valid.map(r => ({
    user_id:  USER_ID,
    name:     r[0],
    calories: toNum(r[1]) || 0,
    protein:  toNum(r[2]) || 0,
    carbs:    toNum(r[3]) || 0,
    fat:      toNum(r[4]) || 0,
    notes:    r[5] || null,
  }));

  const { error } = await supabase.from('saved_meals').insert(records);
  if (error) throw new Error(`saved_meals insert failed: ${error.message}`);
  console.log(`  saved_meals: ${records.length} rows inserted ✓`);
}

// ── Migrate food library ──────────────────────────────────────────────────────

async function migrateFoodLibrary() {
  console.log('\n📊 Migrating food library...');
  const rows = await fetchRange('Food Library!A2:F500');
  const valid = rows.filter(r => r[0]);

  const records = valid.map(r => ({
    name:       r[0],
    unit:       r[1] || '1 serving',
    calories:   toNum(r[2]) || 0,
    protein:    toNum(r[3]) || 0,
    carbs:      toNum(r[4]) || 0,
    fat:        toNum(r[5]) || 0,
    created_by: USER_ID,
  }));

  const { error } = await supabase.from('food_library').insert(records);
  if (error) throw new Error(`food_library insert failed: ${error.message}`);
  console.log(`  food_library: ${records.length} rows inserted ✓`);
}

// ── Migrate 10-8 tracker ──────────────────────────────────────────────────────

async function migrateTracker() {
  console.log('\n📊 Migrating 10-8 tracker...');
  const rows = await fetchRange('Tracker!A2:C500');
  const valid = rows.filter(r => r[0]);

  const records = valid.map(r => ({
    user_id:     USER_ID,
    date:        parseDate(r[0]),
    description: r[1] || null,
    minutes:     toNum(r[2]),
  })).filter(r => r.date);

  if (records.length === 0) {
    console.log('  tracker: no rows found (sheet may be empty or named differently)');
    return;
  }

  const { error } = await supabase.from('tracker_log').insert(records);
  if (error) throw new Error(`tracker_log insert failed: ${error.message}`);
  console.log(`  tracker_log: ${records.length} rows inserted ✓`);
}

// ── Ensure user row exists ────────────────────────────────────────────────────

async function ensureUser() {
  console.log('\n👤 Ensuring user profile exists...');
  const { error } = await supabase
    .from('users')
    .upsert({ id: USER_ID, goal_weight_lbs: 180, height_cm: 182.88, birthday: '1982-08-25' }, { onConflict: 'id' });
  if (error) throw new Error(`users upsert failed: ${error.message}`);
  console.log('  users: profile ready ✓');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting migration...');
  console.log(`   Sheet ID: ${SHEET_ID}`);
  console.log(`   User ID:  ${USER_ID}`);
  console.log(`   Supabase: ${SUPABASE_URL}`);

  try {
    await ensureUser();
    await migrateWorkouts();
    await migrateFitbit();
    await migrateFoodLog();
    await migrateSavedMeals();
    await migrateFoodLibrary();
    await migrateTracker();
    console.log('\n✅ Migration complete!');
  } catch (e) {
    console.error(`\n❌ Migration failed: ${e.message}`);
    process.exit(1);
  }
}

main();