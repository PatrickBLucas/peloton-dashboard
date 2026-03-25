import { useState, useEffect, useCallback } from 'react';
import { fetchCoachReport, saveCoachReport } from '../api/supabase';
import { supabase } from '../lib/supabase';

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdGV2Zmxmcnlqa3Vka2NwbWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzA3NzgsImV4cCI6MjA4OTk0Njc3OH0.9riWHdjPggS9so5VXzcOmlQ-gsAREzZhfRmNAEEe2Rw';
const KG_TO_LBS = 2.20462;

function toDateStr(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().split('T')[0];
}

async function fetchLast4WeeksData(userId) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 28);
  const cutoffStr = toDateStr(cutoff);

  const [{ data: workouts }, { data: fitbit }, { data: weightData }] = await Promise.all([
    supabase
      .from('workouts')
      .select('date, title, type, duration_min, calories, output_kj, hr_z1, hr_z2, hr_z3, hr_z4, hr_z5, effort_score, instructor')
      .eq('user_id', userId)
      .gte('date', cutoffStr)
      .order('date', { ascending: true }),
    supabase
      .from('fitbit_daily')
      .select('date, calories_out, steps, very_active_min, fairly_active_min, weight_kg, minutes_asleep, efficiency')
      .eq('user_id', userId)
      .gte('date', cutoffStr)
      .order('date', { ascending: true }),
    supabase
      .from('fitbit_daily')
      .select('date, weight_kg')
      .eq('user_id', userId)
      .not('weight_kg', 'is', null)
      .order('date', { ascending: false })
      .limit(1),
  ]);

  return { workouts: workouts || [], fitbit: fitbit || [], latestWeight: weightData?.[0] || null };
}

function buildPrompt(workouts, fitbit, latestWeight) {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const cycling = workouts.filter(w => w.type === 'cycling');
  const totalRides = cycling.length;
  const totalMinutes = workouts.reduce((s, w) => s + (w.duration_min || 0), 0);
  const avgOutput = totalRides > 0
    ? Math.round(cycling.reduce((s, w) => s + (w.output_kj || 0), 0) / totalRides)
    : 0;
  const avgEffort = totalRides > 0
    ? (cycling.reduce((s, w) => s + (w.effort_score || 0), 0) / totalRides).toFixed(1)
    : 0;
  const totalZ4Z5 = cycling.reduce((s, w) => s + (w.hr_z4 || 0) + (w.hr_z5 || 0), 0).toFixed(1);

  // Rest days
  const rideDates = new Set(cycling.map(w => w.date));
  let restDays = 0;
  const sortedDates = [...rideDates].sort();
  for (let i = 1; i < sortedDates.length; i++) {
    const gap = (new Date(sortedDates[i]) - new Date(sortedDates[i-1])) / 86400000;
    restDays += gap - 1;
  }
  const avgRestBetweenRides = sortedDates.length > 1
    ? (restDays / (sortedDates.length - 1)).toFixed(1)
    : 'N/A';

  // Weight
  const currentWeightLbs = latestWeight?.weight_kg
    ? Math.round(latestWeight.weight_kg * KG_TO_LBS * 10) / 10
    : null;
  const weightEntries = fitbit.filter(d => d.weight_kg);
  const oldestWeight = weightEntries.length > 0 ? weightEntries[0] : null;
  const weightChange = (oldestWeight && latestWeight)
    ? Math.round((latestWeight.weight_kg - oldestWeight.weight_kg) * KG_TO_LBS * 10) / 10
    : null;

  // Fitbit averages
  const fitbitWithSteps = fitbit.filter(d => d.steps > 0);
  const avgSteps = fitbitWithSteps.length > 0
    ? Math.round(fitbitWithSteps.reduce((s, d) => s + d.steps, 0) / fitbitWithSteps.length)
    : 0;
  const fitbitWithSleep = fitbit.filter(d => d.minutes_asleep > 0);
  const avgSleep = fitbitWithSleep.length > 0
    ? (fitbitWithSleep.reduce((s, d) => s + d.minutes_asleep, 0) / fitbitWithSleep.length / 60).toFixed(1)
    : null;
  const avgEfficiency = fitbitWithSleep.length > 0
    ? Math.round(fitbitWithSleep.reduce((s, d) => s + (d.efficiency || 0), 0) / fitbitWithSleep.length)
    : null;

  // Top instructors
  const instructorCounts = {};
  cycling.forEach(w => {
    if (w.instructor) instructorCounts[w.instructor] = (instructorCounts[w.instructor] || 0) + 1;
  });
  const topInstructors = Object.entries(instructorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name} (${count}x)`)
    .join(', ');

  // Recent rides list
  const recentRides = cycling.slice(-7).map(w =>
    `  ${w.date}: ${w.title} — output: ${w.output_kj || 0}kJ, effort: ${w.effort_score || 'N/A'}, Z4+Z5: ${((w.hr_z4 || 0) + (w.hr_z5 || 0)).toFixed(1)}min`
  ).join('\n');

  return `You are a personal fitness coach reviewing a 4-week performance summary for a male athlete (age 43, height 6'0"). Today is ${today}.

Here is the data for the last 28 days:

WORKOUTS:
- Total activities: ${workouts.length} (${totalRides} cycling rides)
- Total active time: ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m
- Average output per ride: ${avgOutput} kJ
- Average effort score: ${avgEffort}
- Total Z4+Z5 time: ${totalZ4Z5} minutes
- Average rest days between rides: ${avgRestBetweenRides}
- Top instructors: ${topInstructors || 'N/A'}

RECENT RIDES (last 7):
${recentRides || '  No recent rides'}

BODY & HEALTH:
- Current weight: ${currentWeightLbs ? `${currentWeightLbs} lbs` : 'unknown'}
- Weight change over period: ${weightChange !== null ? `${weightChange > 0 ? '+' : ''}${weightChange} lbs` : 'unknown'}
- Average daily steps: ${avgSteps.toLocaleString()}
- Average sleep: ${avgSleep ? `${avgSleep} hours` : 'unknown'}
- Average sleep efficiency: ${avgEfficiency ? `${avgEfficiency}%` : 'unknown'}

Write a concise coaching report with exactly 5 sections using this format:
1. **Overall Summary** — brief overview of the 4-week period
2. **Workout Performance** — analyze output, effort scores, HR zones, intensity trends
3. **Body & Recovery** — weight trend, sleep quality, rest between rides
4. **What's Working** — specific positives to reinforce
5. **Next Week's Focus** — 2-3 concrete, actionable goals

Keep each section to 3-5 sentences. Be direct and specific — reference actual numbers from the data.`;
}

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
      // Fetch real data
      const { workouts, fitbit, latestWeight } = await fetchLast4WeeksData(userId);
      const prompt = buildPrompt(workouts, fitbit, latestWeight);

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        'https://hmtevflfryjkudkcpmac.supabase.co/functions/v1/claude-proxy',
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey':        SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1500,
            system: 'You are a personal fitness coach. Analyze the real athlete data provided and write a coaching report following the exact format and instructions in the message. Do not invent fictional data or clients.',
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