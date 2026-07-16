"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Cpu, Database, Layers, ShieldAlert, Sparkles, Clock } from "lucide-react";
import Timeline from "@/components/Timeline";
import MemoryChart from "@/components/MemoryChart";
import { Run } from "@/types/run";

interface PageProps {
  params: Promise<{ runId: string }>;
}

export default function RunDetailPage({ params }: PageProps) {
  const { runId } = React.use(params);
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const totalDuration = run.stages.reduce((acc, s) => acc + s.duration_ms, 0);
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
      </div>
    </div>
  );
}
