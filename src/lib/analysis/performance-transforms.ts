// Pure transform functions for the Performance Intelligence analysis page.
// Focused on training load → running performance relationships.

import { type DailyMetricRow, type SleepRow, pearsonR, linearRegression } from "./transforms";
import { type DailyActivityFact, type TrainingLoadPoint } from "@/lib/metrics/load";
import {
  type RunActivity,
  distanceBandLabel,
  paceSecPerKm,
  filterTrueMarathons,
  marathonBlockPatterns,
} from "@/lib/metrics/dashboard";

// ---------------------------------------------------------------------------
// Extended activity type for performance analysis
// ---------------------------------------------------------------------------

export type PerformanceActivity = RunActivity & {
  type: string;
  maxHeartrate: number | null;
  sufferScore: number | null;
  totalElevation: number | null;
  elapsedTimeS: number | null;
  prCount: number | null;
};

// ---------------------------------------------------------------------------
// Section 1: Pace Intelligence
// ---------------------------------------------------------------------------

export type PaceEvolutionPoint = {
  date: string;
  band: string;
  pace: number;
  hr: number | null;
  efficiencyIndex: number | null;
  rollingPace: number | null;
  rollingHr: number | null;
  rollingEfficiency: number | null;
};

export function computePaceEvolution(
  activities: PerformanceActivity[],
  rollingWindow: number = 8,
): Map<string, PaceEvolutionPoint[]> {
  const runs = activities
    .filter((a) => a.type.toLowerCase() === "run" && a.distanceM > 500 && a.movingTimeS > 60)
    .sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate));

  const groups = new Map<string, PerformanceActivity[]>();
  for (const run of runs) {
    const band = distanceBandLabel(run);
    const arr = groups.get(band) ?? [];
    arr.push(run);
    groups.set(band, arr);
  }

  const result = new Map<string, PaceEvolutionPoint[]>();

  for (const [band, bandRuns] of groups) {
    if (bandRuns.length < 3) continue;

    const points: PaceEvolutionPoint[] = bandRuns.map((run) => {
      const pace = paceSecPerKm(run);
      const hr = run.averageHeartrate;
      const efficiency =
        hr != null && hr > 0 && pace > 0 ? (220 - hr) / pace : null;

      return {
        date: run.startDate.slice(0, 10),
        band,
        pace,
        hr,
        efficiencyIndex: efficiency != null ? round(efficiency, 3) : null,
        rollingPace: null,
        rollingHr: null,
        rollingEfficiency: null,
      };
    });

    // Compute rolling averages
    for (let i = 0; i < points.length; i++) {
      const windowStart = Math.max(0, i - rollingWindow + 1);
      const window = points.slice(windowStart, i + 1);

      const paces = window.map((p) => p.pace);
      points[i].rollingPace = round(paces.reduce((s, v) => s + v, 0) / paces.length, 1);

      const hrs = window.filter((p) => p.hr != null).map((p) => p.hr!);
      points[i].rollingHr = hrs.length >= 2 ? round(hrs.reduce((s, v) => s + v, 0) / hrs.length, 1) : null;

      const effs = window.filter((p) => p.efficiencyIndex != null).map((p) => p.efficiencyIndex!);
      points[i].rollingEfficiency = effs.length >= 2 ? round(effs.reduce((s, v) => s + v, 0) / effs.length, 3) : null;
    }

    result.set(band, points);
  }

  return result;
}

export type EfficiencySummary = {
  band: string;
  runCount: number;
  baselinePace: number;
  recentPace: number;
  paceDeltaPct: number;
  baselineHr: number | null;
  recentHr: number | null;
  baselineEfficiency: number | null;
  recentEfficiency: number | null;
  efficiencyDeltaPct: number | null;
  trendSlopePerYear: number;
};

export function computeEfficiencySummary(
  activities: PerformanceActivity[],
): EfficiencySummary[] {
  const runs = activities
    .filter((a) => a.type.toLowerCase() === "run" && a.distanceM > 500 && a.movingTimeS > 60)
    .sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate));

  const groups = new Map<string, PerformanceActivity[]>();
  for (const run of runs) {
    const band = distanceBandLabel(run);
    const arr = groups.get(band) ?? [];
    arr.push(run);
    groups.set(band, arr);
  }

  const summaries: EfficiencySummary[] = [];

  for (const [band, bandRuns] of groups) {
    if (bandRuns.length < 4) continue;

    const splitPoint = Math.ceil(bandRuns.length * 0.25);
    const baseline = bandRuns.slice(0, splitPoint);
    const recent = bandRuns.slice(-splitPoint);

    const avgPace = (arr: PerformanceActivity[]) =>
      arr.reduce((s, r) => s + paceSecPerKm(r), 0) / arr.length;
    const avgHr = (arr: PerformanceActivity[]) => {
      const withHr = arr.filter((r) => r.averageHeartrate != null);
      return withHr.length ? withHr.reduce((s, r) => s + r.averageHeartrate!, 0) / withHr.length : null;
    };
    const avgEff = (arr: PerformanceActivity[]) => {
      const withBoth = arr.filter((r) => r.averageHeartrate != null && r.averageHeartrate > 0);
      if (!withBoth.length) return null;
      return withBoth.reduce((s, r) => {
        const p = paceSecPerKm(r);
        return s + (220 - r.averageHeartrate!) / p;
      }, 0) / withBoth.length;
    };

    const bPace = avgPace(baseline);
    const rPace = avgPace(recent);
    const bEff = avgEff(baseline);
    const rEff = avgEff(recent);

    // Trend slope: pace change per year via linear regression
    const xs = bandRuns.map((r) => +new Date(r.startDate) / (365.25 * 24 * 3600 * 1000));
    const ys = bandRuns.map((r) => paceSecPerKm(r));
    const { slope } = linearRegression(xs, ys);

    summaries.push({
      band,
      runCount: bandRuns.length,
      baselinePace: round(bPace, 1),
      recentPace: round(rPace, 1),
      paceDeltaPct: bPace > 0 ? round(((bPace - rPace) / bPace) * 100, 1) : 0,
      baselineHr: avgHr(baseline) != null ? round(avgHr(baseline)!, 1) : null,
      recentHr: avgHr(recent) != null ? round(avgHr(recent)!, 1) : null,
      baselineEfficiency: bEff != null ? round(bEff, 3) : null,
      recentEfficiency: rEff != null ? round(rEff, 3) : null,
      efficiencyDeltaPct: bEff != null && rEff != null && bEff > 0
        ? round(((rEff - bEff) / bEff) * 100, 1)
        : null,
      trendSlopePerYear: round(slope, 1),
    });
  }

  return summaries.sort((a, b) => b.runCount - a.runCount);
}

// ---------------------------------------------------------------------------
// Section 2: Fitness-Fatigue-Form (CTL/ATL/TSB)
// ---------------------------------------------------------------------------

export type FitnessFormPoint = {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  raceAnnotation: RaceAnnotation | null;
};

export type RaceAnnotation = {
  name: string;
  distanceKm: number;
  paceSecPerKm: number;
  formattedPace: string;
};

const RACE_KEYWORDS = /\b(race|parkrun|5k|10k|half|hm|marathon|comp|championship|relay)\b/i;

export function detectRaces(activities: PerformanceActivity[]): PerformanceActivity[] {
  const marathonIds = new Set(
    filterTrueMarathons(activities)
      .filter((m) => m.type?.toLowerCase() === "run")
      .map((m) => m.id),
  );

  const marathons = activities.filter((a) => marathonIds.has(a.id));

  const keywordRaces = activities.filter((a) => {
    if (marathonIds.has(a.id)) return false;
    if (a.type.toLowerCase() !== "run") return false;
    return RACE_KEYWORDS.test(a.name);
  });

  return [...marathons, ...keywordRaces].sort(
    (a, b) => +new Date(a.startDate) - +new Date(b.startDate),
  );
}

export function computeFitnessForm(
  loadSeries: TrainingLoadPoint[],
  activities: PerformanceActivity[],
): FitnessFormPoint[] {
  const races = detectRaces(activities);
  const raceByDate = new Map<string, PerformanceActivity>();
  for (const race of races) {
    raceByDate.set(race.startDate.slice(0, 10), race);
  }

  return loadSeries.map((point) => {
    const atlDaily = point.acuteLoad7 / 7;
    const tsb = point.chronicLoad42 - atlDaily;

    const race = raceByDate.get(point.date);
    let annotation: RaceAnnotation | null = null;
    if (race) {
      const km = race.distanceM / 1000;
      const pace = paceSecPerKm(race);
      const min = Math.floor(pace / 60);
      const sec = Math.round(pace % 60).toString().padStart(2, "0");
      annotation = {
        name: race.name,
        distanceKm: round(km, 1),
        paceSecPerKm: round(pace, 0),
        formattedPace: `${min}:${sec}/km`,
      };
    }

    return {
      date: point.date,
      ctl: round(point.chronicLoad42, 1),
      atl: round(atlDaily, 1),
      tsb: round(tsb, 1),
      raceAnnotation: annotation,
    };
  });
}

export type RaceFormSummary = {
  name: string;
  date: string;
  distanceKm: number;
  paceSecPerKm: number;
  formattedPace: string;
  tsbAtRace: number;
  ctlAtRace: number;
  atlAtRace: number;
};

export function extractRaceSummaries(fitnessForm: FitnessFormPoint[]): RaceFormSummary[] {
  return fitnessForm
    .filter((p) => p.raceAnnotation != null)
    .map((p) => ({
      name: p.raceAnnotation!.name,
      date: p.date,
      distanceKm: p.raceAnnotation!.distanceKm,
      paceSecPerKm: p.raceAnnotation!.paceSecPerKm,
      formattedPace: p.raceAnnotation!.formattedPace,
      tsbAtRace: p.tsb,
      ctlAtRace: p.ctl,
      atlAtRace: p.atl,
    }));
}

// ---------------------------------------------------------------------------
// Section 3: Marathon Block Forensics
// ---------------------------------------------------------------------------

export type MarathonBlockForensic = {
  blockId: string;
  raceName: string;
  raceDate: string;
  racePaceSecPerKm: number;
  formattedPace: string;
  raceHr: number | null;
  avgWeeklyKm: number;
  longRunCount: number;
  weeklyKmProfile: number[];
  avgSleepMin: number | null;
  avgRestingHr: number | null;
  avgHrv: number | null;
  taperPct: number;
  paceRank: number;
};

export function computeBlockForensics(
  activities: PerformanceActivity[],
  metrics: DailyMetricRow[],
  sleep: SleepRow[],
): MarathonBlockForensic[] {
  // Use existing marathon block patterns
  const runActivities: RunActivity[] = activities.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    startDate: a.startDate,
    distanceM: a.distanceM,
    movingTimeS: a.movingTimeS,
    averageSpeed: a.averageSpeed,
    averageHeartrate: a.averageHeartrate,
  }));

  const allBlocks = marathonBlockPatterns(runActivities);
  if (!allBlocks.length) return [];

  // Filter out non-race marathon-distance runs (training runs with significant stop time)
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const blocks = allBlocks.filter((block) => {
    const race = activityById.get(block.raceId);
    if (!race || !race.elapsedTimeS || race.movingTimeS <= 0) return true;
    const stopRatio = race.elapsedTimeS / race.movingTimeS;
    // Real races have <2% stop time; training runs have much more
    return stopRatio < 1.05;
  });

  // Build lookup maps
  const metricsByDate = new Map<string, DailyMetricRow>();
  for (const m of metrics) metricsByDate.set(m.metric_date, m);
  const sleepByDate = new Map<string, SleepRow>();
  for (const s of sleep) sleepByDate.set(s.sleep_date, s);

  const forensics: MarathonBlockForensic[] = blocks.map((block) => {
    const raceTime = +new Date(block.raceDate);
    const startWindow = raceTime - 12 * 7 * 24 * 3600 * 1000;

    // Collect wellness data for the 12-week block
    const blockSleep: number[] = [];
    const blockHr: number[] = [];
    const blockHrv: number[] = [];

    const cursor = new Date(startWindow);
    while (+cursor < raceTime) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const m = metricsByDate.get(dateStr);
      if (m?.resting_hr != null) blockHr.push(m.resting_hr);
      if (m?.hrv != null) blockHrv.push(m.hrv);
      const s = sleepByDate.get(dateStr);
      if (s?.total_sleep_min != null) blockSleep.push(s.total_sleep_min);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    // Weekly km profile (12 weeks)
    const weeklyKmProfile: number[] = Array(12).fill(0);
    for (const run of block.blockRuns) {
      const runTime = +new Date(run.date);
      const weekIdx = Math.min(11, Math.floor((runTime - startWindow) / (7 * 24 * 3600 * 1000)));
      if (weekIdx >= 0 && weekIdx < 12) {
        weeklyKmProfile[weekIdx] += run.distanceKm;
      }
    }

    // Taper quality: week 11-12 vs peak of weeks 6-8
    const peakWeeks = weeklyKmProfile.slice(5, 8);
    const taperWeeks = weeklyKmProfile.slice(10, 12);
    const peakAvg = peakWeeks.length ? peakWeeks.reduce((s, v) => s + v, 0) / peakWeeks.length : 0;
    const taperAvg = taperWeeks.length ? taperWeeks.reduce((s, v) => s + v, 0) / taperWeeks.length : 0;
    const taperPct = peakAvg > 0 ? round(((peakAvg - taperAvg) / peakAvg) * 100, 0) : 0;

    const avg = (arr: number[]) =>
      arr.length ? round(arr.reduce((s, v) => s + v, 0) / arr.length, 1) : null;

    const pace = block.racePaceSecPerKm;
    const min = Math.floor(pace / 60);
    const sec = Math.round(pace % 60).toString().padStart(2, "0");

    return {
      blockId: block.blockId,
      raceName: block.raceName,
      raceDate: block.raceDate.slice(0, 10),
      racePaceSecPerKm: block.racePaceSecPerKm,
      formattedPace: `${min}:${sec}/km`,
      raceHr: block.raceHr,
      avgWeeklyKm: block.avgWeeklyKm,
      longRunCount: block.longRunCount,
      weeklyKmProfile: weeklyKmProfile.map((v) => round(v, 1)),
      avgSleepMin: avg(blockSleep),
      avgRestingHr: avg(blockHr),
      avgHrv: avg(blockHrv),
      taperPct,
      paceRank: 0, // filled below
    };
  });

  // Rank by pace (fastest = 1)
  const sorted = [...forensics].sort((a, b) => a.racePaceSecPerKm - b.racePaceSecPerKm);
  sorted.forEach((f, i) => {
    f.paceRank = i + 1;
  });

  // Default: chronological order
  return forensics.sort((a, b) => a.raceDate.localeCompare(b.raceDate));
}

// ---------------------------------------------------------------------------
// Section 4: Recovery → Performance Lag
// ---------------------------------------------------------------------------

export type LaggedCorrelation = {
  recoveryMetric: string;
  recoveryLabel: string;
  lagDays: number;
  r: number;
  n: number;
  direction: "positive" | "negative";
};

export type LaggedCorrelationResult = {
  cells: LaggedCorrelation[];
  bestCell: LaggedCorrelation | null;
  narrative: string;
};

const RECOVERY_METRICS: { key: string; label: string; extractor: (m: DailyMetricRow, s: SleepRow | undefined) => number | null }[] = [
  { key: "total_sleep", label: "Sleep Duration", extractor: (_m, s) => s?.total_sleep_min ?? null },
  { key: "deep_sleep", label: "Deep Sleep", extractor: (_m, s) => s?.deep_sleep_min ?? null },
  { key: "hrv", label: "HRV", extractor: (m) => m.hrv },
  { key: "resting_hr", label: "Resting HR", extractor: (m) => m.resting_hr },
  { key: "body_battery", label: "Body Battery", extractor: (m) => m.body_battery_max },
];

const LAG_WINDOWS = [1, 2, 3, 5, 7];

export function computeLaggedCorrelations(
  dailyFacts: DailyActivityFact[],
  metrics: DailyMetricRow[],
  sleep: SleepRow[],
  activities: PerformanceActivity[],
): LaggedCorrelationResult {
  // Build date lookups
  const metricsByDate = new Map<string, DailyMetricRow>();
  for (const m of metrics) metricsByDate.set(m.metric_date, m);
  const sleepByDate = new Map<string, SleepRow>();
  for (const s of sleep) sleepByDate.set(s.sleep_date, s);

  // Compute average pace per distance band for residual calculation
  const runs = activities.filter(
    (a) => a.type.toLowerCase() === "run" && a.distanceM > 500 && a.movingTimeS > 60,
  );
  const bandAvgPace = new Map<string, { sum: number; count: number }>();
  for (const run of runs) {
    const band = distanceBandLabel(run);
    const pace = paceSecPerKm(run);
    const existing = bandAvgPace.get(band) ?? { sum: 0, count: 0 };
    existing.sum += pace;
    existing.count += 1;
    bandAvgPace.set(band, existing);
  }

  // Build run-day outcomes: date → pace residual
  const runDayOutcome = new Map<string, number>();
  for (const run of runs) {
    const date = run.startDate.slice(0, 10);
    const band = distanceBandLabel(run);
    const avg = bandAvgPace.get(band);
    if (!avg || avg.count < 3) continue;
    const expectedPace = avg.sum / avg.count;
    const residual = paceSecPerKm(run) - expectedPace; // negative = faster than usual
    // If multiple runs on same day, use the first
    if (!runDayOutcome.has(date)) {
      runDayOutcome.set(date, residual);
    }
  }

  const cells: LaggedCorrelation[] = [];

  for (const metric of RECOVERY_METRICS) {
    for (const lag of LAG_WINDOWS) {
      const xs: number[] = [];
      const ys: number[] = [];

      for (const [runDate, residual] of runDayOutcome) {
        // Average the recovery metric over the lag window
        let sum = 0;
        let count = 0;
        for (let d = 1; d <= lag; d++) {
          const lookbackDate = offsetDate(runDate, -d);
          const m = metricsByDate.get(lookbackDate);
          const s = sleepByDate.get(lookbackDate);
          const val = metric.extractor(m ?? {} as DailyMetricRow, s);
          if (val != null) {
            sum += val;
            count += 1;
          }
        }
        if (count > 0) {
          xs.push(sum / count);
          ys.push(residual);
        }
      }

      const r = pearsonR(xs, ys);
      cells.push({
        recoveryMetric: metric.key,
        recoveryLabel: metric.label,
        lagDays: lag,
        r: round(r, 3),
        n: xs.length,
        direction: r < 0 ? "negative" : "positive",
      });
    }
  }

  // Find the strongest cell
  const bestCell = cells.length
    ? cells.reduce((best, c) => (Math.abs(c.r) > Math.abs(best.r) ? c : best), cells[0])
    : null;

  // Generate narrative
  let narrative = "Not enough data to determine recovery-performance relationships.";
  if (bestCell && Math.abs(bestCell.r) > 0.05 && bestCell.n >= 10) {
    const direction = bestCell.recoveryMetric === "resting_hr"
      ? (bestCell.r > 0 ? "higher" : "lower")
      : (bestCell.r < 0 ? "higher" : "lower");
    const impact = bestCell.r < 0 ? "faster" : "slower";
    narrative = `Your pace is most sensitive to ${bestCell.lagDays}-day trailing ${bestCell.recoveryLabel.toLowerCase()} (r=${bestCell.r.toFixed(2)}, n=${bestCell.n}). ${direction.charAt(0).toUpperCase() + direction.slice(1)} ${bestCell.recoveryLabel.toLowerCase()} tends to predict ${impact} runs.`;
  }

  return { cells, bestCell, narrative };
}

// ---------------------------------------------------------------------------
// Section 5: Load Sweet Spot + Simulation
// ---------------------------------------------------------------------------

export type LoadPaceBucket = {
  volumeBand: string;
  volumeMin: number;
  volumeMax: number;
  weekCount: number;
  medianSubsequentPace: number;
  p25Pace: number;
  p75Pace: number;
  isSweetSpot: boolean;
};

export type LoadPaceModel = {
  buckets: LoadPaceBucket[];
  sweetSpotBand: string | null;
  linearModel: { slope: number; intercept: number; r: number };
};

const VOLUME_BANDS: { label: string; min: number; max: number }[] = [
  { label: "0–20 km", min: 0, max: 20 },
  { label: "20–35 km", min: 20, max: 35 },
  { label: "35–50 km", min: 35, max: 50 },
  { label: "50–65 km", min: 50, max: 65 },
  { label: "65–80 km", min: 65, max: 80 },
  { label: "80+ km", min: 80, max: Infinity },
];

export function computeLoadPaceRelationship(
  dailyFacts: DailyActivityFact[],
  activities: PerformanceActivity[],
): LoadPaceModel {
  // Build weekly running distance
  const weeklyKm = new Map<string, number>();
  for (const fact of dailyFacts) {
    const wk = isoWeekKey(fact.date);
    weeklyKm.set(wk, (weeklyKm.get(wk) ?? 0) + fact.runDistanceKm);
  }

  // Build per-activity index by date for getting tempo runs in the 2-week window
  const tempoRuns = activities.filter((a) => {
    if (a.type.toLowerCase() !== "run") return false;
    const km = a.distanceM / 1000;
    return km >= 8 && km <= 15 && a.movingTimeS > 0;
  });

  // For each week, find tempo runs in weeks +1 and +2
  const weeks = Array.from(weeklyKm.entries()).sort(([a], [b]) => a.localeCompare(b));
  const weekVolumes: number[] = [];
  const subsequentPaces: number[] = [];
  const weekPacePairs: { weekKm: number; pace: number }[] = [];

  for (let i = 0; i < weeks.length - 2; i++) {
    const [weekKey, km] = weeks[i];
    const nextWeeks = new Set([weeks[i + 1]?.[0], weeks[i + 2]?.[0]].filter(Boolean));

    const nextTempoRuns = tempoRuns.filter((r) => {
      const rWeek = isoWeekKey(r.startDate.slice(0, 10));
      return nextWeeks.has(rWeek);
    });

    if (nextTempoRuns.length === 0) continue;

    const avgPace = nextTempoRuns.reduce((s, r) => s + paceSecPerKm(r), 0) / nextTempoRuns.length;
    weekVolumes.push(km);
    subsequentPaces.push(avgPace);
    weekPacePairs.push({ weekKm: km, pace: avgPace });
  }

  // Bucket into volume bands
  const buckets: LoadPaceBucket[] = VOLUME_BANDS.map((band) => {
    const inBand = weekPacePairs.filter(
      (wp) => wp.weekKm >= band.min && wp.weekKm < band.max,
    );
    const paces = inBand.map((wp) => wp.pace).sort((a, b) => a - b);

    return {
      volumeBand: band.label,
      volumeMin: band.min,
      volumeMax: band.max === Infinity ? 999 : band.max,
      weekCount: paces.length,
      medianSubsequentPace: paces.length ? percentile(paces, 0.5) : 0,
      p25Pace: paces.length ? percentile(paces, 0.25) : 0,
      p75Pace: paces.length ? percentile(paces, 0.75) : 0,
      isSweetSpot: false,
    };
  }).filter((b) => b.weekCount >= 2);

  // Mark sweet spot (fastest median pace)
  if (buckets.length) {
    const best = buckets.reduce((a, b) =>
      a.medianSubsequentPace < b.medianSubsequentPace ? a : b,
    );
    best.isSweetSpot = true;
  }

  // Linear model
  const r = weekVolumes.length >= 5 ? pearsonR(weekVolumes, subsequentPaces) : 0;
  const { slope, intercept } = linearRegression(weekVolumes, subsequentPaces);

  return {
    buckets,
    sweetSpotBand: buckets.find((b) => b.isSweetSpot)?.volumeBand ?? null,
    linearModel: { slope: round(slope, 3), intercept: round(intercept, 1), r: round(r, 3) },
  };
}

export type SimulationResult = {
  currentWeeklyKm: number;
  scenarioWeeklyKm: number;
  currentProjectedPace: number;
  scenarioProjectedPace: number;
  paceDeltaSecPerKm: number;
  confidence: "low" | "medium" | "high";
  caveat: string;
};

export function simulateLoadChange(
  model: LoadPaceModel,
  currentWeeklyKm: number,
  scenarioWeeklyKm: number,
  observedMaxKm: number,
): SimulationResult {
  const clamped = Math.min(scenarioWeeklyKm, observedMaxKm * 1.1);
  const currentPace = model.linearModel.slope * currentWeeklyKm + model.linearModel.intercept;
  const scenarioPace = model.linearModel.slope * clamped + model.linearModel.intercept;

  const absR = Math.abs(model.linearModel.r);
  const confidence: "low" | "medium" | "high" =
    absR >= 0.3 ? "high" : absR >= 0.15 ? "medium" : "low";

  return {
    currentWeeklyKm: round(currentWeeklyKm, 0),
    scenarioWeeklyKm: round(clamped, 0),
    currentProjectedPace: round(currentPace, 1),
    scenarioProjectedPace: round(scenarioPace, 1),
    paceDeltaSecPerKm: round(scenarioPace - currentPace, 1),
    confidence,
    caveat:
      confidence === "low"
        ? "Weak correlation — this projection is unreliable."
        : "Based on historical association, not causation. Other factors matter.",
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round(value: number, digits: number = 2): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const dayOfWeek = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((+d - +yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return round(sorted[lo], 1);
  return round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo), 1);
}
