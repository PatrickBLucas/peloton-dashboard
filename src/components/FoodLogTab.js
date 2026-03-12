// src/components/FoodLogTab.js
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

export default function FoodLogTab({ data, accessToken }) {
  const { stats } = data;
  const tdee = stats?.tdee ?? null;

  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [input, setInput] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState(null); // { description, calories, protein, carbs, fat }
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [barcodeMode, setBarcodeMode] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const textareaRef = useRef(null);

  const today = todayStr();

  // Load today's entries
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

  // Today's totals
  const totals = useMemo(() => ({
    calories: entries.reduce((s, e) => s + (e.calories || 0), 0),
    protein:  entries.reduce((s, e) => s + (e.protein  || 0), 0),
    carbs:    entries.reduce((s, e) => s + (e.carbs    || 0), 0),
    fat:      entries.reduce((s, e) => s + (e.fat      || 0), 0),
  }), [entries]);

  const netCalories = tdee ? totals.calories - tdee : null;

  // AI estimate via Claude API
  const handleEstimate = useCallback(async () => {
    if (!input.trim()) return;
    setEstimating(true);
    setEstimate(null);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 300,
          system: `You are a nutrition estimator. Given a meal description, return ONLY a JSON object with these fields:
{
  "description": "clean short name for the meal",
  "calories": number,
  "protein": number (grams),
  "carbs": number (grams),
  "fat": number (grams)
}
No markdown, no explanation, just the JSON object. Use reasonable average estimates for home-cooked meals.`,
          messages: [{ role: 'user', content: input.trim() }],
        }),
      });
      const json = await res.json();
      const text = json.content?.[0]?.text || '';
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      setEstimate(parsed);
    } catch (e) {
      setSaveMsg({ type: 'error', text: 'AI estimate failed. Try again or enter manually.' });
    } finally {
      setEstimating(false);
    }
  }, [input]);

  // Barcode lookup via Open Food Facts
  const handleBarcodeLookup = useCallback(async () => {
    if (!barcodeInput.trim()) return;
    setLookingUp(true);
    setEstimate(null);
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcodeInput.trim()}.json`);
      const json = await res.json();
      if (json.status !== 1) {
        setSaveMsg({ type: 'error', text: 'Product not found. Try AI estimate instead.' });
        return;
      }
      const p = json.product;
      const n = p.nutriments || {};
      const serving = p.serving_size || '100g';
      const per100 = (field) => toNum(n[field + '_100g'] || n[field]);
      setEstimate({
        description: p.product_name || 'Scanned product',
        calories: Math.round(per100('energy-kcal') || per100('energy') / 4.184 || 0),
        protein:  Math.round(per100('proteins') || 0),
        carbs:    Math.round(per100('carbohydrates') || 0),
        fat:      Math.round(per100('fat') || 0),
        note:     `Per 100g. Serving: ${serving}`,
      });
      setBarcodeMode(false);
      setBarcodeInput('');
    } catch (e) {
      setSaveMsg({ type: 'error', text: 'Barcode lookup failed.' });
    } finally {
      setLookingUp(false);
    }
  }, [barcodeInput]);

  // Save to sheet
  const handleSave = useCallback(async (override) => {
    const toSave = override || estimate;
    if (!toSave) return;
    setSaving(true);
    try {
      await appendFoodEntry(accessToken, {
        date:        today,
        time:        nowTimeStr(),
        description: toSave.description,
        calories:    toSave.calories,
        protein:     toSave.protein,
        carbs:       toSave.carbs,
        fat:         toSave.fat,
        source:      toSave.source || (input ? 'AI' : 'barcode'),
      });
      setEstimate(null);
      setInput('');
      setSaveMsg({ type: 'success', text: 'Logged!' });
      setTimeout(() => setSaveMsg(null), 2000);
      await loadEntries();
    } catch (e) {
      setSaveMsg({ type: 'error', text: `Failed to save: ${e.message}` });
    } finally {
      setSaving(false);
    }
  }, [estimate, accessToken, today, input, loadEntries]);

  // Delete entry
  const handleDelete = useCallback(async (idx) => {
    try {
      await deleteFoodEntry(accessToken, idx);
      await loadEntries();
    } catch (e) {
      setSaveMsg({ type: 'error', text: 'Delete failed.' });
    }
  }, [accessToken, loadEntries]);

  const toNum = (v) => parseFloat(v) || 0;

  const netColor = netCalories === null ? 'var(--text)'
    : netCalories > 200  ? 'var(--red)'
    : netCalories < -200 ? 'var(--green)'
    : 'var(--accent)';

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
          <div className="stat-sub">
            {tdee ? `TDEE: ${tdee.toLocaleString()} kcal` : 'TDEE loading...'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Net vs TDEE</div>
          <div className="stat-value" style={{ color: netColor }}>
            {netCalories === null ? '--' : `${netCalories > 0 ? '+' : ''}${netCalories.toLocaleString()}`}
          </div>
          <div className="stat-sub">
            {netCalories === null ? '' : netCalories > 0 ? 'over TDEE' : netCalories < 0 ? 'under TDEE' : 'at TDEE'}
          </div>
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

      {saveMsg && (
        <div className={`sync-banner ${saveMsg.type}`} style={{ marginBottom: 16 }}>
          {saveMsg.text}
        </div>
      )}

      {/* Input area */}
      <div className="chart-card" style={{ marginBottom: 16 }}>
        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button
            className={`nav-btn${!barcodeMode ? ' active' : ''}`}
            onClick={() => { setBarcodeMode(false); setEstimate(null); }}
            style={{ flex: 1, padding: '10px' }}
          >
            🤖 AI Estimate
          </button>
          <button
            className={`nav-btn${barcodeMode ? ' active' : ''}`}
            onClick={() => { setBarcodeMode(true); setEstimate(null); }}
            style={{ flex: 1, padding: '10px' }}
          >
            📦 Barcode
          </button>
        </div>

        {!barcodeMode ? (
          <>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Describe your meal... e.g. 'grilled chicken breast, 1 cup white rice, side salad with olive oil'"
              rows={3}
              style={{
                width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 14,
                fontFamily: 'var(--font-body)', padding: '10px 12px', resize: 'none',
                boxSizing: 'border-box',
              }}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleEstimate(); }}
            />
            <button
              className="sync-btn"
              onClick={handleEstimate}
              disabled={estimating || !input.trim()}
              style={{ width: '100%', marginTop: 10, padding: '12px', fontSize: 14 }}
            >
              {estimating ? 'Estimating...' : 'Estimate Calories'}
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              inputMode="numeric"
              value={barcodeInput}
              onChange={e => setBarcodeInput(e.target.value)}
              placeholder="Enter or scan barcode number"
              style={{
                width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 16,
                fontFamily: 'var(--font-mono)', padding: '12px', boxSizing: 'border-box',
              }}
              onKeyDown={e => { if (e.key === 'Enter') handleBarcodeLookup(); }}
            />
            <button
              className="sync-btn"
              onClick={handleBarcodeLookup}
              disabled={lookingUp || !barcodeInput.trim()}
              style={{ width: '100%', marginTop: 10, padding: '12px', fontSize: 14 }}
            >
              {lookingUp ? 'Looking up...' : 'Look Up Barcode'}
            </button>
          </>
        )}

        {/* Estimate result */}
        {estimate && (
          <div style={{
            marginTop: 14, padding: 14, background: 'var(--bg3)',
            borderRadius: 'var(--radius)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>
              {estimate.description}
            </div>
            {estimate.note && (
              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>{estimate.note}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
              {[
                ['Calories', estimate.calories, 'var(--accent)'],
                ['Protein',  `${Math.round(estimate.protein)}g`,  'var(--green)'],
                ['Carbs',    `${Math.round(estimate.carbs)}g`,    'var(--blue)'],
                ['Fat',      `${Math.round(estimate.fat)}g`,      'var(--text2)'],
              ].map(([label, val, color]) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                </div>
              ))}
            </div>
            <button
              className="sync-btn"
              onClick={() => handleSave()}
              disabled={saving}
              style={{ width: '100%', padding: '12px', fontSize: 14 }}
            >
              {saving ? 'Saving...' : '+ Log This Meal'}
            </button>
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
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}