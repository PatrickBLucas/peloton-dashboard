// src/components/OverviewTab.js
import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar,
  ComposedChart, Line, ReferenceLine, Legend
} from 'recharts';

function StatCard({ label, value, sub, accent, color }) {
  return (
    <div className={`stat-card${accent ? ' accent' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value${color ? ` ${color}` : ''}`}>{value ?? '--'}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function OverviewTab({ data }) {
  const { stats, fitbit, weight, workouts } = data;

  const netToday = stats.todayConsumed && stats.todayBurned
    ? Math.round(stats.todayConsumed - stats.todayBurned) : null;
  const netYesterday = stats.yesterdayConsumed && stats.yesterdayBurned
    ? Math.round(stats.yesterdayConsumed - stats.yesterdayBurned) : null;

  // Last 20 sessions activity chart
  const activityChart = useMemo(() => {
    return [...workouts]
      .sort((a, b) => a.date - b.date)
      .slice(-20)
      .map(w => ({
        date: format(w.date, 'MMM d'),
        minutes: Math.round(w.durationMin || 0),
      }));
  }, [workouts]);

  // Weight trend last 60 days
  const weightChart = useMemo(() => {
    const cutoff = subDays(new Date(), 60);
    return weight
      .filter(w => w.date >= cutoff && w.weight)
      .map(w => ({ date: format(w.date, 'MMM d'), weight: w.weight }));
  }, [weight]);

  // Combined 30-day chart: weight + net calories + ride days
  const comboChart = useMemo(() => {
    const cutoff = subDays(new Date(), 30);
    const today  = new Date();

    // Build a map of weight by date string
    const weightByDate = {};
    weight.filter(w => w.date >= cutoff && w.weight)
      .forEach(w => { weightByDate[format(w.date, 'yyyy-MM-dd')] = w.weight; });

    // Build a map of net calories by date string from Fitbit
    const netByDate = {};
    data.fitbit.filter(d => d.date >= cutoff).forEach(d => {
      const ds = format(d.date, 'yyyy-MM-dd');
      const burned   = d.caloriesOut || 0;
      // Prefer food log calories
      const consumed = (data.foodLog || [])
        .filter(e => e.date === ds)
        .reduce((s, e) => s + (e.calories || 0), 0) || d.caloriesConsumed || 0;
      if (burned && consumed) netByDate[ds] = Math.round(consumed - burned);
    });

    // Build set of ride dates
    const rideDates = new Set(
      (data.workouts || [])
        .filter(w => w.type === 'cycling' && w.date >= cutoff)
        .map(w => format(w.date, 'yyyy-MM-dd'))
    );

    // Generate a point for every day in the last 30 days
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d   = subDays(today, i);
      const ds  = format(d, 'yyyy-MM-dd');
      const lbl = format(d, 'M/d');
      days.push({
        date:    lbl,
        weight:  weightByDate[ds] ?? null,
        net:     netByDate[ds]    ?? null,
        rode:    rideDates.has(ds) ? 1 : null,
      });
    }
    return days;
  }, [weight, data.fitbit, data.foodLog, data.workouts]);

  // Projected goal date from linear regression on last 30 days of weight (falls back to 60)
  const projectedDate = useMemo(() => {
    const getEntries = (days) => {
      const cutoff = subDays(new Date(), days);
      return weight
        .filter(w => w.weight && w.date >= cutoff)
        .sort((a, b) => a.date - b.date);
    };

    let entries = getEntries(30);
    if (entries.length < 5) entries = getEntries(60);
    if (entries.length < 5) return 'Not enough data';

    const start = entries[0].date;
    const pts = entries.map(e => ({
      x: (e.date - start) / (1000 * 60 * 60 * 24),
      y: e.weight,
    }));
    const n = pts.length;
    const sumX = pts.reduce((s, p) => s + p.x, 0);
    const sumY = pts.reduce((s, p) => s + p.y, 0);
    const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0);
    const sumX2 = pts.reduce((s, p) => s + p.x * p.x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    if (slope >= 0) return 'Not trending down';
    const daysToGoal = (stats.goalWeight - intercept) / slope;
    const goalDate = new Date(start.getTime() + daysToGoal * 86400000);
    if (goalDate < new Date()) return 'Recalculating...';
    return format(goalDate, 'MMM d, yyyy');
  }, [weight, stats.goalWeight]);

  return (
    <>
      {/* Today banner */}
      <div className="today-banner">
        <div className="today-cell">
          <div className="today-label">Today — Net Calories</div>
          <div className={`today-val ${netToday === null ? 'neutral' : netToday > 0 ? 'negative' : 'positive'}`}>
            {netToday !== null ? (netToday > 0 ? `+${netToday}` : netToday) : '--'}
          </div>
          <div className="today-detail">
            {stats.todayConsumed ? `${Math.round(stats.todayConsumed)} in` : '-- in'} / {stats.todayBurned ? `${Math.round(stats.todayBurned)} out` : '-- out'}
          </div>
        </div>
        <div className="today-cell">
          <div className="today-label">Yesterday — Net Calories</div>
          <div className={`today-val ${netYesterday === null ? 'neutral' : netYesterday > 0 ? 'negative' : 'positive'}`}>
            {netYesterday !== null ? (netYesterday > 0 ? `+${netYesterday}` : netYesterday) : '--'}
          </div>
          <div className="today-detail">
            {stats.yesterdayConsumed ? `${Math.round(stats.yesterdayConsumed)} in` : '-- in'} / {stats.yesterdayBurned ? `${Math.round(stats.yesterdayBurned)} out` : '-- out'}
          </div>
        </div>
        <div className="today-cell">
          <div className="today-label">Steps Today</div>
          <div className="today-val neutral">
            {stats.todaySteps ? Math.round(stats.todaySteps).toLocaleString() : '--'}
          </div>
          <div className="today-detail">{stats.rides ? `${stats.rides} total activities logged` : ''}</div>
        </div>
      </div>

      {/* Key stats */}
      <div className="stat-grid">
        <StatCard
          label="Current Weight"
          value={stats.currentWeight ? `${stats.currentWeight} lbs` : '--'}
          sub={`Goal: ${stats.goalWeight} lbs`}
          accent
        />
        <StatCard
          label="Pounds to Go"
          value={stats.poundsToGo !== null ? `${stats.poundsToGo}` : '--'}
          sub="until goal weight"
          color={stats.poundsToGo > 0 ? 'red' : 'green'}
        />
        <StatCard
          label="Weight Lost"
          value={stats.weightLost ? `${stats.weightLost} lbs` : '--'}
          sub="since start"
          color="green"
        />
        <StatCard
          label="Projected Goal"
          value={projectedDate}
          sub="based on trend"
        />
        <StatCard
          label="BMR"
          value={stats.bmr ? stats.bmr.toLocaleString() : '--'}
          sub={`age ${stats.age}, ${stats.currentWeight} lbs`}
        />
        <StatCard
          label="TDEE"
          value={stats.tdee ? stats.tdee.toLocaleString() : '--'}
          sub={stats.activityLevel ? `${stats.activityLevel} (×${stats.activityFactor?.toFixed(2)})` : 'moderate activity'}
        />
        <StatCard
          label="Total Activities"
          value={stats.rides ?? '--'}
          sub="all time"
        />
        <StatCard
          label="Total Time"
          value={stats.totalMinutes ? `${Math.floor(stats.totalMinutes / 60)}h` : '--'}
          sub="all time"
        />
      </div>

      {/* Charts */}
      <div className="chart-grid">
        <div className="chart-card">
          <div className="chart-title">Activity — Last 20 Sessions (minutes)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={activityChart} barSize={12}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={0} angle={-45} textAnchor="end" height={40} />
              <YAxis hide />
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
          <div className="chart-title">Weight — Last 60 Days</div>
          {weightChart.length > 1 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={weightChart}>
                <defs>
                  <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--text2)" }} tickLine={false} axisLine={false} interval={0} angle={-45} textAnchor="end" height={40} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4 }}
                  labelStyle={{ color: 'var(--text2)', fontSize: 11 }}
                  itemStyle={{ color: 'var(--accent)' }}
                  formatter={(v) => [`${v} lbs`, 'Weight']}
                />
                <Area type="monotone" dataKey="weight" stroke="var(--accent)" strokeWidth={2} fill="url(#wGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: 'var(--text3)', padding: '40px 0', textAlign: 'center', fontSize: 13 }}>
              Not enough weight data
            </div>
          )}
        </div>
      </div>
      {/* Combined insight chart */}
      <div className="chart-card" style={{ marginTop: 16 }}>
        <div className="chart-title">Weight, Net Calories &amp; Rides — Last 30 Days</div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={comboChart} margin={{ top: 8, right: 8, bottom: 40, left: 0 }}>
            <defs>
              <linearGradient id="wGrad2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.15} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text2)' }} tickLine={false} axisLine={false} interval={2} angle={-45} textAnchor="end" height={40} />
            {/* Left Y axis — weight */}
            <YAxis yAxisId="w" domain={['auto', 'auto']} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={36} tickFormatter={v => `${v}`} />
            {/* Right Y axis — net calories */}
            <YAxis yAxisId="n" orientation="right" domain={['auto', 'auto']} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={42} tickFormatter={v => `${v > 0 ? '+' : ''}${v}`} />
            <Tooltip
              contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4 }}
              labelStyle={{ color: 'var(--text)', fontSize: 11, fontWeight: 600 }}
              itemStyle={{ fontSize: 11 }}
              formatter={(v, name) => {
                if (name === 'Weight')      return [`${v} lbs`, 'Weight'];
                if (name === 'Net Cal')     return [`${v > 0 ? '+' : ''}${v} kcal`, 'Net Calories'];
                if (name === 'Rode')        return ['🚴 Ride', ''];
                return [v, name];
              }}
            />
            <ReferenceLine yAxisId="n" y={0} stroke="var(--border)" strokeDasharray="3 3" />
            {/* Net calories bars */}
            <Bar yAxisId="n" dataKey="net" name="Net Cal" fill="#4a90d9" opacity={0.6} radius={[2, 2, 0, 0]} barSize={6} />
            {/* Ride day markers */}
            <Bar yAxisId="n" dataKey="rode" name="Rode" fill="var(--accent)" opacity={0.9} radius={[2, 2, 0, 0]} barSize={4} />
            {/* Weight line */}
            <Line yAxisId="w" type="monotone" dataKey="weight" name="Weight" stroke="var(--accent)" strokeWidth={2} dot={false} connectNulls />
            <Legend
              verticalAlign="top"
              height={24}
              formatter={(value) => <span style={{ fontSize: 11, color: 'var(--text2)' }}>{value}</span>}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 4 }}>
          Blue bars = net calories (consumed − burned) · Accent bars = ride days · Line = weight
        </div>
      </div>
    </>
  );
}