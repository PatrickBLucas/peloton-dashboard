// src/App.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import Dashboard from './components/Dashboard';
import './App.css';

const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/script.projects';
// Refresh token 10 minutes before expiry
const REFRESH_BUFFER_MS = 10 * 60 * 1000;

function LoginScreen({ onLogin }) {
  const login = useGoogleLogin({
    onSuccess: onLogin,
    scope: SCOPE,
  });

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <span className="logo-text">ThriveMetrics</span>
        </div>
        <p className="login-tagline">Your training. Your data. Your progress.</p>
        <button className="login-btn" onClick={() => login()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign in with Google
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

function AppInner() {
  const [token, setToken] = useState(() => {
    const saved  = localStorage.getItem('gtoken');
    const expiry = localStorage.getItem('gtoken_expiry');
    if (saved && expiry && Date.now() < parseInt(expiry)) return saved;
    return null;
  });

  const refreshTimerRef = useRef(null);

  // Silent token refresh using the implicit flow
  const silentLogin = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      const expiry = Date.now() + (tokenResponse.expires_in * 1000);
      localStorage.setItem('gtoken', tokenResponse.access_token);
      localStorage.setItem('gtoken_expiry', expiry.toString());
      setToken(tokenResponse.access_token);
      scheduleRefresh(expiry);
    },
    onError: () => {
      // Silent refresh failed — force re-login
      handleLogout();
    },
    scope: SCOPE,
    prompt: '',  // no prompt = silent refresh
  });

  const scheduleRefresh = useCallback((expiry) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const delay = expiry - Date.now() - REFRESH_BUFFER_MS;
    if (delay > 0) {
      refreshTimerRef.current = setTimeout(() => {
        silentLogin();
      }, delay);
    }
  }, [silentLogin]);

  const handleLogin = useCallback((tokenResponse) => {
    const expiry = Date.now() + (tokenResponse.expires_in * 1000);
    localStorage.setItem('gtoken', tokenResponse.access_token);
    localStorage.setItem('gtoken_expiry', expiry.toString());
    setToken(tokenResponse.access_token);
    scheduleRefresh(expiry);
  }, [scheduleRefresh]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('gtoken');
    localStorage.removeItem('gtoken_expiry');
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setToken(null);
  }, []);

  // On mount, schedule refresh for existing token
  useEffect(() => {
    const expiry = localStorage.getItem('gtoken_expiry');
    if (token && expiry) {
      scheduleRefresh(parseInt(expiry));
    }
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  if (!token) return <LoginScreen onLogin={handleLogin} />;
  return <Dashboard accessToken={token} onLogout={handleLogout} />;
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <AppInner />
    </GoogleOAuthProvider>
  );
}