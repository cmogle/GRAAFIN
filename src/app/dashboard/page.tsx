import { AppShell } from "@/components/app-shell";
import { KpiCard } from "@/components/kpi-card";
import { SectionCard } from "@/components/section-card";
import { SyncTriggerButton } from "@/components/sync-trigger-button";
import { createClient } from "@/lib/supabase/server";
import { getStravaStatus } from "@/lib/strava";

function formatPace(secondsPerKm: number) {
  const min = Math.floor(secondsPerKm / 60);
  const sec = Math.round(secondsPerKm % 60)
    .toString()
    .padStart(2, "0");
  return `${min}:${sec}/km`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const status = await getStravaStatus();

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);

  const { data: weeklyRuns } = await supabase
    .from("strava_activities")
    .select("id,distance_m,moving_time_s,average_speed,start_date,name")
    .eq("type", "Run")
    .gte("start_date", weekAgo.toISOString())
    .order("start_date", { ascending: false });

  const runs = weeklyRuns ?? [];
  const weeklyDistanceKm = runs.reduce((sum, r) => sum + ((r.distance_m as number) || 0), 0) / 1000;
  const runCount = runs.length;
  const avgSpeed = runs.length
    ? runs.reduce((sum, r) => sum + ((r.average_speed as number) || 0), 0) / runs.length
    : 0;
  const pace = avgSpeed > 0 ? formatPace(1000 / avgSpeed) : "--";

  const latestSummary = status.latestActivity
    ? `${status.latestActivity.type}: ${status.latestActivity.name} • ${(status.latestActivity.distanceM / 1000).toFixed(1)} km`
    : "No activities found yet.";

  return (
    <AppShell>
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Hi Fionnuala 👋</h1>
        <p className="mt-1 text-sm text-slate-600">Weekly training snapshot powered by live Strava data in Supabase.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Strava Connection"
          value={status.connected ? "Connected" : "Not connected"}
          sub={status.connected ? "Data available" : "No activity rows"}
          status={status.connected ? "green" : "red"}
        />
        <KpiCard label="Weekly Distance" value={`${weeklyDistanceKm.toFixed(1)} km`} sub="Live" status="green" />
        <KpiCard label="Run Count" value={`${runCount}`} sub="Rolling 7d" status="neutral" />
        <KpiCard label="Avg Pace" value={pace} sub="Rolling 7d" status="neutral" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SectionCard title="Sync status">
            <div className="space-y-2 text-sm text-slate-700">
              <p>
                Last successful sync:{" "}
                {status.lastSuccessfulSyncAt ? new Date(status.lastSuccessfulSyncAt).toLocaleString() : "Unknown"}
              </p>
              <p>Latest activity: {latestSummary}</p>
              <SyncTriggerButton />
            </div>
          </SectionCard>
        </div>
        <SectionCard title="Coaching alerts">
          <ul className="space-y-2 text-sm text-slate-700">
            <li className="rounded-xl bg-amber-50 p-3">Automated alerts will appear here after readiness logic is wired.</li>
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Recent activities (live)">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Run</th>
                <th className="px-2 py-2">Distance</th>
                <th className="px-2 py-2">Moving Time</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 10).map((run) => (
                <tr key={run.id as string} className="border-t border-slate-100">
                  <td className="px-2 py-2">{new Date(run.start_date as string).toLocaleDateString()}</td>
                  <td className="px-2 py-2">{(run.name as string) ?? "Run"}</td>
                  <td className="px-2 py-2">{(((run.distance_m as number) || 0) / 1000).toFixed(1)} km</td>
                  <td className="px-2 py-2">{Math.round((((run.moving_time_s as number) || 0) / 60))} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
