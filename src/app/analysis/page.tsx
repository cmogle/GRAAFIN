import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PerformanceDashboard } from "@/components/analysis/performance-dashboard";
import { createClient } from "@/lib/supabase/server";
import { getPrimaryAthleteId } from "@/lib/athlete";
import {
  aggregateDailyFacts,
  computeTrainingLoad,
  type ActivitySample,
} from "@/lib/metrics/load";
import type { DailyMetricRow, SleepRow } from "@/lib/analysis/transforms";
import type { PerformanceActivity } from "@/lib/analysis/performance-transforms";

function mapMetric(row: Record<string, unknown>): DailyMetricRow {
  return {
    metric_date: String(row.metric_date ?? ""),
    resting_hr: row.resting_hr != null ? Number(row.resting_hr) : null,
    hrv: row.hrv != null ? Number(row.hrv) : null,
    hrv_status: row.hrv_status != null ? String(row.hrv_status) : null,
    stress_avg: row.stress_avg != null ? Number(row.stress_avg) : null,
    stress_high_min: row.stress_high_min != null ? Number(row.stress_high_min) : null,
    body_battery_avg: row.body_battery_avg != null ? Number(row.body_battery_avg) : null,
    body_battery_min: row.body_battery_min != null ? Number(row.body_battery_min) : null,
    body_battery_max: row.body_battery_max != null ? Number(row.body_battery_max) : null,
    bb_charged: row.bb_charged != null ? Number(row.bb_charged) : null,
    bb_drained: row.bb_drained != null ? Number(row.bb_drained) : null,
    steps: row.steps != null ? Number(row.steps) : null,
    intensity_minutes: row.intensity_minutes != null ? Number(row.intensity_minutes) : null,
    training_readiness: row.training_readiness != null ? Number(row.training_readiness) : null,
    respiration_avg: row.respiration_avg != null ? Number(row.respiration_avg) : null,
    spo2_avg: row.spo2_avg != null ? Number(row.spo2_avg) : null,
    vo2_max: row.vo2_max != null ? Number(row.vo2_max) : null,
    calories_total: row.calories_total != null ? Number(row.calories_total) : null,
    resting_hr_7d_avg: row.resting_hr_7d_avg != null ? Number(row.resting_hr_7d_avg) : null,
  };
}

function mapSleep(row: Record<string, unknown>): SleepRow {
  return {
    sleep_date: String(row.sleep_date ?? ""),
    total_sleep_min: row.total_sleep_min != null ? Number(row.total_sleep_min) : null,
    sleep_score: row.sleep_score != null ? Number(row.sleep_score) : null,
    sleep_quality: row.sleep_quality != null ? String(row.sleep_quality) : null,
    readiness_score: row.readiness_score != null ? Number(row.readiness_score) : null,
    rem_sleep_min: row.rem_sleep_min != null ? Number(row.rem_sleep_min) : null,
    deep_sleep_min: row.deep_sleep_min != null ? Number(row.deep_sleep_min) : null,
    resting_hr: row.resting_hr != null ? Number(row.resting_hr) : null,
    hrv: row.hrv != null ? Number(row.hrv) : null,
  };
}

function mapPerformanceActivity(row: Record<string, unknown>): PerformanceActivity {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    type: String(row.type ?? "Run"),
    startDate: String(row.start_date ?? new Date().toISOString()),
    distanceM: Number(row.distance_m ?? 0),
    movingTimeS: Number(row.moving_time_s ?? 0),
    averageSpeed: Number(row.average_speed ?? 0),
    averageHeartrate: row.average_heartrate != null ? Number(row.average_heartrate) : null,
    maxHeartrate: row.max_heartrate != null ? Number(row.max_heartrate) : null,
    sufferScore: row.suffer_score != null ? Number(row.suffer_score) : null,
    totalElevation: row.total_elevation != null ? Number(row.total_elevation) : null,
    elapsedTimeS: row.elapsed_time_s != null ? Number(row.elapsed_time_s) : null,
    prCount: row.pr_count != null ? Number(row.pr_count) : null,
  };
}

export default async function AnalysisPage() {
  const supabase = await createClient();
  const athleteId = getPrimaryAthleteId();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch all three datasets in parallel
  const [metricsResult, sleepResult, activitiesResult] = await Promise.all([
    supabase
      .from("wellness_daily_metrics")
      .select(
        "metric_date,resting_hr,hrv,hrv_status,stress_avg,stress_high_min,body_battery_avg,body_battery_min,body_battery_max,bb_charged,bb_drained,steps,intensity_minutes,training_readiness,respiration_avg,spo2_avg,vo2_max,calories_total,resting_hr_7d_avg",
      )
      .eq("user_id", user.id)
      .order("metric_date", { ascending: true })
      .limit(2000),
    supabase
      .from("wellness_sleep_sessions")
      .select(
        "sleep_date,total_sleep_min,sleep_score,sleep_quality,readiness_score,rem_sleep_min,deep_sleep_min,resting_hr,hrv",
      )
      .eq("user_id", user.id)
      .order("sleep_date", { ascending: true })
      .limit(2000),
    supabase
      .from("strava_activities")
      .select("id,name,type,start_date,distance_m,moving_time_s,average_speed,average_heartrate,max_heartrate,suffer_score,total_elevation,elapsed_time_s,pr_count")
      .eq("athlete_id", athleteId)
      .order("start_date", { ascending: true })
      .limit(5000),
  ]);

  const metrics = (metricsResult.data ?? []).map((row) =>
    mapMetric(row as Record<string, unknown>),
  );
  const sleep = (sleepResult.data ?? []).map((row) =>
    mapSleep(row as Record<string, unknown>),
  );
  const perfActivities = (activitiesResult.data ?? []).map((row) =>
    mapPerformanceActivity(row as Record<string, unknown>),
  );

  // Compute training load series (needs basic ActivitySample)
  const activitySamples: ActivitySample[] = perfActivities.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    startDate: a.startDate,
    distanceM: a.distanceM,
    movingTimeS: a.movingTimeS,
    averageHeartrate: a.averageHeartrate,
  }));
  const dailyFacts = aggregateDailyFacts(activitySamples);
  const loadSeries = computeTrainingLoad(dailyFacts);

  const runCount = perfActivities.filter((a) => a.type.toLowerCase() === "run").length;

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Performance Intelligence
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Training load, pace, and performance analysis across{" "}
          {runCount.toLocaleString()} runs and{" "}
          {metrics.length.toLocaleString()} days of wellness data.
        </p>
      </div>

      <PerformanceDashboard
        activities={perfActivities}
        metrics={metrics}
        sleep={sleep}
        dailyFacts={dailyFacts}
        loadSeries={loadSeries}
        athleteId={athleteId}
      />
    </AppShell>
  );
}
