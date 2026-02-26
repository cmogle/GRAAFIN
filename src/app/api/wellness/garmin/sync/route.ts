import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/feature-flags";

function isGarminExportSource(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return false;
  const record = metadata as Record<string, unknown>;
  return record.providerName === "garmin_connect_export";
}

function toMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return {} as Record<string, unknown>;
  return metadata as Record<string, unknown>;
}

function hasGarminImportSignal(metadata: unknown) {
  const record = toMetadata(metadata);
  const importedAt = typeof record.lastImportedAt === "string" && record.lastImportedAt.trim().length > 0;
  const importedSleep = Number(record.importedSleepRecords ?? 0) > 0;
  const importedDaily = Number(record.importedDailyMetricRecords ?? 0) > 0;
  const importedRaw = Number(record.importedRawRecords ?? 0) > 0;
  return importedAt || importedSleep || importedDaily || importedRaw;
}

export async function POST() {
  if (!featureFlags.wellnessSleepV1 && !featureFlags.wellnessNutritionV1) {
    return NextResponse.json({ error: "Wellness features are disabled" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: sourceRows, error: sourceError } = await supabase
    .from("wellness_data_sources")
    .select("id,provider,status,metadata")
    .eq("user_id", user.id);
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
  const source = (sourceRows ?? []).find((row) => row.provider === "other" && isGarminExportSource(row.metadata)) ?? null;
  const importReady = hasGarminImportSignal(source?.metadata ?? null);
  if (!source || source.status !== "connected" || !importReady) {
    return NextResponse.json(
      {
        ok: false,
        connected: false,
        message: "Garmin export is not ready. Import a Garmin Connect export file first.",
      },
      { status: 400 },
    );
  }

  const [{ count: sleepCount }, { count: dailyCount }, { count: rawCount }] = await Promise.all([
    supabase.from("wellness_sleep_sessions").select("id", { head: true, count: "exact" }).eq("user_id", user.id).eq("source", "other"),
    supabase.from("wellness_daily_metrics").select("id", { head: true, count: "exact" }).eq("user_id", user.id).eq("source", "other"),
    supabase.from("garmin_connect_raw_records").select("id", { head: true, count: "exact" }).eq("user_id", user.id),
  ]);

  const now = new Date().toISOString();
  await supabase
    .from("wellness_data_sources")
    .update({
      last_synced_at: now,
      metadata: {
        ...(typeof source.metadata === "object" && source.metadata ? source.metadata : {}),
        providerName: "garmin_connect_export",
        mode: "export_file",
        lastManualSyncAt: now,
        currentCounts: {
          sleep: sleepCount ?? 0,
          dailyMetrics: dailyCount ?? 0,
          raw: rawCount ?? 0,
        },
      },
    })
    .eq("id", source.id)
    .eq("user_id", user.id);

  return NextResponse.json({
    ok: true,
    connected: true,
    mode: "export_file",
    message: "Garmin manual sync completed (export-backed).",
    counts: {
      sleep: sleepCount ?? 0,
      dailyMetrics: dailyCount ?? 0,
      raw: rawCount ?? 0,
    },
    lastSyncedAt: now,
  });
}
