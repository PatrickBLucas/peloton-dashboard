import { useState, useEffect, useCallback } from 'react';
import { fetchCoachReport, saveCoachReport } from '../api/supabase';
import { supabase } from '../lib/supabase';

export default function CoachTab({ userId }) {
  const [report, setReport]         = useState(null);
  const [updatedAt, setUpdatedAt]   = useState(null);
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError]           = useState(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const { report, updatedAt } = await fetchCoachReport(userId);
      setReport(report);
      setUpdatedAt(updatedAt);
    } catch (e) {
      setError('Failed to load report.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadReport(); }, [loadReport]);

const handleGenerate = async () => {
  setGenerating(true);
  setError(null);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      'https://hmtevflfryjkudkcpmac.supabase.co/functions/v1/claude-proxy',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Generate a fitness coach report.' }],
          max_tokens: 1000,
        }),
      }
    );
    if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
    const data = await res.json();
    const reportText = data.text || '';
    await saveCoachReport(userId, reportText);
    setReport(reportText);
    setUpdatedAt(new Date().toISOString());
  } catch (e) {
    setError(`Failed to generate report: ${e.message}`);
  } finally {
    setGenerating(false);
  }
};

  const renderReport = (text) => {
    if (!text) return null;
    const sections = text.split(/(?=\d+\.\s\*\*)/);
    return sections.map((section, i) => {
      if (!section.trim()) return null;
      const headerMatch = section.match(/^\d+\.\s\*\*(.+?)\*\*\s*[—-]?\s*([\s\S]*)/);
      if (headerMatch) {
        const [, title, body] = headerMatch;
        return (
          <div key={i} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              {title}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7 }}>
              {renderBodyText(body.trim())}
            </div>
          </div>
        );
      }
      return (
        <div key={i} style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, marginBottom: 12 }}>
          {renderBodyText(section.trim())}
        </div>
      );
    });
  };

  const renderBodyText = (text) => {
    return text.split('\n').map((line, i) => {
      if (!line.trim()) return null;
      const isBullet = /^[-•*]\s/.test(line.trim());
      const cleaned = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^[-•*]\s/, '');
      return (
        <div key={i} style={{ paddingLeft: isBullet ? 16 : 0, marginBottom: 4, position: 'relative' }}>
          {isBullet && <span style={{ position: 'absolute', left: 0, color: 'var(--accent)', fontWeight: 700 }}>·</span>}
          {cleaned}
        </div>
      );
    });
  };

  return (
    <>
      <div className="section-header">
        <span className="section-title">AI COACH</span>
        {updatedAt && <span className="section-sub">{new Date(updatedAt).toLocaleDateString()}</span>}
      </div>

      <div style={{ marginBottom: 16 }}>
        <button className="sync-btn" onClick={handleGenerate} disabled={generating} style={{ width: '100%', padding: 14, fontSize: 14 }}>
          {generating ? '🤖 Generating report...' : '🤖 Generate Report Now'}
        </button>
        {generating && (
          <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', marginTop: 8 }}>
            Analyzing your last 4 weeks — this takes about 15 seconds
          </div>
        )}
      </div>

      {error && <div className="sync-banner error" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>Loading...</div>
      ) : report ? (
        <div className="chart-card">{renderReport(report)}</div>
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
          No report yet. Tap the button above to generate your first one.
        </div>
      )}

      <div style={{ marginTop: 16, padding: 12, background: 'var(--bg3)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
        Reports auto-generate every Monday at 9AM. You can also generate on demand anytime.
      </div>
    </>
  );
}