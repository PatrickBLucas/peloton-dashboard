// src/components/SettingsTab.js
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const SUPABASE_URL = 'https://hmtevflfryjkudkcpmac.supabase.co';

const DEFAULT_ZONES = { z1Max: 114, z2Max: 132, z3Max: 150, z4Max: 168 };

function toNum(v) { return parseFloat(v) || 0; }

async function fetchUserProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('name, birthday, height_cm, goal_weight_lbs, hr_max, hr_z1_max, hr_z2_max, hr_z3_max, hr_z4_max')
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

export default function SettingsTab({ userId, onSaved, onClose }) {
  const [profile, setProfile] = useState(null);
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
      setProfile(p);
      setName(p.name || '');
      setBirthday(p.birthday || '');

      if (p.height_cm) {
        const totalInches = p.height_cm / 2.54;
        setHeightFt(String(Math.floor(totalInches / 12)));
        setHeightIn(String(Math.round(totalInches % 12)));
      }

      setGoalWeight(String(p.goal_weight_lbs || ''));
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
            Zone boundaries are calculated from your max HR. Enter your max HR and zones update automatically, or adjust them manually.
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

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Max Heart Rate (bpm)</label>
            <input type="number" value={hrMax} onChange={e => handleHrMaxChange(e.target.value)} style={numStyle} placeholder="e.g. 185" />
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