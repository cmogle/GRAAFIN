"use client";

import { type ThresholdSplit, METRIC_LABELS } from "@/lib/analysis/transforms";

export function ThresholdCards({ splits }: { splits: ThresholdSplit[] }) {
  if (splits.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {splits.map((split) => {
        const better = split.fieldA === "resting_hr" || split.fieldA === "stress_avg"
          ? split.belowAvg < split.aboveAvg ? "below" : "above"
          : split.belowAvg > split.aboveAvg ? "below" : "above";

        return (
          <div
            key={`${split.fieldA}:${split.fieldB}`}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-2 text-xs font-medium text-slate-500">
              When <span className="font-semibold text-slate-700">{METRIC_LABELS[split.fieldA]}</span>
              {" is split at "}
              <span className="font-semibold text-slate-700">{Math.round(split.threshold)}</span>
            </div>

            <div className="flex gap-3">
              <div
                className="flex-1 rounded-xl px-3 py-2"
                style={{
                  backgroundColor: better === "below" ? "#ecfdf5" : "#fef2f2",
                }}
              >
                <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Below ({split.belowCount}d)
                </div>
                <div className="text-lg font-semibold text-slate-900">
                  {split.belowAvg}
                </div>
                <div className="text-[10px] text-slate-500">
                  avg {METRIC_LABELS[split.fieldB]}
                </div>
              </div>

              <div
                className="flex-1 rounded-xl px-3 py-2"
                style={{
                  backgroundColor: better === "above" ? "#ecfdf5" : "#fef2f2",
                }}
              >
                <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Above ({split.aboveCount}d)
                </div>
                <div className="text-lg font-semibold text-slate-900">
                  {split.aboveAvg}
                </div>
                <div className="text-[10px] text-slate-500">
                  avg {METRIC_LABELS[split.fieldB]}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
