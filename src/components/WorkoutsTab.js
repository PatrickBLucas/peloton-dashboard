// src/components/WorkoutsTab.js
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
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

  // Last 20 cycling rides sorted by date
  const last20 = useMemo(() =>
    [...cyclingWorkouts]
      .sort((a, b) => (a.date || 0) - (b.date || 0))
      .slice(-20),
    [cyclingWorkouts]
  );

  // Shorten title for tooltip display
  const shortTitle = (t) => t ? t.replace(/^\d+ min /, '').replace(/ Ride$/, '') : '';

  const hrZoneChart = useMemo(() =>
    last20
      .filter(w => w.hrZ1 || w.hrZ2 || w.hrZ3 || w.hrZ4 || w.hrZ5)
      .map(w => ({
        date: w.date ? format(w.date, 'M/d') : '',
        title: shortTitle(w.title),
        Z1: Math.round(w.hrZ1 || 0),
        Z2: Math.round(w.hrZ2 || 0),
        Z3: Math.round(w.hrZ3 || 0),
        Z4: Math.round(w.hrZ4 || 0),
        Z5: Math.round(w.hrZ5 || 0),
      })),
    [last20]
  );

  const outputChart = useMemo(() =>
    last20
      .filter(w => w.outputKj > 0)
      .map(w => ({ date: w.date ? format(w.date, 'M/d') : '', title: shortTitle(w.title), kJ: w.outputKj })),
    [last20]
  );

  const caloriesChart = useMemo(() =>
    last20
      .filter(w => w.calories > 0)
      .map(w => ({ date: w.date ? format(w.date, 'M/d') : '', title: shortTitle(w.title), calories: Math.round(w.calories) })),
    [last20]
  );

  const cadenceChart = useMemo(() =>
    last20
      .filter(w => w.avgCadence > 0)
      .map(w => ({ date: w.date ? format(w.date, 'M/d') : '', title: shortTitle(w.title), cadence: w.avgCadence })),
    [last20]
  );

  const resistanceChart = useMemo(() =>
    last20
      .filter(w => w.avgRes > 0)
      .map(w => ({ date: w.date ? format(w.date, 'M/d') : '', title: shortTitle(w.title), resistance: w.avgRes })),
    [last20]
  );

  const effortChart = useMemo(() =>
    last20
      .filter(w => w.effortScore > 0)
      .map(w => ({ date: w.date ? format(w.date, 'M/d') : '', title: shortTitle(w.title), effort: parseFloat(w.effortScore) })),
    [last20]
  );

  // All-time zone distribution donut
  const zoneDonut = useMemo(() => {
    const totals = cyclingWorkouts.reduce((acc, w) => {
      acc.Z1 += w.hrZ1 || 0;
      acc.Z2 += w.hrZ2 || 0;
      acc.Z3 += w.hrZ3 || 0;
      acc.Z4 += w.hrZ4 || 0;
      acc.Z5 += w.hrZ5 || 0;
      return acc;
    }, { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0 });

    const total = Object.values(totals).reduce((s, v) => s + v, 0);
    if (!total) return [];

    return [
      { name: 'Z1', value: Math.round(totals.Z1), color: '#4a90d9' },
      { name: 'Z2', value: Math.round(totals.Z2), color: '#5bb55e' },
      { name: 'Z3', value: Math.round(totals.Z3), color: '#f5c842' },
      { name: 'Z4', value: Math.round(totals.Z4), color: '#f08c30' },
      { name: 'Z5', value: Math.round(totals.Z5), color: '#e04040' },
    ];
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
    labelStyle: { color: 'var(--text)', fontSize: 11, fontWeight: 600 },
    itemStyle: { fontSize: 11, color: 'var(--text)' },
    labelFormatter: (label, payload) => {
      const title = payload?.[0]?.payload?.title;
      return title ? `${label} — ${title}` : label;
    },
  };

  const xAxisProps = {
    tick: { fontSize: 9, fill: 'var(--text2)' },
    tickLine: false, axisLine: false,
    interval: 0, angle: -45, textAnchor: 'end', height: 40,
  };

  const yAxisProps = {
    tick: { fontSize: 10 }, tickLine: false, axisLine: false, width: 32,
  };

  return (
    <>
      <div className="section-header">
        <span className="section-title">WORKOUTS</span>
        <span className="section-sub">{workouts.length} activities via Peloton</span>
      </div>

      <div className="stat-grid workouts-stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Total Calories Burned</div>
          <div className="stat-value accent">{totalCals ? totalCals.toLocaleString() : '--'}</div>
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
          <div className="stat-value">{totalZ45Min > 0 ? `${z45Hours}h ${z45Mins}m` : '--'}</div>
          <div className="stat-sub">high-intensity zones</div>
        </div>
      </div>

      {/* Row 1: HR Zones + Output */}
      <div className="chart-grid">
        <div className="chart-card">
          <div className="chart-title">HR Zones — Last 20 Rides (min)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={hrZoneChart} barSize={8} barGap={1}>
              <XAxis dataKey="date" {...xAxisProps} />
              <YAxis {...yAxisProps} width={28} />
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
                <span style={{ width: 10, height: 10, borderRadius: 2, background: c, display: 'inline-block' }} />{z}
              </span>
            ))}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-title">Output — Last 20 Rides (kJ)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={outputChart} barSize={10}>
              <XAxis dataKey="date" {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <Tooltip {...tooltipStyle} formatter={(v) => [`${v} kJ`, 'Output']} />
              <Bar dataKey="kJ" fill="var(--accent)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Calories per ride */}
      <div className="chart-card">
        <div className="chart-title">Calories Burned — Last 20 Rides</div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={caloriesChart} barSize={10}>
            <XAxis dataKey="date" {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip {...tooltipStyle} formatter={(v) => [`${v} kcal`, 'Calories']} />
            <Bar dataKey="calories" fill="#e04040" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Row 2: Cadence + Resistance */}
      <div className="chart-grid">
        <div className="chart-card">
          <div className="chart-title">Avg Cadence — Last 20 Rides (rpm)</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={cadenceChart}>
              <XAxis dataKey="date" {...xAxisProps} />
              <YAxis {...yAxisProps} domain={['auto', 'auto']} />
              <Tooltip {...tooltipStyle} formatter={(v) => [`${v} rpm`, 'Cadence']} />
              <Line type="monotone" dataKey="cadence" stroke="#4a90d9" strokeWidth={2} dot={{ r: 3, fill: '#4a90d9' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-title">Avg Resistance — Last 20 Rides (%)</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={resistanceChart}>
              <XAxis dataKey="date" {...xAxisProps} />
              <YAxis {...yAxisProps} domain={['auto', 'auto']} />
              <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`, 'Resistance']} />
              <Line type="monotone" dataKey="resistance" stroke="#f08c30" strokeWidth={2} dot={{ r: 3, fill: '#f08c30' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 3: Effort Score + Zone Donut */}
      <div className="chart-grid">
        <div className="chart-card">
          <div className="chart-title">Effort Score — Last 20 Rides</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={effortChart}>
              <XAxis dataKey="date" {...xAxisProps} />
              <YAxis {...yAxisProps} domain={[0, 100]} />
              <Tooltip {...tooltipStyle} formatter={(v) => [v, 'Effort']} />
              <Line type="monotone" dataKey="effort" stroke="#d4f000" strokeWidth={2} dot={{ r: 3, fill: '#d4f000' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-title">Zone Distribution — All Time</div>
          {zoneDonut.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={zoneDonut}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {zoneDonut.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4 }}
                  labelStyle={{ color: 'var(--text2)', fontSize: 11 }}
                  itemStyle={{ fontSize: 11, color: 'var(--text)' }}
                  formatter={(v, name) => {
                    const total = zoneDonut.reduce((s, d) => s + d.value, 0);
                    const pct = total ? Math.round(v / total * 100) : 0;
                    return [`${Math.round(v)} min (${pct}%)`, name];
                  }}
                />
                <Legend
                  iconSize={10}
                  iconType="circle"
                  formatter={(value) => <span style={{ fontSize: 11, color: 'var(--text2)' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
              No zone data yet
            </div>
          )}
        </div>
      </div>

      {/* Workout table */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => setFilter('all')} className={`nav-btn${filter === 'all' ? ' active' : ''}`}>All</button>
        {types.map(t => (
          <button key={t} onClick={() => setFilter(t)} className={`nav-btn${filter === t ? ' active' : ''}`}>{t}</button>
        ))}
      </div>

      <div className="chart-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="workout-table-wrap">
          <table className="workout-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Title</th>
                <th className="hide-mobile">Type</th>
                <th>Min</th>
                <th>Cal</th>
                <th>kJ</th>
                <th className="hide-mobile">Cadence</th>
                <th className="hide-mobile">Resist</th>
                <th className="hide-mobile" style={{ color: '#4a90d9' }}>Z1</th>
                <th className="hide-mobile" style={{ color: '#5bb55e' }}>Z2</th>
                <th className="hide-mobile" style={{ color: '#f5c842' }}>Z3</th>
                <th className="hide-mobile" style={{ color: '#f08c30' }}>Z4</th>
                <th className="hide-mobile" style={{ color: '#e04040' }}>Z5</th>
                <th>Effort</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((w, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)', fontSize: 12 }}>
                    {w.date ? format(w.date, 'MM/dd/yy') : '--'}
                  </td>
                  <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {w.title || '--'}
                  </td>
                  <td className="hide-mobile"><span className={`pill ${typeColor(w.type)}`}>{w.type || 'Other'}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{w.durationMin ? `${Math.round(w.durationMin)}` : '--'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent2)' }}>{w.calories ? Math.round(w.calories) : '--'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{w.outputKj || '--'}</td>
                  <td className="hide-mobile" style={{ fontFamily: 'var(--font-mono)', color: '#4a90d9', fontSize: 12 }}>{w.avgCadence || '--'}</td>
                  <td className="hide-mobile" style={{ fontFamily: 'var(--font-mono)', color: '#f08c30', fontSize: 12 }}>{w.avgRes || '--'}</td>
                  <td className="hide-mobile" style={{ fontFamily: 'var(--font-mono)', color: '#4a90d9', fontSize: 12 }}>{w.hrZ1 != null && w.hrZ1 !== '' ? w.hrZ1 : '--'}</td>
                  <td className="hide-mobile" style={{ fontFamily: 'var(--font-mono)', color: '#5bb55e', fontSize: 12 }}>{w.hrZ2 != null && w.hrZ2 !== '' ? w.hrZ2 : '--'}</td>
                  <td className="hide-mobile" style={{ fontFamily: 'var(--font-mono)', color: '#f5c842', fontSize: 12 }}>{w.hrZ3 != null && w.hrZ3 !== '' ? w.hrZ3 : '--'}</td>
                  <td className="hide-mobile" style={{ fontFamily: 'var(--font-mono)', color: '#f08c30', fontSize: 12 }}>{w.hrZ4 != null && w.hrZ4 !== '' ? w.hrZ4 : '--'}</td>
                  <td className="hide-mobile" style={{ fontFamily: 'var(--font-mono)', color: '#e04040', fontSize: 12 }}>{w.hrZ5 != null && w.hrZ5 !== '' ? w.hrZ5 : '--'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)', fontSize: 12 }}>{w.effortScore || '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}