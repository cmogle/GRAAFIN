import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/feature-flags";
import { parseGarminWellnessImport } from "@/lib/wellness/garmin-import";

export async function POST(request: NextRequest) {
  if (!featureFlags.wellnessSleepV1 && !featureFlags.wellnessNutritionV1) {
    return NextResponse.json({ error: "Wellness features are disabled" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "FormData payload required" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file input named 'file'" }, { status: 400 });
  }

  const text = await file.text();
  const parsed = parseGarminWellnessImport(text);
  if (!parsed.sleepRecords.length && !parsed.dailyMetricRecords.length && !parsed.rawRecords.length) {
    return NextResponse.json(
      { error: "No importable Garmin wellness records detected.", warnings: parsed.warnings },
      { status: 400 },
    );
  }

  const sleepRows = parsed.sleepRecords.map((record) => ({
    user_id: user.id,
    sleep_date: record.sleepDate,
    bedtime: record.bedtime,
    wake_time: record.wakeTime,
    total_sleep_min: record.totalSleepMin,
    rem_sleep_min: record.remSleepMin,
    deep_sleep_min: record.deepSleepMin,
    resting_hr: record.restingHr,
    hrv: record.hrv,
    sleep_score: record.sleepScore,
    readiness_score: record.readinessScore,
    sleep_quality: record.sleepQuality,
    sleep_need_min: record.sleepNeedMin,
    source: "garmin_connect",
    confidence: 0.84,
    raw_data: {
      provider: "garmin_connect_export",
      fileName: file.name,
      importedAt: new Date().toISOString(),
      row: record.raw,
    },
  }));

  const dailyRows = parsed.dailyMetricRecords.map((record) => ({
    user_id: user.id,
    metric_date: record.metricDate,
    source: "garmin_connect",
    confidence: 0.82,
    steps: record.steps,
    distance_km: record.distanceKm,
    calories_total: record.caloriesTotal,
    calories_active: record.caloriesActive,
    calories_resting: record.caloriesResting,
    intensity_minutes: record.intensityMinutes,
    intensity_minutes_week: record.intensityMinutesWeek,
    resting_hr: record.restingHr,
    resting_hr_7d_avg: record.restingHr7dAvg,
    avg_hr: record.avgHr,
    min_hr: record.minHr,
    max_hr: record.maxHr,
    hrv: record.hrv,
    hrv_status: record.hrvStatus,
    hrv_overnight: record.hrvOvernight,
    hrv_5min_high: record.hrv5minHigh,
    stress_avg: record.stressAvg,
    stress_max: record.stressMax,
    stress_rest_min: record.stressRestMin,
    stress_low_min: record.stressLowMin,
    stress_medium_min: record.stressMediumMin,
    stress_high_min: record.stressHighMin,
    body_battery_avg: record.bodyBatteryAvg,
    body_battery_min: record.bodyBatteryMin,
    body_battery_max: record.bodyBatteryMax,
    bb_charged: record.bbCharged,
    bb_drained: record.bbDrained,
    respiration_avg: record.respirationAvg,
    respiration_sleep_avg: record.respirationSleepAvg,
    respiration_low: record.respirationLow,
    respiration_high: record.respirationHigh,
    spo2_avg: record.spo2Avg,
    spo2_sleep_avg: record.spo2SleepAvg,
    training_readiness: record.trainingReadiness,
    training_readiness_status: record.trainingReadinessStatus,
    recovery_hours: record.recoveryHours,
    vo2_max: record.vo2Max,
    steps_7d_avg: record.steps7dAvg,
    floors_up: record.floorsUp,
    raw_data: {
      provider: "garmin_connect_export",
      fileName: file.name,
      importedAt: new Date().toISOString(),
      row: record.raw,
    },
  }));

  const rawRows = parsed.rawRecords.map((record) => ({
    user_id: user.id,
    metric_type: record.metricType,
    record_date: record.recordDate,
    row_hash: record.rowHash,
    source_file_name: file.name,
    source_format: file.name.toLowerCase().endsWith(".csv") ? "csv" : file.name.toLowerCase().endsWith(".json") ? "json" : "unknown",
    payload: {
      provider: "garmin_connect_export",
      row: record.payload,
    },
  }));

  if (sleepRows.length) {
    const { error } = await supabase
      .from("wellness_sleep_sessions")
      .upsert(sleepRows, { onConflict: "user_id,sleep_date,source" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (dailyRows.length) {
    const { error } = await supabase
      .from("wellness_daily_metrics")
      .upsert(dailyRows, { onConflict: "user_id,metric_date,source" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (rawRows.length) {
    const { error } = await supabase
      .from("garmin_connect_raw_records")
      .upsert(rawRows, { onConflict: "user_id,row_hash" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sourceMetadata = {
    mode: "export_file",
    connectedAt: new Date().toISOString(),
    lastFileName: file.name,
    lastImportedAt: new Date().toISOString(),
    importedSleepRecords: sleepRows.length,
    importedDailyMetricRecords: dailyRows.length,
    importedRawRecords: rawRows.length,
  };

  await supabase.from("wellness_data_sources").upsert(
    {
      user_id: user.id,
      provider: "garmin_connect",
      status: "connected",
      metadata: {
        ...sourceMetadata,
      },
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );

  return NextResponse.json({
    ok: true,
    importedSleepRecords: sleepRows.length,
    importedDailyMetricRecords: dailyRows.length,
    importedRawRecords: rawRows.length,
    warnings: parsed.warnings,
    source: "garmin_connect",
  });
}
