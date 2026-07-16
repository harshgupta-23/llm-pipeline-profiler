"use client";

import React, { useState, useMemo } from "react";
import { X, ArrowUpRight, ArrowDownRight, Layers, Cpu, Database, Zap, Activity, Loader2 } from "lucide-react";
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
import Flamegraph from "@/components/Flamegraph";
import { Run, Stage } from "@/types/run";

interface RunCompareTableProps {
  runA: Run;
  runB: Run;
  onClose: () => void;
}

export default function RunCompareTable({ runA, runB, onClose }: RunCompareTableProps) {
  const [activeTab, setActiveTab] = useState<"metrics" | "throughput">("metrics");
  
  // Expandable trace states
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [traceA, setTraceA] = useState<string | null>(null);
  const [traceB, setTraceB] = useState<string | null>(null);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);

  // Aggregate unique stage names across both runs
  const allStageNames = Array.from(
    new Set([
      ...runA.stages.map((s) => s.name),
      ...runB.stages.map((s) => s.name),
    ])
  );

  // Overall calculations
  const totalDurationA = runA.stages.reduce((acc, s) => acc + s.duration_ms, 0);
  const totalDurationB = runB.stages.reduce((acc, s) => acc + s.duration_ms, 0);

  const peakRamA = runA.stages.length > 0 ? Math.max(...runA.stages.map((s) => s.ram_used_mb)) : 0;
  const peakRamB = runB.stages.length > 0 ? Math.max(...runB.stages.map((s) => s.ram_used_mb)) : 0;

  const peakGpuA = runA.stages.length > 0 ? Math.max(...runA.stages.map((s) => s.gpu_mem_used_mb)) : 0;
  const peakGpuB = runB.stages.length > 0 ? Math.max(...runB.stages.map((s) => s.gpu_mem_used_mb)) : 0;

  // Process combined throughput chart data
  const combinedThroughputData = useMemo(() => {
    // Helper to extract tps metrics
    const getRunTps = (run: Run) => {
      const startTimes = run.stages.map((s) => new Date(s.start_time).getTime());
      const minStart = Math.min(...startTimes);
      const points: { elapsed: number; value: number }[] = [];

      run.stages.forEach((stage) => {
        (stage.metrics || []).forEach((metric) => {
          const lowerKey = metric.key.toLowerCase();
          if (lowerKey === "tps" || lowerKey === "tokens_per_sec" || lowerKey === "throughput") {
            const elapsedSec = (new Date(metric.timestamp).getTime() - minStart) / 1000.0;
            points.push({ elapsed: Number(elapsedSec.toFixed(2)), value: metric.value });
          }
        });
      });
      return points.sort((a, b) => a.elapsed - b.elapsed);
    };

    const tpsA = getRunTps(runA);
    const tpsB = getRunTps(runB);

    if (tpsA.length === 0 && tpsB.length === 0) return [];

    // Group by rounding to nearest 0.5s to align lines nicely
    const bins: Record<number, { elapsed: number; tpsA: number | null; tpsB: number | null }> = {};

    tpsA.forEach((p) => {
      const bin = Math.round(p.elapsed * 2) / 2;
      if (!bins[bin]) bins[bin] = { elapsed: bin, tpsA: null, tpsB: null };
      bins[bin].tpsA = Number(p.value.toFixed(1));
    });

    tpsB.forEach((p) => {
      const bin = Math.round(p.elapsed * 2) / 2;
      if (!bins[bin]) bins[bin] = { elapsed: bin, tpsA: null, tpsB: null };
      bins[bin].tpsB = Number(p.value.toFixed(1));
    });

    return Object.values(bins).sort((a, b) => a.elapsed - b.elapsed);
  }, [runA, runB]);

  // Delta calculation formatter
  const renderDelta = (valA: number | null | undefined, valB: number | null | undefined, unit: string = "") => {
    if (valA === undefined || valA === null || valB === undefined || valB === null) {
      return <span className="text-slate-500 font-medium">N/A</span>;
    }

    const diff = valB - valA;
    if (diff === 0) {
      return <span className="text-slate-500 font-medium">0.0{unit} (0%)</span>;
    }

    const isImprovement = diff < 0; // Less resource/time is better
    if (valA <= 0) {
      return (
        <span className={isImprovement ? "text-emerald-400 font-medium" : "text-rose-400 font-medium"}>
          {diff > 0 ? "+" : ""}{diff.toFixed(1)}{unit} (N/A %)
        </span>
      );
    }

    const pct = (diff / valA) * 100;
    const sign = diff > 0 ? "+" : "";
    const colorClass = isImprovement ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold";
    const Icon = isImprovement ? ArrowDownRight : ArrowUpRight;

    return (
      <span className={`inline-flex items-center gap-0.5 ${colorClass}`}>
        <Icon className="h-3 w-3 shrink-0" />
        {sign}{diff.toFixed(0)}{unit} ({sign}{pct.toFixed(1)}%)
      </span>
    );
  };

  const handleExpandStageTrace = async (stageName: string, stageA: Stage | undefined, stageB: Stage | undefined) => {
    if (expandedStage === stageName) {
      // Toggle close
      setExpandedStage(null);
      setTraceA(null);
      setTraceB(null);
      return;
    }

    setExpandedStage(stageName);
    setTraceA(null);
    setTraceB(null);
    setTraceError(null);
    
    // Check if either has a trace flag
    const hasTraceA = !!stageA?.has_trace;
    const hasTraceB = !!stageB?.has_trace;

    if (!hasTraceA && !hasTraceB) return;

    setLoadingTrace(true);
    try {
      const fetchOps = [];
      if (hasTraceA && stageA) {
        fetchOps.push(
          fetch(`/api/stages/${stageA.id}/trace`)
            .then(res => res.json())
            .then(data => setTraceA(data.trace))
        );
      }
      if (hasTraceB && stageB) {
        fetchOps.push(
          fetch(`/api/stages/${stageB.id}/trace`)
            .then(res => res.json())
            .then(data => setTraceB(data.trace))
        );
      }
      await Promise.all(fetchOps);
    } catch (err: any) {
      setTraceError(err.message || "Failed to load trace information");
    } finally {
      setLoadingTrace(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-6xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-400" />
              Compare Runs
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Comparing Run A (<span className="text-sky-400 font-semibold">{runA.name}</span>) vs Run B (<span className="text-purple-400 font-semibold">{runB.name}</span>)
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-850 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/20 px-6">
          <button
            onClick={() => setActiveTab("metrics")}
            className={`py-3.5 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "metrics"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="h-4.5 w-4.5" />
            Resource Delta Metrics
          </button>
          <button
            onClick={() => setActiveTab("throughput")}
            className={`py-3.5 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "throughput"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Zap className="h-4.5 w-4.5" />
            Throughput Comparison
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === "metrics" ? (
            <>
              {/* Summary Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-card p-5">
                  <div className="flex items-center gap-3 text-slate-400 mb-2">
                    <Cpu className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-bold uppercase tracking-wider">Total Duration</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-xs text-slate-500">A: {totalDurationA.toFixed(0)} ms</div>
                      <div className="text-sm font-bold text-slate-300">B: {totalDurationB.toFixed(0)} ms</div>
                    </div>
                    <div className="text-sm">{renderDelta(totalDurationA, totalDurationB, "ms")}</div>
                  </div>
                </div>

                <div className="glass-card p-5">
                  <div className="flex items-center gap-3 text-slate-400 mb-2">
                    <Database className="h-4 w-4 text-sky-400" />
                    <span className="text-xs font-bold uppercase tracking-wider">Peak System RAM</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-xs text-slate-500">A: {peakRamA.toFixed(0)} MB</div>
                      <div className="text-sm font-bold text-slate-300">B: {peakRamB.toFixed(0)} MB</div>
                    </div>
                    <div className="text-sm">{renderDelta(peakRamA, peakRamB, "MB")}</div>
                  </div>
                </div>

                <div className="glass-card p-5">
                  <div className="flex items-center gap-3 text-slate-400 mb-2">
                    <Database className="h-4 w-4 text-indigo-400" />
                    <span className="text-xs font-bold uppercase tracking-wider">Peak GPU VRAM</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-xs text-slate-500">A: {peakGpuA.toFixed(0)} MB</div>
                      <div className="text-sm font-bold text-slate-300">B: {peakGpuB.toFixed(0)} MB</div>
                    </div>
                    <div className="text-sm">{renderDelta(peakGpuA, peakGpuB, "MB")}</div>
                  </div>
                </div>
              </div>

              {/* Stage breakdown table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 text-xs font-bold uppercase">
                        <th className="p-4">Stage Name</th>
                        <th className="p-4 text-center">Run A Info</th>
                        <th className="p-4 text-center">Run B Info</th>
                        <th className="p-4 text-right">Delta Duration</th>
                        <th className="p-4 text-right">Delta RAM</th>
                        <th className="p-4 text-right">Delta VRAM</th>
                        <th className="p-4 text-center">Traces</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {allStageNames.map((name) => {
                        const stageA = runA.stages.find((s) => s.name === name);
                        const stageB = runB.stages.find((s) => s.name === name);
                        
                        const isStageExpanded = expandedStage === name;
                        const hasAnyTrace = !!stageA?.has_trace || !!stageB?.has_trace;

                        return (
                          <React.Fragment key={name}>
                            <tr className="hover:bg-slate-850/40 transition-colors">
                              <td className="p-4 font-semibold text-slate-200">{name}</td>
                              <td className="p-4 text-center text-slate-400 whitespace-nowrap">
                                {stageA ? (
                                  <div>
                                    <span>{stageA.duration_ms.toFixed(0)}ms</span>
                                    <span className="text-[10px] text-slate-500 block">
                                      {stageA.ram_used_mb.toFixed(0)}M / {stageA.gpu_mem_used_mb.toFixed(0)}M
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-600">N/A</span>
                                )}
                              </td>
                              <td className="p-4 text-center text-slate-400 whitespace-nowrap">
                                {stageB ? (
                                  <div>
                                    <span>{stageB.duration_ms.toFixed(0)}ms</span>
                                    <span className="text-[10px] text-slate-500 block">
                                      {stageB.ram_used_mb.toFixed(0)}M / {stageB.gpu_mem_used_mb.toFixed(0)}M
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-600">N/A</span>
                                )}
                              </td>
                              <td className="p-4 text-right whitespace-nowrap">
                                {renderDelta(stageA?.duration_ms, stageB?.duration_ms, "ms")}
                              </td>
                              <td className="p-4 text-right whitespace-nowrap">
                                {renderDelta(stageA?.ram_used_mb, stageB?.ram_used_mb, "MB")}
                              </td>
                              <td className="p-4 text-right whitespace-nowrap">
                                {renderDelta(stageA?.gpu_mem_used_mb, stageB?.gpu_mem_used_mb, "MB")}
                              </td>
                              <td className="p-4 text-center">
                                {hasAnyTrace ? (
                                  <button
                                    onClick={() => handleExpandStageTrace(name, stageA, stageB)}
                                    className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1 mx-auto ${
                                      isStageExpanded 
                                        ? "bg-indigo-600/20 border-indigo-500 text-indigo-400"
                                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                                    }`}
                                  >
                                    <Zap className="h-3 w-3" />
                                    {isStageExpanded ? "Hide Trace" : "Compare"}
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-600 font-medium">None</span>
                                )}
                              </td>
                            </tr>

                            {/* Sub-row containing Expanded Flamegraphs */}
                            {isStageExpanded && (
                              <tr>
                                <td colSpan={7} className="p-5 bg-slate-950/40 border-t border-b border-slate-900">
                                  {loadingTrace && (
                                    <div className="flex items-center justify-center py-12 gap-3 text-slate-400">
                                      <Loader2 className="animate-spin h-5 w-5 text-indigo-400" />
                                      Fetching execution trace records...
                                    </div>
                                  )}

                                  {traceError && (
                                    <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg text-sm">
                                      {traceError}
                                    </div>
                                  )}

                                  {!loadingTrace && !traceError && (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                      {/* Run A Flamegraph */}
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between px-1">
                                          <span className="text-xs font-bold text-sky-400">RUN A ({runA.name})</span>
                                          {!stageA?.has_trace && <span className="text-[10px] text-slate-500 uppercase font-bold">No Trace</span>}
                                        </div>
                                        <Flamegraph traceJsonStr={traceA} />
                                      </div>

                                      {/* Run B Flamegraph */}
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between px-1">
                                          <span className="text-xs font-bold text-purple-400">RUN B ({runB.name})</span>
                                          {!stageB?.has_trace && <span className="text-[10px] text-slate-500 uppercase font-bold">No Trace</span>}
                                        </div>
                                        <Flamegraph traceJsonStr={traceB} />
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            /* Throughput comparison tab */
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold mb-4 text-slate-200 flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-400" />
                Throughput Overlay Comparison (Tokens/sec)
              </h3>
              {combinedThroughputData.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-500">
                  No throughput statistics (`tps`) were recorded in either Run A or Run B.
                </div>
              ) : (
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={combinedThroughputData}
                      margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
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
                      <Line
                        type="monotone"
                        dataKey="tpsA"
                        name={`Run A: ${runA.name}`}
                        stroke="var(--accent-cyan)"
                        strokeWidth={3}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="tpsB"
                        name={`Run B: ${runB.name}`}
                        stroke="var(--accent-orange)"
                        strokeWidth={3}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-800 bg-slate-950/40 flex justify-end">
          <button onClick={onClose} className="glow-btn px-5 py-2 text-sm font-semibold">
            Close Comparison
          </button>
        </div>
      </div>
    </div>
  );
}
