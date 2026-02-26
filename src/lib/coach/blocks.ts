import { SupabaseClient } from "@supabase/supabase-js";
import { ActiveBlockSummary } from "@/lib/coach/intelligence";
import { RunActivity, marathonBlockPatterns } from "@/lib/metrics/dashboard";
import { getPrimaryAthleteId } from "@/lib/athlete";

type ObjectiveRow = {
  goal_race_name: string | null;
  goal_race_date: string | null;
};

type BlockSource = "cache" | "computed";

type BlockWeek = {
  weekIndex: number;
  weekStart: string;
  distanceKm: number;
  longRunKm: number;
  qualitySessions: number;
  loadScore: number;
};

const DEFAULT_BOSTON_RACE_DATE = "2026-04-20";
const DEFAULT_BOSTON_RACE_NAME = "Boston Marathon";
const BLOCK_WEEKS = 12;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CACHE_FRESH_MS = 8 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mapRun(row: Record<string, unknown>): RunActivity {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? "Run"),
    startDate: String(row.start_date ?? new Date().toISOString()),
    distanceM: Number(row.distance_m ?? 0),
    movingTimeS: Number(row.moving_time_s ?? 0),
    averageSpeed: Number(row.average_speed ?? 0),
    averageHeartrate: row.average_heartrate == null ? null : Number(row.average_heartrate),
  };
}

function daysUntil(dateIso: string): number {
  const race = new Date(`${dateIso}T00:00:00.000Z`);
  if (Number.isNaN(+race)) return 0;
  return Math.ceil((race.getTime() - Date.now()) / MS_PER_DAY);
}

function blockStartDate(raceDateIso: string) {
  const date = new Date(`${raceDateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - BLOCK_WEEKS * 7);
  return date.toISOString().slice(0, 10);
}

function paceSecPerKm(run: RunActivity) {
  if (!run.distanceM || !run.movingTimeS) return 0;
  return run.movingTimeS / (run.distanceM / 1000);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function groupBlockWeeks(runs: RunActivity[], startDateIso: string, endDateIso: string): BlockWeek[] {
  const start = new Date(`${startDateIso}T00:00:00.000Z`);
  const end = new Date(`${endDateIso}T23:59:59.999Z`);
  const filtered = runs.filter((run) => {
    const t = +new Date(run.startDate);
    return t >= +start && t <= +end;
  });

  const weeks: BlockWeek[] = [];
  for (let i = 0; i < BLOCK_WEEKS; i += 1) {
    const weekStart = new Date(start);
    weekStart.setUTCDate(weekStart.getUTCDate() + i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    const weekRuns = filtered.filter((run) => {
      const t = +new Date(run.startDate);
      return t >= +weekStart && t < +weekEnd;
    });
    const distanceKm = weekRuns.reduce((sum, run) => sum + run.distanceM / 1000, 0);
    const longRunKm = weekRuns.reduce((max, run) => Math.max(max, run.distanceM / 1000), 0);
    const qualitySessions = weekRuns.filter((run) => {
      const km = run.distanceM / 1000;
      const pace = paceSecPerKm(run);
      return km >= 10 && pace > 0 && pace <= 360;
    }).length;
    const loadScore = weekRuns.reduce((sum, run) => sum + run.movingTimeS / 60 + (run.distanceM / 1000) * 0.8, 0);
    weeks.push({
      weekIndex: i + 1,
      weekStart: weekStart.toISOString().slice(0, 10),
      distanceKm: Number(distanceKm.toFixed(1)),
      longRunKm: Number(longRunKm.toFixed(1)),
      qualitySessions,
      loadScore: Number(loadScore.toFixed(1)),
    });
  }
  return weeks;
}

function summarizeBlock(params: {
  blockKey: string;
  raceName: string;
  raceDate: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
  weeks: BlockWeek[];
  priorBlocks: ActiveBlockSummary[];
}): ActiveBlockSummary {
  const { blockKey, raceName, raceDate, isActive, startDate, endDate, weeks, priorBlocks } = params;
  const distanceValues = weeks.map((w) => w.distanceKm);
  const avgWeeklyKm = distanceValues.length
    ? Number((distanceValues.reduce((sum, km) => sum + km, 0) / distanceValues.length).toFixed(1))
    : 0;
  const longRunCount = weeks.filter((w) => w.longRunKm >= 24).length;
  const qualitySessionDensity = Number(
    (
      weeks.reduce((sum, week) => sum + week.qualitySessions, 0) /
      Math.max(1, weeks.length)
    ).toFixed(2),
  );

  const taperWeeks = weeks.slice(-3).map((w) => w.distanceKm);
  const preTaperWeeks = weeks.slice(-6, -3).map((w) => w.distanceKm);
  let taperSimilarity: number | null = null;
  if (taperWeeks.length === 3 && preTaperWeeks.length === 3) {
    const taperDrop = preTaperWeeks.reduce((s, v) => s + v, 0) - taperWeeks.reduce((s, v) => s + v, 0);
    taperSimilarity = Number(clamp(taperDrop / Math.max(1, preTaperWeeks.reduce((s, v) => s + v, 0)), 0, 1).toFixed(2));
  }

  const priorMedianWeeklyKm = median(priorBlocks.map((block) => block.avgWeeklyKm));
  const priorMedianLongRuns = median(priorBlocks.map((block) => block.longRunCount));
  const weeklyDeltaKm = priorMedianWeeklyKm == null ? null : Number((avgWeeklyKm - priorMedianWeeklyKm).toFixed(1));
  const longRunDelta = priorMedianLongRuns == null ? null : Number((longRunCount - priorMedianLongRuns).toFixed(1));
  const priorBlockCount = priorBlocks.length;
  const comparatorConfidence: "low" | "moderate" | "high" =
    priorBlockCount >= 6 ? "high" : priorBlockCount >= 3 ? "moderate" : "low";

  const raceCountdown = daysUntil(raceDate);
  const weekIndex = isActive ? Math.max(1, Math.min(BLOCK_WEEKS, BLOCK_WEEKS - Math.floor(raceCountdown / 7))) : null;

  return {
    blockKey,
    raceName,
    raceDate,
    isActive,
    startDate,
    endDate,
    avgWeeklyKm,
    longRunCount,
    qualitySessionDensity,
    taperSimilarity,
    confidence: priorBlockCount >= 3 ? 0.86 : 0.64,
    weekIndex,
    weekCount: weeks.length,
    comparator: {
      priorBlockCount,
      priorMedianWeeklyKm: priorMedianWeeklyKm == null ? null : Number(priorMedianWeeklyKm.toFixed(1)),
      weeklyDeltaKm,
      longRunDelta,
      confidence: comparatorConfidence,
    },
  };
}

async function loadObjective(supabase: SupabaseClient, userId: string): Promise<ObjectiveRow | null> {
  const { data, error } = await supabase
    .from("training_objectives")
    .select("goal_race_name,goal_race_date")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as ObjectiveRow | null) ?? null;
}

async function loadRuns(supabase: SupabaseClient): Promise<RunActivity[]> {
  const athleteId = getPrimaryAthleteId();
  const { data, error } = await supabase
    .from("strava_activities")
    .select("id,name,type,start_date,distance_m,moving_time_s,average_speed,average_heartrate")
    .eq("athlete_id", athleteId)
    .eq("type", "Run")
    .order("start_date", { ascending: false })
    .limit(1400);
  if (error) return [];
  return (data ?? []).map((row) => mapRun(row as Record<string, unknown>));
}

function mapCachedBlock(row: Record<string, unknown>): ActiveBlockSummary | null {
  const summary = row.summary as Record<string, unknown> | null;
  if (!summary) return null;
  return {
    blockKey: String(row.block_key ?? ""),
    raceName: String(row.race_name ?? ""),
    raceDate: String(row.race_date ?? ""),
    isActive: Boolean(row.is_active),
    startDate: row.start_date == null ? null : String(row.start_date),
    endDate: row.end_date == null ? null : String(row.end_date),
    avgWeeklyKm: Number(summary.avgWeeklyKm ?? 0),
    longRunCount: Number(summary.longRunCount ?? 0),
    qualitySessionDensity: Number(summary.qualitySessionDensity ?? 0),
    taperSimilarity: summary.taperSimilarity == null ? null : Number(summary.taperSimilarity),
    confidence: Number(summary.confidence ?? 0.6),
    weekIndex: summary.weekIndex == null ? null : Number(summary.weekIndex),
    weekCount: Number(summary.weekCount ?? 12),
    comparator: {
      priorBlockCount: Number(summary.comparatorPriorBlockCount ?? 0),
      priorMedianWeeklyKm:
        summary.comparatorPriorMedianWeeklyKm == null ? null : Number(summary.comparatorPriorMedianWeeklyKm),
      weeklyDeltaKm: summary.comparatorWeeklyDeltaKm == null ? null : Number(summary.comparatorWeeklyDeltaKm),
      longRunDelta: summary.comparatorLongRunDelta == null ? null : Number(summary.comparatorLongRunDelta),
      confidence:
        summary.comparatorConfidence === "high" || summary.comparatorConfidence === "moderate"
          ? summary.comparatorConfidence
          : "low",
    },
  };
}

async function loadCachedBlocks(supabase: SupabaseClient, userId: string): Promise<ActiveBlockSummary[] | null> {
  const { data, error } = await supabase
    .from("marathon_blocks")
    .select("block_key,race_name,race_date,start_date,end_date,is_active,summary,updated_at")
    .eq("user_id", userId)
    .order("race_date", { ascending: false })
    .limit(12);
  if (error || !data || !data.length) return null;
  const freshness = Math.max(...data.map((row) => +new Date(String(row.updated_at ?? 0))));
  if (!Number.isFinite(freshness) || Date.now() - freshness > CACHE_FRESH_MS) return null;
  const mapped = data
    .map((row) => mapCachedBlock(row as Record<string, unknown>))
    .filter((item): item is ActiveBlockSummary => item != null);
  return mapped.length ? mapped : null;
}

async function persistBlocks(
  supabase: SupabaseClient,
  userId: string,
  blocks: Array<ActiveBlockSummary & { weeks: BlockWeek[] }>,
) {
  if (!blocks.length) return;
  try {
    const upsertPayload = blocks.map((block) => ({
      user_id: userId,
      block_key: block.blockKey,
      race_name: block.raceName,
      race_date: block.raceDate,
      start_date: block.startDate,
      end_date: block.endDate,
      is_active: block.isActive,
      source: block.isActive ? "objective" : "auto",
      confidence: block.confidence,
      summary: {
        avgWeeklyKm: block.avgWeeklyKm,
        longRunCount: block.longRunCount,
        qualitySessionDensity: block.qualitySessionDensity,
        taperSimilarity: block.taperSimilarity,
        confidence: block.confidence,
        weekIndex: block.weekIndex,
        weekCount: block.weekCount,
        comparatorPriorBlockCount: block.comparator.priorBlockCount,
        comparatorPriorMedianWeeklyKm: block.comparator.priorMedianWeeklyKm,
        comparatorWeeklyDeltaKm: block.comparator.weeklyDeltaKm,
        comparatorLongRunDelta: block.comparator.longRunDelta,
        comparatorConfidence: block.comparator.confidence,
      },
    }));

    const { data: blockRows, error } = await supabase
      .from("marathon_blocks")
      .upsert(upsertPayload, { onConflict: "user_id,block_key" })
      .select("id,block_key");
    if (error || !blockRows) return;

    const blockIdByKey = new Map<string, string>(
      blockRows.map((row) => [String(row.block_key), String(row.id)]),
    );
    const weeksPayload = blocks.flatMap((block) => {
      const blockId = blockIdByKey.get(block.blockKey);
      if (!blockId) return [];
      return block.weeks.map((week) => ({
        user_id: userId,
        block_id: blockId,
        week_index: week.weekIndex,
        week_start: week.weekStart,
        distance_km: week.distanceKm,
        long_run_km: week.longRunKm,
        quality_sessions: week.qualitySessions,
        load_score: week.loadScore,
        notes: null,
      }));
    });

    if (weeksPayload.length) {
      await supabase.from("block_week_metrics").upsert(weeksPayload, { onConflict: "block_id,week_index" });
    }
  } catch {
    // Tables may not exist yet; keep non-persistent computation path operational.
  }
}

export async function loadOrBuildMarathonBlocks({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<{ activeBlock: ActiveBlockSummary | null; blocks: ActiveBlockSummary[]; source: BlockSource }> {
  const cached = await loadCachedBlocks(supabase, userId);
  if (cached?.length) {
    const activeBlock = cached.find((block) => block.isActive) ?? cached[0] ?? null;
    return { activeBlock, blocks: cached, source: "cache" };
  }

  const [objective, runs] = await Promise.all([loadObjective(supabase, userId), loadRuns(supabase)]);
  const raceDate = objective?.goal_race_date ?? DEFAULT_BOSTON_RACE_DATE;
  const raceName = objective?.goal_race_name ?? DEFAULT_BOSTON_RACE_NAME;

  const historical = marathonBlockPatterns(runs).slice(-8);
  const historicalSummaries: Array<ActiveBlockSummary & { weeks: BlockWeek[] }> = historical.map((block, idx) => {
    const startDate = blockStartDate(block.raceDate.slice(0, 10));
    const endDate = new Date(`${block.raceDate.slice(0, 10)}T00:00:00.000Z`);
    endDate.setUTCDate(endDate.getUTCDate() - 1);
    const endDateIso = endDate.toISOString().slice(0, 10);
    const weeks = groupBlockWeeks(runs, startDate, endDateIso);
    return {
      ...summarizeBlock({
        blockKey: `race-${block.raceDate.slice(0, 10)}-${idx + 1}`,
        raceName: block.raceName,
        raceDate: block.raceDate.slice(0, 10),
        isActive: false,
        startDate,
        endDate: endDateIso,
        weeks,
        priorBlocks: [],
      }),
      weeks,
    };
  });

  const activeStart = blockStartDate(raceDate);
  const activeEnd = new Date(Math.min(+new Date(`${raceDate}T00:00:00.000Z`), Date.now()));
  const activeEndIso = activeEnd.toISOString().slice(0, 10);
  const activeWeeks = groupBlockWeeks(runs, activeStart, activeEndIso);
  const activeBlock: ActiveBlockSummary & { weeks: BlockWeek[] } = {
    ...summarizeBlock({
      blockKey: `active-${raceDate}`,
      raceName,
      raceDate,
      isActive: true,
      startDate: activeStart,
      endDate: activeEndIso,
      weeks: activeWeeks,
      priorBlocks: historicalSummaries,
    }),
    weeks: activeWeeks,
  };

  const allBlocks = [activeBlock, ...historicalSummaries].slice(0, 9);
  await persistBlocks(supabase, userId, allBlocks);

  const publicBlocks: ActiveBlockSummary[] = allBlocks.map((block) => ({
    blockKey: block.blockKey,
    raceName: block.raceName,
    raceDate: block.raceDate,
    isActive: block.isActive,
    startDate: block.startDate,
    endDate: block.endDate,
    avgWeeklyKm: block.avgWeeklyKm,
    longRunCount: block.longRunCount,
    qualitySessionDensity: block.qualitySessionDensity,
    taperSimilarity: block.taperSimilarity,
    confidence: block.confidence,
    weekIndex: block.weekIndex,
    weekCount: block.weekCount,
    comparator: block.comparator,
  }));

  return {
    activeBlock,
    blocks: publicBlocks,
    source: "computed",
  };
}
