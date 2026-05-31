import Anthropic from "@anthropic-ai/sdk";
import type { SchemaContext, ChartConfig } from "@/types";

const client = new Anthropic();

// Sonnet 4.6 — replaces the now-deprecated claude-sonnet-4-20250514 snapshot
// (EOL 2026-06-15). Older snapshots were prone to repetition/degeneration loops.
const MODEL = "claude-sonnet-4-6";

// Defensive caps. The structured tool schema already prevents a free-text dump
// from reaching the UI, but a model that degenerates inside a string field could
// still emit an enormous value. Clamp before it ever reaches the chat bubble.
const MAX_ANSWER_LENGTH = 8000;
const MAX_SQL_LENGTH = 8000;
const MAX_TITLE_LENGTH = 200;

const CHART_TYPES = ["bar", "line", "pie", "area", "scatter"] as const;

const ANALYSIS_TOOL: Anthropic.Tool = {
  name: "submit_analysis",
  description:
    "ユーザーの質問に対する分析結果を構造化して返します。SQLとグラフ設定は必ずこのツール経由で提出してください。",
  input_schema: {
    type: "object",
    properties: {
      answer: {
        type: "string",
        description:
          "ユーザーへの日本語の回答・説明。分析の意図や結果の読み方を簡潔にまとめる。",
      },
      sql: {
        type: ["string", "null"],
        description:
          "実行するBigQueryのSQL。LIMIT 1000を付ける。データ分析に関係ない質問の場合はnull。",
      },
      chart: {
        type: ["object", "null"],
        description:
          "結果を可視化するグラフ設定。グラフが不要な場合や該当しない場合はnull。",
        properties: {
          type: {
            type: "string",
            enum: [...CHART_TYPES],
            description: "グラフの種類",
          },
          xKey: { type: "string", description: "x軸に使うカラム名" },
          yKeys: {
            type: "array",
            items: { type: "string" },
            description: "y軸に使うカラム名のリスト",
          },
          title: { type: "string", description: "グラフのタイトル" },
        },
        required: ["type", "xKey", "yKeys", "title"],
      },
    },
    required: ["answer", "sql", "chart"],
  },
};

function buildSchemaPrompt(schema: SchemaContext): string {
  const tableDescriptions = schema.tables
    .map((t) => {
      const cols = t.columns
        .map((c) => `    - ${c.name} (${c.type})${c.description ? `: ${c.description}` : ""}`)
        .join("\n");
      return `  テーブル: \`${t.project}.${t.dataset}.${t.table}\`\n${cols}`;
    })
    .join("\n\n");

  return `あなたはデータアナリストです。以下のBigQueryスキーマを把握しています。

## 利用可能なテーブル
${tableDescriptions}

${schema.customDefinitions ? `## KPI定義・補足情報\n${schema.customDefinitions}` : ""}`;
}

interface AnalysisResult {
  content: string;
  sql: string | null;
  chartConfig: ChartConfig | null;
}

interface RawChart {
  type?: unknown;
  xKey?: unknown;
  yKeys?: unknown;
  title?: unknown;
}

interface RawAnalysis {
  answer?: unknown;
  sql?: unknown;
  chart?: unknown;
}

function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function normalizeChart(raw: unknown): ChartConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const chart = raw as RawChart;

  const type = CHART_TYPES.find((t) => t === chart.type);
  if (!type) return null;
  if (typeof chart.xKey !== "string" || !chart.xKey) return null;

  const yKeys = Array.isArray(chart.yKeys)
    ? chart.yKeys.filter((k): k is string => typeof k === "string" && k.length > 0)
    : [];
  if (yKeys.length === 0) return null;

  const title =
    typeof chart.title === "string" && chart.title
      ? clamp(chart.title, MAX_TITLE_LENGTH)
      : "";

  return { type, xKey: chart.xKey, yKeys, title };
}

/**
 * Validate and normalize the structured tool input into an AnalysisResult.
 * Exported for unit testing — pure, no network or SDK dependency.
 */
export function normalizeAnalysis(raw: unknown): AnalysisResult {
  const input = (raw && typeof raw === "object" ? raw : {}) as RawAnalysis;

  const content =
    typeof input.answer === "string" ? clamp(input.answer, MAX_ANSWER_LENGTH) : "";

  const sql =
    typeof input.sql === "string" && input.sql.trim()
      ? clamp(input.sql.trim(), MAX_SQL_LENGTH)
      : null;

  return {
    content,
    sql,
    chartConfig: normalizeChart(input.chart),
  };
}

export async function analyzeQuestion(
  question: string,
  schema: SchemaContext,
  conversationHistory: { role: "user" | "assistant"; content: string }[]
): Promise<AnalysisResult> {
  const systemPrompt = `${buildSchemaPrompt(schema)}

## ルール
- ユーザーの質問に答える分析を行い、必ず \`submit_analysis\` ツールを呼び出して結果を返してください。
- SQLが必要な場合は \`sql\` に設定し、必ず LIMIT 1000 を付けてください。
- データの特性に応じて適切なグラフの種類を \`chart\` に設定してください。グラフが不要なら null にしてください。
- \`answer\` は日本語で簡潔に記述してください。同じ文や要求を繰り返さないでください。
- 質問がデータ分析に関係ない場合は、\`sql\` と \`chart\` を null にして \`answer\` のみで回答してください。`;

  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user" as const, content: question },
  ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: "tool", name: ANALYSIS_TOOL.name },
    messages,
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolUse) {
    // Forced tool_choice should guarantee a tool_use block; fall back gracefully.
    const text = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );
    return {
      content: text?.text
        ? clamp(text.text, MAX_ANSWER_LENGTH)
        : "回答を生成できませんでした。質問を変えてもう一度お試しください。",
      sql: null,
      chartConfig: null,
    };
  }

  return normalizeAnalysis(toolUse.input);
}
