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

  // Net calories today
  const netToday = stats.todayConsumed && stats.todayBurned
    ? Math.round(stats.todayConsumed - stats.todayBurned)
    : null;
  const netYesterday = stats.yesterdayConsumed && stats.yesterdayBurned
    ? Math.round(stats.yesterdayConsumed - stats.yesterdayBurned)
    : null;

  // Last 30 days activity
  const recentActivity = useMemo(() => {
    const cutoff = subDays(new Date(), 30);
    return workouts
      .filter(w => w.date >= cutoff)
      .reduce((acc, w) => {
        const key = format(w.date, 'MMM d');
        acc[key] = (acc[key] || 0) + (w.movingTimeMin || 0);
        return acc;
      }, {});
  }, [workouts]);

  const activityChart = Object.entries(recentActivity)
    .map(([date, minutes]) => ({ date, minutes: Math.round(minutes) }))
    .slice(-20);

  // Weight trend last 60 days
  const weightChart = useMemo(() => {
    const cutoff = subDays(new Date(), 60);
    return weight
      .filter(w => w.date >= cutoff && w.weight)
      .map(w => ({ date: format(w.date, 'MMM d'), weight: w.weight }));
  }, [weight]);

  // Current weight
  const currentWeight = weight.filter(w => w.weight).slice(-1)[0];
  const goalWeight = stats.goalWeight;
  const poundsToGo = currentWeight && goalWeight
    ? Math.round((currentWeight.weight - goalWeight) * 10) / 10
    : null;

  // Projected goal date
  let projDate = '--';
  if (stats.expDate) {
    try {
      const d = typeof stats.expDate === 'number'
        ? new Date((stats.expDate - 25569) * 86400 * 1000) // Excel serial
        : new Date(stats.expDate);
      if (!isNaN(d)) projDate = format(d, 'MMM d, yyyy');
    } catch {}
  }

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
            {stats.steps ? Math.round(stats.steps).toLocaleString() : '--'}
          </div>
          <div className="today-detail">{stats.rides ? `${stats.rides} total rides logged` : ''}</div>
        </div>
      </div>

      {/* Key stats */}
      <div className="stat-grid">
        <StatCard
          label="Current Weight"
          value={currentWeight ? `${currentWeight.weight} lbs` : '--'}
          sub={`Goal: ${goalWeight} lbs`}
          accent
        />
        <StatCard
          label="Pounds to Go"
          value={poundsToGo !== null ? `${poundsToGo}` : '--'}
          sub="until goal weight"
          color={poundsToGo !== null && poundsToGo > 0 ? 'red' : 'green'}
        />
        <StatCard
          label="Weight Lost"
          value={stats.weightLost ? `${Math.round(stats.weightLost * 10) / 10} lbs` : '--'}
          sub="since start"
          color="green"
        />
        <StatCard
          label="Projected Goal"
          value={projDate}
          sub="based on trend"
        />
        <StatCard
          label="BMR"
          value={stats.bmr ? Math.round(stats.bmr).toLocaleString() : '--'}
          sub="cal/day at rest"
        />
        <StatCard
          label="Total Rides"
          value={stats.rides ?? '--'}
          sub="all time"
        />
        <StatCard
          label="Total Distance"
          value={stats.distance?.total ? `${Math.round(stats.distance.total)} mi` : '--'}
          sub="all time"
        />
        <StatCard
          label="Total Output"
          value={stats.totalOutput?.total ? `${Math.round(stats.totalOutput.total).toLocaleString()} kJ` : '--'}
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
                contentStyle={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: 4 }}
                labelStyle={{ color: '#888', fontSize: 11 }}
                itemStyle={{ color: '#e8ff00' }}
              />
              <Bar dataKey="minutes" fill="#e8ff00" radius={[2, 2, 0, 0]} />
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
                    <stop offset="5%" stopColor="#e8ff00" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#e8ff00" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  contentStyle={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: 4 }}
                  labelStyle={{ color: '#888', fontSize: 11 }}
                  itemStyle={{ color: '#e8ff00' }}
                  formatter={(v) => [`${v} lbs`, 'Weight']}
                />
                <Area type="monotone" dataKey="weight" stroke="#e8ff00" strokeWidth={2} fill="url(#wGrad)" dot={false} />
                {goalWeight && (
                  <Area type="monotone" dataKey={() => goalWeight} stroke="#00e676" strokeWidth={1} strokeDasharray="4 4" fill="none" dot={false} name="Goal" />
                )}
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
