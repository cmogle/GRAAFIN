"use client";

import { useState, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPace } from "@/lib/metrics/dashboard";
import {
  type LoadPaceModel,
  type SimulationResult,
  simulateLoadChange,
} from "@/lib/analysis/performance-transforms";

type Props = {
  model: LoadPaceModel;
  currentWeeklyKm: number;
};

export function LoadSweetSpot({ model, currentWeeklyKm }: Props) {
  const { buckets, sweetSpotBand, linearModel } = model;

  // Find the max observed volume for clamping simulation
  const maxObservedKm = useMemo(() => {
    let max = 0;
    for (const b of buckets) {
      if (b.volumeMax < 999 && b.volumeMax > max) max = b.volumeMax;
      if (b.volumeMax >= 999 && b.weekCount > 0 && b.volumeMin > max) max = b.volumeMin + 20;
    }
    return max || 100;
  }, [buckets]);

  const [scenarioKm, setScenarioKm] = useState<number>(
    Math.round(currentWeeklyKm / 5) * 5 + 5,
  );

  const simulation: SimulationResult | null = useMemo(() => {
    if (!buckets.length || currentWeeklyKm <= 0) return null;
    return simulateLoadChange(model, currentWeeklyKm, scenarioKm, maxObservedKm);
  }, [model, currentWeeklyKm, scenarioKm, maxObservedKm, buckets.length]);

  // Chart data — prepare error bars as errorY values
  const chartData = useMemo(
    () =>
      buckets.map((b) => ({
        ...b,
        // For the chart we want "faster is taller" — invert pace
        invertedPace: b.medianSubsequentPace > 0 ? -b.medianSubsequentPace : 0,
        // Error bar needs positive values representing the range
        errorUp: b.medianSubsequentPace - b.p25Pace,
        errorDown: b.p75Pace - b.medianSubsequentPace,
      })),
    [buckets],
  );

  if (!buckets.length) {
    return (
      <p className="text-sm text-slate-400">
        Not enough tempo runs (8-15km) with matching weekly volume data.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Volume → Pace bar chart */}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="volumeBand"
              tick={{ fill: "#64748b", fontSize: 10 }}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickFormatter={(v: number) => formatPace(Math.abs(v))}
              label={{
                value: "Subsequent Pace (faster ↑)",
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
              formatter={((value: number, name: string) => {
                if (name === "Median pace") return [formatPace(Math.abs(value)), name];
                return [value, name];
              }) as any}
            />
            <Bar dataKey="invertedPace" name="Median pace" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry.isSweetSpot ? "#10b981" : "#94a3b8"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bucket detail */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {buckets.map((b) => (
          <div
            key={b.volumeBand}
            className={`rounded-lg border p-2 text-center text-xs ${
              b.isSweetSpot
                ? "border-emerald-300 bg-emerald-50"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <div className="font-medium text-slate-700">{b.volumeBand}</div>
            <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
              {formatPace(b.medianSubsequentPace)}
            </div>
            <div className="text-slate-400">
              {b.weekCount} weeks
            </div>
            <div className="text-slate-400">
              {formatPace(b.p25Pace)} – {formatPace(b.p75Pace)}
            </div>
          </div>
        ))}
      </div>

      {sweetSpotBand && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm text-emerald-800">
            <strong>Sweet spot: {sweetSpotBand}</strong> — this weekly volume range
            is associated with your fastest subsequent tempo runs.
          </p>
        </div>
      )}

      {/* What-If Simulator */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="mb-3 text-sm font-medium text-slate-700">
          What If? — Volume simulator
        </h4>

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
            <span>Current: ~{Math.round(currentWeeklyKm)} km/week</span>
            <span>Scenario: {scenarioKm} km/week</span>
          </div>
          <input
            type="range"
            min={10}
            max={Math.min(120, maxObservedKm * 1.1)}
            step={5}
            value={scenarioKm}
            onChange={(e) => setScenarioKm(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
        </div>

        {simulation && (
          <div className="space-y-2">
            <div className="flex items-baseline gap-3">
              <span
                className={`text-2xl font-bold ${
                  simulation.paceDeltaSecPerKm < -1
                    ? "text-emerald-600"
                    : simulation.paceDeltaSecPerKm > 1
                      ? "text-rose-600"
                      : "text-slate-600"
                }`}
              >
                {simulation.paceDeltaSecPerKm > 0 ? "+" : ""}
                {simulation.paceDeltaSecPerKm.toFixed(1)} sec/km
              </span>
              <span className="text-xs text-slate-500">projected change</span>
            </div>
            <div className="text-xs text-slate-500">
              {formatPace(simulation.currentProjectedPace)} →{" "}
              {formatPace(simulation.scenarioProjectedPace)}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`rounded-md px-1.5 py-0.5 font-medium ${
                  simulation.confidence === "high"
                    ? "bg-emerald-50 text-emerald-700"
                    : simulation.confidence === "medium"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-rose-50 text-rose-700"
                }`}
              >
                {simulation.confidence} confidence
              </span>
              <span className="text-slate-400">
                R = {linearModel.r.toFixed(2)}
              </span>
            </div>
            <p className="text-xs italic text-slate-400">{simulation.caveat}</p>
          </div>
        )}
      </div>
    </div>
  );
}
