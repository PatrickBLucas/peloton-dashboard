// src/components/OverviewTab.js
import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar
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
          sub="moderate activity"
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
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
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
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
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
    </>
  );
}