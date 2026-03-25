// supabase/functions/sync-fitbit/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FITBIT_TOKEN_URL = 'https://api.fitbit.com/oauth2/token';
const FITBIT_API       = 'https://api.fitbit.com/1/user/-';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SB_SERVICE_ROLE_KEY')!
);

const FITBIT_CLIENT_ID     = Deno.env.get('FITBIT_CLIENT_ID')!;
const FITBIT_CLIENT_SECRET = Deno.env.get('FITBIT_CLIENT_SECRET')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function refreshFitbitToken(integration: any) {
  const credentials = btoa(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`);
  const res = await fetch(FITBIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: integration.fitbit_refresh_token,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fitbit token refresh failed: ${res.status} ${text}`);
  }
  const json = await res.json();

  await supabase.from('user_integrations').update({
    fitbit_access_token:  json.access_token,
    fitbit_refresh_token: json.refresh_token,
    fitbit_expires_at:    Math.floor(Date.now() / 1000) + json.expires_in,
    updated_at:           new Date().toISOString(),
  }).eq('user_id', integration.user_id);

  return json.access_token;
}

async function fitbitGet(path: string, token: string) {
  const res = await fetch(`${FITBIT_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Fitbit API error ${res.status} on ${path}`);
  return res.json();
}

async function syncUser(integration: any) {
  const now = Math.floor(Date.now() / 1000);
  let token = integration.fitbit_access_token;

  if (!token || now >= (integration.fitbit_expires_at || 0) - 300) {
    token = await refreshFitbitToken(integration);
  }

  const dates = [];
  for (let i = 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  let synced = 0;
  for (const date of dates) {
    try {
      const [activities, weightData, sleepData] = await Promise.all([
        fitbitGet(`/activities/date/${date}.json`, token),
        fitbitGet(`/body/log/weight/date/${date}.json`, token),
        fitbitGet(`/sleep/date/${date}.json`, token),
      ]);

      const summary  = activities?.summary || {};
      const weight   = weightData?.weight?.[0];
      const sleep    = sleepData?.sleep?.[0];

      const row: any = {
        user_id:            integration.user_id,
        date,
        calories_out:       summary.caloriesOut || null,
        steps:              summary.steps       || null,
        fairly_active_min:  summary.fairlyActiveMinutes  || null,
        very_active_min:    summary.veryActiveMinutes    || null,
        lightly_active_min: summary.lightlyActiveMinutes || null,
        sedentary_min:      summary.sedentaryMinutes     || null,
        weight_kg:          weight?.weight  || null,
        bmi:                weight?.bmi     || null,
        minutes_asleep:     sleep?.minutesAsleep    || null,
        minutes_awake:      sleep?.minutesAwake     || null,
        time_in_bed:        sleep?.timeInBed        || null,
        efficiency:         sleep?.efficiency       || null,
        restless_count:     sleep?.restlessCount    || null,
        restless_duration:  sleep?.restlessDuration || null,
        sleep_start_time:   sleep?.startTime        || null,
        sleep_end_time:     sleep?.endTime          || null,
      };

      const { error } = await supabase
        .from('fitbit_daily')
        .upsert(row, { onConflict: 'user_id,date' });

      if (error) throw new Error(`fitbit_daily upsert failed: ${error.message}`);
      synced++;

      await new Promise(r => setTimeout(r, 500));
    } catch (e: any) {
      console.error(`Failed to sync Fitbit for ${date}: ${e.message}`);
    }
  }

  return { synced };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { data: integrations, error } = await supabase
      .from('user_integrations')
      .select('*')
      .not('fitbit_refresh_token', 'is', null);

    if (error) throw error;
    if (!integrations || integrations.length === 0) {
      return new Response(JSON.stringify({ message: 'No users with Fitbit connected' }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
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
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});