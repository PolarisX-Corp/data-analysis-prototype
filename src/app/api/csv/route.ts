import { NextRequest, NextResponse } from "next/server";
import { parseCsv, sanitizeTableName } from "@/lib/csv";
import { TableSchema } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { name, csv } = await req.json();
    if (!csv || typeof csv !== "string") {
      return NextResponse.json(
        { error: "csv text is required" },
        { status: 400 }
      );
    }

    const { columns } = parseCsv(csv);
    if (columns.length === 0) {
      return NextResponse.json(
        { error: "CSVを解析できませんでした" },
        { status: 400 }
      );
    }

    const schema: TableSchema = {
      source: "csv",
      table: sanitizeTableName(name || "table"),
      columns,
    };
    return NextResponse.json({ schema });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
