// src/components/Dashboard.js
import { useState, useEffect, useCallback } from 'react';
import {
  fetchWorkouts, fetchFitbitData, fetchWeight, fetch108,
  triggerSync, computeStats, fetchGoalWeight, saveGoalWeight
} from '../api/sheets';
import OverviewTab from './OverviewTab';
import WorkoutsTab from './WorkoutsTab';
import WeightTab from './WeightTab';
import CaloriesTab from './CaloriesTab';
import TrackerTab from './TrackerTab';
import FoodLogTab from './FoodLogTab';
import BestRidesTab from './BestRidesTab';
import StatsTab from './StatsTab';

// Bottom nav tabs (5 core)
const BOTTOM_TABS = [
  { id: 'overview',  label: 'Home',    icon: 'home' },
  { id: 'workouts',  label: 'Rides',   icon: 'rides' },
  { id: 'stats',     label: 'Stats',   icon: 'stats' },
  { id: 'foodlog',   label: 'Log',     icon: 'log' },
  { id: 'bestrides', label: 'Ranking', icon: 'trophy' },
];

// Overflow tabs (topbar / hamburger)
const OVERFLOW_TABS = [
  { id: '108',      label: '10-8' },
];

const TABS = [...BOTTOM_TABS, ...OVERFLOW_TABS];

// SVG icons for bottom nav
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
  return null;
}

export default function Dashboard({ accessToken, onLogout }) {
  const [tab, setTab] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [goalWeight, setGoalWeight] = useState(180);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);
  const [syncing, setSyncing] = useState(null);
  const [syncMsg, setSyncMsg] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [workouts, fitbit, weight, tracker, fetchedGoal] = await Promise.all([
        fetchWorkouts(accessToken),
        fetchFitbitData(accessToken),
        fetchWeight(accessToken),
        fetch108(accessToken),
        fetchGoalWeight(accessToken),
      ]);
      setGoalWeight(fetchedGoal);
      const stats = computeStats(weight, fitbit, workouts, fetchedGoal);
      setData({ workouts, fitbit, weight, stats, tracker });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveGoal = useCallback(async () => {
    const val = parseFloat(goalInput);
    if (isNaN(val) || val < 50 || val > 500) return;
    setSavingGoal(true);
    try {
      await saveGoalWeight(accessToken, val);
      setGoalWeight(val);
      setEditingGoal(false);
      // Recompute stats with new goal
      if (data) {
        const stats = computeStats(data.weight, data.fitbit, data.workouts, val);
        setData(d => ({ ...d, stats }));
      }
    } catch (e) {
      setSyncMsg({ type: 'error', text: `Failed to save goal: ${e.message}` });
    } finally {
      setSavingGoal(false);
    }
  }, [accessToken, goalInput, data]);

  const handleSync = useCallback(async (type) => {
    const fnName = type === 'fitbit' ? 'sync' : type === 'peloton' ? 'syncPeloton' : 'sendPDF';
    setSyncing(type);
    setSyncMsg(null);
    try {
      await triggerSync(accessToken, fnName);
      setSyncMsg({ type: 'success', text: `${type === 'fitbit' ? 'Fitbit' : type === 'peloton' ? 'Peloton' : '10-8 report'} ${type === '108' ? 'sent!' : 'sync started. Reloading in 5s...'}` });
      if (type !== '108') {
        setTimeout(() => {
          loadData();
          setSyncMsg(null);
        }, 5000);
      } else {
        setTimeout(() => setSyncMsg(null), 4000);
      }
    } catch (e) {
      setSyncMsg({ type: 'error', text: `Sync failed: ${e.message}` });
    } finally {
      setSyncing(null);
    }
  }, [accessToken, loadData]);

  const syncTime = data ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="dashboard">
      <header className="topbar">
        <span className="topbar-logo">ThriveMetrics</span>
        <nav className="topbar-nav">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`nav-btn${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          {/* Desktop: inline actions */}
          <div className="topbar-actions desktop-actions">
          {editingGoal ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                value={goalInput}
                onChange={e => setGoalInput(e.target.value)}
                placeholder={goalWeight}
                style={{
                  width: 70, padding: '5px 8px', background: 'var(--bg3)',
                  border: '1px solid var(--accent)', borderRadius: 'var(--radius)',
                  color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-mono)',
                }}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSaveGoal(); if (e.key === 'Escape') setEditingGoal(false); }}
              />
              <button className="sync-btn" onClick={handleSaveGoal} disabled={savingGoal}>
                {savingGoal ? '...' : 'Save'}
              </button>
              <button className="logout-btn" onClick={() => setEditingGoal(false)}>Cancel</button>
            </div>
          ) : (
            <button
              className="sync-btn"
              onClick={() => { setGoalInput(goalWeight.toString()); setEditingGoal(true); }}
              title="Set goal weight"
            >
              Goal: {goalWeight} lbs
            </button>
          )}
          <button className="sync-btn" onClick={() => handleSync('108')} disabled={syncing !== null}>
            {syncing === '108' ? '...' : '📧 10-8'}
          </button>
          <button className="sync-btn" onClick={() => handleSync('fitbit')} disabled={syncing !== null}>
            {syncing === 'fitbit' ? '...' : '⟳ Fitbit'}
          </button>
          <button className="sync-btn" onClick={() => handleSync('peloton')} disabled={syncing !== null}>
            {syncing === 'peloton' ? '...' : '⟳ Peloton'}
          </button>
          {syncTime && <span className="sync-time">loaded {syncTime}</span>}
          <button className="logout-btn" onClick={onLogout}>Sign out</button>
          </div>
          {/* Mobile: overflow tab links */}
          <div className="topbar-overflow-tabs">
            {OVERFLOW_TABS.map(t => (
              <button
                key={t.id}
                className={`overflow-tab-btn${tab === t.id ? ' active' : ''}`}
                onClick={() => { setTab(t.id); setMenuOpen(false); }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Mobile: hamburger toggle */}
          <button className="hamburger-btn" onClick={() => setMenuOpen(o => !o)}>
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* Mobile dropdown menu — outside header so it spans full width */}
      {menuOpen && (
        <div className="mobile-menu">
          {editingGoal ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center' }}>Set goal weight (lbs)</div>
              <input
                type="number"
                value={goalInput}
                onChange={e => setGoalInput(e.target.value)}
                placeholder={goalWeight}
                style={{
                  width: '100%', padding: '12px', background: 'var(--bg3)',
                  border: '1px solid var(--accent)', borderRadius: 'var(--radius)',
                  color: 'var(--text)', fontSize: 20, fontFamily: 'var(--font-mono)',
                  textAlign: 'center', boxSizing: 'border-box',
                }}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSaveGoal(); if (e.key === 'Escape') setEditingGoal(false); }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="sync-btn" onClick={handleSaveGoal} disabled={savingGoal} style={{ flex: 1, padding: 12 }}>
                  {savingGoal ? '...' : 'Save'}
                </button>
                <button className="logout-btn" onClick={() => setEditingGoal(false)} style={{ flex: 1, padding: 12 }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button
              className="sync-btn"
              onClick={() => { setGoalInput(goalWeight.toString()); setEditingGoal(true); }}
            >
              Goal: {goalWeight} lbs
            </button>
          )}
          <button className="sync-btn" onClick={() => { handleSync('108'); setMenuOpen(false); }} disabled={syncing !== null}>
            {syncing === '108' ? '...' : '📧 10-8'}
          </button>
          <button className="sync-btn" onClick={() => { handleSync('fitbit'); setMenuOpen(false); }} disabled={syncing !== null}>
            {syncing === 'fitbit' ? '...' : '⟳ Fitbit'}
          </button>
          <button className="sync-btn" onClick={() => { handleSync('peloton'); setMenuOpen(false); }} disabled={syncing !== null}>
            {syncing === 'peloton' ? '...' : '⟳ Peloton'}
          </button>
          {syncTime && <span className="sync-time">loaded {syncTime}</span>}
          <button className="logout-btn" onClick={onLogout}>Sign out</button>
        </div>
      )}

      {/* Mobile bottom nav */}
      <nav className="bottom-nav">
        {BOTTOM_TABS.map(t => (
          <button
            key={t.id}
            className={`bottom-nav-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <NavIcon icon={t.icon} active={tab === t.id} />
            <span className="bottom-nav-label">{t.label}</span>
          </button>
        ))}
      </nav>

      {syncMsg && (
        <div className={`sync-banner ${syncMsg.type}`}>
          {syncMsg.text}
        </div>
      )}

      <main className="main-content">
        {loading && (
          <div className="loading-screen">
            <div className="spinner" />
            <span>Loading your data...</span>
          </div>
        )}
        {error && (
          <div className="error-msg">
            <p>Failed to load data: {error}</p>
            <p style={{ fontSize: 12, marginTop: 8, color: '#666' }}>
              Make sure your Google Sheet is shared and the OAuth scope includes Sheets read access.
            </p>
          </div>
        )}
        {data && !loading && (
          <>
            {tab === 'overview'  && <OverviewTab data={data} />}
            {tab === 'workouts'  && <WorkoutsTab data={data} />}
            {tab === 'stats'     && <StatsTab data={data} />}
            {tab === '108'       && <TrackerTab data={data} />}
            {tab === 'foodlog'   && <FoodLogTab data={data} accessToken={accessToken} />}
            {tab === 'bestrides' && <BestRidesTab data={data} />}
          </>
        )}
      </main>
    </div>
  );
}