// src/components/WeightTab.js
import { useState, useMemo } from 'react';
import { format, subDays, differenceInDays } from 'date-fns';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid
} from 'recharts';
import { supabase } from '../lib/supabase';

const SUPABASE_FUNCTIONS_URL = 'https://hmtevflfryjkudkcpmac.supabase.co/functions/v1';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdGV2Zmxmcnlqa3Vka2NwbWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzA3NzgsImV4cCI6MjA4OTk0Njc3OH0.9riWHdjPggS9so5VXzcOmlQ-gsAREzZhfRmNAEEe2Rw';

function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  const sumX  = points.reduce((s, p) => s + p.x, 0);
  const sumY  = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export default function WeightTab({ data, userId, onWeightLogged }) {
  const { weight, stats } = data;
  const goalWeight = stats.goalWeight || 180;

  const [weightInput, setWeightInput] = useState('');
  const [logging, setLogging]         = useState(false);
  const [logMsg, setLogMsg]           = useState(null);

  const handleLogWeight = async () => {
    const lbs = parseFloat(weightInput);
    if (!lbs || lbs < 50 || lbs > 500) {
      setLogMsg({ type: 'error', text: 'Enter a valid weight in lbs.' });
      return;
    }
    setLogging(true);
    setLogMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey':        ANON_KEY,
      };

      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/log-weight`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_id: userId, weight_lbs: lbs }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Error ${res.status}`);
      }

      setWeightInput('');
      setLogMsg({ type: 'success', text: `${lbs} lbs logged — syncing Fitbit...` });

      try {
        await fetch(`${SUPABASE_FUNCTIONS_URL}/sync-fitbit`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ user_id: userId }),
        });
      } catch (_) {}

      setLogMsg({ type: 'success', text: `${lbs} lbs logged!` });
      setTimeout(() => setLogMsg(null), 3000);
      if (onWeightLogged) onWeightLogged();
    } catch (e) {
      setLogMsg({ type: 'error', text: e.message });
    } finally {
      setLogging(false);
    }
  };

  const chartData = useMemo(() => {
    const entries = weight.filter(w => w.weight).sort((a, b) => a.date - b.date);
    if (!entries.length) return [];
    const startDate = entries[0].date;
    const points = entries.map(e => ({ x: differenceInDays(e.date, startDate), y: e.weight }));
    const reg = linearRegression(points);
    return entries.map((e, i) => ({
      date:   format(e.date, 'MMM d'),
      weight: e.weight,
      trend:  reg ? Math.round((reg.slope * points[i].x + reg.intercept) * 10) / 10 : null,
      goal:   goalWeight,
    }));
  }, [weight, goalWeight]);

  const projectedDate = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const entries = weight.filter(w => w.weight && w.date >= cutoff).sort((a, b) => a.date - b.date);
    if (entries.length < 5) return null;
    const startDate = entries[0].date;
    const points = entries.map(e => ({ x: differenceInDays(e.date, startDate), y: e.weight }));
    const reg = linearRegression(points);
    if (!reg || reg.slope >= 0) return null;
    const daysToGoal = (goalWeight - reg.intercept) / reg.slope;
    const goalDate = new Date(startDate); goalDate.setDate(goalDate.getDate() + Math.round(daysToGoal));
    if (goalDate < new Date()) return null;
    return goalDate;
  }, [weight, goalWeight]);

  const currentWeight = weight.filter(w => w.weight).slice(-1)[0];
  const startWeight   = weight.filter(w => w.weight)[0];
  const lostTotal     = startWeight && currentWeight
    ? Math.round((startWeight.weight - currentWeight.weight) * 10) / 10 : null;
  const poundsToGo = currentWeight
    ? Math.round((currentWeight.weight - goalWeight) * 10) / 10 : null;

  const weeklyRate = useMemo(() => {
    const entries = weight.filter(w => w.weight).sort((a, b) => a.date - b.date);
    if (entries.length < 7) return null;
    const recent = entries.slice(-7);
    return Math.round((recent[0].weight - recent[recent.length - 1].weight) * 10) / 10;
  }, [weight]);

  const inputStyle = {
    padding: '10px 12px', background: 'var(--bg3)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 16,
    fontFamily: 'var(--font-mono)', width: 120, textAlign: 'right', boxSizing: 'border-box',
  };

  return (
    <>
      <div className="section-header">
        <span className="section-title">WEIGHT</span>
        <span className="section-sub">{weight.length} weigh-ins</span>
      </div>

      <div className="chart-card" style={{ marginBottom: 20 }}>
        <div className="chart-title">Log Today's Weight</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="number"
            value={weightInput}
            onChange={e => setWeightInput(e.target.value)}
            placeholder={currentWeight?.weight || '0.0'}
            style={inputStyle}
            onKeyDown={e => e.key === 'Enter' && handleLogWeight()}
          />
          <span style={{ color: 'var(--text2)', fontSize: 14 }}>lbs</span>
          <button
            className="sync-btn"
            onClick={handleLogWeight}
            disabled={logging || !weightInput}
            style={{ padding: '10px 20px' }}
          >
            {logging ? 'Logging...' : 'Log to Fitbit'}
          </button>
        </div>
        {logMsg && (
          <div className={`sync-banner ${logMsg.type}`} style={{ marginTop: 10, borderRadius: 'var(--radius)' }}>
            {logMsg.text}
          </div>
        )}
      </div>

      <div className="weight-stats">
        <div className="weight-stat">
          <div className="weight-stat-label">Current</div>
          <div className="weight-stat-val" style={{ color: 'var(--text)' }}>
            {currentWeight ? `${currentWeight.weight} lbs` : '--'}
          </div>
        </div>
        <div className="weight-stat">
          <div className="weight-stat-label">Goal</div>
          <div className="weight-stat-val" style={{ color: 'var(--accent)' }}>{goalWeight} lbs</div>
        </div>
        <div className="weight-stat">
          <div className="weight-stat-label">Lost Total</div>
          <div className="weight-stat-val" style={{ color: 'var(--green)' }}>
            {lostTotal !== null ? `${lostTotal} lbs` : '--'}
          </div>
        </div>
        <div className="weight-stat">
          <div className="weight-stat-label">To Go</div>
          <div className="weight-stat-val" style={{ color: poundsToGo > 0 ? 'var(--accent2)' : 'var(--green)' }}>
            {poundsToGo !== null ? `${poundsToGo} lbs` : '--'}
          </div>
        </div>
        <div className="weight-stat">
          <div className="weight-stat-label">Last 7 Days</div>
          <div className="weight-stat-val" style={{ color: weeklyRate > 0 ? 'var(--green)' : 'var(--red)' }}>
            {weeklyRate !== null ? `${weeklyRate > 0 ? '-' : '+'}${Math.abs(weeklyRate)} lbs` : '--'}
          </div>
        </div>
        <div className="weight-stat">
          <div className="weight-stat-label">Projected Goal</div>
          <div className="weight-stat-val" style={{ color: 'var(--blue)', fontSize: 20 }}>
            {projectedDate ? format(projectedDate, 'MMM d, yyyy') : '--'}
          </div>
        </div>
      </div>

      {startWeight && currentWeight && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 11, color: 'var(--text3)' }}>
            <span>Start: {startWeight.weight} lbs</span>
            <span>{Math.round(((startWeight.weight - currentWeight.weight) / (startWeight.weight - goalWeight)) * 100)}% to goal</span>
            <span>Goal: {goalWeight} lbs</span>
          </div>
          <div className="progress-bar-wrap" style={{ height: 10 }}>
            <div
              className="progress-bar-fill"
              style={{ width: `${Math.min(100, Math.max(0, ((startWeight.weight - currentWeight.weight) / (startWeight.weight - goalWeight)) * 100))}%` }}
            />
          </div>
        </div>
      )}

      <div className="chart-card">
        <div className="chart-title">Weight History + Trend Line</div>
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={340}>
            <AreaChart data={chartData} margin={{ bottom: 40 }}>
              <defs>
                <linearGradient id="wFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#e8ff00" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#e8ff00" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, angle: -35, textAnchor: 'end' }}
                tickLine={false}
                axisLine={false}
                interval={Math.floor(chartData.length / 8)}
                height={60}
              />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
              <Tooltip
                contentStyle={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: 4 }}
                labelStyle={{ color: '#888', fontSize: 11 }}
                formatter={(v, name) => {
                  if (name === 'weight') return [`${v} lbs`, 'Actual'];
                  if (name === 'trend')  return [`${v} lbs`, 'Trend'];
                  if (name === 'goal')   return [`${v} lbs`, 'Goal'];
                  return [v, name];
                }}
              />
              <ReferenceLine y={goalWeight} stroke="#00e676" strokeDasharray="4 4" strokeWidth={1} label={{ value: `Goal ${goalWeight}`, fill: '#00e676', fontSize: 11 }} />
              <Area type="monotone" dataKey="weight" stroke="#e8ff00" strokeWidth={2} fill="url(#wFill)" dot={false} />
              <Area type="monotone" dataKey="trend"  stroke="#2979ff" strokeWidth={1.5} fill="none" dot={false} strokeDasharray="6 3" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ color: 'var(--text3)', padding: 40, textAlign: 'center' }}>Not enough data</div>
        )}
      </div>

      {stats.bmr && (
        <div className="chart-card" style={{ marginTop: 16 }}>
          <div className="chart-title">Metabolic Estimates — Updated with Current Weight (age {stats.age})</div>
          <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>BMR</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, color: 'var(--text)' }}>{stats.bmr.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>calories at complete rest</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>TDEE (Sedentary)</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, color: 'var(--accent)' }}>{Math.round(stats.bmr * 1.2).toLocaleString()}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>BMR × 1.2</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>TDEE (Active)</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, color: 'var(--blue)' }}>{stats.tdee.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>BMR × 1.55</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}