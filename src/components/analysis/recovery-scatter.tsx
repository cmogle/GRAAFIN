"use client";

import {
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { type RecoveryEvent } from "@/lib/analysis/transforms";

const YEAR_COLORS: Record<number, string> = {
  2021: "#94a3b8",
  2022: "#f59e0b",
  2023: "#ef4444",
  2024: "#8b5cf6",
  2025: "#0ea5e9",
  2026: "#10b981",
};

export function RecoveryScatter({ events }: { events: RecoveryEvent[] }) {
  if (events.length < 3) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400">
        Not enough high-load events to show recovery patterns.
      </div>
    );
  }

  const years = [...new Set(events.map((e) => e.year))].sort();
  const medianRecovery = [...events]
    .sort((a, b) => a.recoveryDays - b.recoveryDays)
    [Math.floor(events.length / 2)].recoveryDays;

  // Group by year for colored scatter series
  const byYear = new Map<number, RecoveryEvent[]>();
  for (const e of events) {
    const arr = byYear.get(e.year) ?? [];
    arr.push(e);
    byYear.set(e.year, arr);
  }

  return (
    <div>
      <p className="mb-3 text-xs text-slate-500">
        Each point is a week where training load spiked &gt;20% above the trailing 4-week average.
        The Y-axis shows how long resting HR took to return to baseline.
      </p>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="loadSpikePct"
              type="number"
              name="Load Spike"
              unit="%"
              tick={{ fill: "#64748b", fontSize: 11 }}
              label={{
                value: "Load spike (%)",
                position: "insideBottom",
                offset: -4,
                style: { fill: "#94a3b8", fontSize: 11 },
              }}
            />
            <YAxis
              dataKey="recoveryDays"
              type="number"
              name="Recovery"
              unit="d"
              tick={{ fill: "#64748b", fontSize: 11 }}
              label={{
                value: "Recovery (days)",
                angle: -90,
                position: "insideLeft",
                style: { fill: "#94a3b8", fontSize: 11 },
              }}
            />
            <ZAxis range={[40, 40]} />
            <Tooltip
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                fontSize: "12px",
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((value: any, name: string) => {
                if (name === "Load Spike") return [`${value ?? 0}%`, name];
                if (name === "Recovery") return [`${value ?? 0} days`, name];
                return [value ?? 0, name];
              }) as any}
              labelFormatter={() => ""}
            />
            <Legend />
            <ReferenceLine
              y={medianRecovery}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              label={{
                value: `Median: ${medianRecovery}d`,
                position: "right",
                fill: "#94a3b8",
                fontSize: 10,
              }}
            />
            {years.map((year) => (
              <Scatter
                key={year}
                name={String(year)}
                data={byYear.get(year) ?? []}
                fill={YEAR_COLORS[year] ?? "#64748b"}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
