import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const run = await db.run.findUnique({
      where: { id },
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

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json(run);
  } catch (error: any) {
    const { id } = await params;
    console.error(`Error in GET /api/runs/${id}:`, error);
    return NextResponse.json({ error: error.message || "Failed to fetch run" }, { status: 500 });
  }
}
