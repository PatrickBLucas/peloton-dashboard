// supabase/functions/strava-callback/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SB_SERVICE_ROLE_KEY')!
);

const STRAVA_CLIENT_ID     = Deno.env.get('STRAVA_CLIENT_ID')!;
const STRAVA_CLIENT_SECRET = Deno.env.get('STRAVA_CLIENT_SECRET')!;
const APP_URL              = 'https://peloton-dashboard-kappa.vercel.app';

Deno.serve(async (req) => {
  const url    = new URL(req.url);
  const code   = url.searchParams.get('code');
  const error  = url.searchParams.get('error');
  const userId = url.searchParams.get('state'); // we pass user_id as state

  if (error || !code || !userId) {
    return Response.redirect(`${APP_URL}/onboarding?strava=error`);
  }

  try {
    // Exchange code for tokens
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    });

    if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
    const json = await res.json();

    // Store tokens in user_integrations
    const { error: dbError } = await supabase
      .from('user_integrations')
      .upsert({
        user_id:              userId,
        strava_access_token:  json.access_token,
        strava_refresh_token: json.refresh_token,
        strava_expires_at:    json.expires_at,
        updated_at:           new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (dbError) throw new Error(dbError.message);

    return Response.redirect(`${APP_URL}/onboarding?strava=success`);
  } catch (e: any) {
    console.error('Strava callback error:', e.message);
    return Response.redirect(`${APP_URL}/onboarding?strava=error`);
  }
});