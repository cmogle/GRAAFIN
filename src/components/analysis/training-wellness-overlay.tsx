"use client";

import { useState, useMemo } from "react";
import {
  Bar,
  Brush,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type WeeklyTrainingWellness } from "@/lib/analysis/transforms";

const WELLNESS_LINES = [
  { key: "restingHrAvg" as const, label: "Resting HR", color: "#f43f5e", defaultOn: true },
  { key: "hrvAvg" as const, label: "HRV", color: "#f59e0b", defaultOn: true },
  { key: "bodyBatteryAvg" as const, label: "Body Battery", color: "#14b8a6", defaultOn: true },
  { key: "sleepAvg" as const, label: "Sleep (min)", color: "#8b5cf6", defaultOn: false },
];

export function TrainingWellnessOverlay({
  data,
}: {
  data: WeeklyTrainingWellness[];
}) {
  const [visible, setVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(WELLNESS_LINES.map((l) => [l.key, l.defaultOn])),
  );

  const toggle = (key: string) =>
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));

  // Thin out labels: show every ~8 weeks
  const labelInterval = Math.max(1, Math.floor(data.length / 30));

  // Find the first index where any wellness data exists — default brush to that range
  const wellnessStartIdx = useMemo(() => {
    for (let i = 0; i < data.length; i++) {
      if (
        data[i].restingHrAvg != null ||
        data[i].hrvAvg != null ||
        data[i].bodyBatteryAvg != null
      ) {
        return Math.max(0, i - 4); // Start a bit before the first wellness data
      }
    }
    return 0;
  }, [data]);

  // Determine right Y-axis domain from visible lines
  const rightDomain = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const d of data) {
      for (const line of WELLNESS_LINES) {
        if (!visible[line.key]) continue;
        const val = d[line.key];
        if (val != null) {
          if (val < min) min = val;
          if (val > max) max = val;
        }
      }
    }
    return [
      min === Infinity ? 0 : Math.floor(min * 0.9),
      max === -Infinity ? 100 : Math.ceil(max * 1.1),
    ];
  }, [data, visible]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {WELLNESS_LINES.map((line) => (
          <button
            key={line.key}
            onClick={() => toggle(line.key)}
            className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition"
            style={{
              borderColor: visible[line.key] ? line.color : "#e2e8f0",
              backgroundColor: visible[line.key] ? `${line.color}10` : "white",
              color: visible[line.key] ? line.color : "#94a3b8",
            }}
          >
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: line.color, opacity: visible[line.key] ? 1 : 0.3 }}
            />
            {line.label}
          </button>
        ))}
      </div>

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="weekLabel"
              tick={{ fill: "#64748b", fontSize: 10 }}
              interval={labelInterval}
              angle={-30}
              textAnchor="end"
              height={50}
            />
            <YAxis
              yAxisId="load"
              orientation="left"
              tick={{ fill: "#64748b", fontSize: 11 }}
              label={{
                value: "Weekly Load",
                angle: -90,
                position: "insideLeft",
                style: { fill: "#94a3b8", fontSize: 11 },
              }}
            />
            <YAxis
              yAxisId="wellness"
              orientation="right"
              domain={rightDomain}
              tick={{ fill: "#64748b", fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                fontSize: "12px",
              }}
            />
            <Legend />
            <Bar
              yAxisId="load"
              dataKey="weeklyLoadScore"
              fill="#cbd5e1"
              name="Training Load"
              barSize={4}
              radius={[2, 2, 0, 0]}
            />
            {WELLNESS_LINES.filter((l) => visible[l.key]).map((line) => (
              <Line
                key={line.key}
                yAxisId="wellness"
                type="monotone"
                dataKey={line.key}
                stroke={line.color}
                strokeWidth={1.5}
                dot={false}
                connectNulls
                name={line.label}
              />
            ))}
            <Brush
              dataKey="weekLabel"
              height={24}
              stroke="#94a3b8"
              fill="#f8fafc"
              travellerWidth={8}
              startIndex={wellnessStartIdx}
              endIndex={data.length - 1}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
