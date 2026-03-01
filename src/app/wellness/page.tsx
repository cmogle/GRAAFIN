import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { WellnessExplorer } from "@/components/wellness/wellness-explorer";
import { WellnessInputsPanel } from "@/components/profile/wellness-inputs-panel";
import { createClient } from "@/lib/supabase/server";

export default async function WellnessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [metricsQuery, sleepQuery] = await Promise.all([
    supabase
      .from("wellness_daily_metrics")
      .select("metric_date,steps,hrv,hrv_status,stress_avg,body_battery_avg,bb_charged,bb_drained,training_readiness,training_readiness_status,recovery_hours,vo2_max,resting_hr")
      .eq("user_id", user.id)
      .gte("metric_date", fourteenDaysAgo)
      .order("metric_date", { ascending: false })
      .limit(14),
    supabase
      .from("wellness_sleep_sessions")
      .select("sleep_date,total_sleep_min,sleep_score,resting_hr,hrv")
      .eq("user_id", user.id)
      .gte("sleep_date", fourteenDaysAgo)
      .order("sleep_date", { ascending: false })
      .limit(14),
  ]);

  const dailyMetrics = (metricsQuery.data ?? []).map((row) => ({
    metric_date: String(row.metric_date),
    steps: row.steps as number | null,
    hrv: row.hrv as number | null,
    hrv_status: row.hrv_status as string | null,
    stress_avg: row.stress_avg as number | null,
    body_battery_avg: row.body_battery_avg as number | null,
    bb_charged: row.bb_charged as number | null,
    bb_drained: row.bb_drained as number | null,
    training_readiness: row.training_readiness as number | null,
    training_readiness_status: row.training_readiness_status as string | null,
    recovery_hours: row.recovery_hours as number | null,
    vo2_max: row.vo2_max as number | null,
    resting_hr: row.resting_hr as number | null,
  }));

  const sleepSessions = (sleepQuery.data ?? []).map((row) => ({
    sleep_date: String(row.sleep_date),
    total_sleep_min: row.total_sleep_min as number | null,
    sleep_score: row.sleep_score as number | null,
    resting_hr: row.resting_hr as number | null,
    hrv: row.hrv as number | null,
  }));

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Wellness</h1>
        <p className="mt-1 text-sm text-slate-600">Your health metrics and nutrition tracking.</p>
      </div>

      <SectionCard title="Health metrics">
        <WellnessExplorer dailyMetrics={dailyMetrics} sleepSessions={sleepSessions} />
      </SectionCard>

      <SectionCard title="Nutrition">
        <WellnessInputsPanel />
      </SectionCard>
    </AppShell>
  );
}
