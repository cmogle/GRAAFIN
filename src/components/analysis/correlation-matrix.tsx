"use client";

import { useState } from "react";
import {
  type MetricKey,
  type CorrelationCell,
  METRIC_LABELS,
} from "@/lib/analysis/transforms";

function correlationColor(r: number): string {
  const abs = Math.abs(r);
  if (abs < 0.1) return "#f8fafc"; // near-white
  const intensity = Math.min(abs * 1.2, 1);
  if (r > 0) {
    // Positive: teal
    return `rgba(20, 184, 166, ${intensity * 0.6})`;
  }
  // Negative: rose
  return `rgba(244, 63, 94, ${intensity * 0.6})`;
}

function interpretR(r: number): string {
  const abs = Math.abs(r);
  const dir = r > 0 ? "positive" : "negative";
  if (abs >= 0.7) return `Strong ${dir}`;
  if (abs >= 0.4) return `Moderate ${dir}`;
  if (abs >= 0.2) return `Weak ${dir}`;
  return "Negligible";
}

export function CorrelationMatrix({
  cells,
  fields,
  onSelect,
  selected,
}: {
  cells: CorrelationCell[];
  fields: MetricKey[];
  onSelect: (fieldA: MetricKey, fieldB: MetricKey) => void;
  selected: { fieldA: MetricKey; fieldB: MetricKey } | null;
}) {
  const [hovered, setHovered] = useState<CorrelationCell | null>(null);

  const cellMap = new Map<string, CorrelationCell>();
  for (const c of cells) cellMap.set(`${c.fieldA}:${c.fieldB}`, c);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-fit">
        {/* Header row */}
        <div className="flex">
          <div className="w-24 shrink-0" />
          {fields.map((f) => (
            <div
              key={f}
              className="w-14 shrink-0 text-center text-[9px] font-medium text-slate-500"
              style={{ writingMode: "vertical-rl", height: "64px" }}
            >
              {METRIC_LABELS[f]}
            </div>
          ))}
        </div>

        {/* Matrix rows */}
        {fields.map((rowField) => (
          <div key={rowField} className="flex items-center">
            <div className="w-24 shrink-0 truncate pr-2 text-right text-[10px] font-medium text-slate-500">
              {METRIC_LABELS[rowField]}
            </div>
            {fields.map((colField) => {
              const cell = cellMap.get(`${rowField}:${colField}`);
              const r = cell?.r ?? 0;
              const isDiagonal = rowField === colField;
              const isSelected =
                selected?.fieldA === rowField && selected?.fieldB === colField;

              return (
                <div
                  key={colField}
                  className="flex h-12 w-14 shrink-0 cursor-pointer items-center justify-center rounded-md border text-[10px] font-medium transition-all hover:scale-105"
                  style={{
                    backgroundColor: isDiagonal ? "#f1f5f9" : correlationColor(r),
                    borderColor: isSelected ? "#0f172a" : "transparent",
                    borderWidth: isSelected ? "2px" : "1px",
                    color: isDiagonal
                      ? "#94a3b8"
                      : Math.abs(r) > 0.5
                        ? "#1e293b"
                        : "#64748b",
                  }}
                  onClick={() => {
                    if (!isDiagonal) onSelect(rowField, colField);
                  }}
                  onMouseEnter={() => setHovered(cell ?? null)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {isDiagonal ? "1" : r.toFixed(2)}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Hover info */}
      {hovered && hovered.fieldA !== hovered.fieldB && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">
            {METRIC_LABELS[hovered.fieldA]} vs {METRIC_LABELS[hovered.fieldB]}
          </span>
          {" — "}
          r = {hovered.r.toFixed(2)} ({interpretR(hovered.r)}) — {hovered.n} days
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex items-center gap-3 text-[10px] text-slate-400">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: "rgba(244, 63, 94, 0.5)" }} />
          Negative
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-sm bg-slate-50" />
          None
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: "rgba(20, 184, 166, 0.5)" }} />
          Positive
        </div>
        <span className="ml-2 text-slate-300">Click a cell to explore</span>
      </div>
    </div>
  );
}
