// src/components/TrackerTab.js
import { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

const TARGET_HOURS   = 10;
const TARGET_MINUTES = TARGET_HOURS * 60;

export default function TrackerTab({ data }) {
  const { workouts } = data;

  const now        = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd   = endOfMonth(now);

  // All workouts this month count toward the 10-8 goal
  const thisMonthActivities = useMemo(() => {
    return workouts
      .filter(w => w.date && isWithinInterval(w.date, { start: monthStart, end: monthEnd }))
      .sort((a, b) => a.date - b.date)
      .map(w => ({
        date:        w.date,
        description: `Peloton ${w.type}`,
        minutes:     Math.round(w.durationMin || 0),
      }));
  }, [workouts, monthStart, monthEnd]);

  const totalMinutes = thisMonthActivities.reduce((s, t) => s + (t.minutes || 0), 0);
  const totalHours   = totalMinutes / 60;
  const pctComplete  = Math.min(100, (totalHours / TARGET_HOURS) * 100);
  const hoursLeft    = Math.max(0, TARGET_HOURS - totalHours);
  const daysLeft     = Math.max(0, Math.ceil((monthEnd - now) / (1000 * 60 * 60 * 24)));

  const isOnTrack = daysLeft > 0
    ? (hoursLeft / daysLeft) * 7 <= TARGET_HOURS / 4
    : totalHours >= TARGET_HOURS;

  return (
    <>
      <div className="section-header">
        <span className="section-title">10-8 TRACKER</span>
        <span className="section-sub">{format(now, 'MMMM yyyy')}</span>
      </div>

      <div className="tracker-108">
        {/* Ring / progress */}
        <div className="chart-card">
          <div className="hours-ring">
            <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Hours This Month
            </div>
            <div className="ring-label" style={{ flexDirection: 'column', gap: 4 }}>
              <div>
                <span>{Math.floor(totalHours)}</span>
                <span style={{ fontSize: 20, color: 'var(--text2)', marginLeft: 6 }}>
                  {Math.floor(totalHours) === 1 ? 'Hour' : 'Hours'}
                </span>
              </div>
              <div style={{ fontSize: 28 }}>
                <span>{Math.round((totalHours % 1) * 60)}</span>
                <span style={{ fontSize: 20, color: 'var(--text2)', marginLeft: 6 }}>
                  {Math.round((totalHours % 1) * 60) === 1 ? 'Minute' : 'Minutes'}
                </span>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>of {TARGET_HOURS} hours</div>

            <div style={{ width: '100%', marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
                <span>0h</span>
                <span style={{ color: pctComplete >= 100 ? 'var(--green)' : 'var(--accent)' }}>
                  {Math.round(pctComplete)}%
                </span>
                <span>10h</span>
              </div>
              <div className="progress-bar-wrap" style={{ height: 12 }}>
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${pctComplete}%`,
                    background: pctComplete >= 100 ? 'var(--green)' : 'var(--accent)',
                  }}
                />
              </div>
            </div>

            <div style={{ marginTop: 20, display: 'flex', gap: 32, alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', minWidth: 80 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text)' }}>
                  {Math.floor(hoursLeft)}h {Math.round((hoursLeft % 1) * 60)}m
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>remaining</div>
              </div>
              <div style={{ textAlign: 'center', minWidth: 60 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text)' }}>
                  {daysLeft}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>days left</div>
              </div>
              <div style={{ textAlign: 'center', minWidth: 60 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: isOnTrack ? 'var(--green)' : 'var(--accent2)' }}>
                  {isOnTrack ? 'ON' : 'OFF'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>track</div>
              </div>
            </div>
          </div>
        </div>

        {/* Activity list */}
        <div className="chart-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div className="chart-title" style={{ marginBottom: 0 }}>
              Activities This Month ({thisMonthActivities.length})
            </div>
          </div>
          {thisMonthActivities.length === 0 ? (
            <div style={{ padding: 32, color: 'var(--text3)', textAlign: 'center', fontSize: 13 }}>
              No activities logged this month yet
            </div>
          ) : (
            <table className="workout-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Activity</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {thisMonthActivities.map((t, i) => {
                  const hrs  = Math.floor((t.minutes || 0) / 60);
                  const mins = (t.minutes || 0) % 60;
                  return (
                    <tr key={i}>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)', fontSize: 12 }}>
                        {t.date ? format(t.date, 'MM/dd') : '--'}
                      </td>
                      <td>{t.description || '--'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                        {hrs > 0 ? `${hrs}h ` : ''}{mins}m
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ padding: '12px', color: 'var(--text2)', fontSize: 12, fontWeight: 600 }}>
                    TOTAL
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', padding: '12px', fontWeight: 600 }}>
                    {Math.floor(totalHours)}h {Math.round((totalHours % 1) * 60)}m
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      <div style={{
        marginTop: 16, padding: '14px 18px', background: 'var(--bg2)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ color: 'var(--accent)', fontSize: 16 }}>ℹ️</span>
        All Peloton activities this month count toward your 10-hour goal — rides, walks, meditations and all.
      </div>
    </>
  );
}