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

function mergeContiguousNodes(nodes: FlamegraphNode[], maxGapUs = 1000): FlamegraphNode[] {
  if (nodes.length === 0) return [];
  
  // Sort nodes by depth, then by start time
  const sortedNodes = [...nodes].sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.start - b.start;
  });
  
  const merged: FlamegraphNode[] = [];
  
  let current: FlamegraphNode & { names?: Set<string>; count?: number } = {
    ...sortedNodes[0],
    names: new Set([sortedNodes[0].name]),
    count: 1
  };
  
  for (let i = 1; i < sortedNodes.length; i++) {
    const node = sortedNodes[i];
    const currentEnd = current.start + current.duration;
    
    // Check if it belongs to the same lane (depth), same category, and within gap threshold
    if (
      node.depth === current.depth &&
      node.cat === current.cat &&
      (node.start - currentEnd) <= maxGapUs
    ) {
      // Merge node
      current.duration = (node.start + node.duration) - current.start;
      current.names?.add(node.name);
      if (current.count !== undefined) {
        current.count += 1;
      }
    } else {
      // Finalize current merged node name
      if (current.names && current.names.size > 1) {
        const uniqueNames = Array.from(current.names);
        if (uniqueNames.length <= 2) {
          current.name = `${uniqueNames.join(" + ")} (x${current.count})`;
        } else {
          current.name = `${uniqueNames[0]} & ${uniqueNames.length - 1} other ops (x${current.count})`;
        }
      } else if (current.count && current.count > 1) {
        current.name = `${current.name} (x${current.count})`;
      }
      
      merged.push({
        name: current.name,
        cat: current.cat,
        start: current.start,
        duration: current.duration,
        depth: current.depth
      });
      
      current = {
        ...node,
        names: new Set([node.name]),
        count: 1
      };
    }
  }
  
  // Finalize last node
  if (current.names && current.names.size > 1) {
    const uniqueNames = Array.from(current.names);
    if (uniqueNames.length <= 2) {
      current.name = `${uniqueNames.join(" + ")} (x${current.count})`;
    } else {
      current.name = `${uniqueNames[0]} & ${uniqueNames.length - 1} other ops (x${current.count})`;
    }
  } else if (current.count && current.count > 1) {
    current.name = `${current.name} (x${current.count})`;
  }
  merged.push({
    name: current.name,
    cat: current.cat,
    start: current.start,
    duration: current.duration,
    depth: current.depth
  });
  
  return merged;
}

export function parseChromeTrace(traceJsonStr: string, limit = 15000, mergeOps = true): ParseTraceResult {
  try {
    const trace = JSON.parse(traceJsonStr);
    const events = trace.traceEvents || [];
    
    // 1. Filter out invalid events
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

      const hasCuda = group.events.some((e: any) => e.cat === "cuda_op" || e.name.toLowerCase().includes("kernel"));
      const namePrefix = hasCuda ? "GPU Kernel Track" : "CPU Operator Track";
      const name = `${namePrefix} (PID ${group.pid}, TID ${group.tid})`;

      threads.push({
        tid: group.tid,
        pid: group.pid,
        name,
        nodes: mergeOps ? mergeContiguousNodes(nodes) : nodes,
        minTs,
        maxTs,
      });
    });

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
