import { AppShell } from "@/components/app-shell";
import { RunComparisonPanel } from "@/components/dashboard/run-comparison-panel";
import { SectionCard } from "@/components/section-card";
import { compareRunVsCategory, formatPace, marathonBlockPatterns, RunActivity } from "@/lib/metrics/dashboard";
import { getCachedRunComparison } from "@/lib/metrics/cache";
import { createClient } from "@/lib/supabase/server";

function toRun(row: Record<string, unknown>): RunActivity {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? "Run"),
    startDate: String(row.start_date ?? new Date().toISOString()),
    distanceM: Number(row.distance_m ?? 0),
    movingTimeS: Number(row.moving_time_s ?? 0),
    averageSpeed: Number(row.average_speed ?? 0),
    averageHeartrate: row.average_heartrate ? Number(row.average_heartrate) : null,
  };
}

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("strava_activities")
    .select("id,name,type,start_date,distance_m,moving_time_s,average_speed,average_heartrate")
    .eq("type", "Run")
    .order("start_date", { ascending: false })
    .limit(400);

  const runs = (data ?? []).map((row) => toRun(row as Record<string, unknown>));
  const run = runs.find((r) => r.id === id);

  if (!run) {
    return (
      <AppShell>
        <SectionCard title="Activity not found">
          <p className="text-sm text-slate-600">Could not find that run in the recent synced set.</p>
        </SectionCard>
      </AppShell>
    );
  }

  const comp = await getCachedRunComparison(supabase, run, runs);
  const twelveMonthsAgo = new Date(run.startDate);
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const yearlyPool = runs.filter((r) => +new Date(r.startDate) >= +twelveMonthsAgo);
  const comp12m = compareRunVsCategory(run, yearlyPool);
  const marathonBlocks = marathonBlockPatterns(runs);

  return (
    <AppShell>
      <SectionCard title={run.name}>
        <p className="text-sm text-slate-600">
          {new Date(run.startDate).toLocaleString()} · {(run.distanceM / 1000).toFixed(1)} km · {formatPace(comp.runPace)}
        </p>
      </SectionCard>

      <SectionCard title="Same-category evolution (auto)">
        <RunComparisonPanel comparison={comp} yearlyComparison={comp12m} />
      </SectionCard>

      <SectionCard title="Marathon-block lens">
        <p className="mb-3 text-sm text-slate-600">8 true race marathons are used (July 2025 anomaly excluded).</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="px-2 py-2">Race</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Avg weekly km</th>
                <th className="px-2 py-2">Long runs</th>
              </tr>
            </thead>
            <tbody>
              {marathonBlocks.map((b) => (
                <tr key={b.raceId} className="border-t border-slate-100">
                  <td className="px-2 py-2">{b.raceName}</td>
                  <td className="px-2 py-2">{new Date(b.raceDate).toLocaleDateString()}</td>
                  <td className="px-2 py-2">{b.avgWeeklyKm.toFixed(1)} km</td>
                  <td className="px-2 py-2">{b.longRunCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
