// supabase/functions/log-weight/index.ts
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
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: integration.fitbit_refresh_token,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const json = await res.json();
  await supabase.from('user_integrations').update({
    fitbit_access_token:  json.access_token,
    fitbit_refresh_token: json.refresh_token,
    fitbit_expires_at:    Math.floor(Date.now() / 1000) + json.expires_in,
    updated_at:           new Date().toISOString(),
  }).eq('user_id', integration.user_id);
  return json.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  try {
    const { user_id, weight_lbs, date } = await req.json();

    if (!user_id || !weight_lbs) {
      return new Response('Missing user_id or weight_lbs', { status: 400, headers: CORS_HEADERS });
    }

    const weightKg = Math.round(weight_lbs * 0.453592 * 1000) / 1000;
    const logDate  = date || new Date().toISOString().split('T')[0];

    // Get user's Fitbit tokens
    const { data: integration, error: intError } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (intError || !integration?.fitbit_refresh_token) {
      return new Response('Fitbit not connected', { status: 400, headers: CORS_HEADERS });
    }

    // Refresh token if needed
    const now = Math.floor(Date.now() / 1000);
    let token = integration.fitbit_access_token;
    if (!token || now >= (integration.fitbit_expires_at || 0) - 300) {
      token = await refreshFitbitToken(integration);
    }

    // Log weight to Fitbit
    const fitbitRes = await fetch(`${FITBIT_API}/body/log/weight.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        weight: String(weightKg),
        date:   logDate,
      }),
    });

    if (!fitbitRes.ok) {
      const err = await fitbitRes.text();
      throw new Error(`Fitbit weight log failed: ${fitbitRes.status} ${err}`);
    }

    const fitbitData = await fitbitRes.json();
    const bmi = fitbitData?.weightLog?.bmi || null;

    // Also update our local fitbit_daily table immediately
    await supabase
      .from('fitbit_daily')
      .upsert({
        user_id,
        date:      logDate,
        weight_kg: weightKg,
        bmi,
      }, { onConflict: 'user_id,date' });

    return new Response(JSON.stringify({ success: true, weight_kg: weightKg, date: logDate }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e: any) {
    console.error('log-weight error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});