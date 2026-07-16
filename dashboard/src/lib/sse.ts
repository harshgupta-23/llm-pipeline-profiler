import { EventEmitter } from "events";

class SSEManager extends EventEmitter {
  broadcastRunUpdate(runId: string, runData: any) {
    this.emit("update", { runId, runData });
  }
}

const globalForSSE = global as unknown as { sse: SSEManager };
export const sseManager = globalForSSE.sse || new SSEManager();
if (process.env.NODE_ENV !== "production") globalForSSE.sse = sseManager;
