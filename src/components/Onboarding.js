// src/components/Onboarding.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const STRAVA_CLIENT_ID = '185228';
const SUPABASE_FUNCTIONS_URL = 'https://hmtevflfryjkudkcpmac.supabase.co/functions/v1';
const APP_URL = 'https://peloton-dashboard-kappa.vercel.app';

export default function Onboarding({ session, onComplete }) {
  const userId = session.user.id;
  const [stravaConnected, setStravaConnected]   = useState(false);
  const [fitbitConnected, setFitbitConnected]   = useState(false);
  const [checkingStatus, setCheckingStatus]     = useState(true);
  const [msg, setMsg] = useState(null);

  // Check URL params for OAuth callback results
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('strava') === 'success') setMsg({ type: 'success', text: 'Strava connected!' });
    if (params.get('strava') === 'error')   setMsg({ type: 'error',   text: 'Strava connection failed. Try again.' });
    if (params.get('fitbit') === 'success') setMsg({ type: 'success', text: 'Fitbit connected!' });
    if (params.get('fitbit') === 'error')   setMsg({ type: 'error',   text: 'Fitbit connection failed. Try again.' });
    // Clean up URL
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  // Check which integrations are already connected
  useEffect(() => {
    async function checkStatus() {
      setCheckingStatus(true);
      const { data } = await supabase
        .from('user_integrations')
        .select('strava_refresh_token, fitbit_refresh_token')
        .eq('user_id', userId)
        .single();

      if (data) {
        setStravaConnected(!!data.strava_refresh_token);
        setFitbitConnected(!!data.fitbit_refresh_token);
      }
      setCheckingStatus(false);
    }
    checkStatus();
  }, [userId]);

  // If both connected, call onComplete
  useEffect(() => {
    if (!checkingStatus && stravaConnected && fitbitConnected) {
      // Small delay so user sees the success state
      setTimeout(onComplete, 1000);
    }
  }, [checkingStatus, stravaConnected, fitbitConnected, onComplete]);

  const connectStrava = () => {
    const redirectUri = `${SUPABASE_FUNCTIONS_URL}/strava-callback`;
    const authUrl = 'https://www.strava.com/oauth/authorize'
      + `?client_id=${STRAVA_CLIENT_ID}`
      + `&response_type=code`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + `&approval_prompt=auto`
      + `&scope=activity:read_all`
      + `&state=${userId}`;
    window.location.href = authUrl;
  };

  const connectFitbit = () => {
    const redirectUri = `${APP_URL}/auth/fitbit/callback`;
    const authUrl = 'https://www.fitbit.com/oauth2/authorize'
      + `?client_id=23Q7WY`
      + `&response_type=code`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + `&scope=activity+nutrition+sleep+weight+profile+settings`
      + `&state=${userId}`;
    window.location.href = authUrl;
  };

  const handleSignOut = () => supabase.auth.signOut();

  const bothConnected = stravaConnected && fitbitConnected;

  return (
    <div className="login-screen">
      <div className="login-card" style={{ maxWidth: 480 }}>
        <div className="login-logo">
          <span className="logo-text">ThriveMetrics</span>
        </div>

        <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
          Welcome! Connect your fitness accounts to get started.
        </p>

        {msg && (
          <div className={`sync-banner ${msg.type}`} style={{ marginBottom: 16, borderRadius: 'var(--radius)' }}>
            {msg.text}
          </div>
        )}

        {checkingStatus ? (
          <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: 20 }}>
            Checking connections...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>

            {/* Strava */}
            <div style={{
              padding: 16, borderRadius: 'var(--radius)',
              border: `1px solid ${stravaConnected ? 'var(--accent)' : 'var(--border)'}`,
              background: stravaConnected ? 'rgba(var(--accent-rgb), 0.05)' : 'var(--bg2)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 3 }}>
                  🚴 Strava
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {stravaConnected ? 'Connected — your rides will sync automatically' : 'Required to sync your Peloton workouts'}
                </div>
              </div>
              {stravaConnected ? (
                <div style={{ color: 'var(--accent)', fontSize: 20, flexShrink: 0 }}>✓</div>
              ) : (
                <button className="sync-btn" onClick={connectStrava} style={{ flexShrink: 0, padding: '10px 16px' }}>
                  Connect
                </button>
              )}
            </div>

            {/* Fitbit */}
            <div style={{
              padding: 16, borderRadius: 'var(--radius)',
              border: `1px solid ${fitbitConnected ? 'var(--accent)' : 'var(--border)'}`,
              background: fitbitConnected ? 'rgba(var(--accent-rgb), 0.05)' : 'var(--bg2)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 3 }}>
                  ❤️ Fitbit
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {fitbitConnected ? 'Connected — your health data will sync automatically' : 'Required to sync sleep, steps and weight'}
                </div>
              </div>
              {fitbitConnected ? (
                <div style={{ color: 'var(--accent)', fontSize: 20, flexShrink: 0 }}>✓</div>
              ) : (
                <button className="sync-btn" onClick={connectFitbit} style={{ flexShrink: 0, padding: '10px 16px' }}>
                  Connect
                </button>
              )}
            </div>

          </div>
        )}

        {bothConnected && (
          <div style={{ textAlign: 'center', color: 'var(--accent)', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
            All set! Taking you to your dashboard...
          </div>
        )}

        <button
          onClick={handleSignOut}
          style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', width: '100%', textAlign: 'center', marginTop: 8 }}
        >
          Sign out
        </button>
      </div>

      <div className="login-bg">
        <div className="bg-line" style={{'--i': 0}} />
        <div className="bg-line" style={{'--i': 1}} />
        <div className="bg-line" style={{'--i': 2}} />
        <div className="bg-line" style={{'--i': 3}} />
        <div className="bg-line" style={{'--i': 4}} />
      </div>
    </div>
  );
}