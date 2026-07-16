"use client";

import React from "react";
import { Stage } from "@/types/run";

interface TimelineProps {
  stages: Stage[];
}

export default function Timeline({ stages }: TimelineProps) {
  if (stages.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-slate-500">
        No stages recorded for this run.
      </div>
    );
  }

  // Find min start and max end times to determine the bounding time
  const startTimes = stages.map((s) => new Date(s.start_time).getTime());
  const endTimes = stages.map((s) => new Date(s.end_time).getTime());
  
  const minStart = Math.min(...startTimes);
  const maxEnd = Math.max(...endTimes);
  const totalDuration = maxEnd - minStart || 1;

  // Colors mapping for stage categories
  const getStageColor = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes("load")) return "from-sky-500 to-indigo-500";
    if (lowerName.includes("token")) return "from-purple-500 to-pink-500";
    if (lowerName.includes("gen")) return "from-emerald-500 to-teal-500";
    if (lowerName.includes("post") || lowerName.includes("process")) return "from-orange-500 to-amber-500";
    return "from-slate-500 to-slate-600";
  };

  return (
    <div className="p-6 glass-card">
      <h3 className="text-lg font-semibold mb-4 text-slate-200">Execution Timeline</h3>
      
      <div className="space-y-4">
        {stages.map((stage) => {
          const start = new Date(stage.start_time).getTime();
          const end = new Date(stage.end_time).getTime();
          const duration = end - start;
          
          const leftPercent = ((start - minStart) / totalDuration) * 100;
          const widthPercent = (duration / totalDuration) * 100;

          return (
            <div key={stage.id} className="timeline-grid group">
              {/* Stage label */}
              <div className="text-sm font-medium text-slate-300 truncate pr-2">
                {stage.name}
              </div>

              {/* Timeline bar container */}
              <div className="relative h-9 bg-slate-950/40 rounded-lg overflow-hidden border border-slate-900">
                <div
                  className={`absolute top-1 bottom-1 rounded-md bg-gradient-to-r ${getStageColor(
                    stage.name
                  )} opacity-90 group-hover:opacity-100 transition-all flex items-center px-2 min-w-[20px] shadow-sm`}
                  style={{
                    left: `${leftPercent}%`,
                    width: `${Math.max(1.5, widthPercent)}%`,
                  }}
                >
                  <span className="text-[11px] font-bold text-white truncate drop-shadow-md">
                    {stage.duration_ms.toFixed(0)}ms
                  </span>
                </div>

                {/* Hover info tooltip */}
                <div className="absolute inset-0 bg-transparent group-hover:bg-indigo-500/5 transition-colors pointer-events-none" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Axis legend */}
      <div className="mt-4 pt-4 border-t border-slate-800/60 flex justify-between text-[11px] text-slate-500">
        <span>0 ms</span>
        <span>{(totalDuration / 2).toFixed(0)} ms</span>
        <span>{totalDuration.toFixed(0)} ms (Total)</span>
      </div>
    </div>
  );
}
