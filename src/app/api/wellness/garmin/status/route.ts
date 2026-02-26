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

export async function GET() {
  if (!featureFlags.wellnessSleepV1 && !featureFlags.wellnessNutritionV1) {
    return NextResponse.json({ error: "Wellness features are disabled" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("wellness_data_sources")
    .select("id,provider,status,last_synced_at,metadata,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const source = (data ?? []).find((row) => row.provider === "other" && isGarminExportSource(row.metadata)) ?? null;
  if (!source) {
    return NextResponse.json({
      connected: false,
      provider: "garmin_connect_export",
      status: "disconnected",
      lastSyncedAt: null,
      metadata: null,
    });
  }

  const metadata = toMetadata(source.metadata);
  const importReady = hasGarminImportSignal(metadata);
  const connected = source.status === "connected" && importReady;
  const status = source.status === "connected" && !importReady ? "pending" : source.status;

  return NextResponse.json({
    connected,
    provider: "garmin_connect_export",
    status,
    lastSyncedAt: connected && source.last_synced_at != null ? String(source.last_synced_at) : null,
    metadata,
  });
}
