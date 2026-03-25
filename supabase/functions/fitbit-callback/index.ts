// supabase/functions/fitbit-callback/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SB_SERVICE_ROLE_KEY')!
);

const FITBIT_CLIENT_ID     = Deno.env.get('FITBIT_CLIENT_ID')!;
const FITBIT_CLIENT_SECRET = Deno.env.get('FITBIT_CLIENT_SECRET')!;
const APP_URL              = 'https://peloton-dashboard-kappa.vercel.app';
const REDIRECT_URI         = `${APP_URL}/auth/fitbit/callback`;

Deno.serve(async (req) => {
  const url    = new URL(req.url);
  const code   = url.searchParams.get('code');
  const error  = url.searchParams.get('error');
  const userId = url.searchParams.get('state');

  if (error || !code || !userId) {
    return Response.redirect(`${APP_URL}/onboarding?fitbit=error`);
  }

  try {
    const credentials = btoa(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`);
    const res = await fetch('https://api.fitbit.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        grant_type:   'authorization_code',
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Token exchange failed: ${res.status} ${text}`);
    }
    const json = await res.json();

    const { error: dbError } = await supabase
      .from('user_integrations')
      .upsert({
        user_id:              userId,
        fitbit_access_token:  json.access_token,
        fitbit_refresh_token: json.refresh_token,
        fitbit_expires_at:    Math.floor(Date.now() / 1000) + json.expires_in,
        updated_at:           new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (dbError) throw new Error(dbError.message);

    return Response.redirect(`${APP_URL}/onboarding?fitbit=success`);
  } catch (e: any) {
    console.error('Fitbit callback error:', e.message);
    return Response.redirect(`${APP_URL}/onboarding?fitbit=error`);
  }
});