"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Cpu, Database, Layers, ShieldAlert, Sparkles, Clock, ChevronDown, ChevronUp, Loader2, Zap } from "lucide-react";
import Timeline from "@/components/Timeline";
import MemoryChart from "@/components/MemoryChart";
import ThroughputChart from "@/components/ThroughputChart";
import Flamegraph from "@/components/Flamegraph";
import { Run } from "@/types/run";

interface PageProps {
  params: Promise<{ runId: string }>;
}

export default function RunDetailPage({ params }: PageProps) {
  const { runId } = React.use(params);
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Expanded trace state
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});
  const [stageTraces, setStageTraces] = useState<Record<string, string | null>>({});
  const [traceLoading, setTraceLoading] = useState<Record<string, boolean>>({});
  const [traceErrors, setTraceErrors] = useState<Record<string, string | null>>({});

  const fetchRunDetails = async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) throw new Error("Failed to load run details");
      const data = await res.json();
      setRun(data);
    } catch (err: any) {
      setError(err.message || "Failed to load run details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRunDetails();

    // Connect to SSE stream for live updates of this specific run
    const eventSource = new EventSource(`/api/stream?runId=${runId}`);
    
    eventSource.addEventListener("update", (event: MessageEvent) => {
      try {
        const updatedRun = JSON.parse(event.data);
        setRun(updatedRun);
      } catch (err) {
        console.error("Error parsing live update:", err);
      }
    });

    return () => {
      eventSource.close();
    };
  }, [runId]);

  const toggleStageExpand = async (stageId: string, hasTrace: boolean) => {
    if (!hasTrace) return;
    const isNowExpanded = !expandedStages[stageId];
    setExpandedStages((prev) => ({ ...prev, [stageId]: isNowExpanded }));

    if (isNowExpanded && !stageTraces[stageId]) {
      setTraceLoading((prev) => ({ ...prev, [stageId]: true }));
      setTraceErrors((prev) => ({ ...prev, [stageId]: null }));
      try {
        const res = await fetch(`/api/stages/${stageId}/trace`);
        if (!res.ok) throw new Error("Failed to load trace data");
        const data = await res.json();
        setStageTraces((prev) => ({ ...prev, [stageId]: data.trace }));
      } catch (err: any) {
        setTraceErrors((prev) => ({ ...prev, [stageId]: err.message || "Failed to load trace" }));
      } finally {
        setTraceLoading((prev) => ({ ...prev, [stageId]: false }));
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-400"></div>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <ShieldAlert className="h-16 w-16 text-rose-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-300 mb-2">Run Not Found</h2>
        <p className="text-slate-500 mb-6">{error || "The profile run could not be found."}</p>
        <Link href="/dashboard" className="glow-btn text-sm">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  const startTimes = run.stages.map((s) => new Date(s.start_time).getTime());
  const endTimes = run.stages.map((s) => new Date(s.end_time).getTime());
  const minStart = startTimes.length > 0 ? Math.min(...startTimes) : 0;
  const maxEnd = endTimes.length > 0 ? Math.max(...endTimes) : 0;
  const totalDuration = maxEnd - minStart || 0;

  const peakRam = run.stages.length > 0 ? Math.max(...run.stages.map((s) => s.ram_used_mb)) : 0;
  const peakGpu = run.stages.length > 0 ? Math.max(...run.stages.map((s) => s.gpu_mem_used_mb)) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header breadcrumb */}
      <div className="mb-6">
        <Link href="/dashboard" className="text-xs text-slate-400 hover:text-sky-400 inline-flex items-center gap-2">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Runs list
        </Link>
      </div>

      {/* Title & Metadata */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-100">{run.name}</h1>
          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
            Live Connected
          </span>
        </div>
        <p className="text-sm text-slate-400">
          Run ID: <code className="text-indigo-300 text-xs">{run.id}</code> &bull; Ingested at {new Date(run.created_at).toLocaleString()}
        </p>
      </div>

      {/* Hardware / Basic Meta Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="glass-card p-5 flex items-center gap-4">
          <div className="h-12 w-12 bg-sky-500/10 rounded-lg flex items-center justify-center text-sky-400">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Model</div>
            <div className="text-lg font-bold text-slate-200 truncate max-w-[180px]">{run.model_name || "N/A"}</div>
          </div>
        </div>

        <div className="glass-card p-5 flex items-center gap-4">
          <div className="h-12 w-12 bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-400">
            <Cpu className="h-6 w-6" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Processor Specs</div>
            <div className="text-sm font-semibold text-slate-300">CPUs: {run.hardware_info?.cpu_count || 1}</div>
            <div className="text-xs text-slate-500 truncate max-w-[180px]">{run.hardware_info?.gpu_type || "No GPU"}</div>
          </div>
        </div>

        <div className="glass-card p-5 flex items-center gap-4">
          <div className="h-12 w-12 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400">
            <Database className="h-6 w-6" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Peak Memory</div>
            <div className="text-sm font-semibold text-slate-300">RAM: {peakRam.toFixed(0)} MB</div>
            {peakGpu > 0 && <div className="text-xs text-indigo-400 font-bold">VRAM: {peakGpu.toFixed(0)} MB</div>}
          </div>
        </div>

        <div className="glass-card p-5 flex items-center gap-4">
          <div className="h-12 w-12 bg-purple-500/10 rounded-lg flex items-center justify-center text-purple-400">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Execution stats</div>
            <div className="text-sm font-semibold text-slate-300">
              Time: {totalDuration > 1000 ? `${(totalDuration / 1000).toFixed(2)}s` : `${totalDuration.toFixed(0)}ms`}
            </div>
            <div className="text-xs text-slate-500">{run.stages.length} Stages Profiled</div>
          </div>
        </div>
      </div>

      {/* Main Charts area */}
      <div className="grid grid-cols-1 gap-8">
        <Timeline stages={run.stages} />
        
        <MemoryChart stages={run.stages} />

        <ThroughputChart stages={run.stages} />
      </div>

      {/* Stage Breakdown & Flamegraph Accordion */}
      <div className="mt-8 space-y-4">
        <h3 className="text-lg font-semibold text-slate-200">Stages Profile Details</h3>
        
        <div className="space-y-4">
          {run.stages.map((stage) => {
            const isExpanded = expandedStages[stage.id] || false;
            const trace = stageTraces[stage.id] || null;
            const isLoading = traceLoading[stage.id] || false;
            const traceError = traceErrors[stage.id] || null;

            return (
              <div key={stage.id} className="glass-card overflow-hidden">
                {/* Header panel */}
                <div 
                  className={`p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer transition-colors ${
                    isExpanded ? "bg-slate-850/50 border-b border-slate-800/60" : "hover:bg-slate-850/30"
                  }`}
                  onClick={() => toggleStageExpand(stage.id, !!stage.has_trace)}
                >
                  <div>
                    <h4 className="text-md font-bold text-slate-200">{stage.name}</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Duration: <span className="text-sky-400 font-semibold">{stage.duration_ms.toFixed(0)}ms</span> &bull; 
                      RAM Peak: <span className="text-indigo-400 font-semibold">{stage.ram_used_mb.toFixed(0)} MB</span>
                      {stage.gpu_mem_used_mb > 0 && (
                        <> &bull; GPU Peak: <span className="text-amber-400 font-semibold">{stage.gpu_mem_used_mb.toFixed(0)} MB</span></>
                      )}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {stage.has_trace ? (
                      <button 
                        className={`glow-btn text-xs font-semibold px-4 py-2 flex items-center gap-1.5 ${
                          isExpanded ? "bg-indigo-600 border-indigo-500" : ""
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStageExpand(stage.id, true);
                        }}
                      >
                        <Zap className="h-3.5 w-3.5" />
                        {isExpanded ? "Close Flamegraph" : "Trace Flamegraph"}
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500 border border-slate-800 rounded-lg px-3 py-2 font-medium animate-pulse">
                        No Trace Recorded
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Flamegraph Panel */}
                {isExpanded && (
                  <div className="p-5 bg-slate-950/40 border-t border-slate-900">
                    {isLoading && (
                      <div className="flex items-center justify-center py-10 gap-3 text-sm text-slate-400">
                        <Loader2 className="animate-spin h-5 w-5 text-indigo-400" />
                        Loading execution trace...
                      </div>
                    )}
                    
                    {traceError && (
                      <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg text-sm flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0" />
                        <span>{traceError}</span>
                      </div>
                    )}

                    {!isLoading && !traceError && (
                      <Flamegraph traceJsonStr={trace} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
