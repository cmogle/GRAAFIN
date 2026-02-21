import { AppShell } from "@/components/app-shell";
import { KpiCard } from "@/components/kpi-card";
import { SectionCard } from "@/components/section-card";
import { SyncTriggerButton } from "@/components/sync-trigger-button";
import { createClient } from "@/lib/supabase/server";
import { getStravaStatus } from "@/lib/strava";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

function formatPace(secondsPerKm: number) {
  const min = Math.floor(secondsPerKm / 60);
  const sec = Math.round(secondsPerKm % 60)
    .toString()
    .padStart(2, "0");
  return `${min}:${sec}/km`;
}

function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

const coachingAlerts = [
  {
    severity: "warning" as const,
    title: "Load spike risk",
    description: "ACWR trending above 1.3 this week. Consider reducing volume.",
  },
  {
    severity: "risk" as const,
    title: "HR drift detected",
    description: "Last long run showed >8% HR drift in the final 3 km.",
  },
  {
    severity: "stable" as const,
    title: "Consistency strong",
    description: "5 out of 6 planned sessions completed last week.",
  },
];

const severityConfig = {
  warning: {
    bg: "bg-warning-muted",
    text: "text-warning",
    icon: AlertTriangle,
    badge: "Warning",
  },
  risk: {
    bg: "bg-destructive-muted",
    text: "text-destructive",
    icon: AlertTriangle,
    badge: "Risk",
  },
  stable: {
    bg: "bg-success-muted",
    text: "text-success",
    icon: CheckCircle2,
    badge: "Stable",
  },
};

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
  const weeklyDistanceKm =
    runs.reduce((sum, r) => sum + ((r.distance_m as number) || 0), 0) / 1000;
  const runCount = runs.length;
  const avgSpeed = runs.length
    ? runs.reduce((sum, r) => sum + ((r.average_speed as number) || 0), 0) /
      runs.length
    : 0;
  const pace = avgSpeed > 0 ? formatPace(1000 / avgSpeed) : "--";

  const latestSummary = status.latestActivity
    ? `${status.latestActivity.type}: ${status.latestActivity.name} — ${(status.latestActivity.distanceM / 1000).toFixed(1)} km`
    : "No activities found yet.";

  return (
    <AppShell>
      {/* Page header */}
      <div>
        <h1 className="text-balance text-2xl font-semibold text-foreground">
          Hi Fionnuala
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Weekly training snapshot powered by live Strava data.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Strava Connection"
          value={status.connected ? "Connected" : "Not connected"}
          sub={status.connected ? "Data available" : "No activity rows"}
          status={status.connected ? "green" : "red"}
        />
        <KpiCard
          label="Weekly Distance"
          value={`${weeklyDistanceKm.toFixed(1)} km`}
          sub="Live"
          status="green"
        />
        <KpiCard
          label="Run Count"
          value={`${runCount}`}
          sub="Live"
          status="green"
        />
        <KpiCard
          label="Avg Pace"
          value={pace}
          sub="Rolling 7d"
          status="neutral"
        />
      </div>

      {/* Sync status + Coaching alerts */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SectionCard title="Sync Status">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Last sync:{" "}
                    <span className="font-medium text-foreground">
                      {status.lastSuccessfulSyncAt
                        ? new Date(
                            status.lastSuccessfulSyncAt
                          ).toLocaleString()
                        : "Unknown"}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Latest:{" "}
                    <span className="font-medium text-foreground">
                      {latestSummary}
                    </span>
                  </span>
                </div>
              </div>
              <SyncTriggerButton />
              <p className="text-xs text-muted-foreground">
                Manual refresh via Strava sync webhook
              </p>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Coaching Alerts">
          <ul className="flex flex-col gap-2">
            {coachingAlerts.map((alert) => {
              const config = severityConfig[alert.severity];
              const Icon = config.icon;
              return (
                <li
                  key={alert.title}
                  className={`flex items-start gap-3 rounded-xl ${config.bg} p-3`}
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.text}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {alert.title}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${config.text} ${config.bg}`}
                      >
                        {config.badge}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {alert.description}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </div>

      {/* Recent Activities table */}
      <SectionCard title="Recent Activities">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">Run Name</th>
                <th className="px-3 py-3 font-medium text-right">Distance</th>
                <th className="px-3 py-3 font-medium text-right">
                  Moving Time
                </th>
                <th className="px-3 py-3 font-medium text-right">Avg Pace</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    No activities in the last 7 days.
                  </td>
                </tr>
              )}
              {runs.slice(0, 10).map((run) => {
                const distKm =
                  (((run.distance_m as number) || 0) / 1000).toFixed(1) + " km";
                const movingTime = formatDuration(
                  (run.moving_time_s as number) || 0
                );
                const speed = (run.average_speed as number) || 0;
                const runPace = speed > 0 ? formatPace(1000 / speed) : "--";

                return (
                  <tr
                    key={run.id as string}
                    className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-3 py-3 text-muted-foreground">
                      {new Date(run.start_date as string).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3 font-medium text-foreground">
                      {(run.name as string) ?? "Run"}
                    </td>
                    <td className="px-3 py-3 text-right text-foreground">
                      {distKm}
                    </td>
                    <td className="px-3 py-3 text-right text-muted-foreground">
                      {movingTime}
                    </td>
                    <td className="px-3 py-3 text-right text-foreground">
                      {runPace}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
