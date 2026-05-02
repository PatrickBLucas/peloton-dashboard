// src/components/TrackerTab.js
import { useState, useMemo, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';

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

    const pageW     = 612;
    const margin    = 60;
    const contentW  = pageW - margin * 2;
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
    const col1 = margin;
    const col2 = margin + 200;
    const col3 = margin + 420;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Date', col1, tableTop);
    doc.text('Activity Description', col2, tableTop);
    doc.text('Time Spent (min.)', col3, tableTop);

    doc.setLineWidth(0.5);
    doc.line(margin, tableTop + 6, margin + contentW, tableTop + 6);

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

    // Return as base64 string (no 'data:...' prefix)
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

      const monthName2 = format(prevMonthDate, 'MMMM yyyy');

      // Build the Gmail API message via MCP
      // We send via the Anthropic API with Gmail MCP
      const { supabaseClient } = data; // may not exist -- fall back to direct fetch

      // Call claude-proxy to send the email via Gmail MCP
      // Since we can't call MCP directly from the browser, we use the Anthropic API
      // with Gmail MCP configured, which will handle the send
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: 'You are a helpful assistant that sends emails. When asked to send an email with an attachment, use the Gmail tool to do so. Confirm success with: SENT',
          messages: [
            {
              role: 'user',
              content: `Please send an email via Gmail with the following details:
To: ${RECIPIENT_EMAIL}
Subject: 10-8 Insurance Report - ${monthName2}
Body: Please find attached my 10-8 insurance exercise report for ${monthName2}.

The attachment is a PDF file named "${fileName}". The base64-encoded content of the PDF is:
${base64}

Send it as an attachment with media type application/pdf.`,
            },
          ],
          mcp_servers: [
            {
              type: 'url',
              url: 'https://gmailmcp.googleapis.com/mcp/v1',
              name: 'gmail-mcp',
            },
          ],
        }),
      });

      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      const text = result.content?.map(b => b.text || '').join('') || '';

      if (text.includes('SENT') || text.toLowerCase().includes('sent')) {
        setEmailStatus('sent');
        setTimeout(() => setEmailStatus(null), 4000);
      } else {
        console.error('Unexpected response:', text);
        throw new Error('Email send not confirmed');
      }
    } catch (e) {
      console.error('Email failed:', e);
      setEmailStatus('error');
      setTimeout(() => setEmailStatus(null), 4000);
    }
  }, [buildPDFBase64, prevMonthDate, data]);

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