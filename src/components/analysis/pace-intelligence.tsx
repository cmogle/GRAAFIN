"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Line,
  Brush,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Scatter,
} from "recharts";
import { formatPace } from "@/lib/metrics/dashboard";
import type {
  PaceEvolutionPoint,
  EfficiencySummary,
} from "@/lib/analysis/performance-transforms";

type Props = {
  paceEvolution: Map<string, PaceEvolutionPoint[]>;
  efficiencySummary: EfficiencySummary[];
};

// Band display order (roughly small → large)
const BAND_ORDER = [
  "0-8km",
  "8-12km",
  "12-18km",
  "18-24km",
  "24-28km",
  "28-32km",
  "32-40km",
  "40-43km (marathon)",
];

export function PaceIntelligence({ paceEvolution, efficiencySummary }: Props) {
  const bands = useMemo(() => {
    const keys = Array.from(paceEvolution.keys());
    return keys.sort(
      (a, b) => BAND_ORDER.indexOf(a) - BAND_ORDER.indexOf(b),
    );
  }, [paceEvolution]);

  const [selectedBand, setSelectedBand] = useState<string>(bands[1] ?? bands[0] ?? "");

  const data = useMemo(
    () => paceEvolution.get(selectedBand) ?? [],
    [paceEvolution, selectedBand],
  );

  if (!bands.length) {
    return <p className="text-sm text-slate-400">Not enough run data for pace analysis.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Band selector tabs */}
      <div className="flex flex-wrap gap-1.5">
        {bands.map((band) => (
          <button
            key={band}
            onClick={() => setSelectedBand(band)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
              selectedBand === band
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            {band}
          </button>
        ))}
      </div>

      {/* Pace + HR trend chart */}
      {data.length > 0 && (
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#64748b", fontSize: 10 }}
                interval={Math.max(1, Math.floor(data.length / 12))}
                angle={-30}
                textAnchor="end"
                height={50}
              />
              <YAxis
                yAxisId="pace"
                orientation="left"
                reversed
                tick={{ fill: "#64748b", fontSize: 11 }}
                tickFormatter={(v: number) => formatPace(v)}
                label={{
                  value: "Pace (faster ↑)",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "#94a3b8", fontSize: 11 },
                }}
              />
              <YAxis
                yAxisId="hr"
                orientation="right"
                tick={{ fill: "#64748b", fontSize: 11 }}
                domain={["auto", "auto"]}
                label={{
                  value: "HR (bpm)",
                  angle: 90,
                  position: "insideRight",
                  style: { fill: "#94a3b8", fontSize: 11 },
                }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  fontSize: "12px",
                }}
                formatter={((value: number, name: string) => {
                  if (name === "Pace (rolling)") return [formatPace(value), name];
                  if (name === "HR (rolling)") return [`${Math.round(value)} bpm`, name];
                  return [value, name];
                }) as any}
              />
              {/* Individual run dots */}
              <Scatter
                yAxisId="pace"
                dataKey="pace"
                fill="#cbd5e1"
                fillOpacity={0.4}
                r={2}
                name="Individual run"
              />
              {/* Rolling pace line */}
              <Line
                yAxisId="pace"
                type="monotone"
                dataKey="rollingPace"
                stroke="#0f172a"
                strokeWidth={2}
                dot={false}
                connectNulls
                name="Pace (rolling)"
              />
              {/* Rolling HR line */}
              <Line
                yAxisId="hr"
                type="monotone"
                dataKey="rollingHr"
                stroke="#f43f5e"
                strokeWidth={1.5}
                dot={false}
                connectNulls
                name="HR (rolling)"
              />
              {data.length > 20 && (
                <Brush
                  dataKey="date"
                  height={24}
                  stroke="#94a3b8"
                  fill="#f8fafc"
                  travellerWidth={8}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Efficiency summary cards */}
      {efficiencySummary.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-medium text-slate-700">
            Efficiency gains by distance
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {efficiencySummary.map((s) => (
              <div
                key={s.band}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="mb-1 text-xs font-medium text-slate-500">
                  {s.band}
                  <span className="ml-1 text-slate-400">({s.runCount} runs)</span>
                </div>
                <div className="flex items-baseline gap-3">
                  <div>
                    <span className="text-lg font-semibold text-slate-900">
                      {s.paceDeltaPct > 0 ? "+" : ""}
                      {s.paceDeltaPct}%
                    </span>
                    <span className="ml-1 text-xs text-slate-500">pace</span>
                  </div>
                  {s.efficiencyDeltaPct != null && (
                    <div>
                      <span
                        className={`text-lg font-semibold ${
                          s.efficiencyDeltaPct > 0 ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {s.efficiencyDeltaPct > 0 ? "+" : ""}
                        {s.efficiencyDeltaPct}%
                      </span>
                      <span className="ml-1 text-xs text-slate-500">efficiency</span>
                    </div>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {formatPace(s.baselinePace)} → {formatPace(s.recentPace)}
                  {s.trendSlopePerYear !== 0 && (
                    <span className="ml-2">
                      ({s.trendSlopePerYear > 0 ? "+" : ""}{s.trendSlopePerYear} s/km per year)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
