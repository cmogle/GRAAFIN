import { createClient } from "@/lib/supabase/server";
import { getPrimaryAthleteId } from "@/lib/athlete";

type AnyRow = Record<string, unknown>;
const SYNC_DATE_KEYS = ["last_success_at", "last_synced_at", "synced_at", "updated_at"] as const;

function pickDate(row: AnyRow | null | undefined, keys: string[]): string | null {
  if (!row) return null;
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function asEpochMs(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function latestSyncRow(rows: AnyRow[] | null | undefined): AnyRow | null {
  if (!rows?.length) return null;

  let chosen: AnyRow | null = null;
  let chosenMs = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    const bestForRow = SYNC_DATE_KEYS.reduce((best, key) => {
      const candidate = asEpochMs(row[key]);
      if (candidate == null) return best;
      return Math.max(best, candidate);
    }, Number.NEGATIVE_INFINITY);

    if (bestForRow > chosenMs) {
      chosen = row;
      chosenMs = bestForRow;
    }
  }

  return chosen;
}

export async function getStravaStatus() {
  const supabase = await createClient();
  const athleteId = getPrimaryAthleteId();

  const [{ data: latestActivity }, { data: syncRows }] = await Promise.all([
    supabase
      .from("strava_activities")
      .select("id,name,type,start_date,distance_m,moving_time_s")
      .eq("athlete_id", athleteId)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("strava_sync_state").select("*").eq("athlete_id", athleteId).limit(25),
  ]);

  const syncRow = latestSyncRow((syncRows as AnyRow[] | null | undefined) ?? null);
  const lastSuccessfulSyncAt = pickDate(syncRow, [...SYNC_DATE_KEYS]);

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
