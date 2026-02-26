import { SupabaseClient } from "@supabase/supabase-js";
import {
  ActivitySample,
  aggregateDailyFacts,
  computeTrainingLoad,
  readinessStatus,
} from "@/lib/metrics/load";

type Workout = {
  id: string;
  name: string;
  dayOfWeek: number;
  distanceKm: number | null;
  durationMin: number | null;
  intensity: string | null;
  notes: string | null;
  status: string;
};

type CheckinPreview = {
  date: string;
  body: string;
  readinessScore: number | null;
};

export type CockpitPayload = {
  readiness: {
    score: number;
    status: "high" | "moderate" | "caution";
    confidence: number;
    acuteLoad: number;
    chronicLoad: number;
    monotony: number;
    strain: number;
    loadRatio: number;
    missingData: boolean;
  };
  todayPlan: {
    date: string;
    workouts: Workout[];
  };
  loadTrend: Array<{
    date: string;
    acuteLoad: number;
    chronicLoad: number;
    readinessScore: number;
  }>;
  quickInsights: string[];
  checkinPreview: CheckinPreview | null;
  generatedAt: string;
};

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function mondayIndex(date: Date) {
  return (date.getUTCDay() + 6) % 7;
}

function mapActivity(row: Record<string, unknown>): ActivitySample {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? "Activity"),
    type: String(row.type ?? "Run"),
    startDate: String(row.start_date ?? new Date().toISOString()),
    distanceM: Number(row.distance_m ?? 0),
    movingTimeS: Number(row.moving_time_s ?? 0),
    averageHeartrate: row.average_heartrate == null ? null : Number(row.average_heartrate),
  };
}

function mapWorkout(row: Record<string, unknown>): Workout {
  return {
    id: String(row.id ?? ""),
    name: String(row.workout_name ?? "Workout"),
    dayOfWeek: Number(row.day_of_week ?? 0),
    distanceKm: row.workout_distance_km == null ? null : Number(row.workout_distance_km),
    durationMin: row.workout_duration_min == null ? null : Number(row.workout_duration_min),
    intensity: row.workout_intensity == null ? null : String(row.workout_intensity),
    notes: row.workout_notes == null ? null : String(row.workout_notes),
    status: String(row.workout_status ?? "Planned"),
  };
}

function summarizeInsights(params: {
  acuteLoad: number;
  chronicLoad: number;
  loadRatio: number;
  monotony: number;
  workouts: Workout[];
  readinessScore: number;
}) {
  const { loadRatio, monotony, workouts, readinessScore } = params;
  const insights: string[] = [];

  if (loadRatio >= 1.2) {
    insights.push("Load spike detected: acute load is >20% above baseline. Keep today easy.");
  } else if (loadRatio <= 0.78) {
    insights.push("Load is below baseline. Consider adding controlled volume if recovery is strong.");
  } else {
    insights.push("Load ratio is in a productive range for consistent marathon progression.");
  }

  if (monotony > 1.8) {
    insights.push("Monotony is elevated. Add variation in session intensity or terrain.");
  }

  if (workouts.length === 0) {
    insights.push("No workout is scheduled today. Use Coach to generate a session suggestion.");
  } else {
    insights.push(`Today has ${workouts.length} planned session${workouts.length > 1 ? "s" : ""}.`);
  }

  if (readinessScore < 60) {
    insights.push("Readiness is cautionary. Prioritize sleep, fueling, and low-intensity work.");
  }

  return insights.slice(0, 4);
}

async function safePersistDailyFacts(
  supabase: SupabaseClient,
  userId: string,
  facts: ReturnType<typeof aggregateDailyFacts>,
) {
  if (!facts.length) return;
  await supabase
    .from("activity_daily_facts")
    .upsert(
      facts.map((fact) => ({
        user_id: userId,
        fact_date: fact.date,
        run_count: fact.runCount,
        run_distance_km: fact.runDistanceKm,
        long_run_count: fact.longRunCount,
        total_moving_minutes: fact.totalMovingMinutes,
        cross_training_minutes: fact.crossTrainingMinutes,
        load_score: fact.loadScore,
      })),
      { onConflict: "user_id,fact_date" },
    )
    .throwOnError();
}

async function safePersistTrainingLoad(
  supabase: SupabaseClient,
  userId: string,
  loads: ReturnType<typeof computeTrainingLoad>,
) {
  if (!loads.length) return;
  await supabase
    .from("training_load_daily")
    .upsert(
      loads.map((load) => ({
        user_id: userId,
        load_date: load.date,
        acute_load_7: load.acuteLoad7,
        chronic_load_42: load.chronicLoad42,
        monotony_7: load.monotony7,
        strain_7: load.strain7,
        load_ratio: load.loadRatio,
        readiness_score: load.readinessScore,
        readiness_confidence: load.readinessConfidence,
        missing_data: load.missingData,
      })),
      { onConflict: "user_id,load_date" },
    )
    .throwOnError();
}

async function persistDerivedMetrics(
  supabase: SupabaseClient,
  userId: string,
  facts: ReturnType<typeof aggregateDailyFacts>,
  loads: ReturnType<typeof computeTrainingLoad>,
) {
  try {
    await Promise.all([
      safePersistDailyFacts(supabase, userId, facts),
      safePersistTrainingLoad(supabase, userId, loads),
    ]);
  } catch {
    // Schema may not be installed yet; computation still proceeds in-memory.
  }
}

export async function buildCockpitPayload({
  supabase,
  userId,
  date,
}: {
  supabase: SupabaseClient;
  userId: string;
  date?: string;
}): Promise<CockpitPayload> {
  const selectedDate = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
  const selectedDateKey = toDateKey(selectedDate);
  const selectedDayIndex = mondayIndex(selectedDate);

  const [{ data: activityRows }, { data: activePlanRows }] = await Promise.all([
    supabase
      .from("strava_activities")
      .select("id,name,type,start_date,distance_m,moving_time_s,average_heartrate")
      .order("start_date", { ascending: false })
      .limit(1400),
    supabase
      .from("training_plans")
      .select("id,plan_name")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const activities = (activityRows ?? []).map((row) => mapActivity(row as Record<string, unknown>));
  const facts = aggregateDailyFacts(activities);
  const loads = computeTrainingLoad(facts);
  await persistDerivedMetrics(supabase, userId, facts, loads);

  const latestLoad = loads[loads.length - 1] ?? {
    date: selectedDateKey,
    acuteLoad7: 0,
    chronicLoad42: 0,
    monotony7: 0,
    strain7: 0,
    loadRatio: 0,
    readinessScore: 55,
    readinessConfidence: 40,
    missingData: true,
  };

  const activePlanId = activePlanRows?.[0]?.id as string | undefined;
  const workoutRows = activePlanId
    ? await supabase
        .from("training_plan_workouts")
        .select("id,day_of_week,workout_name,workout_distance_km,workout_duration_min,workout_intensity,workout_notes,workout_status")
        .eq("user_id", userId)
        .eq("plan_id", activePlanId)
        .eq("day_of_week", selectedDayIndex)
        .order("workout_order", { ascending: true })
        .order("created_at", { ascending: true })
    : { data: [] as unknown[] };

  const workouts = (workoutRows.data ?? []).map((row) => mapWorkout(row as Record<string, unknown>));

  let checkinPreview: CheckinPreview | null = null;
  try {
    const { data: checkins } = await supabase
      .from("coach_checkins")
      .select("checkin_date,body,readiness_score")
      .eq("user_id", userId)
      .order("checkin_date", { ascending: false })
      .limit(1);
    const latest = checkins?.[0];
    if (latest) {
      checkinPreview = {
        date: String(latest.checkin_date),
        body: String(latest.body),
        readinessScore: latest.readiness_score == null ? null : Number(latest.readiness_score),
      };
    }
  } catch {
    checkinPreview = null;
  }

  const loadTrend = loads.slice(-14).map((point) => ({
    date: point.date,
    acuteLoad: point.acuteLoad7,
    chronicLoad: point.chronicLoad42,
    readinessScore: point.readinessScore,
  }));

  const quickInsights = summarizeInsights({
    acuteLoad: latestLoad.acuteLoad7,
    chronicLoad: latestLoad.chronicLoad42,
    loadRatio: latestLoad.loadRatio,
    monotony: latestLoad.monotony7,
    workouts,
    readinessScore: latestLoad.readinessScore,
  });

  return {
    readiness: {
      score: latestLoad.readinessScore,
      status: readinessStatus(latestLoad.readinessScore),
      confidence: latestLoad.readinessConfidence,
      acuteLoad: latestLoad.acuteLoad7,
      chronicLoad: latestLoad.chronicLoad42,
      monotony: latestLoad.monotony7,
      strain: latestLoad.strain7,
      loadRatio: latestLoad.loadRatio,
      missingData: latestLoad.missingData,
    },
    todayPlan: {
      date: selectedDateKey,
      workouts,
    },
    loadTrend,
    quickInsights,
    checkinPreview,
    generatedAt: new Date().toISOString(),
  };
}
