export type ActivitySample = {
  id: string;
  name: string;
  type: string;
  startDate: string;
  distanceM: number;
  movingTimeS: number;
  averageHeartrate: number | null;
};

export type DailyActivityFact = {
  date: string; // YYYY-MM-DD UTC
  runCount: number;
  runDistanceKm: number;
  longRunCount: number;
  totalMovingMinutes: number;
  crossTrainingMinutes: number;
  loadScore: number;
  avgRunPaceSecPerKm: number | null;
};

export type TrainingLoadPoint = {
  date: string; // YYYY-MM-DD UTC
  acuteLoad7: number;
  chronicLoad42: number;
  monotony7: number;
  strain7: number;
  loadRatio: number;
  readinessScore: number;
  readinessConfidence: number;
  missingData: boolean;
};

function toDateKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function isRun(type: string) {
  return type.toLowerCase() === "run";
}

function activityWeight(type: string) {
  const normalized = type.toLowerCase();
  if (normalized === "run") return 1.0;
  if (normalized.includes("ride")) return 0.72;
  if (normalized.includes("swim")) return 0.78;
  if (normalized.includes("walk") || normalized.includes("hike")) return 0.45;
  if (normalized.includes("workout") || normalized.includes("strength")) return 0.6;
  if (normalized.includes("yoga")) return 0.35;
  return 0.5;
}

function round(value: number, digits = 2) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function stddev(values: number[]) {
  if (!values.length) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function activityLoadScore(activity: ActivitySample) {
  const minutes = activity.movingTimeS / 60;
  const km = activity.distanceM / 1000;
  const base = minutes * activityWeight(activity.type);
  const runDistanceBonus = isRun(activity.type) ? km * 0.8 : 0;
  return base + runDistanceBonus;
}

export function aggregateDailyFacts(activities: ActivitySample[]): DailyActivityFact[] {
  const map = new Map<string, DailyActivityFact & { runPaceAccumulator: number; runPaceCount: number }>();

  for (const activity of activities) {
    const date = toDateKey(activity.startDate);
    const existing = map.get(date) ?? {
      date,
      runCount: 0,
      runDistanceKm: 0,
      longRunCount: 0,
      totalMovingMinutes: 0,
      crossTrainingMinutes: 0,
      loadScore: 0,
      avgRunPaceSecPerKm: null,
      runPaceAccumulator: 0,
      runPaceCount: 0,
    };

    const movingMinutes = activity.movingTimeS / 60;
    const distanceKm = activity.distanceM / 1000;
    existing.totalMovingMinutes += movingMinutes;
    existing.loadScore += activityLoadScore(activity);

    if (isRun(activity.type)) {
      existing.runCount += 1;
      existing.runDistanceKm += distanceKm;
      if (distanceKm >= 25) existing.longRunCount += 1;
      if (activity.distanceM > 0 && activity.movingTimeS > 0) {
        existing.runPaceAccumulator += activity.movingTimeS / distanceKm;
        existing.runPaceCount += 1;
      }
    } else {
      existing.crossTrainingMinutes += movingMinutes;
    }

    map.set(date, existing);
  }

  return Array.from(map.values())
    .map((row) => ({
      date: row.date,
      runCount: row.runCount,
      runDistanceKm: round(row.runDistanceKm),
      longRunCount: row.longRunCount,
      totalMovingMinutes: round(row.totalMovingMinutes),
      crossTrainingMinutes: round(row.crossTrainingMinutes),
      loadScore: round(row.loadScore, 3),
      avgRunPaceSecPerKm: row.runPaceCount > 0 ? Math.round(row.runPaceAccumulator / row.runPaceCount) : null,
    }))
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
}

function dateRangeInclusive(startDate: string, endDate: string) {
  const out: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (+cursor <= +end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function computeReadiness(params: {
  acuteLoad7: number;
  chronicLoad42: number;
  monotony7: number;
  runCount7: number;
  historyDays: number;
}) {
  const { acuteLoad7, chronicLoad42, monotony7, runCount7, historyDays } = params;
  const acuteDaily = acuteLoad7 / 7;
  const baseline = Math.max(chronicLoad42, 0.01);
  const loadRatio = acuteDaily / baseline;

  let score = 74;
  if (loadRatio > 1.3) score -= 18;
  else if (loadRatio > 1.15) score -= 10;
  else if (loadRatio < 0.7) score -= 7;

  if (monotony7 > 2.0) score -= 12;
  else if (monotony7 > 1.7) score -= 6;

  if (runCount7 <= 1) score -= 8;
  if (runCount7 >= 5 && loadRatio >= 0.85 && loadRatio <= 1.1) score += 6;
  if (historyDays < 21) score -= 4;

  score = Math.max(5, Math.min(98, score));
  const confidence = Math.max(35, Math.min(98, historyDays * 1.8));

  return {
    readinessScore: round(score, 1),
    readinessConfidence: round(confidence, 1),
    loadRatio: round(loadRatio, 4),
  };
}

export function computeTrainingLoad(dailyFacts: DailyActivityFact[]): TrainingLoadPoint[] {
  if (!dailyFacts.length) return [];

  const byDate = new Map(dailyFacts.map((row) => [row.date, row]));
  const allDates = dateRangeInclusive(dailyFacts[0].date, dailyFacts[dailyFacts.length - 1].date);

  const series = allDates.map((date) => ({
    date,
    loadScore: byDate.get(date)?.loadScore ?? 0,
    runCount: byDate.get(date)?.runCount ?? 0,
  }));

  return series.map((_, idx) => {
    const window7 = series.slice(Math.max(0, idx - 6), idx + 1);
    const window42 = series.slice(Math.max(0, idx - 41), idx + 1);

    const acuteLoad7 = window7.reduce((sum, day) => sum + day.loadScore, 0);
    const chronicLoad42 = window42.reduce((sum, day) => sum + day.loadScore, 0) / Math.max(1, window42.length);
    const monotony7 = stddev(window7.map((d) => d.loadScore)) > 0.01
      ? (acuteLoad7 / Math.max(1, window7.length)) / stddev(window7.map((d) => d.loadScore))
      : 0;
    const strain7 = acuteLoad7 * monotony7;
    const runCount7 = window7.reduce((sum, day) => sum + day.runCount, 0);

    const readiness = computeReadiness({
      acuteLoad7,
      chronicLoad42,
      monotony7,
      runCount7,
      historyDays: idx + 1,
    });

    return {
      date: series[idx].date,
      acuteLoad7: round(acuteLoad7, 3),
      chronicLoad42: round(chronicLoad42, 3),
      monotony7: round(monotony7, 3),
      strain7: round(strain7, 3),
      loadRatio: readiness.loadRatio,
      readinessScore: readiness.readinessScore,
      readinessConfidence: readiness.readinessConfidence,
      missingData: idx + 1 < 14,
    };
  });
}

export function readinessStatus(score: number) {
  if (score >= 78) return "high";
  if (score >= 62) return "moderate";
  return "caution";
}
