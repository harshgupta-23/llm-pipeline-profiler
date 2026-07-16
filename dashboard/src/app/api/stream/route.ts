import { NextRequest } from "next/server";
import { sseManager } from "@/lib/sse";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");

  const encoder = new TextEncoder();

  const customStream = new ReadableStream({
    start(controller) {
      // Send initial connect signal
      controller.enqueue(encoder.encode(": ok\n\n"));

      const handleUpdate = (event: { runId: string; runData: any }) => {
        if (!runId || event.runId === runId) {
          controller.enqueue(
            encoder.encode(`event: update\ndata: ${JSON.stringify(event.runData)}\n\n`)
          );
        }
      };

      sseManager.on("update", handleUpdate);

      const intervalId = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch (err) {
          clearInterval(intervalId);
        }
      }, 15000);

      req.signal.addEventListener("abort", () => {
        clearInterval(intervalId);
        sseManager.off("update", handleUpdate);
        controller.close();
      });
    },
  });

  return new Response(customStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
export const dynamic = "force-dynamic";
