import { NextRequest, NextResponse } from "next/server";
import { analyzeQuestion } from "@/lib/ai";
import { executeQuery } from "@/lib/bigquery";
import { runCsvQuery } from "@/lib/csv";
import { CsvSource, Report, SchemaContext } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { question, schema, conversationHistory, executeSQL, csvTables } =
      await req.json();

    const csvSources: CsvSource[] = Array.isArray(csvTables) ? csvTables : [];
    const dialect = csvSources.length > 0 ? "csv" : "bigquery";

    const run = (sql: string) =>
      dialect === "csv" ? runCsvQuery(sql, csvSources) : executeQuery(sql);

    if (executeSQL) {
      const result = await run(executeSQL);
      return NextResponse.json({ queryResult: result });
    }

    if (!question || !schema) {
      return NextResponse.json(
        { error: "question and schema are required" },
        { status: 400 }
      );
    }

    const schemaContext: SchemaContext = schema;
    const analysis = await analyzeQuestion(
      question,
      schemaContext,
      conversationHistory ?? [],
      dialect
    );

    // データ分析ではない（雑談など）場合は通常返答のみ返す
    if (!analysis.isAnalysis || !analysis.sql) {
      return NextResponse.json({
        content: analysis.message || analysis.analysis,
      });
    }

    let queryResult;
    try {
      queryResult = await run(analysis.sql);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Query execution failed";
      return NextResponse.json({
        content: analysis.analysis,
        sql: analysis.sql,
        chartConfig: analysis.chartConfig,
        error: `SQL実行エラー: ${message}`,
      });
    }

    const report: Report = {
      id: crypto.randomUUID(),
      title: analysis.title || question,
      definition: analysis.definition,
      sql: analysis.sql,
      queryResult,
      chartConfig: analysis.chartConfig,
      analysis: analysis.analysis,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({ report });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
