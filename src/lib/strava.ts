import { createClient } from "@/lib/supabase/server";

type AnyRow = Record<string, unknown>;

function pickDate(row: AnyRow | null | undefined, keys: string[]): string | null {
  if (!row) return null;
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

export async function getStravaStatus() {
  const supabase = await createClient();

  const [{ data: latestActivity }, { data: syncRows }] = await Promise.all([
    supabase
      .from("strava_activities")
      .select("id,name,type,start_date,distance_m,moving_time_s")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("strava_sync_state").select("*").limit(1),
  ]);

  const syncRow = (syncRows?.[0] as AnyRow | undefined) ?? null;
  const lastSuccessfulSyncAt = pickDate(syncRow, [
    "last_success_at",
    "last_synced_at",
    "synced_at",
    "updated_at",
  ]);

  const connected = Boolean(latestActivity);

  return {
    connected,
    lastSuccessfulSyncAt,
    latestActivity: latestActivity
      ? {
          name: (latestActivity.name as string) || "Activity",
          type: (latestActivity.type as string) || "Run",
          startDate: latestActivity.start_date as string,
          distanceM: (latestActivity.distance_m as number) || 0,
          movingTimeS: (latestActivity.moving_time_s as number) || 0,
        }
      : null,
  };
}
