// src/utils.js
// Pure calculation utilities shared across components

import { differenceInDays, subDays, format, addDays } from 'date-fns';

/**
 * Projects the date when weight will reach goalWeight based on recent trend.
 * Uses linear regression over the most recent data points.
 *
 * @param {Array}  weightEntries  - Array of { date: Date, weight: number }
 * @param {number} goalWeight     - Target weight in lbs
 * @returns {Date|null}           - Projected goal date, or null if not computable
 */
export function projectGoalDate(weightEntries, goalWeight) {
  const validEntries = weightEntries.filter(w => w.weight);
  if (!validEntries.length) return null;

  // Try last 30 days first, fall back to 60 if not enough points
  const now = new Date();
  let entries = validEntries.filter(w => w.date >= subDays(now, 30)).sort((a, b) => a.date - b.date);
  if (entries.length < 5) {
    entries = validEntries.filter(w => w.date >= subDays(now, 60)).sort((a, b) => a.date - b.date);
  }
  if (entries.length < 5) return null;

  const startDate = entries[0].date;
  const points = entries.map(e => ({
    x: differenceInDays(e.date, startDate),
    y: e.weight,
  }));

  const n     = points.length;
  const sumX  = points.reduce((s, p) => s + p.x, 0);
  const sumY  = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  if (slope >= 0) return null;

  const daysToGoal = (goalWeight - intercept) / slope;
  const goalDate = addDays(startDate, Math.round(daysToGoal));
  if (goalDate < now) return null;

  return goalDate;
}