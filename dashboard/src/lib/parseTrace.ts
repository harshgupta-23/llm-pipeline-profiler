export interface FlamegraphNode {
  name: string;
  cat: string;
  start: number; // in microseconds
  duration: number; // in microseconds
  depth: number;
}

export interface FlamegraphThread {
  tid: number;
  pid: number;
  name: string;
  nodes: FlamegraphNode[];
  minTs: number;
  maxTs: number;
}

export interface ParseTraceResult {
  threads: FlamegraphThread[];
  truncated: boolean;
  originalCount: number;
  limit: number;
}

export function parseChromeTrace(traceJsonStr: string, limit = 15000): ParseTraceResult {
  try {
    const trace = JSON.parse(traceJsonStr);
    const events = trace.traceEvents || [];
    
    // 1. Filter out invalid events
    // We want complete duration events ('X'), with valid start (ts) and duration (dur)
    const validEvents = events.filter((e: any) => {
      return (
        e.ph === "X" &&
        e.ts !== undefined &&
        e.dur !== undefined &&
        e.dur > 0 &&
        e.name
      );
    });

    const originalCount = validEvents.length;
    if (originalCount === 0) {
      return { threads: [], truncated: false, originalCount: 0, limit };
    }

    const truncated = originalCount > limit;
    let eventsToProcess = validEvents;

    if (truncated) {
      // Sort by duration descending to keep the longest-duration events
      const sortedByDuration = [...validEvents].sort((a: any, b: any) => b.dur - a.dur);
      eventsToProcess = sortedByDuration.slice(0, limit);
    }

    // 2. Group events by pid/tid track
    const groups: Record<string, { pid: number; tid: number; events: any[] }> = {};
    eventsToProcess.forEach((e: any) => {
      const key = `${e.pid}-${e.tid}`;
      if (!groups[key]) {
        groups[key] = { pid: e.pid, tid: e.tid, events: [] };
      }
      groups[key].events.push(e);
    });

    // 3. Process each thread track
    const threads: FlamegraphThread[] = [];

    Object.keys(groups).forEach((key) => {
      const group = groups[key];
      
      // Sort events by start time (ts) ascending.
      // If start times are identical, sort by duration (dur) descending so the parent wraps the child.
      group.events.sort((a, b) => {
        if (a.ts !== b.ts) return a.ts - b.ts;
        return b.dur - a.dur;
      });

      const nodes: FlamegraphNode[] = [];
      const stack: any[] = [];
      let minTs = Infinity;
      let maxTs = -Infinity;

      group.events.forEach((event) => {
        const start = event.ts;
        const duration = event.dur;
        const end = start + duration;

        minTs = Math.min(minTs, start);
        maxTs = Math.max(maxTs, end);

        // Pop elements from the stack that ended before/at the current event's start time
        while (stack.length > 0) {
          const parent = stack[stack.length - 1];
          const parentEnd = parent.ts + parent.dur;
          if (parentEnd <= start) {
            stack.pop();
          } else {
            break;
          }
        }

        const depth = stack.length;
        stack.push(event);

        nodes.push({
          name: event.name,
          cat: event.cat || "op",
          start,
          duration,
          depth,
        });
      });

      // Label the track based on the categories it contains
      const hasCuda = group.events.some((e: any) => e.cat === "cuda_op" || e.name.toLowerCase().includes("kernel"));
      const namePrefix = hasCuda ? "GPU Kernel Track" : "CPU Operator Track";
      const name = `${namePrefix} (PID ${group.pid}, TID ${group.tid})`;

      threads.push({
        tid: group.tid,
        pid: group.pid,
        name,
        nodes,
        minTs,
        maxTs,
      });
    });

    // Sort threads so GPU tracks come first
    const sortedThreads = threads.sort((a, b) => {
      const aIsGpu = a.name.startsWith("GPU") ? 1 : 0;
      const bIsGpu = b.name.startsWith("GPU") ? 1 : 0;
      return bIsGpu - aIsGpu;
    });

    return {
      threads: sortedThreads,
      truncated,
      originalCount,
      limit,
    };
  } catch (err) {
    console.error("Error parsing chrome trace:", err);
    return { threads: [], truncated: false, originalCount: 0, limit };
  }
}
