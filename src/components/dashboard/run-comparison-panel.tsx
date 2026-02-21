"use client";

import { useMemo, useState } from "react";
import { formatPace } from "@/lib/metrics/dashboard";

type Comparison = {
  type: string;
  peerCount: number;
  runPace: number;
  paceBaseline: number;
  paceDeltaPct: number;
  runHr: number | null;
  hrBaseline: number | null;
  hrDelta: number | null;
  cacheHit?: boolean;
  cachedAt?: string;
};

export function RunComparisonPanel({
  comparison,
  yearlyComparison,
}: {
  comparison: Comparison;
  yearlyComparison: Comparison;
}) {
  const [mode, setMode] = useState<"all" | "12m">("all");
  const data = useMemo(() => (mode === "all" ? comparison : yearlyComparison), [mode, comparison, yearlyComparison]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-xs">
          <button
            onClick={() => setMode("all")}
            className={`rounded-lg px-3 py-1 ${mode === "all" ? "bg-slate-900 text-white" : "text-slate-600"}`}
          >
            All history
          </button>
          <button
            onClick={() => setMode("12m")}
            className={`rounded-lg px-3 py-1 ${mode === "12m" ? "bg-slate-900 text-white" : "text-slate-600"}`}
          >
            Last 12 months
          </button>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${data.cacheHit ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
          {data.cacheHit ? "Cached" : "Fresh"}
        </span>
      </div>

      <ul className="space-y-2 text-sm text-slate-700">
        <li>
          Category: <strong>{data.type}</strong> ({data.peerCount} comparable runs)
        </li>
        <li>
          Pace vs baseline: <strong>{formatPace(data.runPace)}</strong> vs <strong>{formatPace(data.paceBaseline)}</strong>
          {" "}({data.paceDeltaPct >= 0 ? "+" : ""}{data.paceDeltaPct.toFixed(1)}%)
        </li>
        <li>
          HR vs baseline: <strong>{data.runHr ? `${data.runHr.toFixed(0)} bpm` : "n/a"}</strong> vs <strong>{data.hrBaseline ? `${data.hrBaseline.toFixed(0)} bpm` : "n/a"}</strong>
          {data.hrDelta != null ? ` (${data.hrDelta >= 0 ? "+" : ""}${data.hrDelta.toFixed(1)} bpm)` : ""}
        </li>
      </ul>
      {data.cachedAt ? <p className="text-xs text-slate-500">Cached at {new Date(data.cachedAt).toLocaleString()}</p> : null}
    </div>
  );
}
