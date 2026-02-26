import { SupabaseClient } from "@supabase/supabase-js";

export type WellnessSnapshot = {
  sleep: {
    date: string | null;
    totalSleepMin: number | null;
    sleepScore: number | null;
    readinessScore: number | null;
    restingHr: number | null;
    hrv: number | null;
  } | null;
  nutrition: {
    entriesLast24h: number;
    caloriesLast24h: number | null;
    proteinLast24h: number | null;
    carbsLast24h: number | null;
    hydrationLast24h: number | null;
    hasPhotoMeals: boolean;
    pendingRecognitionCount: number;
  } | null;
  dailyMetrics: {
    date: string | null;
    steps: number | null;
    hrv: number | null;
    stressAvg: number | null;
    bodyBatteryAvg: number | null;
    trainingReadiness: number | null;
    recoveryHours: number | null;
    vo2Max: number | null;
    restingHr: number | null;
  } | null;
  dataQuality: "none" | "partial" | "good";
  riskFlags: string[];
  insights: string[];
  generatedAt: string;
};

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function startOfDayIso(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function hoursAgoIso(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}

export async function buildWellnessSnapshot({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<WellnessSnapshot> {
  try {
    const [sleepQuery, nutritionQuery, dailyQuery] = await Promise.all([
      supabase
        .from("wellness_sleep_sessions")
        .select("sleep_date,total_sleep_min,sleep_score,readiness_score,resting_hr,hrv")
        .eq("user_id", userId)
        .gte("sleep_date", startOfDayIso(new Date(Date.now() - 48 * 60 * 60 * 1000)).slice(0, 10))
        .order("sleep_date", { ascending: false })
        .limit(1),
      supabase
        .from("wellness_nutrition_entries")
        .select("calories,protein_g,carbs_g,hydration_ml,photo_url,recognition_status,meal_time")
        .eq("user_id", userId)
        .gte("meal_time", hoursAgoIso(24))
        .order("meal_time", { ascending: false })
        .limit(120),
      supabase
        .from("wellness_daily_metrics")
        .select("metric_date,steps,hrv,stress_avg,body_battery_avg,training_readiness,recovery_hours,vo2_max,resting_hr")
        .eq("user_id", userId)
        .gte("metric_date", startOfDayIso(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).slice(0, 10))
        .order("metric_date", { ascending: false })
        .limit(1),
    ]);

    const sleepRow = sleepQuery.data?.[0] ?? null;
    const sleep =
      sleepRow == null
        ? null
        : {
            date: sleepRow.sleep_date == null ? null : String(sleepRow.sleep_date),
            totalSleepMin: toNumber(sleepRow.total_sleep_min),
            sleepScore: toNumber(sleepRow.sleep_score),
            readinessScore: toNumber(sleepRow.readiness_score),
            restingHr: toNumber(sleepRow.resting_hr),
            hrv: toNumber(sleepRow.hrv),
          };

    const nutritionRows = nutritionQuery.data ?? [];
    const nutrition =
      nutritionRows.length === 0
        ? null
        : {
            entriesLast24h: nutritionRows.length,
            caloriesLast24h: roundNullable(sumNumeric(nutritionRows.map((row) => row.calories))),
            proteinLast24h: roundNullable(sumNumeric(nutritionRows.map((row) => row.protein_g))),
            carbsLast24h: roundNullable(sumNumeric(nutritionRows.map((row) => row.carbs_g))),
            hydrationLast24h: roundNullable(sumNumeric(nutritionRows.map((row) => row.hydration_ml))),
            hasPhotoMeals: nutritionRows.some((row) => typeof row.photo_url === "string" && row.photo_url.length > 0),
            pendingRecognitionCount: nutritionRows.filter((row) => row.recognition_status === "pending").length,
          };

    const dailyRow = dailyQuery.data?.[0] ?? null;
    const dailyMetrics =
      dailyRow == null
        ? null
        : {
            date: dailyRow.metric_date == null ? null : String(dailyRow.metric_date),
            steps: toNumber(dailyRow.steps),
            hrv: toNumber(dailyRow.hrv),
            stressAvg: toNumber(dailyRow.stress_avg),
            bodyBatteryAvg: toNumber(dailyRow.body_battery_avg),
            trainingReadiness: toNumber(dailyRow.training_readiness),
            recoveryHours: toNumber(dailyRow.recovery_hours),
            vo2Max: toNumber(dailyRow.vo2_max),
            restingHr: toNumber(dailyRow.resting_hr),
          };

    const riskFlags: string[] = [];
    const insights: string[] = [];

    if (sleep?.totalSleepMin != null) {
      if (sleep.totalSleepMin < 360) riskFlags.push("sleep_debt");
      if (sleep.totalSleepMin < 420) insights.push("Sleep duration is below marathon-block target; downshift intensity if fatigue is high.");
      else insights.push("Sleep duration is supportive for quality training today.");
    } else {
      insights.push("No sleep data in the last 48h. Add manual sleep or connect a wearable source.");
    }

    if (nutrition?.entriesLast24h != null) {
      if (nutrition.entriesLast24h < 2) riskFlags.push("nutrition_logging_sparse");
      if ((nutrition.hydrationLast24h ?? 0) < 1200) riskFlags.push("hydration_low");
      if ((nutrition.proteinLast24h ?? 0) < 70) insights.push("Protein intake appears low for recovery; consider adding post-session protein.");
      if (nutrition.pendingRecognitionCount > 0) {
        insights.push(`${nutrition.pendingRecognitionCount} photo meal(s) waiting on recognition review.`);
      }
    } else {
      insights.push("No nutrition data logged in last 24h.");
    }

    if (dailyMetrics) {
      if ((dailyMetrics.hrv ?? 999) < 35) riskFlags.push("hrv_low");
      if ((dailyMetrics.stressAvg ?? 0) > 55) riskFlags.push("stress_high");
      if ((dailyMetrics.bodyBatteryAvg ?? 100) < 40) riskFlags.push("body_battery_low");
      if ((dailyMetrics.trainingReadiness ?? 100) < 40) riskFlags.push("training_readiness_low");
      if ((dailyMetrics.recoveryHours ?? 0) > 36) riskFlags.push("recovery_demand_high");

      if ((dailyMetrics.hrv ?? 999) < 40) insights.push("HRV is suppressed versus typical healthy range; keep quality conservative until trend stabilizes.");
      if ((dailyMetrics.stressAvg ?? 0) > 50) insights.push("Average stress is elevated; watch perceived effort drift in planned sessions.");
      if ((dailyMetrics.bodyBatteryAvg ?? 100) < 45) insights.push("Body Battery trend is low; prioritize sleep and fueling before key workouts.");
    } else {
      insights.push("No daily wellness metrics imported yet (HRV/stress/body battery/readiness).");
    }

    const dataQuality: WellnessSnapshot["dataQuality"] =
      sleep && nutrition && dailyMetrics ? "good" : sleep || nutrition || dailyMetrics ? "partial" : "none";

    return {
      sleep,
      nutrition,
      dailyMetrics,
      dataQuality,
      riskFlags,
      insights,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      sleep: null,
      nutrition: null,
      dailyMetrics: null,
      dataQuality: "none",
      riskFlags: [],
      insights: ["Wellness inputs are not available yet in this environment."],
      generatedAt: new Date().toISOString(),
    };
  }
}

function sumNumeric(values: unknown[]): number {
  return values.reduce<number>((sum, value) => {
    const n = toNumber(value);
    return n == null ? sum : sum + n;
  }, 0);
}

function roundNullable(value: number | null) {
  if (value == null) return null;
  return Number(value.toFixed(1));
}
