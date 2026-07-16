"use client";

import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Zap } from "lucide-react";
import { Stage } from "@/types/run";

interface ThroughputChartProps {
  stages: Stage[];
}

export default function ThroughputChart({ stages }: ThroughputChartProps) {
  const chartData = useMemo(() => {
    if (stages.length === 0) return [];

    // Find the global start time
    const startTimes = stages.map((s) => new Date(s.start_time).getTime());
    const minStart = Math.min(...startTimes);

    // Collect all throughput metrics
    const allMetrics: { timestamp: number; value: number }[] = [];

    stages.forEach((stage) => {
      (stage.metrics || []).forEach((metric) => {
        const lowerKey = metric.key.toLowerCase();
        if (lowerKey === "tps" || lowerKey === "tokens_per_sec" || lowerKey === "throughput") {
          allMetrics.push({
            timestamp: new Date(metric.timestamp).getTime(),
            value: metric.value,
          });
        }
      });
    });

    // Sort metrics by timestamp
    allMetrics.sort((a, b) => a.timestamp - b.timestamp);

    // Convert to sorted chart data points
    return allMetrics
      .map((m) => {
        const elapsedSec = (m.timestamp - minStart) / 1000.0;
        return {
          elapsed: Number(elapsedSec.toFixed(2)),
          "Tokens/sec": Number(m.value.toFixed(1)),
        };
      })
      .filter((d) => d.elapsed >= 0);
  }, [stages]);

  if (chartData.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-slate-500 glass-card flex flex-col items-center justify-center min-h-[160px]">
        <Zap className="h-8 w-8 text-slate-600 mb-2" />
        <p className="font-semibold text-slate-400">No Throughput Metrics Recorded</p>
        <p className="text-[11px] text-slate-500 max-w-md mt-1">
          To display throughput, call <code className="text-indigo-400 font-mono">tracer.log_metric("tps", value)</code> inside your stage block (e.g. during generation).
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 glass-card">
      <h3 className="text-lg font-semibold mb-4 text-slate-200 flex items-center gap-2">
        <Zap className="h-5 w-5 text-amber-400" />
        Generation Throughput
      </h3>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
          >
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
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              label={{
                value: "Tokens / sec",
                angle: -90,
                position: "insideLeft",
                offset: 5,
                fill: "#64748b",
                fontSize: 10,
              }}
            />
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
            <Line
              type="monotone"
              dataKey="Tokens/sec"
              stroke="var(--accent-orange)"
              strokeWidth={3}
              dot={{ r: 3 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
