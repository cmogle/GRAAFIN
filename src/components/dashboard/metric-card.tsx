import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  delta,
  interpretation,
}: {
  label: string;
  value: string;
  delta?: number;
  interpretation: string;
}) {
  const up = (delta ?? 0) >= 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {typeof delta === "number" ? (
        <p className={cn("mt-1 text-xs font-medium", up ? "text-emerald-700" : "text-rose-700")}>
          {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
        </p>
      ) : null}
      <p className="mt-2 text-sm text-slate-600">{interpretation}</p>
    </div>
  );
}
