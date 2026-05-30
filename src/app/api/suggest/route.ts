import { NextRequest, NextResponse } from "next/server";
import { suggestQuestions } from "@/lib/ai";
import { CsvSource, SchemaContext } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { schema, csvTables } = await req.json();

    if (!schema) {
      return NextResponse.json({ suggestions: [] });
    }

    const csvSources: CsvSource[] = Array.isArray(csvTables) ? csvTables : [];
    const dialect = csvSources.length > 0 ? "csv" : "bigquery";

    const schemaContext: SchemaContext = schema;
    const suggestions = await suggestQuestions(schemaContext, dialect);

    return NextResponse.json({ suggestions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ suggestions: [], error: message }, { status: 200 });
  }
}
