import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { MarathonBlockExplorer } from "@/components/dashboard/marathon-block-explorer";
import {
  RunActivity,
  marathonBlockPatterns,
  runTypeEvolution,
  weeklyDistanceTrend,
} from "@/lib/metrics/dashboard";
import { createClient } from "@/lib/supabase/server";
import { getPrimaryAthleteId } from "@/lib/athlete";

function mapRun(row: Record<string, unknown>): RunActivity {
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

export default async function TrendsPage() {
  const supabase = await createClient();
  const athleteId = getPrimaryAthleteId();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data } = await supabase
    .from("strava_activities")
    .select("id,name,type,start_date,distance_m,moving_time_s,average_speed,average_heartrate")
    .eq("athlete_id", athleteId)
    .eq("type", "Run")
    .order("start_date", { ascending: false })
    .limit(1000);

  const runs = (data ?? []).map((row) => mapRun(row as Record<string, unknown>));
  const weekly = weeklyDistanceTrend(runs, 12).map((row) => ({ week: row.week.slice(5), distanceKm: row.distanceKm }));
  const evolution = runTypeEvolution(runs).map((entry) => ({
    type: entry.type,
    latestPace: Math.round(entry.latestPaceSecPerKm / 60),
    baselinePace: Math.round(entry.baselinePaceSecPerKm / 60),
    latestHr: entry.latestHr ?? null,
    baselineHr: entry.baselineHr,
  }));
  const blocks = marathonBlockPatterns(runs);

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Trends</h1>
        <p className="mt-1 text-sm text-slate-600">Explore training progress and marathon-block patterns.</p>
      </div>

      <TrendChart
        title="Weekly run distance (12 weeks)"
        data={weekly}
        xKey="week"
        lines={[{ key: "distanceKm", color: "#0f172a", name: "Weekly km" }]}
      />

      <TrendChart
        title="Run-band evolution"
        data={evolution}
        xKey="type"
        lines={[
          { key: "latestPace", color: "#0f766e", name: "Latest pace (min/km)" },
          { key: "baselinePace", color: "#64748b", name: "Baseline pace (min/km)" },
          { key: "latestHr", color: "#dc2626", name: "Latest HR" },
          { key: "baselineHr", color: "#fb7185", name: "Baseline HR" },
        ]}
      />

      <SectionCard title="Marathon block explorer">
        <MarathonBlockExplorer blocks={blocks} />
      </SectionCard>
    </AppShell>
  );
}
