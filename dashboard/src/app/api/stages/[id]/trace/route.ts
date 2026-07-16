import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const stage = await db.stage.findUnique({
      where: { id },
      select: { trace_ref: true }
    });
    
    if (!stage) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }
    
    return NextResponse.json({ trace: stage.trace_ref });
  } catch (error: any) {
    const { id } = await params;
    console.error(`Error in GET /api/stages/${id}/trace:`, error);
    return NextResponse.json({ error: error.message || "Failed to fetch trace" }, { status: 500 });
  }
}
