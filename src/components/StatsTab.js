import { useState } from 'react';
import WeightTab from './WeightTab';
import CaloriesTab from './CaloriesTab';

export default function StatsTab({ data }) {
  const [sub, setSub] = useState('weight');
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          className={`nav-btn${sub === 'weight' ? ' active' : ''}`}
          onClick={() => setSub('weight')}
          style={{ flex: 1, padding: '10px' }}
        >
          ⚖️ Weight
        </button>
        <button
          className={`nav-btn${sub === 'calories' ? ' active' : ''}`}
          onClick={() => setSub('calories')}
          style={{ flex: 1, padding: '10px' }}
        >
          🔥 Calories
        </button>
      </div>
      {sub === 'weight'   && <WeightTab data={data} />}
      {sub === 'calories' && <CaloriesTab data={data} />}
    </>
  );
}