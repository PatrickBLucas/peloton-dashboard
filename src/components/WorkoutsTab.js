// src/components/WorkoutsTab.js
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

export default function WorkoutsTab({ data }) {
  const { workouts } = data;
  const [filter, setFilter] = useState('cycling');

  const cyclingWorkouts = useMemo(
    () => workouts.filter(w => w.type === 'cycling'),
    [workouts]
  );

  const totalCals = useMemo(
    () => workouts.reduce((s, w) => s + (w.calories || 0), 0),
    [workouts]
  );

  const avgOutputKj = useMemo(() => {
    const rides = cyclingWorkouts.filter(w => w.outputKj > 0);
    if (!rides.length) return null;
    return Math.round(rides.reduce((s, w) => s + w.outputKj, 0) / rides.length);
  }, [cyclingWorkouts]);

  const avgEffort = useMemo(() => {
    const rides = cyclingWorkouts.filter(w => w.effortScore > 0);
    if (!rides.length) return null;
    return (rides.reduce((s, w) => s + w.effortScore, 0) / rides.length).toFixed(1);
  }, [cyclingWorkouts]);

  const totalZ45Min = useMemo(
    () => cyclingWorkouts.reduce((s, w) => s + (w.hrZ4 || 0) + (w.hrZ5 || 0), 0),
    [cyclingWorkouts]
  );
  const z45Hours = Math.floor(totalZ45Min / 60);
  const z45Mins = Math.round(totalZ45Min % 60);

  const hrZoneChart = useMemo(() => {
    return [...cyclingWorkouts]
      .filter(w => w.hrZ1 || w.hrZ2 || w.hrZ3 || w.hrZ4 || w.hrZ5)
      .sort((a, b) => (a.date || 0) - (b.date || 0))
      .slice(-20)
      .map(w => ({
        date: w.date ? format(w.date, 'M/d') : '',
        Z1: Math.round(w.hrZ1 || 0),
        Z2: Math.round(w.hrZ2 || 0),
        Z3: Math.round(w.hrZ3 || 0),
        Z4: Math.round(w.hrZ4 || 0),
        Z5: Math.round(w.hrZ5 || 0),
      }));
  }, [cyclingWorkouts]);

  const outputChart = useMemo(() => {
    return [...cyclingWorkouts]
      .filter(w => w.outputKj > 0)
      .sort((a, b) => (a.date || 0) - (b.date || 0))
      .slice(-20)
      .map(w => ({
        date: w.date ? format(w.date, 'M/d') : '',
        kJ: w.outputKj,
      }));
  }, [cyclingWorkouts]);

  const types = useMemo(
    () => [...new Set(workouts.map(w => w.type).filter(Boolean))].sort(),
    [workouts]
  );

  const filtered = useMemo(() => {
    const sorted = [...workouts].sort((a, b) => (b.date || 0) - (a.date || 0));
    if (filter === 'all') return sorted;
    return sorted.filter(w => w.type === filter);
  }, [workouts, filter]);

  const typeColor = (t) => {
    if (!t) return 'pill-other';
    const l = t.toLowerCase();
    if (l === 'cycling') return 'pill-ride';
    if (l === 'walking' || l === 'running') return 'pill-run';
    return 'pill-other';
  };

  const tooltipStyle = {
    contentStyle: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4 },
    labelStyle: { color: 'var(--text2)', fontSize: 11 },
    itemStyle: { fontSize: 11 },
  };

  return (
    <>
      <div className="section-header">
        <span className="section-title">WORKOUTS</span>
        <span className="section-sub">{workouts.length} activities via Peloton</span>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Total Calories Burned</div>
          <div className="stat-value accent">
            {totalCals ? totalCals.toLocaleString() : '--'}
          </div>
          <div className="stat-sub">all time</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Output</div>
          <div className="stat-value">{avgOutputKj ?? '--'}</div>
          <div className="stat-sub">kJ per ride</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Effort Score</div>
          <div className="stat-value">{avgEffort ?? '--'}</div>
          <div className="stat-sub">cycling only</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Z4 + Z5 Time</div>
          <div className="stat-value">
            {totalZ45Min > 0 ? `${z45Hours}h ${z45Mins}m` : '--'}
          </div>
          <div className="stat-sub">high-intensity zones</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <div className="chart-title">HR Zones — Last 20 Rides (min)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={hrZoneChart} barSize={8} barGap={1}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
              <Tooltip {...tooltipStyle} formatter={(v, name) => [`${v} min`, name]} />
              <Bar dataKey="Z1" stackId="z" fill="#4a90d9" />
              <Bar dataKey="Z2" stackId="z" fill="#5bb55e" />
              <Bar dataKey="Z3" stackId="z" fill="#f5c842" />
              <Bar dataKey="Z4" stackId="z" fill="#f08c30" />
              <Bar dataKey="Z5" stackId="z" fill="#e04040" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: 'var(--text2)', justifyContent: 'center' }}>
            {[['Z1','#4a90d9'],['Z2','#5bb55e'],['Z3','#f5c842'],['Z4','#f08c30'],['Z5','#e04040']].map(([z, c]) => (
              <span key={z} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: c, display: 'inline-block' }} />
                {z}
              </span>
            ))}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-title">Output — Last 20 Rides (kJ)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={outputChart} barSize={10}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
              <Tooltip {...tooltipStyle} formatter={(v) => [`${v} kJ`, 'Output']} />
              <Bar dataKey="kJ" fill="var(--accent)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => setFilter('all')} className={`nav-btn${filter === 'all' ? ' active' : ''}`}>
          All
        </button>
        {types.map(t => (
          <button key={t} onClick={() => setFilter(t)} className={`nav-btn${filter === t ? ' active' : ''}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="chart-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="workout-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Title</th>
              <th>Type</th>
              <th>Duration</th>
              <th>Calories</th>
              <th>Output (kJ)</th>
              <th style={{ color: '#4a90d9' }}>Z1</th>
              <th style={{ color: '#5bb55e' }}>Z2</th>
              <th style={{ color: '#f5c842' }}>Z3</th>
              <th style={{ color: '#f08c30' }}>Z4</th>
              <th style={{ color: '#e04040' }}>Z5</th>
              <th>Effort</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((w, i) => (
              <tr key={i}>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)', fontSize: 12 }}>
                  {w.date ? format(w.date, 'MM/dd/yy') : '--'}
                </td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {w.title || '--'}
                </td>
                <td>
                  <span className={`pill ${typeColor(w.type)}`}>{w.type || 'Other'}</span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>
                  {w.durationMin ? `${Math.round(w.durationMin)}m` : '--'}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent2)' }}>
                  {w.calories ? Math.round(w.calories) : '--'}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>
                  {w.outputKj || '--'}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', color: '#4a90d9', fontSize: 12 }}>
                  {w.hrZ1 != null && w.hrZ1 !== '' ? w.hrZ1 : '--'}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', color: '#5bb55e', fontSize: 12 }}>
                  {w.hrZ2 != null && w.hrZ2 !== '' ? w.hrZ2 : '--'}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', color: '#f5c842', fontSize: 12 }}>
                  {w.hrZ3 != null && w.hrZ3 !== '' ? w.hrZ3 : '--'}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', color: '#f08c30', fontSize: 12 }}>
                  {w.hrZ4 != null && w.hrZ4 !== '' ? w.hrZ4 : '--'}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', color: '#e04040', fontSize: 12 }}>
                  {w.hrZ5 != null && w.hrZ5 !== '' ? w.hrZ5 : '--'}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)', fontSize: 12 }}>
                  {w.effortScore || '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}