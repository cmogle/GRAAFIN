"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LaggedCorrelationResult, LaggedCorrelation } from "@/lib/analysis/performance-transforms";

type Props = {
  results: LaggedCorrelationResult;
};

const RECOVERY_METRICS_ORDER = ["total_sleep", "deep_sleep", "hrv", "resting_hr", "body_battery"];
const RECOVERY_LABELS: Record<string, string> = {
  total_sleep: "Sleep",
  deep_sleep: "Deep Sleep",
  hrv: "HRV",
  resting_hr: "Resting HR",
  body_battery: "Body Battery",
};
const LAG_WINDOWS = [1, 2, 3, 5, 7];

function cellColor(r: number, n: number): string {
  if (n < 5) return "bg-slate-50 text-slate-300";
  const abs = Math.abs(r);
  if (abs < 0.05) return "bg-slate-50 text-slate-400";
  // For recovery metrics: negative r with pace residual = good (better recovery → faster pace)
  // Exception: resting_hr where positive r = good (lower HR → faster)
  if (r < 0) {
    if (abs >= 0.2) return "bg-teal-100 text-teal-800";
    if (abs >= 0.1) return "bg-teal-50 text-teal-700";
    return "bg-teal-50/50 text-teal-600";
  } else {
    if (abs >= 0.2) return "bg-rose-100 text-rose-800";
    if (abs >= 0.1) return "bg-rose-50 text-rose-700";
    return "bg-rose-50/50 text-rose-600";
  }
}

export function RecoveryPerformanceLag({ results }: Props) {
  const { cells, bestCell, narrative } = results;
  const [selectedCell, setSelectedCell] = useState<LaggedCorrelation | null>(null);

  if (!cells.length) {
    return <p className="text-sm text-slate-400">Not enough run + wellness overlap data.</p>;
  }

  // Build grid: rows = recovery metrics, columns = lag windows
  const grid: (LaggedCorrelation | null)[][] = RECOVERY_METRICS_ORDER.map((metric) =>
    LAG_WINDOWS.map(
      (lag) => cells.find((c) => c.recoveryMetric === metric && c.lagDays === lag) ?? null,
    ),
  );

  return (
    <div className="space-y-6">
      {/* Narrative insight */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
        <p className="text-sm text-blue-800">{narrative}</p>
      </div>

      {/* Lag correlation heatmap */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="pb-2 pr-2 text-left font-medium text-slate-500">Recovery Metric</th>
              {LAG_WINDOWS.map((lag) => (
                <th key={lag} className="pb-2 text-center font-medium text-slate-500">
                  {lag}d lag
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, rowIdx) => {
              const metricKey = RECOVERY_METRICS_ORDER[rowIdx];
              return (
                <tr key={metricKey}>
                  <td className="py-1 pr-2 font-medium text-slate-700">
                    {RECOVERY_LABELS[metricKey] ?? metricKey}
                  </td>
                  {row.map((cell, colIdx) => {
                    const lag = LAG_WINDOWS[colIdx];
                    const isSelected =
                      selectedCell?.recoveryMetric === metricKey &&
                      selectedCell?.lagDays === lag;
                    const isBest =
                      bestCell?.recoveryMetric === metricKey &&
                      bestCell?.lagDays === lag;

                    return (
                      <td key={lag} className="p-0.5">
                        <button
                          onClick={() => cell && setSelectedCell(cell)}
                          className={`w-full rounded-lg px-2 py-2 text-center font-mono text-xs transition ${
                            cell ? cellColor(cell.r, cell.n) : "bg-slate-50 text-slate-300"
                          } ${isSelected ? "ring-2 ring-blue-500" : ""} ${
                            isBest ? "ring-2 ring-amber-400" : ""
                          }`}
                          title={cell ? `r=${cell.r.toFixed(3)}, n=${cell.n}` : "No data"}
                        >
                          {cell ? cell.r.toFixed(2) : "—"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <div className="h-3 w-3 rounded bg-teal-100" /> Teal = recovery predicts faster pace
        </span>
        <span className="flex items-center gap-1">
          <div className="h-3 w-3 rounded bg-rose-100" /> Rose = inverse relationship
        </span>
        {bestCell && (
          <span className="flex items-center gap-1">
            <div className="h-3 w-3 rounded ring-2 ring-amber-400" /> Strongest signal
          </span>
        )}
      </div>

      {/* Selected cell detail */}
      {selectedCell && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm font-medium text-slate-700">
            {RECOVERY_LABELS[selectedCell.recoveryMetric] ?? selectedCell.recoveryMetric}{" "}
            ({selectedCell.lagDays}-day lag)
          </div>
          <div className="mt-1 text-xs text-slate-500">
            r = {selectedCell.r.toFixed(3)} | n = {selectedCell.n} run days |{" "}
            {Math.abs(selectedCell.r) >= 0.2
              ? "Moderate relationship"
              : Math.abs(selectedCell.r) >= 0.1
                ? "Weak relationship"
                : "Very weak relationship"}
          </div>
        </div>
      )}
    </div>
  );
}
