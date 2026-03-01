"use client";

type DailyMetricRow = {
  metric_date: string;
  steps: number | null;
  hrv: number | null;
  hrv_status: string | null;
  stress_avg: number | null;
  body_battery_avg: number | null;
  bb_charged: number | null;
  bb_drained: number | null;
  training_readiness: number | null;
  training_readiness_status: string | null;
  recovery_hours: number | null;
  vo2_max: number | null;
  resting_hr: number | null;
};

type SleepRow = {
  sleep_date: string;
  total_sleep_min: number | null;
  sleep_score: number | null;
  resting_hr: number | null;
  hrv: number | null;
};

type Props = {
  dailyMetrics: DailyMetricRow[];
  sleepSessions: SleepRow[];
};

function Sparkline({ values, color = "#0f172a" }: { values: (number | null)[]; color?: string }) {
  const nums = values.map((v) => v ?? 0);
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const w = 64;
  const h = 20;
  const points = nums
    .map((v, i) => {
      const x = (i / (nums.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="inline-block" viewBox={`0 0 ${w} ${h}`}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

function MetricCard({
  label,
  value,
  unit,
  sub,
  sparkValues,
  sparkColor,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  sub?: string | null;
  sparkValues?: (number | null)[];
  sparkColor?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-lg font-semibold text-slate-900">
          {value ?? "—"}
          {unit && value != null ? <span className="ml-0.5 text-xs font-normal text-slate-500">{unit}</span> : null}
        </p>
        {sparkValues && sparkValues.some((v) => v != null) ? <Sparkline values={sparkValues} color={sparkColor} /> : null}
      </div>
      {sub ? <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

function formatSleepHours(min: number | null): string | null {
  if (min == null) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

export function WellnessExplorer({ dailyMetrics, sleepSessions }: Props) {
  const latest = dailyMetrics[0] ?? null;
  const latestSleep = sleepSessions[0] ?? null;

  // Build 7-day sparkline arrays (oldest → newest)
  const reversed = [...dailyMetrics].reverse();
  const sleepReversed = [...sleepSessions].reverse();

  const hrvSpark = reversed.map((r) => r.hrv);
  const stepsSpark = reversed.map((r) => r.steps);
  const bbSpark = reversed.map((r) => r.body_battery_avg);
  const stressSpark = reversed.map((r) => r.stress_avg);
  const rhrSpark = reversed.map((r) => r.resting_hr);
  const readinessSpark = reversed.map((r) => r.training_readiness);
  const sleepScoreSpark = sleepReversed.map((r) => r.sleep_score);
  const sleepDurSpark = sleepReversed.map((r) => r.total_sleep_min);

  if (!latest && !latestSleep) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
        <p className="text-sm text-slate-600">No wellness data available yet.</p>
        <p className="mt-1 text-xs text-slate-400">Data will appear here once your wearable metrics have been imported.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {latest?.metric_date || latestSleep?.sleep_date ? (
        <p className="text-xs text-slate-500">
          Latest data: {latest?.metric_date ?? latestSleep?.sleep_date}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <MetricCard
          label="HRV"
          value={latest?.hrv}
          unit="ms"
          sub={latest?.hrv_status ?? null}
          sparkValues={hrvSpark}
          sparkColor="#0f766e"
        />
        <MetricCard
          label="Sleep Score"
          value={latestSleep?.sleep_score}
          sub={formatSleepHours(latestSleep?.total_sleep_min ?? null)}
          sparkValues={sleepScoreSpark}
          sparkColor="#6366f1"
        />
        <MetricCard
          label="Body Battery"
          value={latest?.body_battery_avg}
          sub={latest?.bb_charged != null && latest?.bb_drained != null ? `+${latest.bb_charged} / -${latest.bb_drained}` : null}
          sparkValues={bbSpark}
          sparkColor="#f59e0b"
        />
        <MetricCard
          label="Training Readiness"
          value={latest?.training_readiness}
          sub={latest?.training_readiness_status ?? null}
          sparkValues={readinessSpark}
          sparkColor="#0f172a"
        />
        <MetricCard
          label="Steps"
          value={latest?.steps != null ? latest.steps.toLocaleString() : null}
          sparkValues={stepsSpark}
          sparkColor="#64748b"
        />
        <MetricCard
          label="Resting HR"
          value={latest?.resting_hr}
          unit="bpm"
          sparkValues={rhrSpark}
          sparkColor="#ef4444"
        />
        <MetricCard
          label="Stress"
          value={latest?.stress_avg}
          sub={latest?.stress_avg != null ? (latest.stress_avg > 50 ? "Elevated" : "Normal") : null}
          sparkValues={stressSpark}
          sparkColor="#8b5cf6"
        />
        <MetricCard
          label="Sleep Duration"
          value={formatSleepHours(latestSleep?.total_sleep_min ?? null)}
          sparkValues={sleepDurSpark}
          sparkColor="#6366f1"
        />
      </div>
    </div>
  );
}
