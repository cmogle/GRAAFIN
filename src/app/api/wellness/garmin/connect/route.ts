import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/feature-flags";

type ConnectPayload = {
  action?: "connect" | "disconnect";
};

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

export async function POST(request: NextRequest) {
  if (!featureFlags.wellnessSleepV1 && !featureFlags.wellnessNutritionV1) {
    return NextResponse.json({ error: "Wellness features are disabled" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as ConnectPayload;
  const action = body.action === "disconnect" ? "disconnect" : "connect";
  const now = new Date().toISOString();
  const { data: sourceRows, error: sourceError } = await supabase
    .from("wellness_data_sources")
    .select("id,provider,status,metadata,last_synced_at")
    .eq("user_id", user.id);
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });

  const existingSource =
    (sourceRows ?? []).find((row) => row.provider === "other" && isGarminExportSource(row.metadata)) ?? null;
  const existingImportReady = hasGarminImportSignal(existingSource?.metadata ?? null);
  const nextStatus = action === "disconnect" ? "disconnected" : existingImportReady ? "connected" : "pending";
  const nextMetadata =
    action === "disconnect"
      ? {
          providerName: "garmin_connect_export",
          mode: "export_file",
          disconnectedAt: now,
          updatedAt: now,
        }
      : {
          ...toMetadata(existingSource?.metadata),
          providerName: "garmin_connect_export",
          mode: "export_file",
          setupRequestedAt: now,
          updatedAt: now,
        };

  const { error } = await supabase.from("wellness_data_sources").upsert(
    {
      user_id: user.id,
      provider: "other",
      status: nextStatus,
      metadata: nextMetadata,
      last_synced_at:
        action === "disconnect"
          ? null
          : nextStatus === "connected" && existingSource?.last_synced_at
            ? existingSource.last_synced_at
            : null,
    },
    { onConflict: "user_id,provider" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    connected: nextStatus === "connected",
    status: nextStatus,
    mode: "export_file",
    message:
      action === "connect"
        ? nextStatus === "connected"
          ? "Garmin export mode is active."
          : "Garmin export mode enabled. Import a Garmin Connect export file to complete setup."
        : "Garmin export mode disconnected.",
  });
}
