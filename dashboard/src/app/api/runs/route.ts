import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sseManager } from "@/lib/sse";
import { Prisma } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    
    if (!payload.id || !payload.name) {
      return NextResponse.json({ error: "Missing required fields: id, name" }, { status: 400 });
    }

    // Execute in a transaction to ensure atomicity
    const run = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Upsert Run
      await tx.run.upsert({
        where: { id: payload.id },
        create: {
          id: payload.id,
          name: payload.name,
          created_at: payload.created_at ? new Date(payload.created_at) : new Date(),
          model_name: payload.model_name,
          hardware_info: payload.hardware_info || {},
        },
        update: {
          name: payload.name,
          model_name: payload.model_name,
          hardware_info: payload.hardware_info || {},
        },
      });

      // 2. Clear old stages and cascade metrics
      await tx.stage.deleteMany({
        where: { run_id: payload.id },
      });

      // 3. Create stages and metrics
      for (const stage of payload.stages || []) {
        await tx.stage.create({
          data: {
            id: stage.id,
            run_id: payload.id,
            name: stage.name,
            start_time: new Date(stage.start_time),
            end_time: new Date(stage.end_time),
            duration_ms: stage.duration_ms,
            cpu_percent: stage.cpu_percent,
            ram_used_mb: stage.ram_used_mb,
            gpu_util_percent: stage.gpu_util_percent,
            gpu_mem_used_mb: stage.gpu_mem_used_mb,
            trace_ref: stage.trace_ref,
            metrics: {
              create: (stage.metrics || []).map((m: any) => ({
                timestamp: new Date(m.timestamp),
                key: m.key,
                value: m.value,
              })),
            },
          },
        });
      }

      // Fetch the full run data with stages and metrics for the broadcast
      return tx.run.findUnique({
        where: { id: payload.id },
        include: {
          stages: {
            orderBy: { start_time: "asc" },
            include: {
              metrics: {
                orderBy: { timestamp: "asc" },
              },
            },
          },
        },
      });
    });

    // Broadcast the update
    if (run) {
      sseManager.broadcastRunUpdate(run.id, run);
    }

    return NextResponse.json({ success: true, run });
  } catch (error: any) {
    console.error("Error in POST /api/runs:", error);
    return NextResponse.json({ error: error.message || "Failed to process run payload" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const runs = await db.run.findMany({
      orderBy: { created_at: "desc" },
      include: {
        stages: {
          select: {
            id: true,
            name: true,
            duration_ms: true,
          },
        },
      },
    });
    return NextResponse.json(runs);
  } catch (error: any) {
    console.error("Error in GET /api/runs:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch runs" }, { status: 500 });
  }
}
