import { NextRequest, NextResponse } from "next/server";
import { getSchemas } from "@/lib/bigquery";

export async function POST(req: NextRequest) {
  try {
    const { projectId, datasetId } = await req.json();
    if (!projectId || !datasetId) {
      return NextResponse.json(
        { error: "projectId and datasetId are required" },
        { status: 400 }
      );
    }
    const schemas = await getSchemas(projectId, datasetId);
    return NextResponse.json({ schemas });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
