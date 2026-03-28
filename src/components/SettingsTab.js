// src/components/SettingsTab.js
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const DEFAULT_ZONES = { z1Max: 114, z2Max: 132, z3Max: 150, z4Max: 168 };

function toNum(v) { return parseFloat(v) || 0; }

async function fetchUserProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('name, birthday, height_cm, goal_weight_lbs, hr_min, hr_max, hr_z1_max, hr_z2_max, hr_z3_max, hr_z4_max')
    .eq('id', userId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function saveUserProfile(userId, fields) {
  const { error } = await supabase
    .from('users')
    .update(fields)
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

async function estimateMaxHR(userId) {
  const { data: profile } = await supabase
    .from('users')
    .select('birthday')
    .eq('id', userId)
    .single();

  let ageBased = null;
  if (profile?.birthday) {
    const age = Math.floor((Date.now() - new Date(profile.birthday)) / (365.25 * 24 * 3600 * 1000));
    ageBased = 220 - age;
  }

  const { data: workouts } = await supabase
    .from('workouts')
    .select('hr_z4, hr_z5, effort_score')
    .eq('user_id', userId)
    .eq('type', 'cycling')
    .not('hr_z5', 'is', null)
    .gt('hr_z5', 0)
    .order('hr_z5', { ascending: false })
    .limit(20);

  return { ageBased, hasZ5Data: workouts && workouts.length > 0, z5Rides: workouts?.length || 0 };
}

function zonesFromMaxHR(maxHR) {
  return {
    z1Max: Math.round(maxHR * 0.60),
    z2Max: Math.round(maxHR * 0.70),
    z3Max: Math.round(maxHR * 0.80),
    z4Max: Math.round(maxHR * 0.90),
  };
}

function ZonePreview({ hrMin, hrMax, z1Max, z2Max, z3Max, z4Max }) {
  const min = parseInt(hrMin, 10);
  const max = parseInt(hrMax, 10);
  const z1 = parseInt(z1Max, 10);
  const z2 = parseInt(z2Max, 10);
  const z3 = parseInt(z3Max, 10);
  const z4 = parseInt(z4Max, 10);

  if (!max || max < 100) return null;

  const zones = [
    { label: 'Z1', color: 'var(--blue)',   range: `${min || 0} - ${z1}` },
    { label: 'Z2', color: 'var(--green)',  range: `${z1 + 1} - ${z2}` },
    { label: 'Z3', color: 'var(--accent)', range: `${z2 + 1} - ${z3}` },
    { label: 'Z4', color: 'var(--red)',    range: `${z3 + 1} - ${z4}` },
    { label: 'Z5', color: '#ff4dff',       range: `${z4 + 1}${max ? ` - ${max}` : '+'}` },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 6,
        marginTop: 16,
        marginBottom: 4,
      }}
    >
      {zones.map(({ label, color, range }) => (
        <div
          key={label}
          style={{
            background: 'var(--bg3)',
            borderRadius: 'var(--radius)',
            padding: '8px 6px',
            textAlign: 'center',
            borderTop: `3px solid ${color}`,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--font-mono)', lineHeight: 1.4 }}>
            {range}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>bpm</div>
        </div>
      ))}
    </div>
  );
}

export default function SettingsTab({ userId, onSaved, onClose }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [hrEstimate, setHrEstimate] = useState(null);

  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [goalWeight, setGoalWeight] = useState('');
  const [hrMin, setHrMin] = useState('');
  const [hrMax, setHrMax] = useState('');
  const [z1Max, setZ1Max] = useState('');
  const [z2Max, setZ2Max] = useState('');
  const [z3Max, setZ3Max] = useState('');
  const [z4Max, setZ4Max] = useState('');

  const showMsg = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await fetchUserProfile(userId);
      setName(p.name || '');
      setBirthday(p.birthday || '');

      if (p.height_cm) {
        const totalInches = p.height_cm / 2.54;
        setHeightFt(String(Math.floor(totalInches / 12)));
        setHeightIn(String(Math.round(totalInches % 12)));
      }

      setGoalWeight(String(p.goal_weight_lbs || ''));
      setHrMin(String(p.hr_min || ''));
      setHrMax(String(p.hr_max || ''));
      setZ1Max(String(p.hr_z1_max || DEFAULT_ZONES.z1Max));
      setZ2Max(String(p.hr_z2_max || DEFAULT_ZONES.z2Max));
      setZ3Max(String(p.hr_z3_max || DEFAULT_ZONES.z3Max));
      setZ4Max(String(p.hr_z4_max || DEFAULT_ZONES.z4Max));
    } catch (e) {
      showMsg('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleHrMaxChange = (val) => {
    setHrMax(val);
    const n = parseInt(val, 10);
    if (n >= 100 && n <= 250) {
      const zones = zonesFromMaxHR(n);
      setZ1Max(String(zones.z1Max));
      setZ2Max(String(zones.z2Max));
      setZ3Max(String(zones.z3Max));
      setZ4Max(String(zones.z4Max));
    }
  };

  const handleEstimate = async () => {
    setEstimating(true);
    try {
      const est = await estimateMaxHR(userId);
      setHrEstimate(est);
      if (est.ageBased) {
        setHrMax(String(est.ageBased));
        const zones = zonesFromMaxHR(est.ageBased);
        setZ1Max(String(zones.z1Max));
        setZ2Max(String(zones.z2Max));
        setZ3Max(String(zones.z3Max));
        setZ4Max(String(zones.z4Max));
      }
    } catch (e) {
      showMsg('error', e.message);
    } finally {
      setEstimating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const heightCm = (heightFt || heightIn)
        ? ((toNum(heightFt) * 12) + toNum(heightIn)) * 2.54
        : null;

      await saveUserProfile(userId, {
        name: name.trim() || null,
        birthday: birthday || null,
        height_cm: heightCm,
        goal_weight_lbs: toNum(goalWeight) || null,
        hr_min: toNum(hrMin) || null,
        hr_max: toNum(hrMax) || null,
        hr_z1_max: toNum(z1Max) || null,
        hr_z2_max: toNum(z2Max) || null,
        hr_z3_max: toNum(z3Max) || null,
        hr_z4_max: toNum(z4Max) || null,
      });

      showMsg('success', 'Settings saved!');
      if (onSaved) onSaved();
    } catch (e) {
      showMsg('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text)',
    fontSize: 14,
    padding: '10px 12px',
    boxSizing: 'border-box',
    fontFamily: 'var(--font-body)',
  };

  const numStyle = { ...inputStyle, fontFamily: 'var(--font-mono)' };
  const labelStyle = { fontSize: 11, color: 'var(--text2)', marginBottom: 4, display: 'block' };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="settings-tab-shell">
      <div className="settings-tab-topbar">
        <div className="section-header" style={{ marginBottom: 0 }}>
          <span className="section-title">SETTINGS</span>
        </div>
        <button
          type="button"
          className="settings-close-btn"
          onClick={onClose || onSaved}
          aria-label="Close settings"
          title="Close settings"
        >
          ×
        </button>
      </div>

      <div className="settings-tab-content">
        {msg && <div className={`sync-banner ${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

        <div className="chart-card settings-card" style={{ marginBottom: 16 }}>
          <div className="chart-title">Profile</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Your name" />
            </div>
            <div>
              <label style={labelStyle}>Birthday</label>
              <input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Height</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <input type="number" value={heightFt} onChange={e => setHeightFt(e.target.value)} style={numStyle} placeholder="ft" min="3" max="8" />
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>feet</div>
                </div>
                <div style={{ flex: 1 }}>
                  <input type="number" value={heightIn} onChange={e => setHeightIn(e.target.value)} style={numStyle} placeholder="in" min="0" max="11" />
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>inches</div>
                </div>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Goal Weight (lbs)</label>
              <input type="number" value={goalWeight} onChange={e => setGoalWeight(e.target.value)} style={numStyle} placeholder="180" />
            </div>
          </div>
        </div>

        <div className="chart-card settings-card" style={{ marginBottom: 16 }}>
          <div className="chart-title">Heart Rate Zones</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
            Enter your resting HR and max HR. Zone ceilings are calculated automatically from max HR, or adjust them manually below.
          </div>

          <button
            className="sync-btn"
            onClick={handleEstimate}
            disabled={estimating}
            style={{ width: '100%', padding: 10, marginBottom: 14, fontSize: 13 }}
          >
            {estimating ? 'Estimating...' : '📊 Estimate from ride history'}
          </button>

          {hrEstimate && (
            <div
              style={{
                padding: '10px 12px',
                background: 'var(--bg3)',
                borderRadius: 'var(--radius)',
                marginBottom: 14,
                fontSize: 12,
                color: 'var(--text2)',
                lineHeight: 1.6,
              }}
            >
              {hrEstimate.ageBased && (
                <div>
                  Age-based estimate: <strong style={{ color: 'var(--accent)' }}>{hrEstimate.ageBased} bpm</strong> (220 minus age)
                </div>
              )}
              {hrEstimate.hasZ5Data
                ? <div>You have {hrEstimate.z5Rides} rides with Z5 data. Your actual max HR is likely higher than the age estimate.</div>
                : <div>No Z5 HR data found in your rides. Age-based estimate is your best baseline.</div>
              }
              <div style={{ marginTop: 4, color: 'var(--text3)' }}>
                Zones have been updated below. Adjust if needed, then save.
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Resting HR (bpm)</label>
              <input
                type="number"
                value={hrMin}
                onChange={e => setHrMin(e.target.value)}
                style={numStyle}
                placeholder="e.g. 55"
              />
            </div>
            <div>
              <label style={labelStyle}>Max HR (bpm)</label>
              <input
                type="number"
                value={hrMax}
                onChange={e => handleHrMaxChange(e.target.value)}
                style={numStyle}
                placeholder="e.g. 178"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              ['Z1 ceiling (bpm)', z1Max, setZ1Max, 'var(--blue)'],
              ['Z2 ceiling (bpm)', z2Max, setZ2Max, 'var(--green)'],
              ['Z3 ceiling (bpm)', z3Max, setZ3Max, 'var(--accent)'],
              ['Z4 ceiling (bpm)', z4Max, setZ4Max, 'var(--red)'],
            ].map(([label, val, setter, color]) => (
              <div key={label}>
                <label style={{ ...labelStyle, color }}>{label}</label>
                <input type="number" value={val} onChange={e => setter(e.target.value)} style={numStyle} />
              </div>
            ))}
          </div>

          <ZonePreview
            hrMin={hrMin}
            hrMax={hrMax}
            z1Max={z1Max}
            z2Max={z2Max}
            z3Max={z3Max}
            z4Max={z4Max}
          />

          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
            Z5 starts above the Z4 ceiling. New rides synced from Strava will use these boundaries.
          </div>
        </div>

        <div className="settings-actions">
          <button
            type="button"
            className="settings-secondary-btn"
            onClick={onClose || onSaved}
          >
            Cancel
          </button>
          <button
            className="sync-btn"
            onClick={handleSave}
            disabled={saving}
            style={{ padding: 14, fontSize: 15 }}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}