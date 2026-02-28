"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type ContinuousTrendPoint } from "@/lib/analysis/transforms";

export function ContinuousTrendChart({
  data,
  metricLabel,
}: {
  data: ContinuousTrendPoint[];
  metricLabel: string;
}) {
  // Show a tick roughly every 3 months
  const tickInterval = Math.max(1, Math.floor(data.length / 16));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            tick={{ fill: "#64748b", fontSize: 10 }}
            interval={tickInterval}
            angle={-30}
            textAnchor="end"
            height={40}
          />
          <YAxis
            tick={{ fill: "#64748b", fontSize: 11 }}
            domain={["auto", "auto"]}
            label={{
              value: metricLabel,
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
            labelFormatter={(label) => String(label)}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#94a3b8"
            strokeWidth={0}
            fill="#e2e8f0"
            fillOpacity={0.4}
            name="Weekly avg"
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="rolling"
            stroke="#0f172a"
            strokeWidth={2}
            dot={false}
            connectNulls
            name="8-week trend"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
