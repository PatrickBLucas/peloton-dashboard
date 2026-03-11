// src/components/CaloriesTab.js
import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, AreaChart, Area
} from 'recharts';

export default function CaloriesTab({ data }) {
  const { fitbit } = data;

  // Last 30 days of calorie data
  const last30 = useMemo(() => {
    const cutoff = subDays(new Date(), 30);
    return fitbit
      .filter(d => d.date >= cutoff)
      .sort((a, b) => a.date - b.date)
      .map(d => ({
        date: format(d.date, 'MMM d'),
        burned: d.caloriesOut ? Math.round(d.caloriesOut) : null,
        consumed: d.caloriesConsumed ? Math.round(d.caloriesConsumed) : null,
        net: (d.caloriesConsumed && d.caloriesOut)
          ? Math.round(d.caloriesConsumed - d.caloriesOut)
          : null,
        steps: d.steps,
        protein: d.protein,
        carbs: d.carbs,
        fat: d.fat,
      }));
  }, [fitbit]);

  // Averages
  const avgBurned = useMemo(() => {
    const vals = last30.filter(d => d.burned);
    return vals.length ? Math.round(vals.reduce((s, d) => s + d.burned, 0) / vals.length) : null;
  }, [last30]);

  const avgConsumed = useMemo(() => {
    const vals = last30.filter(d => d.consumed);
    return vals.length ? Math.round(vals.reduce((s, d) => s + d.consumed, 0) / vals.length) : null;
  }, [last30]);

  const avgNet = avgConsumed && avgBurned ? avgConsumed - avgBurned : null;

  // Macro averages
  const avgProtein = useMemo(() => {
    const vals = last30.filter(d => d.protein);
    return vals.length ? Math.round(vals.reduce((s, d) => s + d.protein, 0) / vals.length) : null;
  }, [last30]);

  const avgCarbs = useMemo(() => {
    const vals = last30.filter(d => d.carbs);
    return vals.length ? Math.round(vals.reduce((s, d) => s + d.carbs, 0) / vals.length) : null;
  }, [last30]);

  const avgFat = useMemo(() => {
    const vals = last30.filter(d => d.fat);
    return vals.length ? Math.round(vals.reduce((s, d) => s + d.fat, 0) / vals.length) : null;
  }, [last30]);

  return (
    <>
      <div className="section-header">
        <span className="section-title">CALORIES</span>
        <span className="section-sub">Last 30 days</span>
      </div>

      {/* Summary row */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Avg Burned / Day</div>
          <div className="stat-value" style={{ color: 'var(--accent2)' }}>{avgBurned?.toLocaleString() ?? '--'}</div>
          <div className="stat-sub">Fitbit total</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Consumed / Day</div>
          <div className="stat-value" style={{ color: 'var(--blue)' }}>{avgConsumed?.toLocaleString() ?? '--'}</div>
          <div className="stat-sub">Food log</div>
        </div>
        <div className="stat-card accent={avgNet < 0}">
          <div className="stat-label">Avg Net / Day</div>
          <div className={`stat-value ${avgNet !== null ? (avgNet < 0 ? 'green' : 'red') : ''}`}>
            {avgNet !== null ? (avgNet > 0 ? `+${avgNet.toLocaleString()}` : avgNet.toLocaleString()) : '--'}
          </div>
          <div className="stat-sub">{avgNet < 0 ? 'deficit' : 'surplus'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Protein</div>
          <div className="stat-value">{avgProtein ?? '--'}</div>
          <div className="stat-sub">grams / day</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Carbs</div>
          <div className="stat-value">{avgCarbs ?? '--'}</div>
          <div className="stat-sub">grams / day</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Fat</div>
          <div className="stat-value">{avgFat ?? '--'}</div>
          <div className="stat-sub">grams / day</div>
        </div>
      </div>

      {/* Calories in vs out */}
      <div className="chart-card">
        <div className="chart-title">Calories Burned vs Consumed — Last 30 Days</div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={last30}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={4} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              contentStyle={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: 4 }}
              labelStyle={{ color: '#888', fontSize: 11 }}
              formatter={(v, name) => [v?.toLocaleString(), name === 'burned' ? 'Burned' : 'Consumed']}
            />
            <Bar dataKey="burned" fill="#ff4500" opacity={0.7} radius={[2, 2, 0, 0]} barSize={8} name="burned" />
            <Bar dataKey="consumed" fill="#2979ff" opacity={0.7} radius={[2, 2, 0, 0]} barSize={8} name="consumed" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Net calories */}
      <div className="chart-card" style={{ marginTop: 16 }}>
        <div className="chart-title">Net Calories (Consumed - Burned) — Negative = Deficit</div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={last30}>
            <defs>
              <linearGradient id="netPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ff1744" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ff1744" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="netNeg" x1="0" y1="1" x2="0" y2="0">
                <stop offset="5%" stopColor="#00e676" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00e676" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={4} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              contentStyle={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: 4 }}
              labelStyle={{ color: '#888', fontSize: 11 }}
              formatter={(v) => [v?.toLocaleString(), 'Net']}
            />
            <Area
              type="monotone"
              dataKey="net"
              stroke="#e8ff00"
              strokeWidth={2}
              fill="url(#netPos)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
