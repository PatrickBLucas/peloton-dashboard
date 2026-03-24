// src/App.js
import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Dashboard from './components/Dashboard';
import './App.css';

function LoginScreen({ expired = false }) {
  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <span className="logo-text">ThriveMetrics</span>
        </div>
        {expired ? (
          <p className="login-tagline" style={{ color: 'var(--accent)', fontSize: 15 }}>
            Session expired — tap below to sign back in.
          </p>
        ) : (
          <p className="login-tagline">Your training. Your data. Your progress.</p>
        )}
        <button className="login-btn" onClick={handleLogin}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {expired ? 'Sign back in' : 'Sign in with Google'}
        </button>
        <p className="login-note">Only you can access this dashboard</p>
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

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Still determining session state
  if (session === undefined) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
        <div style={{ color: 'var(--text3)', fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <Dashboard
      session={session}
      onLogout={() => supabase.auth.signOut()}
    />
  );
}