"use client";

import { useState } from "react";
import { type HeatmapCell, type MetricKey } from "@/lib/analysis/transforms";

const WEEK_MONTH_BOUNDARIES = [
  { week: 1, label: "Jan" },
  { week: 5, label: "Feb" },
  { week: 9, label: "Mar" },
  { week: 14, label: "Apr" },
  { week: 18, label: "May" },
  { week: 22, label: "Jun" },
  { week: 27, label: "Jul" },
  { week: 31, label: "Aug" },
  { week: 36, label: "Sep" },
  { week: 40, label: "Oct" },
  { week: 44, label: "Nov" },
  { week: 48, label: "Dec" },
];

// Metrics where lower is "better" (green) and higher is "worse" (red)
const INVERTED_METRICS: MetricKey[] = ["resting_hr", "stress_avg"];

function colorScale(
  value: number,
  min: number,
  max: number,
  inverted: boolean,
): string {
  if (max === min) return "rgb(148, 163, 184)"; // slate-400
  let t = (value - min) / (max - min); // 0..1
  if (inverted) t = 1 - t;

  // Green (low=good) → Yellow (mid) → Red (high=bad) when NOT inverted
  // For inverted metrics: low=bad(red) → high=good(green)
  if (t < 0.5) {
    // Red to Yellow
    const r = 220;
    const g = Math.round(80 + t * 2 * 160);
    const b = Math.round(60 + t * 2 * 40);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Yellow to Green
    const r = Math.round(220 - (t - 0.5) * 2 * 170);
    const g = Math.round(200 + (t - 0.5) * 2 * 40);
    const b = Math.round(80 - (t - 0.5) * 2 * 20);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

export function SeasonalHeatmap({
  cells,
  years,
  metricKey,
}: {
  cells: HeatmapCell[];
  years: number[];
  metricKey: MetricKey;
}) {
  const [tooltip, setTooltip] = useState<{
    cell: HeatmapCell;
    x: number;
    y: number;
  } | null>(null);

  const values = cells.filter((c) => c.value != null).map((c) => c.value!);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const inverted = INVERTED_METRICS.includes(metricKey);

  const cellMap = new Map<string, HeatmapCell>();
  for (const c of cells) cellMap.set(`${c.year}-${c.week}`, c);

  return (
    <div className="relative overflow-x-auto">
      {/* Month labels */}
      <div className="mb-1 ml-12 flex">
        {WEEK_MONTH_BOUNDARIES.map((m) => (
          <div
            key={m.week}
            className="text-[10px] font-medium text-slate-400"
            style={{
              position: "absolute",
              left: `${48 + (m.week - 1) * 12}px`,
            }}
          >
            {m.label}
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-1">
        {years.map((year) => (
          <div key={year} className="flex items-center gap-1">
            <div className="w-10 shrink-0 text-right text-xs font-medium text-slate-500">
              {year}
            </div>
            <div className="flex gap-px">
              {Array.from({ length: 53 }, (_, i) => i + 1).map((week) => {
                const cell = cellMap.get(`${year}-${week}`);
                return (
                  <div
                    key={week}
                    className="h-3 w-[10px] rounded-[2px] transition-transform hover:scale-150 hover:z-10"
                    style={{
                      backgroundColor: cell?.value != null
                        ? colorScale(cell.value, min, max, inverted)
                        : "#f1f5f9", // slate-100 for missing
                    }}
                    onMouseEnter={(e) => {
                      if (cell?.value != null) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({
                          cell,
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                        });
                      }
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 ml-12 flex items-center gap-2 text-[10px] text-slate-400">
        <span>{inverted ? "Better" : "Lower"}</span>
        <div className="flex gap-px">
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className="h-2.5 w-3 rounded-[1px]"
              style={{
                backgroundColor: colorScale(
                  min + (i / 9) * (max - min),
                  min,
                  max,
                  inverted,
                ),
              }}
            />
          ))}
        </div>
        <span>{inverted ? "Worse" : "Higher"}</span>
        <span className="ml-2 text-slate-300">|</span>
        <span>
          Range: {Math.round(min)} – {Math.round(max)}
        </span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{
            left: tooltip.x,
            top: tooltip.y - 48,
            transform: "translateX(-50%)",
          }}
        >
          <div className="font-semibold text-slate-900">
            {tooltip.cell.value}
          </div>
          <div className="text-slate-500">{tooltip.cell.dateRange}</div>
          <div className="text-slate-400">{tooltip.cell.count} days</div>
        </div>
      )}
    </div>
  );
}
