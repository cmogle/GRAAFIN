import { SupabaseClient } from "@supabase/supabase-js";

export type WellnessSnapshot = {
  sleep: {
    date: string | null;
    totalSleepMin: number | null;
    sleepScore: number | null;
    readinessScore: number | null;
    sleepQuality: string | null;
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
    hrvOvernight: number | null;
    hrvStatus: string | null;
    stressAvg: number | null;
    stressHighMin: number | null;
    bodyBatteryAvg: number | null;
    bbCharged: number | null;
    bbDrained: number | null;
    trainingReadiness: number | null;
    trainingReadinessStatus: string | null;
    recoveryHours: number | null;
    vo2Max: number | null;
    restingHr: number | null;
    restingHr7dAvg: number | null;
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
        .select("sleep_date,total_sleep_min,sleep_score,readiness_score,sleep_quality,resting_hr,hrv")
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
        .select("metric_date,steps,hrv,hrv_overnight,hrv_status,stress_avg,stress_high_min,body_battery_avg,bb_charged,bb_drained,training_readiness,training_readiness_status,recovery_hours,vo2_max,resting_hr,resting_hr_7d_avg")
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
            sleepQuality: sleepRow.sleep_quality == null ? null : String(sleepRow.sleep_quality),
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
            hrvOvernight: toNumber(dailyRow.hrv_overnight),
            hrvStatus: dailyRow.hrv_status == null ? null : String(dailyRow.hrv_status),
            stressAvg: toNumber(dailyRow.stress_avg),
            stressHighMin: toNumber(dailyRow.stress_high_min),
            bodyBatteryAvg: toNumber(dailyRow.body_battery_avg),
            bbCharged: toNumber(dailyRow.bb_charged),
            bbDrained: toNumber(dailyRow.bb_drained),
            trainingReadiness: toNumber(dailyRow.training_readiness),
            trainingReadinessStatus: dailyRow.training_readiness_status == null ? null : String(dailyRow.training_readiness_status),
            recoveryHours: toNumber(dailyRow.recovery_hours),
            vo2Max: toNumber(dailyRow.vo2_max),
            restingHr: toNumber(dailyRow.resting_hr),
            restingHr7dAvg: toNumber(dailyRow.resting_hr_7d_avg),
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
      if (dailyMetrics.hrvStatus === "LOW" || dailyMetrics.hrvStatus === "UNBALANCED") riskFlags.push("hrv_status_concern");
      if ((dailyMetrics.stressAvg ?? 0) > 55) riskFlags.push("stress_high");
      if ((dailyMetrics.stressHighMin ?? 0) > 120) riskFlags.push("stress_high_duration");
      if ((dailyMetrics.bodyBatteryAvg ?? 100) < 40) riskFlags.push("body_battery_low");
      if ((dailyMetrics.bbDrained ?? 0) > 80 && (dailyMetrics.bbCharged ?? 100) < 30) riskFlags.push("body_battery_net_negative");
      if ((dailyMetrics.trainingReadiness ?? 100) < 40) riskFlags.push("training_readiness_low");
      if (dailyMetrics.trainingReadinessStatus === "Poor" || dailyMetrics.trainingReadinessStatus === "Low") riskFlags.push("training_readiness_status_concern");
      if ((dailyMetrics.recoveryHours ?? 0) > 36) riskFlags.push("recovery_demand_high");

      if ((dailyMetrics.hrv ?? 999) < 40) insights.push("HRV is suppressed versus typical healthy range; keep quality conservative until trend stabilizes.");
      if (dailyMetrics.hrvStatus && dailyMetrics.hrvStatus !== "BALANCED") insights.push(`HRV status is ${dailyMetrics.hrvStatus}; monitor trends over the next few days.`);
      if ((dailyMetrics.stressAvg ?? 0) > 50) insights.push("Average stress is elevated; watch perceived effort drift in planned sessions.");
      if ((dailyMetrics.bodyBatteryAvg ?? 100) < 45) insights.push("Body Battery trend is low; prioritize sleep and fueling before key workouts.");
      if (dailyMetrics.trainingReadinessStatus && dailyMetrics.trainingReadinessStatus !== "Prime" && dailyMetrics.trainingReadinessStatus !== "High") {
        insights.push(`Training readiness is ${dailyMetrics.trainingReadinessStatus}; consider adjusting session intensity.`);
      }
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
