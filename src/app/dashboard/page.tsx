import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { ActivitiesTable } from "@/components/dashboard/activities-table";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { FloatingActions } from "@/components/mobile/floating-actions";
import { buildCockpitPayload } from "@/lib/mobile/cockpit";
import { RunActivity, paceSecPerKm, formatPace } from "@/lib/metrics/dashboard";
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

export default async function DashboardPage() {
  const supabase = await createClient();
  const athleteId = getPrimaryAthleteId();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data }, cockpit] = await Promise.all([
    supabase
      .from("strava_activities")
      .select("id,name,type,start_date,distance_m,moving_time_s,average_speed,average_heartrate")
      .eq("athlete_id", athleteId)
      .eq("type", "Run")
      .order("start_date", { ascending: false })
      .limit(100),
    buildCockpitPayload({ supabase, userId: user.id }),
  ]);

  const runs = (data ?? []).map((row) => mapRun(row as Record<string, unknown>));
  const avgPacePool = runs.slice(0, 20).map((run) => paceSecPerKm(run)).filter((pace) => pace > 0);
  const avgPace = avgPacePool.length
    ? avgPacePool.reduce((sum, pace) => sum + pace, 0) / avgPacePool.length
    : 0;

  return (
    <AppShell>
      <section className="rounded-3xl border border-slate-200/80 bg-white px-4 py-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Today cockpit</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Readiness {cockpit.readiness.score.toFixed(0)}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Status {cockpit.readiness.status} · confidence {cockpit.readiness.confidence.toFixed(0)}% · load ratio {cockpit.readiness.loadRatio.toFixed(2)}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Today's session">
          {cockpit.todayPlan.workouts.length ? (
            <ul className="space-y-2">
              {cockpit.todayPlan.workouts.map((workout) => (
                <li key={workout.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">{workout.name}</p>
                  <p>
                    {workout.distanceKm ? `${workout.distanceKm.toFixed(1)} km` : "distance n/a"} ·{" "}
                    {workout.durationMin ? `${workout.durationMin} min` : "duration n/a"} ·{" "}
                    {workout.intensity ?? "intensity n/a"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">No workout scheduled for today yet.</p>
          )}
        </SectionCard>

        <SectionCard title="Coach quick actions">
          <p className="mb-2 text-sm text-slate-600">Instant actions tuned for today’s load context.</p>
          <div className="flex flex-wrap gap-2">
            <a href="/coach" className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white">
              Ask coach
            </a>
            <a href="/plan#plan-workout-form" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              Log workout
            </a>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            {cockpit.quickInsights.map((insight) => (
              <li key={insight}>• {insight}</li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TrendChart
          title="Load trend (14 days)"
          data={cockpit.loadTrend.map((point) => ({
            day: point.date.slice(5),
            readiness: point.readinessScore,
            acute: Number(point.acuteLoad.toFixed(1)),
            chronic: Number(point.chronicLoad.toFixed(1)),
          }))}
          xKey="day"
          lines={[
            { key: "readiness", color: "#0f172a", name: "Readiness" },
            { key: "acute", color: "#0f766e", name: "Acute load 7d" },
            { key: "chronic", color: "#64748b", name: "Chronic load 42d" },
          ]}
        />
        <SectionCard title="Current signals">
          <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <p>Acute load: <strong>{cockpit.readiness.acuteLoad.toFixed(1)}</strong></p>
            <p>Chronic load: <strong>{cockpit.readiness.chronicLoad.toFixed(1)}</strong></p>
            <p>Monotony: <strong>{cockpit.readiness.monotony.toFixed(2)}</strong></p>
            <p>Strain: <strong>{cockpit.readiness.strain.toFixed(1)}</strong></p>
            <p>Avg pace (20 recent runs): <strong>{formatPace(avgPace)}</strong></p>
            <p>Generated: <strong>{new Date(cockpit.generatedAt).toLocaleTimeString()}</strong></p>
          </div>
          {cockpit.checkinPreview ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">Latest check-in ({cockpit.checkinPreview.date})</p>
              <p>{cockpit.checkinPreview.body}</p>
            </div>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard title="Recent run history">
        <ActivitiesTable runs={runs} />
      </SectionCard>

      <FloatingActions />
    </AppShell>
  );
}
