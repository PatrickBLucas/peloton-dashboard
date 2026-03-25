// src/components/TrackerTab.js
import { useState, useMemo, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';

const TARGET_HOURS   = 10;
const TARGET_MINUTES = TARGET_HOURS * 60;

// Dynamically load jsPDF from CDN
function loadJsPDF() {
  return new Promise((resolve, reject) => {
    if (window.jspdf) { resolve(window.jspdf.jsPDF); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = () => resolve(window.jspdf.jsPDF);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function formatDateLong(date) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export default function TrackerTab({ data }) {
  const { workouts } = data;
  const [generating, setGenerating] = useState(false);

  const now        = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd   = endOfMonth(now);

  // Previous month for PDF generation
  const prevMonthDate  = subMonths(now, 1);
  const prevMonthStart = startOfMonth(prevMonthDate);
  const prevMonthEnd   = endOfMonth(prevMonthDate);

  // Current month activities for display
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

  // Previous month activities for PDF
  const prevMonthActivities = useMemo(() => {
    return workouts
      .filter(w => w.date && isWithinInterval(w.date, { start: prevMonthStart, end: prevMonthEnd }))
      .sort((a, b) => a.date - b.date)
      .map(w => ({
        date:        w.date,
        description: `Peloton ${w.type}`,
        minutes:     Math.round(w.durationMin || 0),
      }));
  }, [workouts, prevMonthStart, prevMonthEnd]);

  const totalMinutes = thisMonthActivities.reduce((s, t) => s + (t.minutes || 0), 0);
  const totalHours   = totalMinutes / 60;
  const pctComplete  = Math.min(100, (totalHours / TARGET_HOURS) * 100);
  const hoursLeft    = Math.max(0, TARGET_HOURS - totalHours);
  const daysLeft     = Math.max(0, Math.ceil((monthEnd - now) / (1000 * 60 * 60 * 24)));
  const isOnTrack    = daysLeft > 0
    ? (hoursLeft / daysLeft) * 7 <= TARGET_HOURS / 4
    : totalHours >= TARGET_HOURS;

  const generatePDF = useCallback(async () => {
    setGenerating(true);
    try {
      const jsPDF = await loadJsPDF();
      const doc   = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });

      const pageW  = 612;
      const margin = 60;
      const contentW = pageW - margin * 2;
      const monthName = format(prevMonthDate, 'MMMM yyyy');
      const prevTotal = prevMonthActivities.reduce((s, a) => s + a.minutes, 0);
      const prevHours = prevTotal / 60;

      // Header
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Patrick Lucas', margin, 80);

      doc.setFontSize(13);
      doc.setFont('helvetica', 'normal');
      doc.text(`Month of ${monthName}`, margin, 100);

      // Table header
      const tableTop = 130;
      const col1 = margin;         // Date
      const col2 = margin + 200;   // Activity Description
      const col3 = margin + 420;   // Time Spent

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Date', col1, tableTop);
      doc.text('Activity Description', col2, tableTop);
      doc.text('Time Spent (min.)', col3, tableTop);

      // Header underline
      doc.setLineWidth(0.5);
      doc.line(margin, tableTop + 6, margin + contentW, tableTop + 6);

      // Table rows
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      let y = tableTop + 24;

      for (const activity of prevMonthActivities) {
        if (y > 680) {
          doc.addPage();
          y = 60;
        }
        doc.text(formatDateLong(activity.date), col1, y);
        doc.text(activity.description, col2, y);
        doc.text(String(activity.minutes), col3, y);
        y += 20;
      }

      // Total row
      y += 10;
      doc.setLineWidth(0.5);
      doc.line(margin, y - 6, margin + contentW, y - 6);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Total', col2, y + 4);
      doc.text(String(prevTotal), col3, y + 4);

      // Footer note
      y += 40;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(`${prevHours.toFixed(1)} hours of exercise logged in ${monthName}`, margin, y);
      doc.text('i-Health Goal: 600 minutes (10 hours)', margin, y + 16);

      doc.save(`P. Lucas 10-8 ${format(prevMonthDate, 'MMMM yyyy')}.pdf`);
    } catch (e) {
      console.error('PDF generation failed:', e);
      alert('PDF generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }, [prevMonthActivities, prevMonthDate]);

  return (
    <>
      <div className="section-header">
        <span className="section-title">10-8 TRACKER</span>
        <span className="section-sub">{format(now, 'MMMM yyyy')}</span>
      </div>

      {/* Download previous month PDF */}
      <div className="chart-card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
            {format(prevMonthDate, 'MMMM yyyy')} Report
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            {prevMonthActivities.length} activities · {Math.floor(prevMonthActivities.reduce((s,a) => s + a.minutes, 0) / 60)}h {prevMonthActivities.reduce((s,a) => s + a.minutes, 0) % 60}m total
          </div>
        </div>
        <button
          className="sync-btn"
          onClick={generatePDF}
          disabled={generating || prevMonthActivities.length === 0}
          style={{ padding: '10px 20px', flexShrink: 0 }}
        >
          {generating ? '...' : '📄 Download PDF'}
        </button>
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
                  <td colSpan={2} style={{ padding: '12px', color: 'var(--text2)', fontSize: 12, fontWeight: 600 }}>TOTAL</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', padding: '12px', fontWeight: 600 }}>
                    {Math.floor(totalHours)}h {Math.round((totalHours % 1) * 60)}m
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </>
  );
}