import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { appendFoodEntry, deleteFoodEntry, fetchFoodLog, fetchSavedMeals, saveMeal, deleteSavedMeal, estimateNutrition } from '../api/sheets';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function nowTimeStr() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function toNum(v) { return parseFloat(v) || 0; }

// ── Manual entry form ────────────────────────────────────────────────────────
function ManualEntry({ onAdd }) {
  const [fields, setFields] = useState({ description: '', calories: '', protein: '', carbs: '', fat: '' });

  const set = (k, v) => setFields(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!fields.description.trim() || !fields.calories) return;
    onAdd({
      description: fields.description.trim(),
      calories: toNum(fields.calories),
      protein:  toNum(fields.protein),
      carbs:    toNum(fields.carbs),
      fat:      toNum(fields.fat),
    });
    setFields({ description: '', calories: '', protein: '', carbs: '', fat: '' });
  };

  const inputStyle = {
    width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 14,
    padding: '10px 12px', boxSizing: 'border-box', fontFamily: 'var(--font-body)',
  };

  const numStyle = {
    ...inputStyle, fontFamily: 'var(--font-mono)', textAlign: 'right',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input
        type="text"
        placeholder="Food name *"
        value={fields.description}
        onChange={e => set('description', e.target.value)}
        style={inputStyle}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Calories *</div>
          <input type="number" placeholder="e.g. 350" value={fields.calories} onChange={e => set('calories', e.target.value)} style={numStyle} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Protein (g)</div>
          <input type="number" placeholder="e.g. 30" value={fields.protein} onChange={e => set('protein', e.target.value)} style={numStyle} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Carbs (g)</div>
          <input type="number" placeholder="e.g. 40" value={fields.carbs} onChange={e => set('carbs', e.target.value)} style={numStyle} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Fat (g)</div>
          <input type="number" placeholder="e.g. 12" value={fields.fat} onChange={e => set('fat', e.target.value)} style={numStyle} />
        </div>
      </div>
      <button
        className="sync-btn"
        onClick={handleSubmit}
        disabled={!fields.description.trim() || !fields.calories}
        style={{ width: '100%', padding: 12, fontSize: 14 }}
      >
        Preview Entry
      </button>
    </div>
  );
}

// ── Barcode scanner using native BarcodeDetector API ─────────────────────────
function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const detectedRef = useRef(false);
  const [status, setStatus] = useState('Starting camera...');

  useEffect(() => {
    async function start() {
      if (!('BarcodeDetector' in window)) {
        setStatus('BarcodeDetector not supported on this browser.');
        return;
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        });
      } catch (e) {
        setStatus(`Camera error: ${e.message}`);
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      setStatus('Scanning — point at barcode');

      const detector = new window.BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
      });

      async function scan() {
        if (detectedRef.current) return;
        try {
          const results = await detector.detect(video);
          if (results.length > 0 && !detectedRef.current) {
            detectedRef.current = true;
            onDetected(results[0].rawValue);
            return;
          }
        } catch (_) {}
        rafRef.current = requestAnimationFrame(scan);
      }
      rafRef.current = requestAnimationFrame(scan);
    }

    start();
    return () => {
      detectedRef.current = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [onDetected]);

  return (
    <div style={{ position: 'relative', background: '#000', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 12 }}>
      <video ref={videoRef} style={{ width: '100%', display: 'block', maxHeight: 280, objectFit: 'cover' }} muted playsInline />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ width: '70%', height: 80, border: '2px solid var(--accent)', borderRadius: 6, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: 'var(--accent)', fontSize: 12, textAlign: 'center', padding: '6px 12px', fontFamily: 'var(--font-mono)' }}>
        {status}
      </div>
      <button onClick={onClose} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
    </div>
  );
}

// ── Serving size adjuster for barcode results ─────────────────────────────────
function ServingAdjuster({ estimate, onChange }) {
  const [grams, setGrams] = useState(estimate.servingG || 100);

  const apply = (g) => {
    const val = Math.max(1, g);
    setGrams(val);
    const ratio = val / 100;
    onChange({
      ...estimate,
      calories: Math.round(estimate.per100.calories * ratio),
      protein:  Math.round(estimate.per100.protein  * ratio),
      carbs:    Math.round(estimate.per100.carbs    * ratio),
      fat:      Math.round(estimate.per100.fat      * ratio),
      servingG: val,
      note:     `Per ${val}g serving`,
    });
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>Serving size:</span>
      <button onClick={() => apply(grams - 10)} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4, width: 28, height: 28, cursor: 'pointer', fontSize: 16 }}>−</button>
      <input
        type="number"
        value={grams}
        onChange={e => setGrams(toNum(e.target.value))}
        onBlur={e => apply(toNum(e.target.value))}
        style={{ width: 60, textAlign: 'center', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 14, padding: '4px 6px', fontFamily: 'var(--font-mono)' }}
      />
      <button onClick={() => apply(grams + 10)} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4, width: 28, height: 28, cursor: 'pointer', fontSize: 16 }}>+</button>
      <span style={{ fontSize: 11, color: 'var(--text2)' }}>g</span>
      {estimate.servingG && estimate.servingG !== grams && (
        <button onClick={() => apply(estimate.servingG)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          reset to {estimate.servingG}g
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FoodLogTab({ data, accessToken }) {
  const { stats } = data;
  const tdee = stats?.tdee ?? null;

  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
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

  // Saved meals
  const [savedMeals, setSavedMeals] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [savingMeal, setSavingMeal] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveMealName, setSaveMealName] = useState('');

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

  const loadSavedMeals = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const meals = await fetchSavedMeals(accessToken);
      setSavedMeals(meals);
    } catch (e) {
      console.error('Failed to load saved meals', e);
    } finally {
      setLoadingSaved(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (mode === 'saved') loadSavedMeals();
  }, [mode, loadSavedMeals]);

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

  // ── Claude API call via Apps Script proxy (avoids CORS) ─────────────────
  // ── Claude API via Apps Script Execution API (no CORS issues) ──────────────
  async function callClaude(messages) {
    return await estimateNutrition(accessToken, messages);
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

  // ── Barcode lookup helpers ────────────────────────────────────────────────

  function buildEstimateFromOFF(p) {
    const n = p.nutriments || {};

    const perServing = (f) => toNum(n[`${f}_serving`] ?? 0);
    const per100     = (f) => toNum(n[`${f}_100g`] ?? n[f] ?? 0);

    // Parse serving grams from serving_size string or serving_quantity field
    const servingRaw = p.serving_size || '';
    const match = servingRaw.match(/(\d+(\.\d+)?)\s*g/i);
    const servingG = match
      ? parseFloat(match[1])
      : toNum(p.serving_quantity) || 100;
    const ratio = servingG / 100;

    // Prefer per-serving fields — they're what's printed on the label
    // and are immune to the per-100g data corruption issues
    let calories = perServing('energy-kcal');
    let protein  = perServing('proteins');
    let carbs    = perServing('carbohydrates');
    let fat      = perServing('fat');

    // If per-serving kcal is missing or looks like kJ, fall back to per-100g * ratio
    if (!calories || calories > 1200) {
      let kcalPer100 = per100('energy-kcal');
      if (!kcalPer100 || kcalPer100 > 900) {
        const kj = per100('energy-kj') || per100('energy-kj') || per100('energy');
        kcalPer100 = kj / 4.184;
      }
      calories = kcalPer100 * ratio;
    }
    if (!protein) protein = per100('proteins')  * ratio;
    if (!carbs)   carbs   = per100('carbohydrates') * ratio;
    if (!fat)     fat     = per100('fat') * ratio;

    const per100Data = {
      calories: per100('energy-kcal') || per100('energy') / 4.184,
      protein:  per100('proteins'),
      carbs:    per100('carbohydrates'),
      fat:      per100('fat'),
    };

    return {
      description: p.product_name || 'Scanned product',
      calories: Math.round(calories),
      protein:  Math.round(protein),
      carbs:    Math.round(carbs),
      fat:      Math.round(fat),
      per100:   per100Data,
      servingG,
      note:     `Per ${servingG}g serving${servingRaw ? ` (${servingRaw})` : ''} · Open Food Facts`,
      source:   'barcode',
    };
  }

  function buildEstimateFromUSDA(food) {
    const nutrients = food.foodNutrients || [];
    const get = (name) => {
      const n = nutrients.find(n => n.nutrientName === name);
      return toNum(n?.value ?? 0);
    };
    // USDA values are per 100g
    const kcalPer100 = get('Energy');
    const per100Data = {
      calories: kcalPer100,
      protein:  get('Protein'),
      carbs:    get('Carbohydrate, by difference'),
      fat:      get('Total lipid (fat)'),
    };
    // Try to parse serving size from servingSize + servingSizeUnit fields
    const servingG = toNum(food.servingSize) || 100;
    const ratio = servingG / 100;
    return {
      description: food.description || 'USDA product',
      calories: Math.round(per100Data.calories * ratio),
      protein:  Math.round(per100Data.protein  * ratio),
      carbs:    Math.round(per100Data.carbs    * ratio),
      fat:      Math.round(per100Data.fat      * ratio),
      per100:   per100Data,
      servingG,
      note:     `Per ${servingG}g serving · USDA FoodData Central`,
      source:   'barcode',
    };
  }

  async function lookupOFF(barcode) {
    // Try original barcode first, then with leading zero (UPC-A vs EAN-13 mismatch)
    const candidates = [barcode];
    if (barcode.length === 12) candidates.push('0' + barcode);

    for (const code of candidates) {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
      const json = await res.json();
      if (json.status === 1 && json.product?.product_name) {
        return buildEstimateFromOFF(json.product);
      }
    }
    return null;
  }

  async function lookupUSDA(barcode) {
    const key = process.env.REACT_APP_USDA_API_KEY;
    // Search by barcode (USDA GTIN/UPC search)
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${barcode}&dataType=Branded&pageSize=1&api_key=${key}`
    );
    const json = await res.json();
    const food = json.foods?.[0];
    if (!food) return null;
    return buildEstimateFromUSDA(food);
  }

  // ── Barcode detected ──────────────────────────────────────────────────────
  const handleBarcodeDetected = useCallback(async (barcode) => {
    setScannerOpen(false);
    setLookingUp(true);
    setEstimate(null);
    try {
      // Run both lookups in parallel, use whichever succeeds first
      const [offResult, usdaResult] = await Promise.allSettled([
        lookupOFF(barcode),
        lookupUSDA(barcode),
      ]);

      const result =
        (offResult.status  === 'fulfilled' && offResult.value)  ? offResult.value  :
        (usdaResult.status === 'fulfilled' && usdaResult.value) ? usdaResult.value :
        null;

      if (!result) {
        showMsg('error', 'Product not found in Open Food Facts or USDA database.');
        return;
      }

      setEstimate(result);
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
      const result = await callClaude([{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: photoFile.type || 'image/jpeg', data: base64 } },
          { type: 'text', text: 'Estimate the calories and macros for the food shown in this photo. Consider visible portion sizes.' },
        ],
      }]);
      setEstimate({ ...result, source: 'photo' });
    } catch (e) {
      showMsg('error', `Photo analysis failed: ${e.message}`);
    } finally {
      setAnalyzingPhoto(false);
    }
  }, [photoFile]);

  // ── Save estimate as a named meal ────────────────────────────────────────
  const handleSaveMeal = useCallback(async () => {
    if (!estimate || !saveMealName.trim()) return;
    setSavingMeal(true);
    try {
      await saveMeal(accessToken, {
        name:     saveMealName.trim(),
        calories: estimate.calories,
        protein:  estimate.protein,
        carbs:    estimate.carbs,
        fat:      estimate.fat,
      });
      setSaveModalOpen(false);
      setSaveMealName('');
      showMsg('success', 'Meal saved!');
      setSavedMeals(prev => [...prev, {
        rowIndex: prev.length,
        name: saveMealName.trim(),
        calories: estimate.calories,
        protein: estimate.protein,
        carbs: estimate.carbs,
        fat: estimate.fat,
      }]);
    } catch (e) {
      showMsg('error', `Failed to save meal: ${e.message}`);
    } finally {
      setSavingMeal(false);
    }
  }, [estimate, saveMealName, accessToken]);

  const handleDeleteSavedMeal = useCallback(async (idx) => {
    try {
      await deleteSavedMeal(accessToken, idx);
      setSavedMeals(prev => prev.filter((_, i) => i !== idx));
    } catch (e) {
      showMsg('error', 'Delete failed.');
    }
  }, [accessToken]);

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

  // ── Helpers ───────────────────────────────────────────────────────────────
  const MacroPill = ({ label, value, color }) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );

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
        <div className={`sync-banner ${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>
      )}

      {/* Input card */}
      <div className="chart-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <ModeBtn id="ai"      icon="🤖" label="AI Text" />
          <ModeBtn id="barcode" icon="📦" label="Barcode" />
          <ModeBtn id="photo"   icon="📷" label="Photo" />
          <ModeBtn id="manual"  icon="✏️" label="Manual" />
          <ModeBtn id="saved"   icon="⭐" label="Saved" />
        </div>

        {/* AI Text */}
        {mode === 'ai' && (
          <>
            <textarea
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder="Describe your meal... e.g. 'grilled chicken breast, 1 cup white rice, side salad with olive oil'"
              rows={3}
              style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-body)', padding: '10px 12px', resize: 'none', boxSizing: 'border-box' }}
            />
            <button className="sync-btn" onClick={handleTextEstimate} disabled={estimating || !textInput.trim()} style={{ width: '100%', marginTop: 10, padding: 12, fontSize: 14 }}>
              {estimating ? 'Estimating...' : 'Estimate Calories'}
            </button>
          </>
        )}

        {/* Barcode */}
        {mode === 'barcode' && (
          scannerOpen
            ? <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setScannerOpen(false)} />
            : <button className="sync-btn" onClick={() => setScannerOpen(true)} disabled={lookingUp} style={{ width: '100%', padding: 14, fontSize: 15 }}>
                {lookingUp ? 'Looking up...' : '📷 Open Barcode Scanner'}
              </button>
        )}

        {/* Photo */}
        {mode === 'photo' && (
          <>
            <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} style={{ display: 'none' }} />
            {photoPreview ? (
              <>
                <img src={photoPreview} alt="Food" style={{ width: '100%', borderRadius: 'var(--radius)', marginBottom: 10, maxHeight: 240, objectFit: 'cover' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="sync-btn" onClick={handlePhotoEstimate} disabled={analyzingPhoto} style={{ flex: 1, padding: 12, fontSize: 14 }}>
                    {analyzingPhoto ? 'Analyzing...' : '🤖 Analyze Photo'}
                  </button>
                  <button className="logout-btn" onClick={() => { setPhotoFile(null); setPhotoPreview(null); setEstimate(null); }} style={{ padding: '12px 16px' }}>
                    Retake
                  </button>
                </div>
              </>
            ) : (
              <button className="sync-btn" onClick={() => photoInputRef.current?.click()} style={{ width: '100%', padding: 14, fontSize: 15 }}>
                📷 Take a Photo of Your Meal
              </button>
            )}
          </>
        )}

        {/* Saved Meals */}
        {mode === 'saved' && (
          <div>
            {loadingSaved ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>Loading...</div>
            ) : savedMeals.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                No saved meals yet. Log a meal and tap "Save as Meal" to add one.
              </div>
            ) : (
              savedMeals.map((meal, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3 }}>{meal.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: 'var(--accent)' }}>{meal.calories} cal</span>
                      &nbsp;·&nbsp; P: {meal.protein}g &nbsp; C: {meal.carbs}g &nbsp; F: {meal.fat}g
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      className="sync-btn"
                      onClick={() => setEstimate({ description: meal.name, calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, source: 'saved' })}
                      style={{ padding: '6px 12px', fontSize: 12 }}
                    >
                      Load
                    </button>
                    <button
                      onClick={() => handleDeleteSavedMeal(meal.rowIndex)}
                      style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, padding: '4px 8px' }}
                    >✕</button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Manual Entry */}
        {mode === 'manual' && (
          <ManualEntry onAdd={(entry) => {
            setEstimate({ ...entry, source: 'manual' });
          }} />
        )}

        {/* Estimate result */}
        {estimate && (
          <div style={{ marginTop: 14, padding: 14, background: 'var(--bg3)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 15 }}>{estimate.description}</div>
            {estimate.note && (
              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 10 }}>{estimate.note}</div>
            )}
            {/* Serving adjuster — only for barcode results with per100 data */}
            {estimate.per100 && (
              <ServingAdjuster estimate={estimate} onChange={setEstimate} />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
              <MacroPill label="Calories" value={estimate.calories}                    color="var(--accent)" />
              <MacroPill label="Protein"  value={`${Math.round(estimate.protein)}g`}   color="var(--green)"  />
              <MacroPill label="Carbs"    value={`${Math.round(estimate.carbs)}g`}     color="var(--blue)"   />
              <MacroPill label="Fat"      value={`${Math.round(estimate.fat)}g`}       color="var(--text2)"  />
            </div>
            <button className="sync-btn" onClick={handleSave} disabled={saving} style={{ width: '100%', padding: 12, fontSize: 14 }}>
              {saving ? 'Saving...' : '+ Log This Meal'}
            </button>
            <button
              onClick={() => { setSaveMealName(estimate.description); setSaveModalOpen(true); }}
              style={{ width: '100%', marginTop: 8, padding: '10px 12px', fontSize: 13, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text2)', cursor: 'pointer' }}
            >
              ⭐ Save as Meal
            </button>
            {saveModalOpen && (
              <div style={{ marginTop: 10, padding: 12, background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>Save as:</div>
                <input
                  type="text"
                  value={saveMealName}
                  onChange={e => setSaveMealName(e.target.value)}
                  placeholder="Meal name"
                  autoFocus
                  style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 14, padding: '8px 12px', boxSizing: 'border-box', marginBottom: 8 }}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveMeal(); if (e.key === 'Escape') setSaveModalOpen(false); }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="sync-btn" onClick={handleSaveMeal} disabled={savingMeal || !saveMealName.trim()} style={{ flex: 1, padding: '8px 12px', fontSize: 13 }}>
                    {savingMeal ? 'Saving...' : 'Save'}
                  </button>
                  <button className="logout-btn" onClick={() => setSaveModalOpen(false)} style={{ padding: '8px 12px', fontSize: 13 }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Today's log */}
      <div className="chart-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text2)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Today's Entries
        </div>
        {loadingEntries ? (
          <div style={{ padding: 20, color: 'var(--text2)', fontSize: 13, textAlign: 'center' }}>Loading...</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>No entries yet today</div>
        ) : (
          entries.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
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
              <button onClick={() => handleDelete(i)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, padding: '4px 8px', flexShrink: 0 }}>✕</button>
            </div>
          ))
        )}
      </div>
    </>
  );
}