// src/components/Dashboard.js
import { useState, useEffect } from 'react';
import {
  fetchWorkouts, fetchPelotonLog, fetchFitbitData, fetchWeight, fetchStats, fetch108
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [workouts, peloton, fitbit, weight, stats, tracker] = await Promise.all([
          fetchWorkouts(accessToken),
          fetchPelotonLog(accessToken),
          fetchFitbitData(accessToken),
          fetchWeight(accessToken),
          fetchStats(accessToken),
          fetch108(accessToken),
        ]);
        setData({ workouts, peloton, fitbit, weight, stats, tracker });
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [accessToken]);

  const syncTime = data ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="dashboard">
      <header className="topbar">
        <span className="topbar-logo">LUCAS</span>
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
          {syncTime && <span className="sync-time">synced {syncTime}</span>}
          <button className="logout-btn" onClick={onLogout}>Sign out</button>
        </div>
      </header>

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

      {/* Mobile bottom nav */}
      <nav style={{
        display: 'none',
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--bg2)',
        borderTop: '1px solid var(--border)',
        padding: '8px 0',
        zIndex: 100,
      }} className="mobile-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`nav-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
            style={{ flex: 1, fontSize: 11 }}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
