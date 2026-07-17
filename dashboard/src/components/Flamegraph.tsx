"use client";

import React, { useMemo } from "react";
import { parseChromeTrace, FlamegraphThread, FlamegraphNode } from "@/lib/parseTrace";
import { AlertCircle } from "lucide-react";

interface FlamegraphProps {
  traceJsonStr: string | null;
}

export default function Flamegraph({ traceJsonStr }: FlamegraphProps) {
  const [simplified, setSimplified] = React.useState(true);

  const parseResult = useMemo(() => {
    if (!traceJsonStr) return { threads: [], truncated: false, originalCount: 0, limit: 15000 };
    return parseChromeTrace(traceJsonStr, 15000, simplified);
  }, [traceJsonStr, simplified]);

  const { threads, truncated, originalCount, limit } = parseResult;

  if (!traceJsonStr) {
    return (
      <div className="p-8 text-center text-sm text-slate-500 bg-slate-950/20 border border-slate-900 rounded-xl">
        <AlertCircle className="h-8 w-8 text-slate-600 mx-auto mb-2" />
        No trace data recorded for this stage.
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-500 bg-slate-950/20 border border-slate-900 rounded-xl">
        <AlertCircle className="h-8 w-8 text-slate-600 mx-auto mb-2" />
        Failed to parse trace or no valid execution events found.
      </div>
    );
  }

  // Helper to color nodes based on category and hash the name for hue variation
  const getNodeColor = (node: FlamegraphNode) => {
    const lowerName = node.name.toLowerCase();
    const cat = node.cat.toLowerCase();

    // Simple hash function for name string
    let hash = 0;
    for (let i = 0; i < node.name.length; i++) {
      hash = node.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hueOffset = Math.abs(hash % 30); // small variations in hue

    if (cat === "cuda_op" || lowerName.includes("kernel") || lowerName.includes("sgemm") || lowerName.includes("conv")) {
      // GPU operations: warm colors (orange/amber)
      return `hsl(${25 + hueOffset}, 80%, 45%)`;
    }
    if (cat === "runtime" || lowerName.includes("cuda")) {
      // CUDA Runtime/APIs: purples
      return `hsl(${270 + hueOffset}, 75%, 45%)`;
    }
    // CPU operations: cool colors (blue/teal)
    return `hsl(${200 + hueOffset}, 70%, 42%)`;
  };

  return (
    <div className="space-y-6">
      {/* Trace Visualization Switch */}
      <div className="flex justify-between items-center bg-slate-900/40 p-4 border border-slate-900 rounded-xl">
        <div className="text-xs text-slate-400">
          <span className="font-semibold text-slate-200">Trace Visualization Mode</span>
          <p className="mt-0.5">Merge contiguous small operations of the same category to simplify the view without losing duration information.</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer select-none">
          <input 
            type="checkbox" 
            checked={simplified} 
            onChange={(e) => setSimplified(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-slate-950"></div>
          <span className="ms-3 text-xs font-semibold text-slate-300">
            {simplified ? "Merged (Simplified)" : "Raw (Detailed)"}
          </span>
        </label>
      </div>

      {truncated && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 animate-pulse" />
          <span>
            Trace is very large ({originalCount.toLocaleString()} events). Only the top {limit.toLocaleString()} longest duration events have been rendered to maintain browser performance.
          </span>
        </div>
      )}

      {threads.map((thread) => {
        const maxDepth = Math.max(...thread.nodes.map((n) => n.depth), 0);
        const laneHeight = (maxDepth + 1) * 26 + 20; // 26px per row + padding
        const timeSpan = thread.maxTs - thread.minTs || 1;

        return (
          <div key={`${thread.pid}-${thread.tid}`} className="p-5 glass-card flex flex-col">
            <h4 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${thread.name.startsWith("GPU") ? "bg-amber-400" : "bg-sky-400"}`} />
              {thread.name}
            </h4>

            {/* Scrollable Flamegraph Lane */}
            <div className="w-full overflow-x-auto bg-slate-950/60 rounded-xl border border-slate-900 relative">
              <div 
                className="relative min-w-[800px]" 
                style={{ height: `${laneHeight}px` }}
              >
                {thread.nodes
                  .filter((node) => {
                    const width = (node.duration / timeSpan) * 100;
                    return width >= 0.02; // Filter out elements less than 0.02% wide
                  })
                  .map((node, index) => {
                    const left = ((node.start - thread.minTs) / timeSpan) * 100;
                    const width = (node.duration / timeSpan) * 100;
                    const top = node.depth * 26 + 10;
                    const color = getNodeColor(node);

                    return (
                      <div
                        key={index}
                        className="absolute h-[22px] rounded text-[10px] font-medium text-white flex items-center px-1.5 cursor-help transition-all duration-150 hover:brightness-125 border border-black/10 select-none overflow-hidden text-ellipsis whitespace-nowrap"
                        style={{
                          left: `${left}%`,
                          width: `${Math.max(0.4, width)}%`,
                          top: `${top}px`,
                          backgroundColor: color,
                        }}
                        title={`${node.name}\nDuration: ${(node.duration / 1000).toFixed(3)} ms\nCategory: ${node.cat}`}
                      >
                        {width > 3 && (
                          <span className="truncate drop-shadow-md">
                            {node.name.replace("aten::", "")}
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Time legend */}
            <div className="flex justify-between mt-2 px-1 text-[10px] text-slate-500">
              <span>0 ms</span>
              <span>{((timeSpan / 2) / 1000).toFixed(1)} ms</span>
              <span>{(timeSpan / 1000).toFixed(1)} ms (Total)</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
