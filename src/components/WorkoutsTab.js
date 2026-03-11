// src/components/WorkoutsTab.js
import { useState, useMemo } from 'react';
import { format, subDays } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line
} from 'recharts';

export default function WorkoutsTab({ data }) {
  const { peloton, workouts } = data;
  const [filter, setFilter] = useState('all');

  // Instructor breakdown
  const instructors = useMemo(() => {
    const counts = {};
    peloton.forEach(w => {
      if (w.instructor) counts[w.instructor] = (counts[w.instructor] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [peloton]);

  // Output over time (last 30 rides with output)
  const outputChart = useMemo(() => {
    return peloton
      .filter(w => w.totalOutput)
      .slice(-30)
      .map(w => ({
        date: w.date ? format(w.date, 'MMM d') : '',
        output: w.totalOutput,
        calories: w.caloriesBurned,
      }));
  }, [peloton]);

  // Recent workouts list
  const recentWorkouts = useMemo(() => {
    const combined = [
      ...peloton.map(w => ({ ...w, source: 'peloton' })),
    ].sort((a, b) => (b.date || 0) - (a.date || 0));

    if (filter === 'cycling') return combined.filter(w => w.discipline === 'Cycling');
    if (filter === 'other') return combined.filter(w => w.discipline !== 'Cycling');
    return combined;
  }, [peloton, filter]);

  const disciplineColor = (d) => {
    if (!d) return 'pill-other';
    if (d.toLowerCase().includes('cycl')) return 'pill-ride';
    if (d.toLowerCase().includes('run')) return 'pill-run';
    return 'pill-other';
  };

  return (
    <>
      <div className="section-header">
        <span className="section-title">WORKOUTS</span>
        <span className="section-sub">{peloton.length} rides logged</span>
      </div>

      {/* Stats row */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Avg Output</div>
          <div className="stat-value">
            {peloton.length ? Math.round(peloton.filter(w => w.totalOutput).reduce((s, w) => s + w.totalOutput, 0) / peloton.filter(w => w.totalOutput).length) : '--'}
          </div>
          <div className="stat-sub">kJ per ride</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Heart Rate</div>
          <div className="stat-value">
            {(() => {
              const vals = peloton.filter(w => w.avgHeartrate);
              return vals.length ? Math.round(vals.reduce((s, w) => s + w.avgHeartrate, 0) / vals.length) : '--';
            })()}
          </div>
          <div className="stat-sub">bpm</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Calories</div>
          <div className="stat-value">
            {(() => {
              const vals = peloton.filter(w => w.caloriesBurned);
              return vals.length ? Math.round(vals.reduce((s, w) => s + w.caloriesBurned, 0) / vals.length) : '--';
            })()}
          </div>
          <div className="stat-sub">per ride</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Cadence</div>
          <div className="stat-value">
            {(() => {
              const vals = peloton.filter(w => w.avgCadence);
              return vals.length ? Math.round(vals.reduce((s, w) => s + w.avgCadence, 0) / vals.length) : '--';
            })()}
          </div>
          <div className="stat-sub">RPM</div>
        </div>
      </div>

      <div className="chart-grid">
        {/* Output trend */}
        <div className="chart-card">
          <div className="chart-title">Total Output — Last 30 Rides (kJ)</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={outputChart}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
              <Tooltip
                contentStyle={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: 4 }}
                labelStyle={{ color: '#888', fontSize: 11 }}
                itemStyle={{ color: '#2979ff' }}
              />
              <Line type="monotone" dataKey="output" stroke="#2979ff" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Instructor breakdown */}
        <div className="chart-card">
          <div className="chart-title">Top Instructors</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={instructors.map(([name, count]) => ({ name: name.split(' ')[0], count }))} layout="vertical" barSize={10}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
              <Tooltip
                contentStyle={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: 4 }}
                labelStyle={{ color: '#888', fontSize: 11 }}
                itemStyle={{ color: '#e8ff00' }}
                formatter={(v) => [v, 'Rides']}
              />
              <Bar dataKey="count" fill="#e8ff00" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all', 'cycling', 'other'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="nav-btn"
            style={{ textTransform: 'capitalize' }}
          >
            {f === 'all' ? 'All' : f === 'cycling' ? 'Cycling' : 'Other'}
          </button>
        ))}
      </div>

      {/* Workout list */}
      <div className="chart-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="workout-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Class</th>
              <th>Instructor</th>
              <th>Length</th>
              <th>Output</th>
              <th>Calories</th>
              <th>Avg HR</th>
              <th>Cadence</th>
            </tr>
          </thead>
          <tbody>
            {recentWorkouts.slice(0, 50).map((w, i) => (
              <tr key={i}>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)', fontSize: 12 }}>
                  {w.date ? format(w.date, 'MM/dd/yy') : '--'}
                </td>
                <td>
                  <span className={`pill ${disciplineColor(w.discipline)}`}>{w.discipline || 'Workout'}</span>
                  <span style={{ marginLeft: 8, color: 'var(--text2)', fontSize: 12 }}>{w.title || ''}</span>
                </td>
                <td style={{ color: 'var(--text2)' }}>{w.instructor || '--'}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{w.lengthMin ? `${w.lengthMin}m` : '--'}</td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--blue)' }}>{w.totalOutput ?? '--'}</td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent2)' }}>{w.caloriesBurned ?? '--'}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{w.avgHeartrate ? `${Math.round(w.avgHeartrate)}` : '--'}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{w.avgCadence ?? '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
