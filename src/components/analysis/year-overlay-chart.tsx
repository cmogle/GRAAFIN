"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type YearOverlayPoint } from "@/lib/analysis/transforms";

const YEAR_COLORS: Record<number, string> = {
  2021: "#94a3b8", // slate-400
  2022: "#f59e0b", // amber-500
  2023: "#ef4444", // red-500
  2024: "#8b5cf6", // violet-500
  2025: "#0ea5e9", // sky-500
  2026: "#10b981", // emerald-500
};

const MONTH_LABELS: Record<number, string> = {
  1: "Jan", 5: "Feb", 9: "Mar", 14: "Apr", 18: "May", 22: "Jun",
  27: "Jul", 31: "Aug", 36: "Sep", 40: "Oct", 44: "Nov", 48: "Dec",
};

export function YearOverlayChart({
  data,
  years,
  metricLabel,
}: {
  data: YearOverlayPoint[];
  years: number[];
  metricLabel: string;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="week"
            tick={{ fill: "#64748b", fontSize: 11 }}
            tickFormatter={(w: number) => MONTH_LABELS[w] ?? ""}
            interval={3}
          />
          <YAxis
            tick={{ fill: "#64748b", fontSize: 11 }}
            label={{
              value: metricLabel,
              angle: -90,
              position: "insideLeft",
              style: { fill: "#94a3b8", fontSize: 11 },
            }}
          />
          <Tooltip
            labelFormatter={(w) => `Week ${w}`}
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              fontSize: "12px",
            }}
          />
          <Legend />
          {years.map((year) => (
            <Line
              key={year}
              type="monotone"
              dataKey={String(year)}
              stroke={YEAR_COLORS[year] ?? "#64748b"}
              strokeWidth={year === 2026 ? 2.5 : 1.5}
              dot={false}
              connectNulls
              name={String(year)}
              strokeOpacity={year === 2026 ? 1 : 0.7}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
