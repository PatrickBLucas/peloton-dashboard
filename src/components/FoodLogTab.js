import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { appendFoodEntry, deleteFoodEntry, fetchFoodLog } from '../api/sheets';

const MODEL = 'claude-sonnet-4-20250514';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function nowTimeStr() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function toNum(v) { return parseFloat(v) || 0; }

// ── Barcode scanner using ZXing loaded from CDN ─────────────────────────────
function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [status, setStatus] = useState('Starting camera...');

  useEffect(() => {
    let stopped = false;

    async function start() {
      // Load ZXing from CDN if not already present
      if (!window.ZXingBrowser) {
        setStatus('Loading scanner...');
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/index.min.js';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }

      if (stopped) return;
      setStatus('Scanning — point at barcode');

      try {
        const hints = new Map();
        const { BrowserMultiFormatReader, BarcodeFormat } = window.ZXingBrowser;
        hints.set(2, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.QR_CODE,
        ]);
        const reader = new BrowserMultiFormatReader(hints);
        readerRef.current = reader;

        const devices = await window.ZXingBrowser.BrowserMultiFormatReader.listVideoInputDevices();
        // Prefer rear camera
        const back = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[devices.length - 1];
        const deviceId = back?.deviceId;

        await reader.decodeFromVideoDevice(deviceId, videoRef.current, (result, err) => {
          if (result && !stopped) {
            stopped = true;
            onDetected(result.getText());
          }
        });
      } catch (e) {
        setStatus(`Camera error: ${e.message}`);
      }
    }

    start();

    return () => {
      stopped = true;
      if (readerRef.current) {
        try { readerRef.current.reset(); } catch (_) {}
      }
    };
  }, [onDetected]);

  return (
    <div style={{ position: 'relative', background: '#000', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 12 }}>
      <video
        ref={videoRef}
        style={{ width: '100%', display: 'block', maxHeight: 280, objectFit: 'cover' }}
        muted
        playsInline
      />
      {/* Targeting overlay */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
      }}>
        <div style={{
          width: '70%', height: 80, border: '2px solid var(--accent)',
          borderRadius: 6, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
        }} />
      </div>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'rgba(0,0,0,0.6)', color: 'var(--accent)',
        fontSize: 12, textAlign: 'center', padding: '6px 12px',
        fontFamily: 'var(--font-mono)',
      }}>
        {status}
      </div>
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff',
          borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16,
        }}
      >✕</button>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function FoodLogTab({ data, accessToken }) {
  const { stats } = data;
  const tdee = stats?.tdee ?? null;

  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(true);

  // Mode: 'ai' | 'barcode' | 'photo'
  const [mode, setMode] = useState('ai');

  // AI text mode
  const [textInput, setTextInput] = useState('');
  const [estimating, setEstimating] = useState(false);

  // Barcode mode
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  // Photo mode
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
  const photoInputRef = useRef(null);

  // Shared
  const [estimate, setEstimate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const today = todayStr();

  const showMsg = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3000);
  };

  // ── Load today's entries ──────────────────────────────────────────────────
  const loadEntries = useCallback(async () => {
    setLoadingEntries(true);
    try {
      const all = await fetchFoodLog(accessToken);
      setEntries(all.filter(e => e.date === today));
    } catch (e) {
      console.error('Failed to load food log', e);
    } finally {
      setLoadingEntries(false);
    }
  }, [accessToken, today]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // ── Totals ────────────────────────────────────────────────────────────────
  const totals = useMemo(() => ({
    calories: entries.reduce((s, e) => s + (e.calories || 0), 0),
    protein:  entries.reduce((s, e) => s + (e.protein  || 0), 0),
    carbs:    entries.reduce((s, e) => s + (e.carbs    || 0), 0),
    fat:      entries.reduce((s, e) => s + (e.fat      || 0), 0),
  }), [entries]);

  const net = tdee !== null ? totals.calories - tdee : null;
  const netColor = net === null ? 'var(--text)'
    : net > 200  ? 'var(--red)'
    : net < -200 ? 'var(--green)'
    : 'var(--accent)';

  // ── Claude API call (shared by text + photo modes) ────────────────────────
  async function callClaude(messages) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: `You are a nutrition estimator. Return ONLY a valid JSON object — no markdown, no explanation:
{
  "description": "short clean meal name",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number
}
Use realistic average estimates. For photos, estimate based on visible portion sizes.`,
        messages,
      }),
    });
    const json = await res.json();
    const text = json.content?.[0]?.text || '';
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  }

  // ── AI text estimate ──────────────────────────────────────────────────────
  const handleTextEstimate = useCallback(async () => {
    if (!textInput.trim()) return;
    setEstimating(true);
    setEstimate(null);
    try {
      const result = await callClaude([{ role: 'user', content: textInput.trim() }]);
      setEstimate({ ...result, source: 'AI text' });
    } catch (e) {
      showMsg('error', 'AI estimate failed. Try again.');
    } finally {
      setEstimating(false);
    }
  }, [textInput]);

  // ── Barcode detected ──────────────────────────────────────────────────────
  const handleBarcodeDetected = useCallback(async (barcode) => {
    setScannerOpen(false);
    setLookingUp(true);
    setEstimate(null);
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
      const json = await res.json();
      if (json.status !== 1) {
        showMsg('error', 'Product not found in database.');
        return;
      }
      const p = json.product;
      const n = p.nutriments || {};
      const per100 = (f) => toNum(n[`${f}_100g`] ?? n[f]);
      const kcal = per100('energy-kcal') || Math.round(per100('energy') / 4.184);
      setEstimate({
        description: p.product_name || 'Scanned product',
        calories: Math.round(kcal),
        protein:  Math.round(per100('proteins')),
        carbs:    Math.round(per100('carbohydrates')),
        fat:      Math.round(per100('fat')),
        note:     `Per 100g · Serving size: ${p.serving_size || 'unknown'}`,
        source:   'barcode',
      });
    } catch (e) {
      showMsg('error', 'Barcode lookup failed.');
    } finally {
      setLookingUp(false);
    }
  }, []);

  // ── Photo selected ────────────────────────────────────────────────────────
  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    setEstimate(null);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handlePhotoEstimate = useCallback(async () => {
    if (!photoFile) return;
    setAnalyzingPhoto(true);
    setEstimate(null);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result.split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(photoFile);
      });
      const mediaType = photoFile.type || 'image/jpeg';
      const result = await callClaude([{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: 'Estimate the calories and macros for the food shown in this photo. Consider visible portion sizes.',
          },
        ],
      }]);
      setEstimate({ ...result, source: 'photo' });
    } catch (e) {
      showMsg('error', `Photo analysis failed: ${e.message}`);
    } finally {
      setAnalyzingPhoto(false);
    }
  }, [photoFile]);

  // ── Save to sheet ─────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!estimate) return;
    setSaving(true);
    try {
      await appendFoodEntry(accessToken, {
        date:        today,
        time:        nowTimeStr(),
        description: estimate.description,
        calories:    estimate.calories,
        protein:     estimate.protein,
        carbs:       estimate.carbs,
        fat:         estimate.fat,
        source:      estimate.source || mode,
      });
      setEstimate(null);
      setTextInput('');
      setPhotoFile(null);
      setPhotoPreview(null);
      showMsg('success', 'Logged!');
      await loadEntries();
    } catch (e) {
      showMsg('error', `Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [estimate, accessToken, today, mode, loadEntries]);

  // ── Delete entry ──────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (idx) => {
    try {
      await deleteFoodEntry(accessToken, idx);
      await loadEntries();
    } catch (e) {
      showMsg('error', 'Delete failed.');
    }
  }, [accessToken, loadEntries]);

  // ── Macro pill ────────────────────────────────────────────────────────────
  const MacroPill = ({ label, value, color }) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );

  // ── Mode button ───────────────────────────────────────────────────────────
  const ModeBtn = ({ id, icon, label }) => (
    <button
      className={`nav-btn${mode === id ? ' active' : ''}`}
      onClick={() => { setMode(id); setEstimate(null); setScannerOpen(false); }}
      style={{ flex: 1, padding: '10px 4px', fontSize: 13 }}
    >
      {icon} {label}
    </button>
  );

  return (
    <>
      <div className="section-header">
        <span className="section-title">FOOD LOG</span>
        <span className="section-sub">{today}</span>
      </div>

      {/* Daily summary */}
      <div className="stat-grid" style={{ marginBottom: 20, gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Calories In</div>
          <div className="stat-value accent">{totals.calories.toLocaleString()}</div>
          <div className="stat-sub">{tdee ? `TDEE: ${tdee.toLocaleString()} kcal` : 'TDEE loading...'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Net vs TDEE</div>
          <div className="stat-value" style={{ color: netColor }}>
            {net === null ? '--' : `${net > 0 ? '+' : ''}${net.toLocaleString()}`}
          </div>
          <div className="stat-sub">{net === null ? '' : net > 0 ? 'over TDEE' : net < 0 ? 'under TDEE' : 'at TDEE'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Protein</div>
          <div className="stat-value">{Math.round(totals.protein)}g</div>
          <div className="stat-sub">today</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Carbs / Fat</div>
          <div className="stat-value">{Math.round(totals.carbs)}g / {Math.round(totals.fat)}g</div>
          <div className="stat-sub">today</div>
        </div>
      </div>

      {msg && (
        <div className={`sync-banner ${msg.type}`} style={{ marginBottom: 16 }}>
          {msg.text}
        </div>
      )}

      {/* Input card */}
      <div className="chart-card" style={{ marginBottom: 16 }}>
        {/* Mode selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <ModeBtn id="ai"      icon="🤖" label="AI Text" />
          <ModeBtn id="barcode" icon="📦" label="Barcode" />
          <ModeBtn id="photo"   icon="📷" label="Photo" />
        </div>

        {/* ── AI Text ── */}
        {mode === 'ai' && (
          <>
            <textarea
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder="Describe your meal... e.g. 'grilled chicken breast, 1 cup white rice, side salad with olive oil'"
              rows={3}
              style={{
                width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 14,
                fontFamily: 'var(--font-body)', padding: '10px 12px', resize: 'none', boxSizing: 'border-box',
              }}
            />
            <button
              className="sync-btn"
              onClick={handleTextEstimate}
              disabled={estimating || !textInput.trim()}
              style={{ width: '100%', marginTop: 10, padding: 12, fontSize: 14 }}
            >
              {estimating ? 'Estimating...' : 'Estimate Calories'}
            </button>
          </>
        )}

        {/* ── Barcode ── */}
        {mode === 'barcode' && (
          <>
            {scannerOpen ? (
              <BarcodeScanner
                onDetected={handleBarcodeDetected}
                onClose={() => setScannerOpen(false)}
              />
            ) : (
              <button
                className="sync-btn"
                onClick={() => setScannerOpen(true)}
                disabled={lookingUp}
                style={{ width: '100%', padding: 14, fontSize: 15 }}
              >
                {lookingUp ? 'Looking up...' : '📷 Open Barcode Scanner'}
              </button>
            )}
          </>
        )}

        {/* ── Photo ── */}
        {mode === 'photo' && (
          <>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoChange}
              style={{ display: 'none' }}
            />
            {photoPreview ? (
              <>
                <img
                  src={photoPreview}
                  alt="Food"
                  style={{ width: '100%', borderRadius: 'var(--radius)', marginBottom: 10, maxHeight: 240, objectFit: 'cover' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="sync-btn"
                    onClick={handlePhotoEstimate}
                    disabled={analyzingPhoto}
                    style={{ flex: 1, padding: 12, fontSize: 14 }}
                  >
                    {analyzingPhoto ? 'Analyzing...' : '🤖 Analyze Photo'}
                  </button>
                  <button
                    className="logout-btn"
                    onClick={() => { setPhotoFile(null); setPhotoPreview(null); setEstimate(null); }}
                    style={{ padding: '12px 16px' }}
                  >
                    Retake
                  </button>
                </div>
              </>
            ) : (
              <button
                className="sync-btn"
                onClick={() => photoInputRef.current?.click()}
                style={{ width: '100%', padding: 14, fontSize: 15 }}
              >
                📷 Take a Photo of Your Meal
              </button>
            )}
          </>
        )}

        {/* ── Estimate result (shared) ── */}
        {estimate && (
          <div style={{
            marginTop: 14, padding: 14, background: 'var(--bg3)',
            borderRadius: 'var(--radius)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 15 }}>{estimate.description}</div>
            {estimate.note && (
              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 10 }}>{estimate.note}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
              <MacroPill label="Calories" value={estimate.calories}               color="var(--accent)" />
              <MacroPill label="Protein"  value={`${Math.round(estimate.protein)}g`}  color="var(--green)"  />
              <MacroPill label="Carbs"    value={`${Math.round(estimate.carbs)}g`}    color="var(--blue)"   />
              <MacroPill label="Fat"      value={`${Math.round(estimate.fat)}g`}      color="var(--text2)"  />
            </div>
            <button
              className="sync-btn"
              onClick={handleSave}
              disabled={saving}
              style={{ width: '100%', padding: 12, fontSize: 14 }}
            >
              {saving ? 'Saving...' : '+ Log This Meal'}
            </button>
          </div>
        )}
      </div>

      {/* Today's log */}
      <div className="chart-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '14px 16px 10px', borderBottom: '1px solid var(--border)',
          fontSize: 12, fontWeight: 600, color: 'var(--text2)',
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          Today's Entries
        </div>
        {loadingEntries ? (
          <div style={{ padding: 20, color: 'var(--text2)', fontSize: 13, textAlign: 'center' }}>Loading...</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>No entries yet today</div>
        ) : (
          entries.map((e, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.description}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
                  {e.time} &nbsp;·&nbsp;
                  <span style={{ color: 'var(--accent)' }}>{e.calories} cal</span>
                  &nbsp;·&nbsp; P: {e.protein}g &nbsp; C: {e.carbs}g &nbsp; F: {e.fat}g
                </div>
              </div>
              <button
                onClick={() => handleDelete(i)}
                style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, padding: '4px 8px', flexShrink: 0 }}
              >✕</button>
            </div>
          ))
        )}
      </div>
    </>
  );
}