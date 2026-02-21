"use client";

import { useMemo, useState } from "react";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { formatPace } from "@/lib/metrics/dashboard";

type MarathonBlock = {
  blockId: string;
  raceId: string;
  raceName: string;
  raceDate: string;
  racePaceSecPerKm: number;
  avgWeeklyKm: number;
  longRunCount: number;
  blockRuns: { date: string; distanceKm: number; paceSecPerKm: number }[];
};

export function MarathonBlockExplorer({ blocks }: { blocks: MarathonBlock[] }) {
  const [selected, setSelected] = useState(blocks[blocks.length - 1]?.blockId ?? "");

  const current = useMemo(() => blocks.find((b) => b.blockId === selected) ?? blocks[blocks.length - 1], [blocks, selected]);
  if (!current) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-slate-600">Marathon block</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          {blocks.map((b) => (
            <option key={b.blockId} value={b.blockId}>
              {new Date(b.raceDate).toLocaleDateString()} · {b.raceName}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Race pace: <strong>{formatPace(current.racePaceSecPerKm)}</strong></div>
        <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Avg weekly km: <strong>{current.avgWeeklyKm.toFixed(1)}</strong></div>
        <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Long runs: <strong>{current.longRunCount}</strong></div>
      </div>

      <TrendChart
        title="Selected block build pattern"
        data={current.blockRuns.map((r) => ({ date: r.date.slice(5), distanceKm: r.distanceKm, paceMinPerKm: Number((r.paceSecPerKm / 60).toFixed(2)) }))}
        xKey="date"
        lines={[
          { key: "distanceKm", color: "#0f172a", name: "Distance (km)" },
          { key: "paceMinPerKm", color: "#0f766e", name: "Pace (min/km)" },
        ]}
      />
    </div>
  );
}
