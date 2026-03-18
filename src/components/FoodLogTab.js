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
function round1(v) { return Math.round(v * 10) / 10; }

// ── Barcode Scanner ───────────────────────────────────────────────────────────
function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const detectedRef = useRef(false);
  const [status, setStatus] = useState('Starting camera...');

  useEffect(() => {
    async function start() {
      if (!('BarcodeDetector' in window)) { setStatus('BarcodeDetector not supported.'); return; }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } });
      } catch (e) { setStatus(`Camera error: ${e.message}`); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      setStatus('Scanning — point at barcode');
      const detector = new window.BarcodeDetector({ formats: ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','qr_code'] });
      async function scan() {
        if (detectedRef.current) return;
        try {
          const results = await detector.detect(video);
          if (results.length > 0 && !detectedRef.current) { detectedRef.current = true; onDetected(results[0].rawValue); return; }
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
      <video ref={videoRef} style={{ width: '100%', display: 'block', maxHeight: 240, objectFit: 'cover' }} muted playsInline />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ width: '70%', height: 70, border: '2px solid var(--accent)', borderRadius: 6, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: 'var(--accent)', fontSize: 12, textAlign: 'center', padding: '6px 12px', fontFamily: 'var(--font-mono)' }}>{status}</div>
      <button onClick={onClose} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
    </div>
  );
}

// ── Nutrition lookup helpers ───────────────────────────────────────────────────
async function lookupBarcode(barcode) {
  const candidates = [barcode];
  if (barcode.length === 12) candidates.push('0' + barcode);
  for (const code of candidates) {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
    const json = await res.json();
    if (json.status === 1 && json.product?.product_name) return buildFromOFF(json.product);
  }
  return null;
}

async function lookupUSDABarcode(barcode) {
  const key = process.env.REACT_APP_USDA_API_KEY;
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${barcode}&dataType=Branded&pageSize=1&api_key=${key}`);
  const json = await res.json();
  const food = json.foods?.[0];
  if (!food) return null;
  return buildFromUSDA(food);
}

export async function searchFoodUSDA(query) {
  const key = process.env.REACT_APP_USDA_API_KEY;
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&dataType=Branded,SR%20Legacy&pageSize=10&api_key=${key}`);
  const json = await res.json();
  return (json.foods || []).map(f => buildFromUSDA(f));
}

function buildFromOFF(p) {
  const n = p.nutriments || {};
  const per100 = (f) => toNum(n[`${f}_100g`] ?? n[f] ?? 0);
  let kcalPer100 = per100('energy-kcal');
  if (!kcalPer100 || kcalPer100 > 900) {
    const kj = per100('energy-kj') || per100('energy');
    kcalPer100 = kj / 4.184;
  }
  const perServing = (f) => toNum(n[`${f}_serving`] ?? 0);
  const servingRaw = p.serving_size || '';
  const match = servingRaw.match(/(\d+(\.\d+)?)\s*g/i);
  const servingG = match ? parseFloat(match[1]) : toNum(p.serving_quantity) || 100;
  const ratio = servingG / 100;
  let calories = perServing('energy-kcal');
  let protein  = perServing('proteins');
  let carbs    = perServing('carbohydrates');
  let fat      = perServing('fat');
  if (!calories || calories > 1200) calories = kcalPer100 * ratio;
  if (!protein) protein = per100('proteins') * ratio;
  if (!carbs)   carbs   = per100('carbohydrates') * ratio;
  if (!fat)     fat     = per100('fat') * ratio;
  return {
    description: p.product_name || 'Scanned product',
    calories: Math.round(calories), protein: Math.round(protein),
    carbs: Math.round(carbs), fat: Math.round(fat),
    per100g: { calories: kcalPer100, protein: per100('proteins'), carbs: per100('carbohydrates'), fat: per100('fat') },
    servingG, source: 'barcode',
  };
}

function buildFromUSDA(food) {
  const nutrients = food.foodNutrients || [];
  const get = (name) => toNum(nutrients.find(n => n.nutrientName === name)?.value ?? 0);
  const kcalPer100 = get('Energy');
  const per100g = { calories: kcalPer100, protein: get('Protein'), carbs: get('Carbohydrate, by difference'), fat: get('Total lipid (fat)') };
  const servingG = toNum(food.servingSize) || 100;
  const ratio = servingG / 100;
  return {
    description: food.description || 'USDA product',
    calories: Math.round(per100g.calories * ratio), protein: Math.round(per100g.protein * ratio),
    carbs: Math.round(per100g.carbs * ratio), fat: Math.round(per100g.fat * ratio),
    per100g, servingG, source: 'usda',
  };
}

// Scale a food item to a given number of grams
function scaleToGrams(item, grams) {
  if (!item.per100g || !grams) return item;
  const ratio = grams / 100;
  return {
    ...item,
    calories: Math.round(item.per100g.calories * ratio),
    protein:  Math.round(item.per100g.protein  * ratio),
    carbs:    Math.round(item.per100g.carbs    * ratio),
    fat:      Math.round(item.per100g.fat      * ratio),
    servingG: grams,
  };
}

// ── Meal Builder ──────────────────────────────────────────────────────────────
function MealBuilder({ accessToken, onLog, onSaveRecipe }) {
  const [ingredients, setIngredients] = useState([]);
  const [mealName, setMealName] = useState('');
  const [subMode, setSubMode] = useState('search'); // search | barcode | manual
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [msg, setMsg] = useState(null);

  // Manual ingredient state
  const [manualFields, setManualFields] = useState({ description: '', calories: '', protein: '', carbs: '', fat: '' });

  const totals = useMemo(() => ({
    calories: ingredients.reduce((s, i) => s + i.calories, 0),
    protein:  ingredients.reduce((s, i) => s + i.protein,  0),
    carbs:    ingredients.reduce((s, i) => s + i.carbs,    0),
    fat:      ingredients.reduce((s, i) => s + i.fat,      0),
  }), [ingredients]);

  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3000); };

  const addIngredient = (item) => {
    setIngredients(prev => [...prev, { ...item, id: Date.now() }]);
    setSearchResults([]);
    setSearchQuery('');
    showMsg('success', `Added ${item.description}`);
  };

  const removeIngredient = (id) => setIngredients(prev => prev.filter(i => i.id !== id));

  const updateGrams = (id, grams) => {
    setIngredients(prev => prev.map(i => {
      if (i.id !== id) return i;
      return i.per100g ? { ...scaleToGrams(i, toNum(grams)), id: i.id, servingG: toNum(grams) } : i;
    }));
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const results = await searchFoodUSDA(searchQuery);
      setSearchResults(results);
      if (results.length === 0) showMsg('error', 'No results found. Try a different search term.');
    } catch (e) {
      showMsg('error', 'Search failed. Try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleBarcodeDetected = async (barcode) => {
    setScannerOpen(false);
    setLookingUp(true);
    try {
      const [offResult, usdaResult] = await Promise.allSettled([lookupBarcode(barcode), lookupUSDABarcode(barcode)]);
      const result = (offResult.status === 'fulfilled' && offResult.value) ? offResult.value :
                     (usdaResult.status === 'fulfilled' && usdaResult.value) ? usdaResult.value : null;
      if (result) addIngredient(result);
      else showMsg('error', 'Product not found.');
    } catch (e) { showMsg('error', 'Barcode lookup failed.'); }
    finally { setLookingUp(false); }
  };

  const handleManualAdd = () => {
    if (!manualFields.description.trim() || !manualFields.calories) return;
    addIngredient({
      description: manualFields.description.trim(),
      calories: toNum(manualFields.calories), protein: toNum(manualFields.protein),
      carbs: toNum(manualFields.carbs), fat: toNum(manualFields.fat),
      source: 'manual',
    });
    setManualFields({ description: '', calories: '', protein: '', carbs: '', fat: '' });
  };

  const handleLog = () => {
    if (ingredients.length === 0) return;
    const name = mealName.trim() || ingredients.map(i => i.description).join(', ');
    onLog({ description: name, ...totals, source: 'builder' });
    setIngredients([]);
    setMealName('');
  };

  const inputStyle = { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 14, padding: '10px 12px', boxSizing: 'border-box', fontFamily: 'var(--font-body)' };
  const numStyle = { ...inputStyle, fontFamily: 'var(--font-mono)', textAlign: 'right' };
  const SubBtn = ({ id, label }) => (
    <button className={`nav-btn${subMode === id ? ' active' : ''}`} onClick={() => { setSubMode(id); setSearchResults([]); setScannerOpen(false); }} style={{ flex: 1, padding: '8px 4px', fontSize: 12 }}>{label}</button>
  );

  return (
    <div>
      {/* Running totals */}
      {ingredients.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14, padding: 12, background: 'var(--bg3)', borderRadius: 'var(--radius)' }}>
          {[['Cal', totals.calories, 'var(--accent)'], ['Pro', `${Math.round(totals.protein)}g`, 'var(--green)'], ['Carb', `${Math.round(totals.carbs)}g`, 'var(--blue)'], ['Fat', `${Math.round(totals.fat)}g`, 'var(--text2)']].map(([l, v, c]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {msg && <div className={`sync-banner ${msg.type}`} style={{ marginBottom: 10 }}>{msg.text}</div>}

      {/* Sub-mode selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <SubBtn id="search" label="🔍 Search" />
        <SubBtn id="barcode" label="📦 Barcode" />
        <SubBtn id="manual" label="✏️ Manual" />
      </div>

      {/* Search */}
      {subMode === 'search' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="Search foods... e.g. pulled pork" style={{ ...inputStyle, flex: 1 }} />
            <button className="sync-btn" onClick={handleSearch} disabled={searching || !searchQuery.trim()} style={{ flexShrink: 0, padding: '10px 14px' }}>
              {searching ? '...' : 'Go'}
            </button>
          </div>
          {searchResults.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: 'var(--accent)' }}>{r.calories} cal</span> · P:{r.protein}g · C:{r.carbs}g · F:{r.fat}g · per {r.servingG}g
                </div>
              </div>
              <button className="sync-btn" onClick={() => addIngredient(r)} style={{ flexShrink: 0, padding: '6px 12px', fontSize: 12, marginLeft: 8 }}>+ Add</button>
            </div>
          ))}
        </div>
      )}

      {/* Barcode */}
      {subMode === 'barcode' && (
        scannerOpen
          ? <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setScannerOpen(false)} />
          : <button className="sync-btn" onClick={() => setScannerOpen(true)} disabled={lookingUp} style={{ width: '100%', padding: 12 }}>
              {lookingUp ? 'Looking up...' : '📷 Open Barcode Scanner'}
            </button>
      )}

      {/* Manual */}
      {subMode === 'manual' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input type="text" placeholder="Ingredient name *" value={manualFields.description} onChange={e => setManualFields(f => ({ ...f, description: e.target.value }))} style={inputStyle} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[['calories','Calories *'],['protein','Protein (g)'],['carbs','Carbs (g)'],['fat','Fat (g)']].map(([k, label]) => (
              <div key={k}>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 3 }}>{label}</div>
                <input type="number" value={manualFields[k]} onChange={e => setManualFields(f => ({ ...f, [k]: e.target.value }))} style={numStyle} />
              </div>
            ))}
          </div>
          <button className="sync-btn" onClick={handleManualAdd} disabled={!manualFields.description.trim() || !manualFields.calories} style={{ width: '100%', padding: 12 }}>+ Add Ingredient</button>
        </div>
      )}

      {/* Ingredient list */}
      {ingredients.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Ingredients</div>
          {ingredients.map(ing => (
            <div key={ing.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ing.description}</div>
                <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{ing.calories} cal</div>
              </div>
              {ing.per100g && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <input
                    type="number"
                    value={ing.servingG}
                    onChange={e => updateGrams(ing.id, e.target.value)}
                    style={{ width: 58, padding: '4px 6px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-mono)', textAlign: 'right' }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>g</span>
                </div>
              )}
              <button onClick={() => removeIngredient(ing.id)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, padding: '4px', flexShrink: 0 }}>✕</button>
            </div>
          ))}

          {/* Meal name + log */}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input type="text" value={mealName} onChange={e => setMealName(e.target.value)} placeholder="Meal name (optional)" style={inputStyle} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="sync-btn" onClick={handleLog} style={{ flex: 1, padding: 12, fontSize: 14 }}>+ Log Meal</button>
              <button onClick={() => onSaveRecipe({ name: mealName || 'My Meal', ...totals })} style={{ padding: '12px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>⭐ Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main FoodLogTab ───────────────────────────────────────────────────────────
export default function FoodLogTab({ data, accessToken }) {
  const { stats } = data;
  const tdee = stats?.tdee ?? null;

  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [mode, setMode] = useState('build');

  // AI mode
  const [textInput, setTextInput] = useState('');
  const [estimating, setEstimating] = useState(false);

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
  const [pendingSave, setPendingSave] = useState(null);

  // Edit mode
  const [editingEntry, setEditingEntry] = useState(null); // { index, entry }
  const [editFields, setEditFields] = useState({});

  // Shared
  const [estimate, setEstimate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const today = todayStr();
  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3000); };

  // ── Load entries ──────────────────────────────────────────────────────────
  const loadEntries = useCallback(async () => {
    setLoadingEntries(true);
    try {
      const all = await fetchFoodLog(accessToken);
      setEntries(all.filter(e => e.date === today));
    } catch (e) { console.error('Failed to load food log', e); }
    finally { setLoadingEntries(false); }
  }, [accessToken, today]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const loadSavedMeals = useCallback(async () => {
    setLoadingSaved(true);
    try { setSavedMeals(await fetchSavedMeals(accessToken)); }
    catch (e) { console.error('Failed to load saved meals', e); }
    finally { setLoadingSaved(false); }
  }, [accessToken]);

  useEffect(() => { if (mode === 'saved') loadSavedMeals(); }, [mode, loadSavedMeals]);

  // ── Totals ────────────────────────────────────────────────────────────────
  const totals = useMemo(() => ({
    calories: entries.reduce((s, e) => s + (e.calories || 0), 0),
    protein:  entries.reduce((s, e) => s + (e.protein  || 0), 0),
    carbs:    entries.reduce((s, e) => s + (e.carbs    || 0), 0),
    fat:      entries.reduce((s, e) => s + (e.fat      || 0), 0),
  }), [entries]);

  const net = tdee !== null ? totals.calories - tdee : null;
  const netColor = net === null ? 'var(--text)' : net > 200 ? 'var(--red)' : net < -200 ? 'var(--green)' : 'var(--accent)';

  // ── Claude proxy ──────────────────────────────────────────────────────────
  async function callClaude(messages) {
    return await estimateNutrition(accessToken, messages);
  }

  // ── AI text ───────────────────────────────────────────────────────────────
  const handleTextEstimate = useCallback(async () => {
    if (!textInput.trim()) return;
    setEstimating(true); setEstimate(null);
    try { setEstimate({ ...await callClaude([{ role: 'user', content: textInput.trim() }]), source: 'AI text' }); }
    catch (e) { showMsg('error', 'AI estimate failed.'); }
    finally { setEstimating(false); }
  }, [textInput]);

  // ── Photo ─────────────────────────────────────────────────────────────────
  const handlePhotoChange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setPhotoFile(file); setEstimate(null);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handlePhotoEstimate = useCallback(async () => {
    if (!photoFile) return;
    setAnalyzingPhoto(true); setEstimate(null);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader(); r.onload = () => resolve(r.result.split(',')[1]); r.onerror = reject; r.readAsDataURL(photoFile);
      });
      const result = await callClaude([{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: photoFile.type || 'image/jpeg', data: base64 } },
        { type: 'text', text: 'Estimate the calories and macros for the food shown in this photo.' },
      ]}]);
      setEstimate({ ...result, source: 'photo' });
    } catch (e) { showMsg('error', `Photo analysis failed: ${e.message}`); }
    finally { setAnalyzingPhoto(false); }
  }, [photoFile]);

  // ── Save to sheet ─────────────────────────────────────────────────────────
  const handleSave = useCallback(async (override) => {
    const toSave = override || estimate;
    if (!toSave) return;
    setSaving(true);
    try {
      await appendFoodEntry(accessToken, { date: today, time: nowTimeStr(), description: toSave.description, calories: toSave.calories, protein: toSave.protein, carbs: toSave.carbs, fat: toSave.fat, source: toSave.source || mode });
      setEstimate(null); setTextInput(''); setPhotoFile(null); setPhotoPreview(null);
      showMsg('success', 'Logged!');
      await loadEntries();
    } catch (e) { showMsg('error', `Save failed: ${e.message}`); }
    finally { setSaving(false); }
  }, [estimate, accessToken, today, mode, loadEntries]);

  // ── Builder log ───────────────────────────────────────────────────────────
  const handleBuilderLog = useCallback(async (meal) => {
    setSaving(true);
    try {
      await appendFoodEntry(accessToken, { date: today, time: nowTimeStr(), ...meal });
      showMsg('success', 'Meal logged!');
      await loadEntries();
    } catch (e) { showMsg('error', `Save failed: ${e.message}`); }
    finally { setSaving(false); }
  }, [accessToken, today, loadEntries]);

  // ── Save as recipe ────────────────────────────────────────────────────────
  const handleSaveRecipe = useCallback((meal) => {
    setPendingSave(meal);
    setSaveMealName(meal.name || '');
    setSaveModalOpen(true);
  }, []);

  const handleConfirmSaveRecipe = useCallback(async () => {
    if (!pendingSave || !saveMealName.trim()) return;
    setSavingMeal(true);
    try {
      await saveMeal(accessToken, { name: saveMealName.trim(), calories: pendingSave.calories, protein: pendingSave.protein, carbs: pendingSave.carbs, fat: pendingSave.fat });
      setSaveModalOpen(false); setSaveMealName(''); setPendingSave(null);
      showMsg('success', 'Recipe saved!');
    } catch (e) { showMsg('error', `Failed to save: ${e.message}`); }
    finally { setSavingMeal(false); }
  }, [pendingSave, saveMealName, accessToken]);

  // ── Delete entry ──────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (entry) => {
    console.log('Delete entry:', JSON.stringify(entry));
    try { await deleteFoodEntry(accessToken, entry.sheetRow); await loadEntries(); }
    catch (e) { showMsg('error', 'Delete failed.'); }
  }, [accessToken, loadEntries]);

  // ── Edit entry ────────────────────────────────────────────────────────────
  const startEdit = (idx, entry) => {
    setEditingEntry(entry.sheetRow);
    setEditFields({ description: entry.description, calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat });
  };

  const handleEditSave = useCallback(async () => {
    if (editingEntry === null) return;
    setSaving(true);
    try {
      // Delete old row and append updated one
      await deleteFoodEntry(accessToken, editingEntry);
      const orig = entries.find(e => e.sheetRow === editingEntry);
      await appendFoodEntry(accessToken, { date: orig.date, time: orig.time, description: editFields.description, calories: toNum(editFields.calories), protein: toNum(editFields.protein), carbs: toNum(editFields.carbs), fat: toNum(editFields.fat), source: orig.source || 'edit' });
      setEditingEntry(null);
      showMsg('success', 'Updated!');
      await loadEntries();
    } catch (e) { showMsg('error', `Update failed: ${e.message}`); }
    finally { setSaving(false); }
  }, [editingEntry, editFields, accessToken, entries, loadEntries]);

  // ── Macro pill ────────────────────────────────────────────────────────────
  const MacroPill = ({ label, value, color }) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );

  const ModeBtn = ({ id, icon, label }) => (
    <button className={`nav-btn${mode === id ? ' active' : ''}`} onClick={() => { setMode(id); setEstimate(null); }} style={{ flex: 1, padding: '10px 4px', fontSize: 12 }}>
      {icon} {label}
    </button>
  );

  // ── Estimate card ─────────────────────────────────────────────────────────
  const EstimateCard = ({ est }) => (
    <div style={{ marginTop: 14, padding: 14, background: 'var(--bg3)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 15 }}>{est.description}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
        <MacroPill label="Calories" value={est.calories}                   color="var(--accent)" />
        <MacroPill label="Protein"  value={`${Math.round(est.protein)}g`}  color="var(--green)"  />
        <MacroPill label="Carbs"    value={`${Math.round(est.carbs)}g`}    color="var(--blue)"   />
        <MacroPill label="Fat"      value={`${Math.round(est.fat)}g`}      color="var(--text2)"  />
      </div>
      <button className="sync-btn" onClick={() => handleSave(est)} disabled={saving} style={{ width: '100%', padding: 12, fontSize: 14 }}>
        {saving ? 'Saving...' : '+ Log This Meal'}
      </button>
      <button onClick={() => handleSaveRecipe(est)} style={{ width: '100%', marginTop: 8, padding: '10px', fontSize: 13, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text2)', cursor: 'pointer' }}>
        ⭐ Save as Meal
      </button>
    </div>
  );

  return (
    <>
      <div className="section-header">
        <span className="section-title">FOOD LOG</span>
        <span className="section-sub">{today}</span>
      </div>

      {/* Daily summary */}
      <div className="stat-grid" style={{ marginBottom: 20, gridTemplateColumns: 'repeat(2,1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Calories In</div>
          <div className="stat-value accent">{totals.calories.toLocaleString()}</div>
          <div className="stat-sub">{tdee ? `TDEE: ${tdee.toLocaleString()} kcal` : 'TDEE loading...'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Net vs TDEE</div>
          <div className="stat-value" style={{ color: netColor }}>{net === null ? '--' : `${net > 0 ? '+' : ''}${net.toLocaleString()}`}</div>
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

      {msg && <div className={`sync-banner ${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

      {/* Mode selector */}
      <div className="chart-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <ModeBtn id="build" icon="🧺" label="Build" />
          <ModeBtn id="ai"    icon="🤖" label="AI" />
          <ModeBtn id="photo" icon="📷" label="Photo" />
          <ModeBtn id="saved" icon="⭐" label="Saved" />
        </div>

        {/* Build mode */}
        {mode === 'build' && (
          <MealBuilder accessToken={accessToken} onLog={handleBuilderLog} onSaveRecipe={handleSaveRecipe} />
        )}

        {/* AI mode */}
        {mode === 'ai' && (
          <>
            <textarea value={textInput} onChange={e => setTextInput(e.target.value)} placeholder="Describe your meal... e.g. 'grilled chicken breast, 1 cup white rice, side salad'" rows={3}
              style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-body)', padding: '10px 12px', resize: 'none', boxSizing: 'border-box' }} />
            <button className="sync-btn" onClick={handleTextEstimate} disabled={estimating || !textInput.trim()} style={{ width: '100%', marginTop: 10, padding: 12, fontSize: 14 }}>
              {estimating ? 'Estimating...' : 'Estimate Calories'}
            </button>
            {estimate && <EstimateCard est={estimate} />}
          </>
        )}

        {/* Photo mode */}
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
                  <button className="logout-btn" onClick={() => { setPhotoFile(null); setPhotoPreview(null); setEstimate(null); }} style={{ padding: '12px 16px' }}>Retake</button>
                </div>
                {estimate && <EstimateCard est={estimate} />}
              </>
            ) : (
              <button className="sync-btn" onClick={() => photoInputRef.current?.click()} style={{ width: '100%', padding: 14, fontSize: 15 }}>📷 Take a Photo of Your Meal</button>
            )}
          </>
        )}

        {/* Saved mode */}
        {mode === 'saved' && (
          <div>
            {loadingSaved ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>Loading...</div>
            ) : savedMeals.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No saved meals yet.</div>
            ) : savedMeals.map((meal, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3 }}>{meal.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: 'var(--accent)' }}>{meal.calories} cal</span> · P:{meal.protein}g · C:{meal.carbs}g · F:{meal.fat}g
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="sync-btn" onClick={() => handleSave({ ...meal, description: meal.name, source: 'saved' })} style={{ padding: '6px 12px', fontSize: 12 }}>Log</button>
                  <button onClick={() => { deleteSavedMeal(accessToken, meal.rowIndex); setSavedMeals(prev => prev.filter((_, j) => j !== i)); }} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, padding: '4px 8px' }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save recipe modal */}
      {saveModalOpen && (
        <div className="chart-card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>Save as meal:</div>
          <input type="text" value={saveMealName} onChange={e => setSaveMealName(e.target.value)} placeholder="Meal name" autoFocus
            style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 14, padding: '10px 12px', boxSizing: 'border-box', marginBottom: 8 }}
            onKeyDown={e => { if (e.key === 'Enter') handleConfirmSaveRecipe(); if (e.key === 'Escape') setSaveModalOpen(false); }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="sync-btn" onClick={handleConfirmSaveRecipe} disabled={savingMeal || !saveMealName.trim()} style={{ flex: 1, padding: 12 }}>{savingMeal ? 'Saving...' : 'Save'}</button>
            <button className="logout-btn" onClick={() => setSaveModalOpen(false)} style={{ flex: 1, padding: 12 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Today's log */}
      <div className="chart-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text2)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Today's Entries
        </div>
        {loadingEntries ? (
          <div style={{ padding: 20, color: 'var(--text2)', fontSize: 13, textAlign: 'center' }}>Loading...</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>No entries yet today</div>
        ) : entries.map((e, i) => (
          <div key={i}>
            {editingEntry === e.sheetRow ? (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
                <input value={editFields.description} onChange={ev => setEditFields(f => ({ ...f, description: ev.target.value }))}
                  style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--text)', fontSize: 13, padding: '6px 10px', boxSizing: 'border-box', marginBottom: 8 }} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 8 }}>
                  {[['calories','Cal'],['protein','Pro'],['carbs','Carb'],['fat','Fat']].map(([k, label]) => (
                    <div key={k}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>{label}</div>
                      <input type="number" value={editFields[k]} onChange={ev => setEditFields(f => ({ ...f, [k]: ev.target.value }))}
                        style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12, padding: '5px', fontFamily: 'var(--font-mono)', textAlign: 'right', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="sync-btn" onClick={handleEditSave} disabled={saving} style={{ flex: 1, padding: 8, fontSize: 12 }}>{saving ? '...' : 'Save'}</button>
                  <button className="logout-btn" onClick={() => setEditingEntry(null)} style={{ flex: 1, padding: 8, fontSize: 12 }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
                    {e.time} · <span style={{ color: 'var(--accent)' }}>{e.calories} cal</span> · P:{e.protein}g · C:{e.carbs}g · F:{e.fat}g
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => startEdit(e.sheetRow, e)} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, padding: '4px 6px' }}>✏️</button>
                  <button onClick={() => handleDelete(e)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, padding: '4px 6px' }}>✕</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}