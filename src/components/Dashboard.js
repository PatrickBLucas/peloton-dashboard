// src/components/Dashboard.js
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  fetchWorkouts, fetchFitbitData, fetchWeight, fetch108, fetchFoodLog,
  computeStats, fetchGoalWeight, saveGoalWeight
} from '../api/supabase';
import OverviewTab from './OverviewTab';
import WorkoutsTab from './WorkoutsTab';
import WeightTab from './WeightTab';
import CaloriesTab from './CaloriesTab';
import TrackerTab from './TrackerTab';
import FoodLogTab from './FoodLogTab';
import BestRidesTab from './BestRidesTab';
import CoachTab from './CoachTab';
import StatsTab from './StatsTab';
import SettingsTab from './SettingsTab';

const SUPABASE_FUNCTIONS_URL = 'https://hmtevflfryjkudkcpmac.supabase.co/functions/v1';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdGV2Zmxmcnlqa3Vka2NwbWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzA3NzgsImV4cCI6MjA4OTk0Njc3OH0.9riWHdjPggS9so5VXzcOmlQ-gsAREzZhfRmNAEEe2Rw';

const BOTTOM_TABS = [
  { id: 'overview',  label: 'Home',    icon: 'home' },
  { id: 'workouts',  label: 'Rides',   icon: 'rides' },
  { id: 'stats',     label: 'Stats',   icon: 'stats' },
  { id: 'foodlog',   label: 'Log',     icon: 'log' },
  { id: 'bestrides', label: 'Ranking', icon: 'trophy' },
  { id: 'coach',     label: 'Coach',   icon: 'coach' },
];

const OVERFLOW_TABS = [
  { id: '108', label: '10-8' },
];

const TABS = [...BOTTOM_TABS, ...OVERFLOW_TABS];

function NavIcon({ icon, active }) {
  const color = active ? 'var(--accent)' : 'var(--text2)';
  const s = { width: 20, height: 20 };
  if (icon === 'home') return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
  if (icon === 'rides') return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/>
      <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5L9 11l3-5h4l2 5.5"/>
      <path d="M9 11H5l-1.5-4.5"/>
    </svg>
  );
  if (icon === 'stats') return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  );
  if (icon === 'log') return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
      <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
    </svg>
  );
  if (icon === 'trophy') return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 21 12 21 16 21"/><line x1="12" y1="17" x2="12" y2="21"/>
      <path d="M7 4H17l-1 7a5 5 0 0 1-10 0z"/>
      <path d="M5 4H3v3a4 4 0 0 0 4 4"/><path d="M19 4h2v3a4 4 0 0 1-4 4"/>
    </svg>
  );
  if (icon === 'coach') return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
      <path d="M12 6v6l4 2"/>
      <path d="M9.5 9a3 3 0 0 1 5 0c0 1.5-1 2.5-2.5 3v1"/>
      <circle cx="12" cy="17" r="0.5" fill={color}/>
    </svg>
  );
  return null;
}

export default function Dashboard({ session, onLogout }) {
  const userId = session.user.id;

  // Persist active tab across full page reloads using localStorage
  const [tab, setTab] = useState(() => localStorage.getItem('activeTab') || 'overview');
  const [menuOpen, setMenuOpen]       = useState(false);
  const [loading, setLoading]         = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError]             = useState(null);
  const [data, setData]               = useState(null);
  const [goalWeight, setGoalWeight]   = useState(180);
  const [syncing, setSyncing]         = useState(null);
  const [syncMsg, setSyncMsg]         = useState(null);

  // temporary debug -- remove after testing
  const [debugTab] = useState(() => localStorage.getItem('activeTab'));

  // Persists tab to localStorage on every navigation
  const navigateTab = useCallback((id) => {
    localStorage.setItem('activeTab', id);
    setTab(id);
    setMenuOpen(false);
  }, []);

  const loadData = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      setError(null);
      const [workouts, fitbit, weight, tracker, fetchedGoal, foodLog] = await Promise.all([
        fetchWorkouts(userId),
        fetchFitbitData(userId),
        fetchWeight(userId),
        fetch108(userId),
        fetchGoalWeight(userId),
        fetchFoodLog(userId),
      ]);
      setGoalWeight(fetchedGoal);
      const stats = computeStats(weight, fitbit, workouts, fetchedGoal, foodLog);
      setData({ workouts, fitbit, weight, stats, tracker, foodLog });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [userId]);

  // Show spinner on initial load only -- subsequent refreshes are silent
  useEffect(() => {
    loadData(true);
  }, [loadData]);

  const handleSync = useCallback(async (type) => {
    setSyncing(type);
    setSyncMsg(null);
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/sync-${type}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
          'apikey': ANON_KEY,
          'Content-Type': 'application/json',
        },
      });
      const json = await res.json();
      const synced = json.results?.[0]?.synced ?? 0;
      setSyncMsg({ type: 'success', text: `${type === 'strava' ? 'Strava' : 'Fitbit'} sync complete — ${synced} new ${type === 'strava' ? 'activities' : 'days'} added. Reloading...` });
      setTimeout(async () => { await loadData(); setSyncMsg(null); }, 2000);
    } catch (e) {
      setSyncMsg({ type: 'error', text: `Sync failed: ${e.message}` });
    } finally {
      setSyncing(null);
    }
  }, [loadData]);

  const syncTime = data
    ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const SyncButtons = ({ mobile = false }) => (
    <>
      <button className="sync-btn" onClick={() => handleSync('fitbit')} disabled={syncing !== null} style={mobile ? { width: '100%' } : {}}>
        {syncing === 'fitbit' ? '...' : '⟳ Fitbit'}
      </button>
      <button className="sync-btn" onClick={() => handleSync('strava')} disabled={syncing !== null} style={mobile ? { width: '100%' } : {}}>
        {syncing === 'strava' ? '...' : '⟳ Strava'}
      </button>
    </>
  );

  return (
    <div className="dashboard">

      {/* temporary debug -- remove after testing */}
      <div style={{
        position: 'fixed', top: 56, left: 0, right: 0,
        background: 'red', color: '#fff', fontSize: 11,
        zIndex: 9999, padding: '6px 10px', lineHeight: 1.8,
        textAlign: 'center',
      }}>
        stored: {debugTab ?? 'null'} | current: {tab} | match: {String(debugTab === tab)}
      </div>

      <header className="topbar">
        <span className="topbar-logo">THRIVEMETRICS</span>
        <nav className="topbar-nav">
          {TABS.map(t => (
            <button key={t.id} className={`nav-btn${tab === t.id ? ' active' : ''}`} onClick={() => navigateTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <div className="topbar-actions desktop-actions">
            <SyncButtons />
            {syncTime && <span className="sync-time">loaded {syncTime}</span>}
            <button className="sync-btn" onClick={() => navigateTab('settings')}>⚙ Settings</button>
            <button className="logout-btn" onClick={onLogout}>Sign out</button>
          </div>
          <div className="topbar-overflow-tabs">
            {OVERFLOW_TABS.map(t => (
              <button key={t.id} className={`overflow-tab-btn${tab === t.id ? ' active' : ''}`} onClick={() => navigateTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <button className="hamburger-btn" onClick={() => setMenuOpen(o => !o)}>
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="mobile-menu">
          <SyncButtons mobile />
          <button className="sync-btn" onClick={() => navigateTab('settings')} style={{ width: '100%' }}>
            ⚙ Settings
          </button>
          <button className="sync-btn" onClick={() => navigateTab('108')} style={{ width: '100%' }}>
            10-8 Tracker
          </button>
          {syncTime && <span className="sync-time">loaded {syncTime}</span>}
          <button className="logout-btn" onClick={onLogout}>Sign out</button>
        </div>
      )}

      <nav className="bottom-nav">
        {BOTTOM_TABS.map(t => (
          <button key={t.id} className={`bottom-nav-btn${tab === t.id ? ' active' : ''}`} onClick={() => navigateTab(t.id)}>
            <NavIcon icon={t.icon} active={tab === t.id} />
            <span className="bottom-nav-label">{t.label}</span>
          </button>
        ))}
      </nav>

      {syncMsg && (
        <div className={`sync-banner ${syncMsg.type}`}>{syncMsg.text}</div>
      )}

      <main className="main-content">
        {loading && initialLoad && (
          <div className="loading-screen">
            <div className="spinner" />
            <span>Loading your data...</span>
          </div>
        )}
        {error && (
          <div className="error-msg">
            <p>Failed to load data: {error}</p>
          </div>
        )}
        {data && !loading && (
          <>
            {tab === 'overview'  && <OverviewTab data={data} />}
            {tab === 'workouts'  && <WorkoutsTab data={data} />}
            {tab === 'stats'     && <StatsTab data={data} userId={userId} />}
            {tab === '108'       && <TrackerTab data={data} />}
            {tab === 'foodlog'   && <FoodLogTab data={data} userId={userId} />}
            {tab === 'bestrides' && <BestRidesTab data={data} />}
            {tab === 'coach'     && <CoachTab userId={userId} />}
            {tab === 'settings'  && (
              <SettingsTab
                userId={userId}
                onSaved={async () => {
                  await loadData();
                  navigateTab('overview');
                }}
                onClose={() => navigateTab('overview')}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}