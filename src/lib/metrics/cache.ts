import { SupabaseClient } from "@supabase/supabase-js";
import { compareRunVsCategory, RunActivity } from "@/lib/metrics/dashboard";

type CachedComparison = ReturnType<typeof compareRunVsCategory> & { cachedAt?: string; cacheHit?: boolean };

export async function getCachedRunComparison(
  supabase: SupabaseClient,
  run: RunActivity,
  allRuns: RunActivity[],
): Promise<CachedComparison> {
  try {
    const { data: cached } = await supabase
      .from("run_insight_cache")
      .select("payload,updated_at")
      .eq("run_id", run.id)
      .eq("insight_type", "distance_band_compare")
      .maybeSingle();

    if (cached?.payload && typeof cached.payload === "object") {
      return {
        ...(cached.payload as CachedComparison),
        cachedAt: String(cached.updated_at ?? ""),
        cacheHit: true,
      };
    }
  } catch {
    // cache table may not exist yet; fall through to compute path
  }

  const computed = compareRunVsCategory(run, allRuns);

  try {
    await supabase.from("run_insight_cache").upsert(
      {
        run_id: run.id,
        insight_type: "distance_band_compare",
        payload: computed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "run_id,insight_type" },
    );
  } catch {
    // non-fatal if cache write fails
  }

  return { ...computed, cacheHit: false };
}
