import { useState, useMemo } from 'react';

const METRICS = [
  { id: 'outputKj',   label: 'Total Output', unit: 'kJ',  decimals: 0 },
  { id: 'calories',   label: 'Calories',     unit: 'cal', decimals: 0 },
  { id: 'effortScore',label: 'Effort Score', unit: '',    decimals: 1 },
  { id: 'hrZ4Z5',     label: 'Z4+Z5 Time',  unit: 'min', decimals: 1 },
];

// Get unique durations from workouts, rounded to nearest 5 min, sorted
function getDurations(workouts) {
  const counts = {};
  workouts.forEach(w => {
    if (!w.durationMin) return;
    const rounded = Math.round(w.durationMin / 5) * 5;
    counts[rounded] = (counts[rounded] || 0) + 1;
  });
  return Object.keys(counts)
    .map(Number)
    .filter(d => d >= 5)
    .sort((a, b) => a - b);
}

export default function BestRidesTab({ data }) {
  const { workouts } = data;

  const cycling = useMemo(() =>
    (workouts || []).filter(w => w.type === 'cycling'),
  [workouts]);

  const durations = useMemo(() => getDurations(cycling), [cycling]);

  const [selectedDuration, setSelectedDuration] = useState(null);
  const [metric, setMetric] = useState('outputKj');

  const selectedMetric = METRICS.find(m => m.id === metric);

  // Filter rides matching selected duration (±3 min tolerance)
  const filteredRides = useMemo(() => {
    if (!selectedDuration) return [];
    return cycling.filter(w => {
      const d = w.durationMin || 0;
      return Math.abs(d - selectedDuration) <= 3;
    });
  }, [cycling, selectedDuration]);

  // Sort by selected metric, take top 10
  const ranked = useMemo(() => {
    return [...filteredRides]
      .map(w => ({
        ...w,
        hrZ4Z5: (w.hrZ4 || 0) + (w.hrZ5 || 0),
      }))
      .filter(w => w[metric] > 0)
      .sort((a, b) => b[metric] - a[metric])
      .slice(0, 10);
  }, [filteredRides, metric]);

  const formatVal = (w) => {
    const val = metric === 'hrZ4Z5' ? w.hrZ4Z5 : w[metric];
    if (!val) return '--';
    return selectedMetric.decimals > 0
      ? val.toFixed(selectedMetric.decimals)
      : Math.round(val).toLocaleString();
  };

  const formatDate = (d) => {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    return `${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}/${String(dt.getFullYear()).slice(2)}`;
  };

  // Best value for gold/silver/bronze coloring
  const maxVal = ranked.length > 0 ? (metric === 'hrZ4Z5' ? ranked[0].hrZ4Z5 : ranked[0][metric]) : 0;

  const medalColor = (i) => {
    if (i === 0) return '#FFD700';
    if (i === 1) return '#C0C0C0';
    if (i === 2) return '#CD7F32';
    return 'var(--text2)';
  };

  return (
    <>
      <div className="section-header">
        <span className="section-title">BEST RIDES</span>
        <span className="section-sub">cycling · top 10</span>
      </div>

      {/* Duration selector */}
      <div className="chart-card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Ride Duration
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {durations.map(d => (
            <button
              key={d}
              className={`nav-btn${selectedDuration === d ? ' active' : ''}`}
              onClick={() => setSelectedDuration(d)}
              style={{ padding: '8px 14px', fontSize: 13 }}
            >
              {d} min
            </button>
          ))}
        </div>
      </div>

      {/* Metric selector */}
      {selectedDuration && (
        <div className="chart-card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Rank By
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {METRICS.map(m => (
              <button
                key={m.id}
                className={`nav-btn${metric === m.id ? ' active' : ''}`}
                onClick={() => setMetric(m.id)}
                style={{ padding: '8px 14px', fontSize: 13 }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rankings */}
      {selectedDuration && (
        <div className="chart-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text2)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Top {Math.min(ranked.length, 10)} · {selectedDuration} min · {selectedMetric.label}
          </div>

          {ranked.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              No rides found for {selectedDuration} min with {selectedMetric.label} data
            </div>
          ) : (
            ranked.map((w, i) => {
              const val = metric === 'hrZ4Z5' ? w.hrZ4Z5 : w[metric];
              const barWidth = maxVal > 0 ? (val / maxVal) * 100 : 0;

              return (
                <div key={w.workoutId || i} style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--border)',
                  position: 'relative',
                }}>
                  {/* Progress bar background */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0, bottom: 0,
                    width: `${barWidth}%`,
                    background: 'var(--bg3)',
                    opacity: 0.6,
                    pointerEvents: 'none',
                  }} />

                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Rank */}
                    <div style={{
                      width: 28, textAlign: 'center', fontWeight: 700,
                      fontSize: i < 3 ? 18 : 14,
                      color: medalColor(i),
                      flexShrink: 0,
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {i < 3 ? ['🥇','🥈','🥉'][i] : `#${i+1}`}
                    </div>

                    {/* Ride info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {w.title || 'Cycling Workout'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
                        {formatDate(w.date)}
                        {w.instructor ? ` · ${w.instructor}` : ''}
                        {` · ${w.durationMin}min`}
                      </div>
                    </div>

                    {/* Metric value */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                        {formatVal(w)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                        {selectedMetric.unit}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {!selectedDuration && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
          Select a duration above to see your best rides
        </div>
      )}
    </>
  );
}