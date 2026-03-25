// supabase/functions/sync-strava/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRAVA_API       = 'https://www.strava.com/api/v3';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SB_SERVICE_ROLE_KEY')!
);

const STRAVA_CLIENT_ID     = Deno.env.get('STRAVA_CLIENT_ID')!;
const STRAVA_CLIENT_SECRET = Deno.env.get('STRAVA_CLIENT_SECRET')!;

// ── HR Zone boundaries (can be made per-user later) ───────────────────────────
const HR_ZONES = { z1Max: 114, z2Max: 132, z3Max: 150, z4Max: 168 };

function calculateZones(hrStream: number[]) {
  let z1 = 0, z2 = 0, z3 = 0, z4 = 0, z5 = 0;
  for (const bpm of hrStream) {
    if      (bpm <= HR_ZONES.z1Max) z1++;
    else if (bpm <= HR_ZONES.z2Max) z2++;
    else if (bpm <= HR_ZONES.z3Max) z3++;
    else if (bpm <= HR_ZONES.z4Max) z4++;
    else                             z5++;
  }
  const toMin = (s: number) => s > 0 ? Math.round(s / 60 * 10) / 10 : null;
  return { z1: toMin(z1), z2: toMin(z2), z3: toMin(z3), z4: toMin(z4), z5: toMin(z5) };
}

function calculateEffortScore(z1: number, z2: number, z3: number, z4: number, z5: number, outputKj: number) {
  const n = (v: number) => v || 0;
  const score = (
    -0.599 * n(z1) + -0.134 * n(z2) + 0.210 * n(z3) +
     0.745 * n(z4) +  0.766 * n(z5) + 0.1268 * n(outputKj) - 2.71
  );
  return Math.round(Math.max(0, score) * 10) / 10;
}

function mapActivityType(stravaType: string) {
  const t = (stravaType || '').toLowerCase();
  if (t === 'ride' || t === 'virtualride' || t === 'ebikeride') return 'cycling';
  if (t === 'run' || t === 'virtualrun')                         return 'running';
  if (t === 'walk' || t === 'hike')                              return 'walking';
  if (t.includes('yoga') || t.includes('medit') || t.includes('workout')) return 'meditation';
  return t;
}

async function refreshStravaToken(integration: any) {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type:    'refresh_token',
      refresh_token: integration.strava_refresh_token,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const json = await res.json();

  await supabase.from('user_integrations').update({
    strava_access_token:  json.access_token,
    strava_refresh_token: json.refresh_token,
    strava_expires_at:    json.expires_at,
    updated_at:           new Date().toISOString(),
  }).eq('user_id', integration.user_id);

  return json.access_token;
}

async function syncUser(integration: any) {
  const now = Math.floor(Date.now() / 1000);
  let token = integration.strava_access_token;

  // Refresh token if expired or expiring within 5 minutes
  if (!token || now >= (integration.strava_expires_at || 0) - 300) {
    token = await refreshStravaToken(integration);
  }

  // Get existing strava IDs to avoid duplicates
  const { data: existing } = await supabase
    .from('workouts')
    .select('strava_id')
    .eq('user_id', integration.user_id)
    .not('strava_id', 'is', null);

  const existingIds = new Set((existing || []).map((r: any) => String(r.strava_id)));

  // Fetch activities from Strava
  const activities: any[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${STRAVA_API}/athlete/activities?per_page=200&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Strava API error: ${res.status}`);
    const batch = await res.json();
    if (!batch || batch.length === 0) break;
    activities.push(...batch);
    if (batch.length < 200) break;
    page++;
    await new Promise(r => setTimeout(r, 1000));
  }

  const newActivities = activities.filter((a: any) => !existingIds.has(String(a.id)));
  if (newActivities.length === 0) return { synced: 0 };

  // Sort oldest first
  newActivities.sort((a: any, b: any) => new Date(a.start_date_local).getTime() - new Date(b.start_date_local).getTime());

  const rows = [];
  for (const a of newActivities) {
    const type      = mapActivityType(a.type || a.sport_type);
    const date      = a.start_date_local?.split('T')[0];
    const outputKj  = a.kilojoules ? Math.round(a.kilojoules) : null;
    const title     = a.name || type;
    const withMatch = title.match(/\bwith\s+(.+)$/i);
    const instructor = withMatch ? withMatch[1].trim() : null;

    let calories = null;
    let z1 = null, z2 = null, z3 = null, z4 = null, z5 = null, effortScore = null;

    if (type === 'cycling') {
      // Fetch calories
      const detailRes = await fetch(`${STRAVA_API}/activities/${a.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (detailRes.ok) {
        const detail = await detailRes.json();
        if (detail.calories) calories = Math.round(detail.calories);
      }

      // Fetch HR stream
      if (a.has_heartrate) {
        const hrRes = await fetch(`${STRAVA_API}/activities/${a.id}/streams?keys=heartrate&key_by_type=true`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (hrRes.ok) {
          const hrData = await hrRes.json();
          const hrs = hrData?.heartrate?.data;
          if (hrs && hrs.length > 0) {
            const zones = calculateZones(hrs);
            z1 = zones.z1; z2 = zones.z2; z3 = zones.z3; z4 = zones.z4; z5 = zones.z5;
            if (outputKj !== null) {
              effortScore = calculateEffortScore(z1||0, z2||0, z3||0, z4||0, z5||0, outputKj);
            }
          }
        }
      }

      await new Promise(r => setTimeout(r, 500)); // be polite to rate limits
    }

    rows.push({
      user_id:       integration.user_id,
      date,
      title,
      type,
      duration_min:  a.moving_time ? Math.round(a.moving_time / 60) : null,
      calories,
      output_kj:     outputKj,
      avg_cadence:   a.average_cadence ? Math.round(a.average_cadence * 10) / 10 : null,
      avg_resistance: null,
      hr_z1: z1, hr_z2: z2, hr_z3: z3, hr_z4: z4, hr_z5: z5,
      effort_score:  effortScore,
      instructor,
      strava_id:     String(a.id),
    });
  }

  const { error } = await supabase.from('workouts').upsert(rows, { onConflict: 'strava_id', ignoreDuplicates: true });
  if (error) throw new Error(`Workouts upsert failed: ${error.message}`);

  return { synced: rows.length };
}

Deno.serve(async (_req) => {
  try {
    // Get all users with Strava tokens
    const { data: integrations, error } = await supabase
      .from('user_integrations')
      .select('*')
      .not('strava_refresh_token', 'is', null);

    if (error) throw error;
    if (!integrations || integrations.length === 0) {
      return new Response(JSON.stringify({ message: 'No users with Strava connected' }), { status: 200 });
    }

    const results = [];
    for (const integration of integrations) {
      try {
        const result = await syncUser(integration);
        results.push({ user_id: integration.user_id, ...result });
      } catch (e: any) {
        results.push({ user_id: integration.user_id, error: e.message });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});