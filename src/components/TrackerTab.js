// src/components/TrackerTab.js
import { useState, useMemo, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import { supabase } from '../lib/supabase';

const TARGET_HOURS   = 10;
const TARGET_MINUTES = TARGET_HOURS * 60;

const RECIPIENT_EMAIL = 'plucas82@gmail.com';

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

// Consolidate workouts by date -- sum minutes, always label "Peloton Cycling"
function consolidateByDay(activities) {
  const map = new Map();
  for (const a of activities) {
    const key = format(a.date, 'yyyy-MM-dd');
    if (map.has(key)) {
      map.get(key).minutes += a.minutes;
    } else {
      map.set(key, { date: a.date, description: 'Peloton Cycling', minutes: a.minutes });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date - b.date);
}

export default function TrackerTab({ data }) {
  const { workouts } = data;
  const [generating, setGenerating] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null); // null | 'sending' | 'sent' | 'error'

  const now        = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd   = endOfMonth(now);

  // Previous month for PDF generation
  const prevMonthDate  = subMonths(now, 1);
  const prevMonthStart = startOfMonth(prevMonthDate);
  const prevMonthEnd   = endOfMonth(prevMonthDate);

  // Current month activities for display (consolidated)
  const thisMonthActivities = useMemo(() => {
    const raw = workouts
      .filter(w => w.date && isWithinInterval(w.date, { start: monthStart, end: monthEnd }))
      .sort((a, b) => a.date - b.date)
      .map(w => ({
        date:        w.date,
        description: 'Peloton Cycling',
        minutes:     Math.round(w.durationMin || 0),
      }));
    return consolidateByDay(raw);
  }, [workouts, monthStart, monthEnd]);

  // Previous month activities for PDF (consolidated)
  const prevMonthActivities = useMemo(() => {
    const raw = workouts
      .filter(w => w.date && isWithinInterval(w.date, { start: prevMonthStart, end: prevMonthEnd }))
      .sort((a, b) => a.date - b.date)
      .map(w => ({
        date:        w.date,
        description: 'Peloton Cycling',
        minutes:     Math.round(w.durationMin || 0),
      }));
    return consolidateByDay(raw);
  }, [workouts, prevMonthStart, prevMonthEnd]);

  const totalMinutes = thisMonthActivities.reduce((s, t) => s + (t.minutes || 0), 0);
  const totalHours   = totalMinutes / 60;
  const pctComplete  = Math.min(100, (totalHours / TARGET_HOURS) * 100);
  const hoursLeft    = Math.max(0, TARGET_HOURS - totalHours);
  const daysLeft     = Math.max(0, Math.ceil((monthEnd - now) / (1000 * 60 * 60 * 24)));
  const isOnTrack    = daysLeft > 0
    ? (hoursLeft / daysLeft) * 7 <= TARGET_HOURS / 4
    : totalHours >= TARGET_HOURS;

  // Build the PDF as a base64 string (no download)
  const buildPDFBase64 = useCallback(async () => {
    const jsPDF = await loadJsPDF();
    const doc   = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });

    const pageW    = 612;
    const margin   = 54;
    const contentW = pageW - margin * 2;
    const monthName = format(prevMonthDate, 'MMMM yyyy');

    // Consolidate inline so PDF is always correct regardless of memo state
    const dayMap = new Map();
    for (const w of prevMonthActivities) {
      const key = format(w.date, 'yyyy-MM-dd');
      if (dayMap.has(key)) {
        dayMap.get(key).minutes += w.minutes;
      } else {
        dayMap.set(key, { date: w.date, minutes: w.minutes });
      }
    }
    const consolidated = Array.from(dayMap.values()).sort((a, b) => a.date - b.date);

    const prevTotal = consolidated.reduce((s, a) => s + a.minutes, 0);
    const prevHours = prevTotal / 60;

    // Scale row height to fit all rows on one page
    const availableHeight = 792 - 110 - 40 - 70;
    const rowHeight = consolidated.length > 0
      ? Math.min(16, Math.max(11, Math.floor(availableHeight / (consolidated.length + 2))))
      : 16;
    const fontSize = rowHeight >= 14 ? 10 : rowHeight >= 12 ? 9 : 8;

    // Header
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Patrick Lucas', margin, 60);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Month of ${monthName}`, margin, 78);

    // Table header
    const tableTop = 104;
    const col1 = margin;
    const col2 = margin + 192;
    const col3 = margin + 390;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Date', col1, tableTop);
    doc.text('Activity Description', col2, tableTop);
    doc.text('Time Spent (min.)', col3, tableTop);

    doc.setLineWidth(0.5);
    doc.line(margin, tableTop + 5, margin + contentW, tableTop + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    let y = tableTop + rowHeight + 4;

    for (const activity of consolidated) {
      doc.text(formatDateLong(activity.date), col1, y);
      doc.text('Peloton Cycling', col2, y);
      doc.text(String(activity.minutes), col3, y);
      y += rowHeight;
    }

    // Total row
    y += 4;
    doc.setLineWidth(0.5);
    doc.line(margin, y - 4, margin + contentW, y - 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Total', col2, y + 6);
    doc.text(String(prevTotal), col3, y + 6);

    // Footer note
    y += 28;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`${prevHours.toFixed(1)} hours of exercise logged in ${monthName}`, margin, y);
    doc.text('i-Health Goal: 600 minutes (10 hours)', margin, y + 13);

    return {
      base64: doc.output('datauristring').split(',')[1],
      monthName,
      fileName: `P. Lucas 10-8 ${format(prevMonthDate, 'MMMM yyyy')}.pdf`,
    };
  }, [prevMonthActivities, prevMonthDate]);

  const generatePDF = useCallback(async () => {
    setGenerating(true);
    try {
      const { base64, fileName } = await buildPDFBase64();
      // Trigger download by creating a blob URL
      const bytes = atob(base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: 'application/pdf' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('PDF generation failed:', e);
      alert('PDF generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }, [buildPDFBase64]);

  const emailPDF = useCallback(async () => {
    setEmailStatus('sending');
    try {
      const { base64, monthName, fileName } = await buildPDFBase64();

      // Get the current session for auth token + Google provider token
      const { data: { session } } = await supabase.auth.getSession();

      const accessToken   = session?.access_token;
      const providerToken = session?.provider_token;

      if (!providerToken) {
        throw new Error('Google token not available. Please sign out and sign back in to grant Gmail access.');
      }

      const response = await fetch(
        'https://hmtevflfryjkudkcpmac.supabase.co/functions/v1/send-report-email',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdGV2Zmxmcnlqa3Vka2NwbWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzA3NzgsImV4cCI6MjA4OTk0Njc3OH0.9riWHdjPggS9so5VXzcOmlQ-gsAREzZhfRmNAEEe2Rw',
          },
          body: JSON.stringify({
            providerToken,
            pdfBase64: base64,
            fileName,
            monthName,
            recipientEmail: RECIPIENT_EMAIL,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

      setEmailStatus('sent');
      setTimeout(() => setEmailStatus(null), 4000);
    } catch (e) {
      console.error('Email failed:', e);
      alert(e.message || 'Email failed. Check console for details.');
      setEmailStatus('error');
      setTimeout(() => setEmailStatus(null), 4000);
    }
  }, [buildPDFBase64]);

  return (
    <>
      <div className="section-header">
        <span className="section-title">10-8 TRACKER</span>
        <span className="section-sub">{format(now, 'MMMM yyyy')}</span>
      </div>

      {/* Download / Email previous month PDF */}
      <div className="chart-card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
            {format(prevMonthDate, 'MMMM yyyy')} Report
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            {prevMonthActivities.length} days · {Math.floor(prevMonthActivities.reduce((s,a) => s + a.minutes, 0) / 60)}h {prevMonthActivities.reduce((s,a) => s + a.minutes, 0) % 60}m total
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button
            className="sync-btn"
            onClick={generatePDF}
            disabled={generating || prevMonthActivities.length === 0}
            style={{ padding: '10px 20px' }}
          >
            {generating ? '...' : '📄 Download PDF'}
          </button>
          <button
            className="sync-btn"
            onClick={emailPDF}
            disabled={emailStatus === 'sending' || prevMonthActivities.length === 0}
            style={{
              padding: '10px 20px',
              background: emailStatus === 'sent' ? 'var(--green)' : emailStatus === 'error' ? 'var(--accent2)' : undefined,
            }}
          >
            {emailStatus === 'sending' ? '...' : emailStatus === 'sent' ? '✓ Sent' : emailStatus === 'error' ? 'Failed' : '✉ Email PDF'}
          </button>
        </div>
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