"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MarathonBlockForensic } from "@/lib/analysis/performance-transforms";

type Props = {
  blocks: MarathonBlockForensic[];
};

const RANK_BADGE = ["bg-amber-100 text-amber-800", "bg-slate-100 text-slate-700", "bg-orange-50 text-orange-700"];

export function MarathonBlockForensics({ blocks }: Props) {
  if (!blocks.length) {
    return <p className="text-sm text-slate-400">No marathon races found in data.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Block comparison cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {blocks.map((block) => (
          <div
            key={block.blockId}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            {/* Header: rank + race name */}
            <div className="mb-3 flex items-start justify-between">
              <div>
                <span
                  className={`mr-2 inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold ${
                    RANK_BADGE[block.paceRank - 1] ?? "bg-slate-50 text-slate-500"
                  }`}
                >
                  #{block.paceRank}
                </span>
                <span className="text-sm font-medium text-slate-900">
                  {block.raceName.length > 25
                    ? block.raceName.slice(0, 25) + "…"
                    : block.raceName}
                </span>
              </div>
              <span className="text-xs text-slate-400">{block.raceDate}</span>
            </div>

            {/* Race pace */}
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">
                {block.formattedPace}
              </span>
              {block.raceHr != null && (
                <span className="text-xs text-slate-500">
                  {Math.round(block.raceHr)} bpm
                </span>
              )}
            </div>

            {/* Weekly km sparkline */}
            <div className="mb-3">
              <div className="mb-1 text-xs text-slate-500">
                Weekly km (12 weeks)
              </div>
              <div className="h-12 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={block.weeklyKmProfile.map((km, i) => ({ week: i + 1, km }))}>
                    <Bar
                      dataKey="km"
                      fill={block.paceRank === 1 ? "#10b981" : "#94a3b8"}
                      radius={[1, 1, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Key metrics grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Avg weekly</span>
                <span className="font-medium text-slate-700">
                  {block.avgWeeklyKm} km
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Long runs</span>
                <span className="font-medium text-slate-700">{block.longRunCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Taper</span>
                <span className="font-medium text-slate-700">{block.taperPct}%</span>
              </div>
              {block.avgSleepMin != null && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Sleep</span>
                  <span className="font-medium text-slate-700">
                    {Math.round(block.avgSleepMin / 60)}h{Math.round(block.avgSleepMin % 60)}m
                  </span>
                </div>
              )}
              {block.avgRestingHr != null && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Resting HR</span>
                  <span className="font-medium text-slate-700">
                    {block.avgRestingHr} bpm
                  </span>
                </div>
              )}
              {block.avgHrv != null && (
                <div className="flex justify-between">
                  <span className="text-slate-500">HRV</span>
                  <span className="font-medium text-slate-700">
                    {block.avgHrv} ms
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Comparison bar chart */}
      {blocks.length >= 2 && (
        <div>
          <h4 className="mb-3 text-sm font-medium text-slate-700">
            Block comparison
          </h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={blocks.map((b) => ({
                  name: b.raceDate,
                  weeklyKm: b.avgWeeklyKm,
                  longRuns: b.longRunCount,
                  taperPct: b.taperPct,
                  sleepHrs: b.avgSleepMin != null ? Math.round((b.avgSleepMin / 60) * 10) / 10 : null,
                }))}
                margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="weeklyKm" fill="#3b82f6" name="Avg Weekly km" radius={[2, 2, 0, 0]} />
                <Bar dataKey="longRuns" fill="#10b981" name="Long Runs" radius={[2, 2, 0, 0]} />
                <Bar dataKey="taperPct" fill="#f59e0b" name="Taper %" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
