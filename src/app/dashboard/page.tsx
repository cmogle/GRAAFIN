import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { ActivitiesTable } from "@/components/dashboard/activities-table";
import { CoachPanel } from "@/components/dashboard/coach-panel";
import { MetricCard } from "@/components/dashboard/metric-card";
import { NarrativeHeader } from "@/components/dashboard/narrative-header";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { MarathonBlockExplorer } from "@/components/dashboard/marathon-block-explorer";
import {
  classifyRunType,
  formatPace,
  marathonBlockPatterns,
  paceSecPerKm,
  RunActivity,
  runTypeEvolution,
  weeklyDistanceTrend,
} from "@/lib/metrics/dashboard";
import { createClient } from "@/lib/supabase/server";

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

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("strava_activities")
    .select("id,name,type,start_date,distance_m,moving_time_s,average_speed,average_heartrate")
    .eq("type", "Run")
    .order("start_date", { ascending: false })
    .limit(900);

  const runs = (data ?? []).map((row) => mapRun(row as Record<string, unknown>));
  const weeklyDistance = runs.reduce((sum, r) => sum + r.distanceM, 0) / 1000;
  const avgPace = runs.length ? runs.reduce((sum, r) => sum + paceSecPerKm(r), 0) / runs.length : 0;

  const trendRows = weeklyDistanceTrend(runs, 8).map((r) => ({ week: r.week.slice(5), distanceKm: r.distanceKm }));
  const evolution = runTypeEvolution(runs);
  const marathonPatterns = marathonBlockPatterns(runs);

  const baselineWeekly = trendRows.slice(0, -1).length
    ? trendRows.slice(0, -1).reduce((s, r) => s + Number(r.distanceKm), 0) / trendRows.slice(0, -1).length
    : Number(trendRows[trendRows.length - 1]?.distanceKm ?? 0);
  const latestWeekly = Number(trendRows[trendRows.length - 1]?.distanceKm ?? 0);
  const weeklyDelta = baselineWeekly > 0 ? ((latestWeekly - baselineWeekly) / baselineWeekly) * 100 : 0;

  const easyVsHard = runs.reduce(
    (acc, run) => {
      const type = classifyRunType(run);
      if (type === "short") acc.easy += 1;
      else if (type === "tempo") acc.moderate += 1;
      else acc.hard += 1;
      return acc;
    },
    { easy: 0, moderate: 0, hard: 0 },
  );

  const recommendation = latestWeekly > baselineWeekly * 1.2
    ? "Take next run easy (45-60min zone-2). Keep intensity low after this load bump."
    : "Proceed with a quality session: 20-30min steady tempo after warm-up.";

  return (
    <AppShell>
      <NarrativeHeader
        phase="Marathon build"
        summary={`Last 8 weeks show ${latestWeekly.toFixed(1)} km this week vs ${baselineWeekly.toFixed(1)} km 7-week baseline. Focus today: durable aerobic quality.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Weekly distance"
          value={`${latestWeekly.toFixed(1)} km`}
          delta={weeklyDelta}
          interpretation="Compared to trailing 7-week average"
        />
        <MetricCard
          label="8-week distance"
          value={`${weeklyDistance.toFixed(0)} km`}
          interpretation="Total run volume in selected window"
        />
        <MetricCard
          label="Average pace"
          value={formatPace(avgPace)}
          interpretation="Across all runs in current analysis window"
        />
        <MetricCard
          label="Intensity split"
          value={`${easyVsHard.easy}/${easyVsHard.moderate}/${easyVsHard.hard}`}
          interpretation="Easy / moderate / hard session count"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TrendChart
            title="Distance trend (last 8 weeks)"
            data={trendRows}
            xKey="week"
            lines={[{ key: "distanceKm", color: "#0f172a", name: "Weekly km" }]}
          />
        </div>
        <CoachPanel
          recommendation={recommendation}
          warning={latestWeekly > baselineWeekly * 1.2 ? "Load spike detected (>20% above baseline)." : null}
          confidence={runs.length > 16 ? "High" : "Medium"}
        />
      </div>

      <TrendChart
        title="Run-type evolution (latest vs historical baseline)"
        data={evolution.map((e) => ({
          type: e.type,
          latestPace: Math.round(e.latestPaceSecPerKm / 60),
          baselinePace: Math.round(e.baselinePaceSecPerKm / 60),
          latestHr: e.latestHr ?? null,
          baselineHr: e.baselineHr,
        }))}
        xKey="type"
        lines={[
          { key: "latestPace", color: "#0f766e", name: "Latest pace (min/km)" },
          { key: "baselinePace", color: "#475569", name: "Baseline pace (min/km)" },
          { key: "latestHr", color: "#dc2626", name: "Latest HR" },
          { key: "baselineHr", color: "#fb7185", name: "Baseline HR" },
        ]}
      />

      <SectionCard title="Marathon-block pattern explorer (auto-filtered)">
        <p className="mb-3 text-sm text-slate-600">
          Showing true marathon race blocks only. July 2025 marathon-distance anomaly is excluded automatically.
        </p>
        <MarathonBlockExplorer blocks={marathonPatterns} />
      </SectionCard>

      <SectionCard title="Recent activities">
        <ActivitiesTable runs={runs} />
      </SectionCard>
    </AppShell>
  );
}
