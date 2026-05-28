import { GoogleGenAI } from "@google/genai";
import { SchemaContext, ChartConfig, DataSourceKind, TableSchema } from "@/types";

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

function tableRef(t: TableSchema): string {
  if (t.source === "csv") return `\`${t.table}\``;
  return `\`${t.project}.${t.dataset}.${t.table}\``;
}

function buildSchemaPrompt(schema: SchemaContext): string {
  const tableDescriptions = schema.tables
    .map((t) => {
      const cols = t.columns
        .map((c) => `    - ${c.name} (${c.type})${c.description ? `: ${c.description}` : ""}`)
        .join("\n");
      return `  テーブル: ${tableRef(t)}\n${cols}`;
    })
    .join("\n\n");

  return `## 利用可能なテーブル
${tableDescriptions}

${schema.customDefinitions ? `## KPI定義・補足情報\n${schema.customDefinitions}` : ""}`;
}

function dialectRules(dialect: DataSourceKind): string {
  if (dialect === "csv") {
    return `## ルール
- アップロードされたCSVがテーブルとして登録されています
- ユーザーの質問に対して標準SQLを生成してください（alasqlエンジンで実行されます）
- テーブルはプロジェクト名やデータセット名を付けず、テーブル名だけで参照してください
- BigQuery固有の関数（DATE_TRUNC, PARSE_DATE, SAFE_CAST 等）は使えません。SUM/COUNT/AVG/MIN/MAX など標準的な集計関数を使ってください
- 列名やテーブル名にスペースや記号が含まれる場合はバッククォートで囲んでください
- 別名（AS）には英数字とアンダースコアのみを使い、total・count・order などの予約語は避けてください
- SQLは必ず \`\`\`sql\`\`\` ブロックで囲んでください
- データの特性に応じて適切なグラフの種類を選び、以下のJSON形式で提案してください:
  \`\`\`chart
  {"type": "bar|line|pie|area|scatter", "xKey": "x軸カラム名", "yKeys": ["y軸カラム名"], "title": "グラフタイトル"}
  \`\`\`
- 日本語で回答してください
- 質問がデータ分析に関係ない場合は、SQLなしで回答してください
- SQLでは LIMIT 1000 を付けてください`;
  }

  return `## ルール
- ユーザーの質問に対してBigQueryのSQLを生成してください
- SQLは必ず \`\`\`sql\`\`\` ブロックで囲んでください
- データの特性に応じて適切なグラフの種類を選び、以下のJSON形式で提案してください:
  \`\`\`chart
  {"type": "bar|line|pie|area|scatter", "xKey": "x軸カラム名", "yKeys": ["y軸カラム名"], "title": "グラフタイトル"}
  \`\`\`
- 日本語で回答してください
- 質問がデータ分析に関係ない場合は、SQLなしで回答してください
- SQLでは LIMIT 1000 を付けてください`;
}

interface AnalysisResult {
  content: string;
  sql: string | null;
  chartConfig: ChartConfig | null;
}

export async function analyzeQuestion(
  question: string,
  schema: SchemaContext,
  conversationHistory: { role: "user" | "assistant"; content: string }[],
  dialect: DataSourceKind
): Promise<AnalysisResult> {
  const systemPrompt = `あなたはデータアナリストです。以下のスキーマを把握しています。

${buildSchemaPrompt(schema)}

${dialectRules(dialect)}`;

  const contents = [
    ...conversationHistory.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: question }] },
  ];

  const response = await client.models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 4096,
    },
  });

  const text = response.text ?? "";

  const sqlMatch = text.match(/```sql\n([\s\S]*?)```/);
  const chartMatch = text.match(/```chart\n([\s\S]*?)```/);

  let chartConfig: ChartConfig | null = null;
  if (chartMatch) {
    try {
      chartConfig = JSON.parse(chartMatch[1].trim());
    } catch {
      // ignore parse errors
    }
  }

  const content = text
    .replace(/```sql\n[\s\S]*?```/g, "")
    .replace(/```chart\n[\s\S]*?```/g, "")
    .trim();

  return {
    content,
    sql: sqlMatch ? sqlMatch[1].trim() : null,
    chartConfig,
  };
}
