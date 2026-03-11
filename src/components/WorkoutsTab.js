// src/components/WorkoutsTab.js
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line
} from 'recharts';

export default function WorkoutsTab({ data }) {
  const { workouts } = data;
  const [filter, setFilter] = useState('all');

  // Activity type breakdown
  const typeBreakdown = useMemo(() => {
    const counts = {};
    workouts.forEach(w => {
      const t = w.type || 'Other';
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [workouts]);

  // Duration trend — last 30 activities
  const durationChart = useMemo(() => {
    return [...workouts]
      .sort((a, b) => a.date - b.date)
      .slice(-30)
      .map(w => ({
        date: w.date ? format(w.date, 'MMM d') : '',
        minutes: Math.round(w.movingTimeMin || 0),
        calories: w.calories || 0,
      }));
  }, [workouts]);

  // Unique activity types for filter
  const types = useMemo(() => {
    return [...new Set(workouts.map(w => w.type).filter(Boolean))].sort();
  }, [workouts]);

  const filtered = useMemo(() => {
    const sorted = [...workouts].sort((a, b) => (b.date || 0) - (a.date || 0));
    if (filter === 'all') return sorted;
    return sorted.filter(w => w.type === filter);
  }, [workouts, filter]);

  const typeColor = (t) => {
    if (!t) return 'pill-other';
    const l = t.toLowerCase();
    if (l.includes('ride') || l.includes('cycl')) return 'pill-ride';
    if (l.includes('run')) return 'pill-run';
    return 'pill-other';
  };

  // Summary stats
  const totalMinutes = workouts.reduce((s, w) => s + (w.movingTimeMin || 0), 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const avgMinutes = workouts.length ? Math.round(totalMinutes / workouts.length) : 0;
  const totalCals = workouts.filter(w => w.calories).reduce((s, w) => s + w.calories, 0);
  const totalDistMi = workouts.filter(w => w.distanceM).reduce((s, w) => s + w.distanceM / 1609.34, 0);

  return (
    <>
      <div className="section-header">
        <span className="section-title">WORKOUTS</span>
        <span className="section-sub">{workouts.length} activities via Strava</span>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Total Activities</div>
          <div className="stat-value accent">{workouts.length}</div>
          <div className="stat-sub">all time</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Time</div>
          <div className="stat-value">{totalHours}h</div>
          <div className="stat-sub">{Math.round(totalMinutes % 60)}m remaining</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Duration</div>
          <div className="stat-value">{avgMinutes}</div>
          <div className="stat-sub">minutes per activity</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Distance</div>
          <div className="stat-value">{Math.round(totalDistMi)}</div>
          <div className="stat-sub">miles all time</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Calories</div>
          <div className="stat-value">{totalCals ? Math.round(totalCals).toLocaleString() : '--'}</div>
          <div className="stat-sub">all time</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <div className="chart-title">Duration — Last 30 Activities (min)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={durationChart} barSize={10}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
              <Tooltip
                contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4 }}
                labelStyle={{ color: 'var(--text2)', fontSize: 11 }}
                itemStyle={{ color: 'var(--accent)' }}
                formatter={(v) => [`${v} min`, 'Duration']}
              />
              <Bar dataKey="minutes" fill="var(--accent)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-title">Activity Types</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={typeBreakdown.map(([name, count]) => ({ name, count }))} layout="vertical" barSize={10}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={80} />
              <Tooltip
                contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4 }}
                labelStyle={{ color: 'var(--text2)', fontSize: 11 }}
                itemStyle={{ color: 'var(--blue)' }}
                formatter={(v) => [v, 'Activities']}
              />
              <Bar dataKey="count" fill="var(--blue)" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filter by type */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          onClick={() => setFilter('all')}
          className={`nav-btn${filter === 'all' ? ' active' : ''}`}
        >
          All
        </button>
        {types.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`nav-btn${filter === t ? ' active' : ''}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="chart-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="workout-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Name</th>
              <th>Type</th>
              <th>Duration</th>
              <th>Distance</th>
              <th>Calories</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map((w, i) => (
              <tr key={i}>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)', fontSize: 12 }}>
                  {w.date ? format(w.date, 'MM/dd/yy') : '--'}
                </td>
                <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {w.name || '--'}
                </td>
                <td>
                  <span className={`pill ${typeColor(w.type)}`}>{w.type || 'Other'}</span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>
                  {w.movingTimeMin ? `${Math.round(w.movingTimeMin)}m` : '--'}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>
                  {w.distanceM ? `${(w.distanceM / 1609.34).toFixed(2)} mi` : '--'}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent2)' }}>
                  {w.calories ? Math.round(w.calories) : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}