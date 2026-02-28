"use client";

import { type MetricKey, METRIC_LABELS } from "@/lib/analysis/transforms";

export function MetricSelector({
  value,
  onChange,
  options,
}: {
  value: MetricKey;
  onChange: (key: MetricKey) => void;
  options: MetricKey[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as MetricKey)}
      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 focus:border-slate-400 focus:outline-none"
    >
      {options.map((key) => (
        <option key={key} value={key}>
          {METRIC_LABELS[key]}
        </option>
      ))}
    </select>
  );
}
