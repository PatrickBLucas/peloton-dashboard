// supabase/functions/generate-coach-report/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY   = Deno.env.get('SB_SERVICE_ROLE_KEY')!;
const KG_TO_LBS          = 2.20462;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function buildPrompt(
  workouts: any[],
  fitbit: any[],
  latestWeight: any | null,
  today: string
): string {
  const cycling    = workouts.filter(w => w.type === 'cycling');
  const totalRides = cycling.length;
  const totalMinutes = workouts.reduce((s: number, w: any) => s + (w.duration_min || 0), 0);
  const avgOutput  = totalRides > 0
    ? Math.round(cycling.reduce((s: number, w: any) => s + (w.output_kj || 0), 0) / totalRides)
    : 0;
  const avgEffort  = totalRides > 0
    ? (cycling.reduce((s: number, w: any) => s + (w.effort_score || 0), 0) / totalRides).toFixed(1)
    : 0;
  const totalZ4Z5  = cycling
    .reduce((s: number, w: any) => s + (w.hr_z4 || 0) + (w.hr_z5 || 0), 0)
    .toFixed(1);

  const rideDates = [...new Set(cycling.map((w: any) => w.date))].sort() as string[];
  let restDays = 0;
  for (let i = 1; i < rideDates.length; i++) {
    restDays += (new Date(rideDates[i]).getTime() - new Date(rideDates[i - 1]).getTime()) / 86400000 - 1;
  }
  const avgRestBetweenRides = rideDates.length > 1
    ? (restDays / (rideDates.length - 1)).toFixed(1)
    : 'N/A';

  const currentWeightLbs = latestWeight?.weight_kg
    ? Math.round(latestWeight.weight_kg * KG_TO_LBS * 10) / 10
    : null;
  const weightEntries = fitbit.filter((d: any) => d.weight_kg);
  const oldestWeight  = weightEntries.length > 0 ? weightEntries[0] : null;
  const weightChange  = oldestWeight && latestWeight
    ? Math.round((latestWeight.weight_kg - oldestWeight.weight_kg) * KG_TO_LBS * 10) / 10
    : null;

  const fitbitWithSteps = fitbit.filter((d: any) => d.steps > 0);
  const avgSteps = fitbitWithSteps.length > 0
    ? Math.round(fitbitWithSteps.reduce((s: number, d: any) => s + d.steps, 0) / fitbitWithSteps.length)
    : 0;
  const fitbitWithSleep  = fitbit.filter((d: any) => d.minutes_asleep > 0);
  const avgSleep         = fitbitWithSleep.length > 0
    ? (fitbitWithSleep.reduce((s: number, d: any) => s + d.minutes_asleep, 0) / fitbitWithSleep.length / 60).toFixed(1)
    : null;
  const avgEfficiency    = fitbitWithSleep.length > 0
    ? Math.round(fitbitWithSleep.reduce((s: number, d: any) => s + (d.efficiency || 0), 0) / fitbitWithSleep.length)
    : null;

  const instructorCounts: Record<string, number> = {};
  cycling.forEach((w: any) => {
    if (w.instructor) instructorCounts[w.instructor] = (instructorCounts[w.instructor] || 0) + 1;
  });
  const topInstructors = Object.entries(instructorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name} (${count}x)`)
    .join(', ');

  const recentRides = cycling.slice(-7).map((w: any) =>
    `  ${w.date}: ${w.title} — output: ${w.output_kj || 0}kJ, effort: ${w.effort_score || 'N/A'}, Z4+Z5: ${((w.hr_z4 || 0) + (w.hr_z5 || 0)).toFixed(1)}min`
  ).join('\n');

  return `You are a personal fitness coach reviewing a 4-week performance summary for a male athlete (age 43, height 6'0"). Today is ${today}.

Here is the data for the last 28 days:

WORKOUTS:
- Total activities: ${workouts.length} (${totalRides} cycling rides)
- Total active time: ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m
- Average output per ride: ${avgOutput} kJ
- Average effort score: ${avgEffort}
- Total Z4+Z5 time: ${totalZ4Z5} minutes
- Average rest days between rides: ${avgRestBetweenRides}
- Top instructors: ${topInstructors || 'N/A'}

RECENT RIDES (last 7):
${recentRides || '  No recent rides'}

BODY & HEALTH:
- Current weight: ${currentWeightLbs ? `${currentWeightLbs} lbs` : 'unknown'}
- Weight change over period: ${weightChange !== null ? `${weightChange > 0 ? '+' : ''}${weightChange} lbs` : 'unknown'}
- Average daily steps: ${avgSteps.toLocaleString()}
- Average sleep: ${avgSleep ? `${avgSleep} hours` : 'unknown'}
- Average sleep efficiency: ${avgEfficiency ? `${avgEfficiency}%` : 'unknown'}

Write a concise coaching report with exactly 5 sections using this format:
1. **Overall Summary** — brief overview of the 4-week period
2. **Workout Performance** — analyze output, effort scores, HR zones, intensity trends
3. **Body & Recovery** — weight trend, sleep quality, rest between rides
4. **What's Working** — specific positives to reinforce
5. **Next Week's Focus** — 2-3 concrete, actionable goals

Keep each section to 3-5 sentences. Be direct and specific — reference actual numbers from the data.`;
}

async function generateReportForUser(
  supabase: any,
  userId: string
): Promise<void> {
  const now     = new Date();
  const cutoff  = new Date(now);
  cutoff.setDate(cutoff.getDate() - 28);
  const cutoffStr = toDateStr(cutoff);
  const today     = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const [{ data: workouts }, { data: fitbit }, { data: weightData }] = await Promise.all([
    supabase
      .from('workouts')
      .select('date, title, type, duration_min, calories, output_kj, hr_z1, hr_z2, hr_z3, hr_z4, hr_z5, effort_score, instructor')
      .eq('user_id', userId)
      .gte('date', cutoffStr)
      .order('date', { ascending: true }),
    supabase
      .from('fitbit_daily')
      .select('date, calories_out, steps, very_active_min, fairly_active_min, weight_kg, minutes_asleep, efficiency')
      .eq('user_id', userId)
      .gte('date', cutoffStr)
      .order('date', { ascending: true }),
    supabase
      .from('fitbit_daily')
      .select('date, weight_kg')
      .eq('user_id', userId)
      .not('weight_kg', 'is', null)
      .order('date', { ascending: false })
      .limit(1),
  ]);

  const prompt = buildPrompt(
    workouts || [],
    fitbit   || [],
    weightData?.[0] || null,
    today
  );

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system:     'You are a personal fitness coach. Analyze the real athlete data provided and write a coaching report following the exact format and instructions in the message. Do not invent fictional data or clients.',
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data       = await res.json();
  const reportText = data.content?.[0]?.text || '';

  const { error: saveError } = await supabase
    .from('coach_reports')
    .insert({ user_id: userId, report: reportText });

  if (saveError) throw new Error(`Failed to save report: ${saveError.message}`);

  console.log(`Coach report generated for user ${userId}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Fetch all users
    const { data: users, error: usersError } = await admin
      .from('users')
      .select('id');

    if (usersError) throw new Error(`Failed to fetch users: ${usersError.message}`);
    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ message: 'No users found' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const results: Record<string, string> = {};

    for (const user of users) {
      try {
        await generateReportForUser(admin, user.id);
        results[user.id] = 'success';
      } catch (e: any) {
        console.error(`Failed for user ${user.id}:`, e.message);
        results[user.id] = `failed: ${e.message}`;
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e: any) {
    console.error('generate-coach-report error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});