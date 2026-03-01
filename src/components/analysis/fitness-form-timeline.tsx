"use client";

import { useMemo } from "react";
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPace } from "@/lib/metrics/dashboard";
import type {
  FitnessFormPoint,
  RaceFormSummary,
} from "@/lib/analysis/performance-transforms";

type Props = {
  data: FitnessFormPoint[];
  raceSummaries: RaceFormSummary[];
};

export function FitnessFormTimeline({ data, raceSummaries }: Props) {
  // Thin out x-axis labels
  const labelInterval = Math.max(1, Math.floor(data.length / 24));

  // Find a reasonable default brush range (last 6 months)
  const brushStart = useMemo(() => {
    const sixMonthsAgo = data.length - 180;
    return Math.max(0, sixMonthsAgo);
  }, [data]);

  // Chart data with formatted dates
  const chartData = useMemo(
    () =>
      data.map((p) => ({
        ...p,
        label: p.date,
        // For the area fill: split TSB into positive and negative
        tsbPositive: p.tsb >= 0 ? p.tsb : 0,
        tsbNegative: p.tsb < 0 ? p.tsb : 0,
      })),
    [data],
  );

  // Race dates for reference lines
  const raceDates = useMemo(
    () => raceSummaries.map((r) => r.date),
    [raceSummaries],
  );

  if (!data.length) {
    return <p className="text-sm text-slate-400">No training data available.</p>;
  }

  return (
    <div className="space-y-6">
      {/* CTL/ATL/TSB Chart */}
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#64748b", fontSize: 10 }}
              interval={labelInterval}
              angle={-30}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              label={{
                value: "Load / Form",
                angle: -90,
                position: "insideLeft",
                style: { fill: "#94a3b8", fontSize: 11 },
              }}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                fontSize: "12px",
              }}
              formatter={((value: number, name: string) => [
                typeof value === "number" ? value.toFixed(1) : value,
                name,
              ]) as any}
            />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />

            {/* Race day markers */}
            {raceDates.map((date) => (
              <ReferenceLine
                key={date}
                x={date}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
            ))}

            {/* TSB (Form) as area */}
            <Area
              type="monotone"
              dataKey="tsb"
              stroke="none"
              fill="#10b981"
              fillOpacity={0.15}
              name="Form (TSB)"
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="tsb"
              stroke="#10b981"
              strokeWidth={1}
              dot={false}
              connectNulls
              name="Form (TSB)"
            />

            {/* CTL (Fitness) */}
            <Line
              type="monotone"
              dataKey="ctl"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              connectNulls
              name="Fitness (CTL)"
            />

            {/* ATL (Fatigue) */}
            <Line
              type="monotone"
              dataKey="atl"
              stroke="#ef4444"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              connectNulls
              name="Fatigue (ATL)"
            />

            <Brush
              dataKey="label"
              height={24}
              stroke="#94a3b8"
              fill="#f8fafc"
              travellerWidth={8}
              startIndex={brushStart}
              endIndex={data.length - 1}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <div className="h-0.5 w-4 rounded bg-blue-500" /> Fitness (CTL)
        </span>
        <span className="flex items-center gap-1.5">
          <div className="h-0.5 w-4 rounded border-t-2 border-dashed border-red-500" /> Fatigue (ATL)
        </span>
        <span className="flex items-center gap-1.5">
          <div className="h-2 w-4 rounded bg-emerald-500/20" /> Form (TSB)
        </span>
        <span className="flex items-center gap-1.5">
          <div className="h-0.5 w-4 rounded border-t-2 border-dashed border-amber-500" /> Race day
        </span>
      </div>

      {/* Race summary table */}
      {raceSummaries.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-medium text-slate-700">
            Race day form — does fitness predict performance?
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-3 font-medium">Race</th>
                  <th className="pb-2 pr-3 font-medium">Date</th>
                  <th className="pb-2 pr-3 font-medium">Distance</th>
                  <th className="pb-2 pr-3 font-medium">Pace</th>
                  <th className="pb-2 pr-3 font-medium">Form (TSB)</th>
                  <th className="pb-2 pr-3 font-medium">Fitness (CTL)</th>
                </tr>
              </thead>
              <tbody>
                {raceSummaries.map((race) => (
                  <tr
                    key={race.date}
                    className="border-b border-slate-100"
                  >
                    <td className="py-2 pr-3 font-medium text-slate-900">
                      {race.name.length > 30 ? race.name.slice(0, 30) + "…" : race.name}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{race.date}</td>
                    <td className="py-2 pr-3 text-slate-600">
                      {race.distanceKm.toFixed(1)} km
                    </td>
                    <td className="py-2 pr-3 font-mono text-slate-900">
                      {race.formattedPace}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-medium ${
                          race.tsbAtRace >= 0
                            ? "bg-emerald-50 text-emerald-700"
                            : race.tsbAtRace >= -5
                              ? "bg-amber-50 text-amber-700"
                              : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {race.tsbAtRace >= 0 ? "+" : ""}
                        {race.tsbAtRace.toFixed(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">
                      {race.ctlAtRace.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
