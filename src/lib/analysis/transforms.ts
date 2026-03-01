// Shared types and math utilities for analysis pages.

export type DailyMetricRow = {
  metric_date: string;
  resting_hr: number | null;
  hrv: number | null;
  hrv_status: string | null;
  stress_avg: number | null;
  stress_high_min: number | null;
  body_battery_avg: number | null;
  body_battery_min: number | null;
  body_battery_max: number | null;
  bb_charged: number | null;
  bb_drained: number | null;
  steps: number | null;
  intensity_minutes: number | null;
  training_readiness: number | null;
  respiration_avg: number | null;
  spo2_avg: number | null;
  vo2_max: number | null;
  calories_total: number | null;
  resting_hr_7d_avg: number | null;
};

export type SleepRow = {
  sleep_date: string;
  total_sleep_min: number | null;
  sleep_score: number | null;
  sleep_quality: string | null;
  readiness_score: number | null;
  rem_sleep_min: number | null;
  deep_sleep_min: number | null;
  resting_hr: number | null;
  hrv: number | null;
};

// ---------------------------------------------------------------------------
// Math utilities
// ---------------------------------------------------------------------------

export function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

export function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: 0 };
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    num += dx * (ys[i] - meanY);
    den += dx * dx;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}
