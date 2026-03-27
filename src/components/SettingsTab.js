import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const DEFAULT_ZONES = { z1Max: 114, z2Max: 132, z3Max: 150, z4Max: 168 };
const toNum = (v) => parseFloat(v) || 0;

const zonesFromMaxHR = (maxHR) => ({
  z1Max: Math.round(maxHR * 0.60),
  z2Max: Math.round(maxHR * 0.70),
  z3Max: Math.round(maxHR * 0.80),
  z4Max: Math.round(maxHR * 0.90),
});

async function fetchUserProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('name, birthday, height_cm, goal_weight_lbs, hr_max, hr_z1_max, hr_z2_max, hr_z3_max, hr_z4_max')
    .eq('id', userId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function estimateMaxHR(userId) {
  const { data: profile } = await supabase.from('users').select('birthday').eq('id', userId).single();
  let ageBased = null;
  if (profile?.birthday) {
    const age = Math.floor((Date.now() - new Date(profile.birthday)) / (365.25 * 24 * 3600 * 1000));
    ageBased = 220 - age;
  }
  const { data: workouts } = await supabase
    .from('workouts')
    .select('hr_z4, hr_z5')
    .eq('user_id', userId)
    .eq('type', 'cycling')
    .gt('hr_z5', 0)
    .limit(20);
  return { ageBased, hasZ5Data: workouts?.length > 0, z5Rides: workouts?.length || 0 };
}

function SettingsTab({ userId, onSaved, onClose }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [hrEstimate, setHrEstimate] = useState(null);
  const [form, setForm] = useState({
    name: '', birthday: '', heightFt: '', heightIn: '',
    goalWeight: '', hrMax: '', z1Max: '', z2Max: '', z3Max: '', z4Max: ''
  });

  const updateForm = (updates) => setForm(prev => ({ ...prev, ...updates }));

  const showMsg = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await fetchUserProfile(userId);
      const totalInches = p.height_cm ? p.height_cm / 2.54 : 0;
      setForm({
        name: p.name || '',
        birthday: p.birthday || '',
        heightFt: p.height_cm ? String(Math.floor(totalInches / 12)) : '',
        heightIn: p.height_cm ? String(Math.round(totalInches % 12)) : '',
        goalWeight: String(p.goal_weight_lbs || ''),
        hrMax: String(p.hr_max || ''),
        z1Max: String(p.hr_z1_max || DEFAULT_ZONES.z1Max),
        z2Max: String(p.hr_z2_max || DEFAULT_ZONES.z2Max),
        z3Max: String(p.hr_z3_max || DEFAULT_ZONES.z3Max),
        z4Max: String(p.hr_z4_max || DEFAULT_ZONES.z4Max),
      });
    } catch (e) { showMsg('error', e.message); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleHrMaxChange = (val) => {
    const updates = { hrMax: val };
    const n = parseInt(val);
    if (n >= 100 && n <= 250) {
      const zones = zonesFromMaxHR(n);
      updates.z1Max = String(zones.z1Max);
      updates.z2Max = String(zones.z2Max);
      updates.z3Max = String(zones.z3Max);
      updates.z4Max = String(zones.z4Max);
    }
    updateForm(updates);
  };

  const handleEstimate = async () => {
    setEstimating(true);
    try {
      const est = await estimateMaxHR(userId);
      setHrEstimate(est);
      if (est.ageBased) handleHrMaxChange(String(est.ageBased));
    } catch (e) { showMsg('error', e.message); }
    finally { setEstimating(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const heightCm = (form.heightFt || form.heightIn)
        ? ((toNum(form.heightFt) * 12) + toNum(form.heightIn)) * 2.54
        : null;

      const { error } = await supabase.from('users').update({
        name: form.name.trim() || null,
        birthday: form.birthday || null,
        height_cm: heightCm,
        goal_weight_lbs: toNum(form.goalWeight) || null,
        hr_max: toNum(form.hrMax) || null,
        hr_z1_max: toNum(form.z1Max) || null,
        hr_z2_max: toNum(form.z2Max) || null,
        hr_z3_max: toNum(form.z3Max) || null,
        hr_z4_max: toNum(form.z4Max) || null,
      }).eq('id', userId);

      if (error) throw error;
      showMsg('success', 'Settings saved!');
      if (onSaved) onSaved();
    } catch (e) { showMsg('error', e.message); }
    finally { setSaving(false); }
  };

  const styles = {
    container: { maxWidth: 600, margin: '0 auto', padding: '20px 40px' },
    input: { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 16, padding: '10px 12px', boxSizing: 'border-box' },
    label: { fontSize: 14, color: 'var(--text2)', marginBottom: 4, display: 'block' },
    closeBtn: {
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid var(--border)',
      color: '#fff',
      fontSize: '22px',
      cursor: 'pointer',
      borderRadius: '6px',
      width: '32px',
      height: '32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      lineHeight: 0,
      transition: 'all 0.2s'
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Loading...</div>;

  return (
    <div style={styles.container}>
      {/* HEADER SECTION */}
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <span className="section-title">SETTINGS</span>

        <button
          onClick={onClose}
          style={styles.closeBtn}
          onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.15)'}
          onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.05)'}
        >
          &times;
        </button>
      </div>

      {msg && <div className={`sync-banner ${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

      {/* FORM CARDS */}
      <div className="chart-card" style={{ marginBottom: 24, padding: 20 }}>
        <div className="chart-title">Profile</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={styles.label}>Name</label>
            <input value={form.name} onChange={e => updateForm({ name: e.target.value })} style={styles.input} />
          </div>
          <div>
            <label style={styles.label}>Birthday</label>
            <input type="date" value={form.birthday} onChange={e => updateForm({ birthday: e.target.value })} style={styles.input} />
          </div>
          <div className="form-row">
            <div>
              <label style={styles.label}>Height (ft)</label>
              <input type="number" value={form.heightFt} onChange={e => updateForm({ heightFt: e.target.value })} style={styles.input} />
            </div>
            <div>
              <label style={styles.label}>Height (in)</label>
              <input type="number" value={form.heightIn} onChange={e => updateForm({ heightIn: e.target.value })} style={styles.input} />
            </div>
          </div>
        </div>
      </div>

      <div className="chart-card" style={{ marginBottom: 24, padding: 20 }}>
        <div className="chart-title">Heart Rate Zones</div>
        <button className="sync-btn" onClick={handleEstimate} disabled={estimating} style={{ width: '100%', padding: 12, marginBottom: 20, fontSize: 16 }}>
          {estimating ? 'Estimating...' : '📊 Estimate Max HR'}
        </button>

        <div style={{ marginBottom: 16 }}>
          <label style={styles.label}>Max Heart Rate (bpm)</label>
          <input type="number" value={form.hrMax} onChange={e => handleHrMaxChange(e.target.value)} style={styles.input} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            ['Z1 ceiling', form.z1Max, v => updateForm({ z1Max: v }), 'var(--blue)'],
            ['Z2 ceiling', form.z2Max, v => updateForm({ z2Max: v }), 'var(--green)'],
            ['Z3 ceiling', form.z3Max, v => updateForm({ z3Max: v }), 'var(--accent)'],
            ['Z4 ceiling', form.z4Max, v => updateForm({ z4Max: v }), 'var(--red)'],
          ].map(([label, val, setter, color]) => (
            <div key={label}>
              <label style={{ ...styles.label, color }}>{label}</label>
              <input type="number" value={val} onChange={e => setter(e.target.value)} style={styles.input} />
            </div>
          ))}
        </div>
      </div>

      <button className="sync-btn" onClick={handleSave} disabled={saving} style={{ width: '100%', padding: 16, fontSize: 18 }}>
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}

function ParentComponent() {
  const [showSettings, setShowSettings] = useState(false);
  const userId = '9d0f37ce-1726-4651-a262-ba5d8cc8b9ac'; // Replace with the actual user ID

  const handleSave = () => {
    // Logic to handle saving the settings
    console.log('Settings saved');
  };

  const handleCloseSettings = () => {
    // Logic to close the settings window
    setShowSettings(false);
  };

  return (
    <div>
      {/* Other components and content */}
      <button onClick={() => setShowSettings(true)}>Open Settings</button>

      {showSettings && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
            <SettingsTab userId={userId} onSaved={handleSave} onClose={handleCloseSettings} />
          </div>
        </div>
      )}
    </div>
  );
}

export default ParentComponent;