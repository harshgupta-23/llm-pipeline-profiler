"use client";

import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Stage } from "@/types/run";

interface MemoryChartProps {
  stages: Stage[];
}

export default function MemoryChart({ stages }: MemoryChartProps) {
  const chartData = useMemo(() => {
    if (stages.length === 0) return [];

    // Find the global start time
    const startTimes = stages.map((s) => new Date(s.start_time).getTime());
    const minStart = Math.min(...startTimes);

    // Collect all metric samples
    const allMetrics: { timestamp: number; key: string; value: number }[] = [];

    stages.forEach((stage) => {
      (stage.metrics || []).forEach((metric) => {
        allMetrics.push({
          timestamp: new Date(metric.timestamp).getTime(),
          key: metric.key,
          value: metric.value,
        });
      });
    });

    // Sort metrics by timestamp
    allMetrics.sort((a, b) => a.timestamp - b.timestamp);

    // Group metrics by timestamp to merge RAM and GPU samples close to each other
    // We can bin them by 100ms or group them by exact timestamp
    const timeGroups: Record<number, Record<string, number>> = {};

    allMetrics.forEach((m) => {
      // Grouping by rounding to nearest 50ms to align metrics sampled in the same cycle
      const bin = Math.round(m.timestamp / 50) * 50;
      if (!timeGroups[bin]) {
        timeGroups[bin] = {};
      }
      timeGroups[bin][m.key] = m.value;
    });

    // Convert grouped bins to sorted chart data points
    return Object.keys(timeGroups)
      .map((key) => {
        const timestamp = Number(key);
        const elapsedSec = (timestamp - minStart) / 1000.0;
        const group = timeGroups[timestamp];

        return {
          elapsed: Number(elapsedSec.toFixed(2)),
          "RAM (MB)": group["ram_used_mb"] !== undefined ? Number(group["ram_used_mb"].toFixed(1)) : null,
          "GPU VRAM (MB)": group["gpu_mem_used_mb"] !== undefined ? Number(group["gpu_mem_used_mb"].toFixed(1)) : null,
        };
      })
      .filter((d) => d.elapsed >= 0 && (d["RAM (MB)"] !== null || d["GPU VRAM (MB)"] !== null))
      .sort((a, b) => a.elapsed - b.elapsed);
  }, [stages]);

  if (chartData.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-slate-500 glass-card">
        No memory metrics collected. Ensure background sampling is active.
      </div>
    );
  }

  return (
    <div className="p-6 glass-card">
      <h3 className="text-lg font-semibold mb-4 text-slate-200 font-sans">Memory Over Time</h3>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
          >
            <defs>
              <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent-cyan)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--accent-cyan)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorGpu" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} />
            <XAxis
              dataKey="elapsed"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              label={{
                value: "Elapsed Time (s)",
                position: "insideBottom",
                offset: -5,
                fill: "#64748b",
                fontSize: 10,
              }}
            />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                borderColor: "#1e293b",
                borderRadius: "8px",
                color: "#f8fafc",
                fontSize: "12px",
              }}
            />
            <Legend verticalAlign="top" height={36} iconType="circle" />
            <Area
              type="monotone"
              dataKey="RAM (MB)"
              stroke="var(--accent-cyan)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorRam)"
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="GPU VRAM (MB)"
              stroke="var(--accent-blue)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorGpu)"
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
