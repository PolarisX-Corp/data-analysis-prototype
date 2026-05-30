import { GoogleGenAI, Type } from "@google/genai";
import { SchemaContext, ChartConfig, DataSourceKind, TableSchema } from "@/types";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // キー未設定のまま呼び出すと @google/genai が Application Default
    // Credentials にフォールバックし「Could not load the default credentials」
    // という分かりにくいエラーになるため、ここで明示的に弾く。
    throw new Error(
      "GEMINI_API_KEY が設定されていません。プロジェクト直下の .env.local に GEMINI_API_KEY=... を追加し（Vercel等では環境変数に設定し）、サーバーを再起動・再デプロイしてください。"
    );
  }
  return new GoogleGenAI({ apiKey });
}

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
    return `## SQLの方言ルール
- アップロードされたCSVがテーブルとして登録されています
- 標準SQLを生成してください（alasqlエンジンで実行されます）
- テーブルはプロジェクト名やデータセット名を付けず、テーブル名だけで参照してください
- BigQuery固有の関数（DATE_TRUNC, PARSE_DATE, SAFE_CAST 等）は使えません。SUM/COUNT/AVG/MIN/MAX など標準的な集計関数を使ってください
- 列名やテーブル名にスペースや記号が含まれる場合はバッククォートで囲んでください
- 別名（AS）には英数字とアンダースコアのみを使い、total・count・order などの予約語は避けてください
- SQLでは LIMIT 1000 を付けてください`;
  }

  return `## SQLの方言ルール
- ユーザーの質問に対してBigQueryのSQLを生成してください
- SQLでは LIMIT 1000 を付けてください`;
}

const reportSchema = {
  type: Type.OBJECT,
  properties: {
    isAnalysis: {
      type: Type.BOOLEAN,
      description: "データ分析の依頼ならtrue。雑談や分析と無関係な質問ならfalse。",
    },
    title: { type: Type.STRING, description: "レポートのタイトル" },
    definition: {
      type: Type.STRING,
      description:
        "このレポート/グラフが何を示しているのかの定義。対象期間・対象範囲・指標の意味を簡潔に。",
    },
    sql: {
      type: Type.STRING,
      description: "実行するSQL文。分析でない場合は空文字。",
    },
    analysis: {
      type: Type.STRING,
      description: "想定されるデータの傾向に対する解釈・分析。日本語。",
    },
    chart: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        type: {
          type: Type.STRING,
          enum: ["bar", "line", "pie", "area", "scatter"],
        },
        xKey: { type: Type.STRING, description: "x軸に使うカラム名" },
        yKeys: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "y軸に使うカラム名（複数可）",
        },
        title: { type: Type.STRING },
      },
      required: ["type", "xKey", "yKeys", "title"],
    },
    message: {
      type: Type.STRING,
      description: "分析でない場合に表示する通常の返答テキスト。",
    },
  },
  required: ["isAnalysis"],
};

export interface AnalysisResult {
  /** データ分析依頼かどうか */
  isAnalysis: boolean;
  title: string;
  definition: string;
  sql: string | null;
  analysis: string;
  chartConfig: ChartConfig | null;
  /** 分析でない場合の通常返答 */
  message: string;
}

interface RawReport {
  isAnalysis?: boolean;
  title?: string;
  definition?: string;
  sql?: string;
  analysis?: string;
  chart?: ChartConfig | null;
  message?: string;
}

/**
 * 投入されたデータのスキーマから「こう指示してみては？」という質問候補を生成する。
 * データを入れた直後に提示してユーザーの起点をつくるのが目的。
 */
export async function suggestQuestions(
  schema: SchemaContext,
  dialect: DataSourceKind
): Promise<string[]> {
  if (schema.tables.length === 0) return [];

  const systemPrompt = `あなたはデータアナリストです。以下のスキーマを把握しています。

${buildSchemaPrompt(schema)}

利用可能なテーブルとカラムから、ユーザーが分析の起点にできそうな具体的な指示文を${dialect === "csv" ? "" : ""}日本語で考えてください。
- 実在するカラム名・テーブルの内容に即した、すぐ実行できる粒度の指示にすること
- 推移・比較・割合・ランキングなど分析の切り口が多様になるようにすること
- 1文ごとに簡潔に（例:「日別の売上推移を見せて」）`;

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: "分析の指示候補を4つ提案してください。" }] }],
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 512,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "分析の指示候補（4件程度）",
          },
        },
        required: ["suggestions"],
      },
    },
  });

  try {
    const parsed = JSON.parse(response.text ?? "{}") as { suggestions?: string[] };
    return (parsed.suggestions ?? [])
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
  } catch {
    return [];
  }
}

export async function analyzeQuestion(
  question: string,
  schema: SchemaContext,
  conversationHistory: { role: "user" | "assistant"; content: string }[],
  dialect: DataSourceKind
): Promise<AnalysisResult> {
  const systemPrompt = `あなたはデータアナリストです。以下のスキーマを把握しています。

${buildSchemaPrompt(schema)}

${dialectRules(dialect)}

## 出力ルール
- ユーザーの質問がデータ分析の依頼なら isAnalysis を true にし、title / definition / sql / analysis / chart を埋めてください。
- definition には「このレポートが何を示すか（対象・期間・指標の定義）」を必ず書いてください。
- データの特性に応じて適切な chart を1つ選んでください。グラフ化に適さない場合のみ chart は null。
- 質問がデータ分析と無関係な場合は isAnalysis を false にし、message に日本語で返答してください（sql は空文字）。
- すべて日本語で記述してください。`;

  const contents = [
    ...conversationHistory.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: question }] },
  ];

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseSchema: reportSchema,
    },
  });

  const text = response.text ?? "{}";

  let raw: RawReport;
  try {
    raw = JSON.parse(text) as RawReport;
  } catch {
    // 構造化出力が壊れた場合は通常返答として扱う
    return {
      isAnalysis: false,
      title: "",
      definition: "",
      sql: null,
      analysis: "",
      chartConfig: null,
      message: text,
    };
  }

  const sql = raw.sql?.trim() ? raw.sql.trim() : null;

  return {
    isAnalysis: Boolean(raw.isAnalysis && sql),
    title: raw.title?.trim() ?? "",
    definition: raw.definition?.trim() ?? "",
    sql,
    analysis: raw.analysis?.trim() ?? "",
    chartConfig: raw.chart ?? null,
    message: raw.message?.trim() ?? "",
  };
}
