// Pure transform functions for the Wellness Intelligence analysis page.
// All functions are stateless and operate on typed row arrays fetched from Supabase.

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
// Metric definitions
// ---------------------------------------------------------------------------

export type MetricKey =
  | "resting_hr"
  | "hrv"
  | "stress_avg"
  | "body_battery_avg"
  | "total_sleep_min"
  | "steps"
  | "training_readiness"
  | "intensity_minutes"
  | "bb_charged"
  | "bb_drained"
  | "respiration_avg"
  | "spo2_avg";

export const METRIC_LABELS: Record<MetricKey, string> = {
  resting_hr: "Resting HR",
  hrv: "HRV",
  stress_avg: "Stress",
  body_battery_avg: "Body Battery",
  total_sleep_min: "Sleep (min)",
  steps: "Steps",
  training_readiness: "Training Readiness",
  intensity_minutes: "Intensity Min",
  bb_charged: "BB Charged",
  bb_drained: "BB Drained",
  respiration_avg: "Respiration",
  spo2_avg: "SpO2",
};

export const HEATMAP_METRICS: MetricKey[] = [
  "resting_hr",
  "hrv",
  "stress_avg",
  "body_battery_avg",
  "total_sleep_min",
  "steps",
];

export const CORRELATION_METRICS: MetricKey[] = [
  "resting_hr",
  "hrv",
  "stress_avg",
  "body_battery_avg",
  "total_sleep_min",
  "steps",
  "intensity_minutes",
  "training_readiness",
  "bb_charged",
  "bb_drained",
  "respiration_avg",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoWeek(dateStr: string): { year: number; week: number } {
  const d = new Date(dateStr + "T00:00:00Z");
  // ISO week: Monday-based, week 1 contains Jan 4
  const dayOfWeek = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek); // Thursday of the week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((+d - +yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function getMetricValue(
  row: DailyMetricRow,
  sleepByDate: Map<string, SleepRow>,
  key: MetricKey,
): number | null {
  if (key === "total_sleep_min") {
    return sleepByDate.get(row.metric_date)?.total_sleep_min ?? null;
  }
  return (row as Record<string, unknown>)[key] as number | null;
}

function buildSleepMap(sleep: SleepRow[]): Map<string, SleepRow> {
  const map = new Map<string, SleepRow>();
  for (const s of sleep) map.set(s.sleep_date, s);
  return map;
}

// ---------------------------------------------------------------------------
// Section A: Seasonal Rhythm
// ---------------------------------------------------------------------------

export type HeatmapCell = {
  year: number;
  week: number;
  value: number | null;
  dateRange: string;
  count: number;
};

export function toSeasonalHeatmap(
  metrics: DailyMetricRow[],
  sleep: SleepRow[],
  metricKey: MetricKey,
): HeatmapCell[] {
  const sleepMap = buildSleepMap(sleep);
  const buckets = new Map<string, { sum: number; count: number; minDate: string; maxDate: string }>();

  for (const row of metrics) {
    const val = getMetricValue(row, sleepMap, metricKey);
    if (val == null) continue;
    const { year, week } = isoWeek(row.metric_date);
    const key = `${year}-${week}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.sum += val;
      existing.count += 1;
      if (row.metric_date < existing.minDate) existing.minDate = row.metric_date;
      if (row.metric_date > existing.maxDate) existing.maxDate = row.metric_date;
    } else {
      buckets.set(key, { sum: val, count: 1, minDate: row.metric_date, maxDate: row.metric_date });
    }
  }

  const cells: HeatmapCell[] = [];
  for (const [key, bucket] of buckets) {
    const [yearStr, weekStr] = key.split("-");
    cells.push({
      year: Number(yearStr),
      week: Number(weekStr),
      value: Math.round((bucket.sum / bucket.count) * 10) / 10,
      dateRange: bucket.minDate === bucket.maxDate
        ? bucket.minDate
        : `${bucket.minDate} – ${bucket.maxDate}`,
      count: bucket.count,
    });
  }
  return cells;
}

export type ContinuousTrendPoint = {
  date: string; // "YYYY-WW"
  label: string; // "Jan '24"
  value: number | null;
  rolling: number | null;
};

export function toContinuousTrend(
  metrics: DailyMetricRow[],
  sleep: SleepRow[],
  metricKey: MetricKey,
  rollingWindowWeeks: number = 8,
): ContinuousTrendPoint[] {
  const sleepMap = buildSleepMap(sleep);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Bucket by ISO week → average
  const buckets = new Map<string, { sum: number; count: number; firstDate: string }>();

  for (const row of metrics) {
    const val = getMetricValue(row, sleepMap, metricKey);
    if (val == null) continue;
    const { year, week } = isoWeek(row.metric_date);
    const key = `${year}-${String(week).padStart(2, "0")}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.sum += val;
      existing.count += 1;
      if (row.metric_date < existing.firstDate) existing.firstDate = row.metric_date;
    } else {
      buckets.set(key, { sum: val, count: 1, firstDate: row.metric_date });
    }
  }

  // Sort by week key and build the series
  const sorted = Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b));

  const points: ContinuousTrendPoint[] = sorted.map(([key, bucket]) => {
    const d = new Date(bucket.firstDate);
    return {
      date: key,
      label: `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`,
      value: Math.round((bucket.sum / bucket.count) * 10) / 10,
      rolling: null,
    };
  });

  // Compute rolling average
  for (let i = 0; i < points.length; i++) {
    const windowStart = Math.max(0, i - rollingWindowWeeks + 1);
    const window = points.slice(windowStart, i + 1).filter((p) => p.value != null);
    if (window.length >= 3) {
      points[i].rolling =
        Math.round((window.reduce((s, p) => s + p.value!, 0) / window.length) * 10) / 10;
    }
  }

  return points;
}

// ---------------------------------------------------------------------------
// Section B: Training Cost
// ---------------------------------------------------------------------------

export type WeeklyTrainingWellness = {
  week: string; // "YYYY-WW"
  weekLabel: string; // "Jan '24"
  weeklyLoadScore: number;
  restingHrAvg: number | null;
  hrvAvg: number | null;
  bodyBatteryAvg: number | null;
  sleepAvg: number | null;
};

export function toWeeklyTrainingWellness(
  dailyLoadFacts: { date: string; loadScore: number }[],
  metrics: DailyMetricRow[],
  sleep: SleepRow[],
): WeeklyTrainingWellness[] {
  const sleepMap = buildSleepMap(sleep);

  // Build a map of date → combined data
  type DayData = {
    loadScore: number;
    restingHr: number | null;
    hrv: number | null;
    bodyBattery: number | null;
    sleepMin: number | null;
  };

  const dayMap = new Map<string, DayData>();

  // Seed from load facts
  for (const lf of dailyLoadFacts) {
    dayMap.set(lf.date, {
      loadScore: lf.loadScore,
      restingHr: null,
      hrv: null,
      bodyBattery: null,
      sleepMin: null,
    });
  }

  // Overlay wellness metrics
  for (const m of metrics) {
    const existing = dayMap.get(m.metric_date);
    if (existing) {
      existing.restingHr = m.resting_hr;
      existing.hrv = m.hrv;
      existing.bodyBattery = m.body_battery_avg;
      existing.sleepMin = sleepMap.get(m.metric_date)?.total_sleep_min ?? null;
    } else {
      dayMap.set(m.metric_date, {
        loadScore: 0,
        restingHr: m.resting_hr,
        hrv: m.hrv,
        bodyBattery: m.body_battery_avg,
        sleepMin: sleepMap.get(m.metric_date)?.total_sleep_min ?? null,
      });
    }
  }

  // Also add sleep-only days
  for (const s of sleep) {
    if (!dayMap.has(s.sleep_date)) {
      dayMap.set(s.sleep_date, {
        loadScore: 0,
        restingHr: null,
        hrv: null,
        bodyBattery: null,
        sleepMin: s.total_sleep_min,
      });
    }
  }

  // Aggregate by ISO week
  const weekBuckets = new Map<
    string,
    {
      load: number;
      hr: number[];
      hrv: number[];
      bb: number[];
      sleep: number[];
      firstDate: string;
    }
  >();

  for (const [date, day] of dayMap) {
    const { year, week } = isoWeek(date);
    const key = `${year}-${String(week).padStart(2, "0")}`;
    const existing = weekBuckets.get(key);
    if (existing) {
      existing.load += day.loadScore;
      if (day.restingHr != null) existing.hr.push(day.restingHr);
      if (day.hrv != null) existing.hrv.push(day.hrv);
      if (day.bodyBattery != null) existing.bb.push(day.bodyBattery);
      if (day.sleepMin != null) existing.sleep.push(day.sleepMin);
      if (date < existing.firstDate) existing.firstDate = date;
    } else {
      weekBuckets.set(key, {
        load: day.loadScore,
        hr: day.restingHr != null ? [day.restingHr] : [],
        hrv: day.hrv != null ? [day.hrv] : [],
        bb: day.bodyBattery != null ? [day.bodyBattery] : [],
        sleep: day.sleepMin != null ? [day.sleepMin] : [],
        firstDate: date,
      });
    }
  }

  const avg = (arr: number[]) => (arr.length ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10 : null);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return Array.from(weekBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, b]) => {
      const d = new Date(b.firstDate);
      return {
        week: key,
        weekLabel: `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`,
        weeklyLoadScore: Math.round(b.load * 10) / 10,
        restingHrAvg: avg(b.hr),
        hrvAvg: avg(b.hrv),
        bodyBatteryAvg: avg(b.bb),
        sleepAvg: avg(b.sleep),
      };
    });
}

export type RecoveryEvent = {
  loadSpikePct: number;
  recoveryDays: number;
  year: number;
  weekLabel: string;
};

export function toRecoveryEvents(
  weeklyData: WeeklyTrainingWellness[],
): RecoveryEvent[] {
  if (weeklyData.length < 6) return [];

  const events: RecoveryEvent[] = [];

  for (let i = 3; i < weeklyData.length - 2; i++) {
    const trailing = weeklyData.slice(Math.max(0, i - 3), i);
    const trailingAvg = trailing.reduce((s, w) => s + w.weeklyLoadScore, 0) / trailing.length;
    if (trailingAvg < 1) continue;

    const current = weeklyData[i];
    const spikePct = ((current.weeklyLoadScore - trailingAvg) / trailingAvg) * 100;

    // Only consider spikes > 15%
    if (spikePct < 15) continue;

    // Try body battery first (better coverage), fall back to resting HR
    const preBB = trailing.filter((w) => w.bodyBatteryAvg != null).map((w) => w.bodyBatteryAvg!);
    const preHr = trailing.filter((w) => w.restingHrAvg != null).map((w) => w.restingHrAvg!);

    let recoveryWeeks = 0;

    if (preBB.length >= 1) {
      // Body battery recovery: how long until it returns to baseline
      const baselineBB = preBB.reduce((s, v) => s + v, 0) / preBB.length;
      for (let j = i + 1; j < Math.min(i + 6, weeklyData.length); j++) {
        recoveryWeeks++;
        if (weeklyData[j].bodyBatteryAvg != null && weeklyData[j].bodyBatteryAvg! >= baselineBB - 2) {
          break;
        }
      }
    } else if (preHr.length >= 1) {
      // Resting HR recovery: how long until it returns to baseline
      const baselineHr = preHr.reduce((s, v) => s + v, 0) / preHr.length;
      for (let j = i + 1; j < Math.min(i + 6, weeklyData.length); j++) {
        recoveryWeeks++;
        if (weeklyData[j].restingHrAvg != null && weeklyData[j].restingHrAvg! <= baselineHr + 1) {
          break;
        }
      }
    } else {
      continue; // No recovery signal available
    }

    if (recoveryWeeks === 0) continue;

    const yearMatch = current.week.match(/^(\d{4})/);
    events.push({
      loadSpikePct: Math.round(spikePct),
      recoveryDays: recoveryWeeks * 7,
      year: yearMatch ? Number(yearMatch[1]) : 0,
      weekLabel: current.weekLabel,
    });
  }

  return events;
}

// ---------------------------------------------------------------------------
// Section C: Correlations
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

export type CorrelationCell = {
  fieldA: MetricKey;
  fieldB: MetricKey;
  r: number;
  n: number;
};

export function computeCorrelationMatrix(
  metrics: DailyMetricRow[],
  sleep: SleepRow[],
  fields: MetricKey[] = CORRELATION_METRICS,
): CorrelationCell[] {
  const sleepMap = buildSleepMap(sleep);
  const cells: CorrelationCell[] = [];

  for (let i = 0; i < fields.length; i++) {
    for (let j = i; j < fields.length; j++) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const row of metrics) {
        const x = getMetricValue(row, sleepMap, fields[i]);
        const y = getMetricValue(row, sleepMap, fields[j]);
        if (x != null && y != null) {
          xs.push(x);
          ys.push(y);
        }
      }
      const r = i === j ? 1 : pearsonR(xs, ys);
      cells.push({ fieldA: fields[i], fieldB: fields[j], r: Math.round(r * 100) / 100, n: xs.length });
      if (i !== j) {
        cells.push({ fieldA: fields[j], fieldB: fields[i], r: Math.round(r * 100) / 100, n: xs.length });
      }
    }
  }

  return cells;
}

export type ScatterPoint = {
  x: number;
  y: number;
  year: number;
  date: string;
};

export function computeScatterPair(
  metrics: DailyMetricRow[],
  sleep: SleepRow[],
  fieldA: MetricKey,
  fieldB: MetricKey,
): ScatterPoint[] {
  const sleepMap = buildSleepMap(sleep);
  const points: ScatterPoint[] = [];

  for (const row of metrics) {
    const x = getMetricValue(row, sleepMap, fieldA);
    const y = getMetricValue(row, sleepMap, fieldB);
    if (x != null && y != null) {
      points.push({
        x,
        y,
        year: new Date(row.metric_date).getUTCFullYear(),
        date: row.metric_date,
      });
    }
  }

  return points;
}

export type ThresholdSplit = {
  fieldA: MetricKey;
  fieldB: MetricKey;
  threshold: number;
  belowAvg: number;
  belowCount: number;
  aboveAvg: number;
  aboveCount: number;
};

export function computeThresholdSplit(
  metrics: DailyMetricRow[],
  sleep: SleepRow[],
  fieldA: MetricKey,
  fieldB: MetricKey,
  threshold: number,
): ThresholdSplit {
  const sleepMap = buildSleepMap(sleep);
  const below: number[] = [];
  const above: number[] = [];

  for (const row of metrics) {
    const a = getMetricValue(row, sleepMap, fieldA);
    const b = getMetricValue(row, sleepMap, fieldB);
    if (a == null || b == null) continue;
    if (a < threshold) below.push(b);
    else above.push(b);
  }

  const avg = (arr: number[]) => arr.length ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10 : 0;

  return {
    fieldA,
    fieldB,
    threshold,
    belowAvg: avg(below),
    belowCount: below.length,
    aboveAvg: avg(above),
    aboveCount: above.length,
  };
}

export function findTopCorrelations(
  cells: CorrelationCell[],
  topN: number = 4,
): CorrelationCell[] {
  // Filter to unique pairs (fieldA < fieldB alphabetically) and non-diagonal
  const seen = new Set<string>();
  const unique: CorrelationCell[] = [];

  for (const cell of cells) {
    if (cell.fieldA === cell.fieldB) continue;
    const key = [cell.fieldA, cell.fieldB].sort().join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(cell);
  }

  return unique
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    .slice(0, topN);
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

// Compute the median of a metric for use as a threshold split point
export function computeMedian(
  metrics: DailyMetricRow[],
  sleep: SleepRow[],
  key: MetricKey,
): number {
  const sleepMap = buildSleepMap(sleep);
  const values: number[] = [];
  for (const row of metrics) {
    const v = getMetricValue(row, sleepMap, key);
    if (v != null) values.push(v);
  }
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}
