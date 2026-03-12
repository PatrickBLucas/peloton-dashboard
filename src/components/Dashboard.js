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

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'workouts', label: 'Workouts' },
  { id: 'weight', label: 'Weight' },
  { id: 'calories', label: 'Calories' },
  { id: '108', label: '10-8 Tracker' },
];

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
          {/* Mobile: hamburger toggle */}
          <button className="hamburger-btn" onClick={() => setMenuOpen(o => !o)}>
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* Mobile dropdown menu — outside header so it spans full width */}
      {menuOpen && (
        <div className="mobile-menu">
          <button
            className="sync-btn"
            onClick={() => { setGoalInput(goalWeight.toString()); setEditingGoal(true); setMenuOpen(false); }}
          >
            Goal: {goalWeight} lbs
          </button>
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
        {TABS.map(t => (
          <button
            key={t.id}
            className={`bottom-nav-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
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
            {tab === 'overview' && <OverviewTab data={data} />}
            {tab === 'workouts' && <WorkoutsTab data={data} />}
            {tab === 'weight' && <WeightTab data={data} />}
            {tab === 'calories' && <CaloriesTab data={data} />}
            {tab === '108' && <TrackerTab data={data} />}
          </>
        )}
      </main>
    </div>
  );
}