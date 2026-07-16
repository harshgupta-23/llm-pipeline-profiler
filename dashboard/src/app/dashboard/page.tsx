"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Cpu, Database, Layers, ArrowRight, ShieldAlert } from "lucide-react";
import RunCompareTable from "@/components/RunCompareTable";
import { Run } from "@/types/run";

interface RunListEntry {
  id: string;
  name: string;
  created_at: string;
  model_name: string | null;
  hardware_info: {
    gpu_type?: string | null;
    gpu_vram_mb?: number | null;
    cpu_count?: number | null;
  } | null;
  stages: {
    id: string;
    name: string;
    duration_ms: number;
  }[];
}

export default function DashboardPage() {
  const [runs, setRuns] = useState<RunListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compare states
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [compareData, setCompareData] = useState<{ runA: Run; runB: Run } | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  const fetchRuns = async () => {
    try {
      const res = await fetch("/api/runs");
      if (!res.ok) throw new Error("Failed to load runs");
      const data = await res.json();
      setRuns(data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch runs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();

    // Setup Server-Sent Events to listen for live updates
    const eventSource = new EventSource("/api/stream");
    
    eventSource.addEventListener("update", (event: MessageEvent) => {
      try {
        const updatedRun = JSON.parse(event.data);
        setRuns((prevRuns) => {
          const index = prevRuns.findIndex((r) => r.id === updatedRun.id);
          // Map backend object to list entry shape
          const entry: RunListEntry = {
            id: updatedRun.id,
            name: updatedRun.name,
            created_at: updatedRun.created_at,
            model_name: updatedRun.model_name,
            hardware_info: updatedRun.hardware_info,
            stages: (updatedRun.stages || []).map((s: any) => ({
              id: s.id,
              name: s.name,
              duration_ms: s.duration_ms,
            })),
          };

          if (index !== -1) {
            // Update existing run in place
            const updated = [...prevRuns];
            updated[index] = entry;
            return updated;
          } else {
            // Prepend new run
            return [entry, ...prevRuns];
          }
        });
      } catch (err) {
        console.error("Error processing live update event:", err);
      }
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const toggleSelectRun = (id: string) => {
    setSelectedRunIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        if (prev.length >= 2) {
          // Replace the older selected run to maintain max 2 items
          return [prev[1], id];
        }
        return [...prev, id];
      }
    });
  };

  const handleStartCompare = async () => {
    if (selectedRunIds.length !== 2) return;
    setCompareLoading(true);
    setCompareError(null);
    try {
      const [idA, idB] = selectedRunIds;
      // Fetch both runs details in parallel
      const [resA, resB] = await Promise.all([
        fetch(`/api/runs/${idA}`),
        fetch(`/api/runs/${idB}`),
      ]);

      if (!resA.ok || !resB.ok) {
        throw new Error("Could not retrieve details. One of the selected runs might have been deleted.");
      }

      const [runA, runB] = await Promise.all([resA.json(), resB.json()]);
      setCompareData({ runA, runB });
      setComparing(true);
    } catch (err: any) {
      setCompareError(err.message || "Failed to compare runs");
    } finally {
      setCompareLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-400"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 relative pb-24">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent">
            LLM Pipeline Profiler
          </h1>
          <p className="text-slate-400 mt-2">
            Ingest and visualize real-time LLM inference bottlenecks from Kaggle.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-800 rounded-lg px-4 py-2">
          <Activity className="text-indigo-400 animate-pulse h-5 w-5" />
          <span className="text-sm font-semibold text-slate-300">
            {runs.length} Profiler {runs.length === 1 ? "Run" : "Runs"} Ingested
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg text-sm">
          {error}
        </div>
      )}

      {compareError && (
        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg text-sm flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0" />
          <span>{compareError}</span>
        </div>
      )}

      {runs.length === 0 ? (
        <div className="text-center py-20 glass-card">
          <Activity className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-300 mb-2">No Profiler Runs Yet</h2>
          <p className="text-slate-500 max-w-md mx-auto text-sm">
            Launch your Kaggle notebook with the `llm-profiler` library enabled to stream live metrics here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {runs.map((run) => {
            const totalDuration = run.stages.reduce((acc, s) => acc + s.duration_ms, 0);
            const isSelected = selectedRunIds.includes(run.id);

            return (
              <div
                key={run.id}
                className={`glass-card flex flex-col justify-between p-6 transition-all duration-200 ${
                  isSelected ? "border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.25)] bg-slate-900/90" : ""
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 truncate">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRun(run.id)}
                        className="h-5 w-5 accent-indigo-500 rounded border-slate-700 cursor-pointer shrink-0"
                      />
                      <h2 className="text-lg font-bold text-slate-200 truncate group-hover:text-sky-400">
                        {run.name}
                      </h2>
                    </div>
                    <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0">
                      Active
                    </span>
                  </div>

                  {run.model_name && (
                    <div className="text-xs text-slate-400 mb-4 bg-slate-950/40 border border-slate-900 rounded px-2.5 py-1 inline-block">
                      Model: {run.model_name}
                    </div>
                  )}

                  <div className="space-y-2.5 my-4 text-sm text-slate-400">
                    <div className="flex items-center gap-2.5">
                      <Layers className="h-4 w-4 text-indigo-400" />
                      <span>{run.stages.length} Stages Profiled</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Cpu className="h-4 w-4 text-emerald-400" />
                      <span>Total Time: {totalDuration > 1000 ? `${(totalDuration / 1000).toFixed(2)}s` : `${totalDuration.toFixed(0)}ms`}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Database className="h-4 w-4 text-sky-400" />
                      <span className="truncate">
                        Hardware: {run.hardware_info?.gpu_type || "CPU Only"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">
                    {new Date(run.created_at).toLocaleString()}
                  </span>
                  <Link
                    href={`/dashboard/${run.id}`}
                    className="glow-btn text-xs font-semibold px-3 py-1.5"
                  >
                    View Details
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating comparison action bar */}
      {selectedRunIds.length === 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 border border-indigo-500/30 backdrop-blur-md px-6 py-3.5 rounded-full shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-5">
          <span className="text-sm font-semibold text-slate-200">
            2 Runs Selected for Comparison
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleStartCompare}
              disabled={compareLoading}
              className="glow-btn text-xs font-semibold px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {compareLoading ? "Fetching runs..." : "Compare Selected"}
            </button>
            <button
              onClick={() => setSelectedRunIds([])}
              className="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 border border-slate-800 rounded-lg hover:bg-slate-850/50 transition-all"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Comparison Modal Overlay */}
      {comparing && compareData && (
        <RunCompareTable
          runA={compareData.runA}
          runB={compareData.runB}
          onClose={() => {
            setComparing(false);
            setCompareData(null);
          }}
        />
      )}
    </div>
  );
}
