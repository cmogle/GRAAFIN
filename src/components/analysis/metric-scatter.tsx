"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  type MetricKey,
  type ScatterPoint,
  METRIC_LABELS,
  linearRegression,
} from "@/lib/analysis/transforms";

const YEAR_COLORS: Record<number, string> = {
  2021: "#94a3b8",
  2022: "#f59e0b",
  2023: "#ef4444",
  2024: "#8b5cf6",
  2025: "#0ea5e9",
  2026: "#10b981",
};

export function MetricScatter({
  points,
  fieldA,
  fieldB,
  r,
  n,
}: {
  points: ScatterPoint[];
  fieldA: MetricKey;
  fieldB: MetricKey;
  r: number;
  n: number;
}) {
  if (points.length < 10) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400">
        Not enough data points for this metric pair.
      </div>
    );
  }

  const years = [...new Set(points.map((p) => p.year))].sort();
  const byYear = new Map<number, ScatterPoint[]>();
  for (const p of points) {
    const arr = byYear.get(p.year) ?? [];
    arr.push(p);
    byYear.set(p.year, arr);
  }

  // Compute regression line endpoints
  const reg = linearRegression(
    points.map((p) => p.x),
    points.map((p) => p.y),
  );
  const xMin = Math.min(...points.map((p) => p.x));
  const xMax = Math.max(...points.map((p) => p.x));
  const regLine = [
    { x: xMin, y: reg.slope * xMin + reg.intercept },
    { x: xMax, y: reg.slope * xMax + reg.intercept },
  ];

  const abs = Math.abs(r);
  const strength =
    abs >= 0.7 ? "strong" : abs >= 0.4 ? "moderate" : abs >= 0.2 ? "weak" : "negligible";
  const direction = r > 0 ? "positive" : "negative";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-3 text-xs">
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
          r = {r.toFixed(2)}
        </span>
        <span className="text-slate-500">
          {strength} {direction} correlation
        </span>
        <span className="text-slate-400">n = {n.toLocaleString()} days</span>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="x"
              type="number"
              name={METRIC_LABELS[fieldA]}
              tick={{ fill: "#64748b", fontSize: 11 }}
              label={{
                value: METRIC_LABELS[fieldA],
                position: "insideBottom",
                offset: -4,
                style: { fill: "#94a3b8", fontSize: 11 },
              }}
            />
            <YAxis
              dataKey="y"
              type="number"
              name={METRIC_LABELS[fieldB]}
              tick={{ fill: "#64748b", fontSize: 11 }}
              label={{
                value: METRIC_LABELS[fieldB],
                angle: -90,
                position: "insideLeft",
                style: { fill: "#94a3b8", fontSize: 11 },
              }}
            />
            <ZAxis range={[16, 16]} />
            <Tooltip
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                fontSize: "12px",
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((value: any, name: string) => [
                typeof value === "number" ? value.toFixed(1) : String(value ?? ""),
                name,
              ]) as any}
              labelFormatter={() => ""}
            />
            <Legend />
            {years.map((year) => (
              <Scatter
                key={year}
                name={String(year)}
                data={byYear.get(year) ?? []}
                fill={YEAR_COLORS[year] ?? "#64748b"}
                opacity={0.5}
              />
            ))}
            {/* Trend line as a separate scatter with line */}
            <Scatter
              name="Trend"
              data={regLine}
              fill="none"
              line={{ stroke: "#0f172a", strokeWidth: 2, strokeDasharray: "6 3" }}
              legendType="line"
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
