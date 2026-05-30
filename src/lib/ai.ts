import { GoogleGenAI, Type } from "@google/genai";
import {
  SchemaContext,
  ChartConfig,
  DataSourceKind,
  TableSchema,
  QueryResult,
} from "@/types";

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
    kind: {
      type: Type.STRING,
      enum: ["clarify", "report", "answer"],
      description:
        "依頼が曖昧で確認が必要なら clarify、分析を実行できるなら report、分析と無関係なら answer。",
    },
    clarifyQuestion: {
      type: Type.STRING,
      description: "kind=clarify のときの聞き返し（1問だけ）。日本語。",
    },
    clarifyChoices: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "kind=clarify のときの選択肢。実在テーブル/カラムに基づく具体的な候補を2〜4個。",
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
    charts: {
      type: Type.ARRAY,
      description:
        "このデータに適したグラフ案を1〜3個。先頭を推奨案にする。ユーザーが選べるよう異なる見せ方（折れ線/棒/面など）を提案するとよい。",
      items: {
        type: Type.OBJECT,
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
    },
    message: {
      type: Type.STRING,
      description: "kind=answer のときに表示する通常の返答テキスト。",
    },
  },
  required: ["kind"],
};

export type AnalysisResult =
  | { kind: "clarify"; question: string; choices: string[] }
  | {
      kind: "report";
      title: string;
      definition: string;
      sql: string;
      /** グラフ案（先頭が推奨）。解釈は実データ取得後に別途生成する */
      chartOptions: ChartConfig[];
    }
  | { kind: "answer"; message: string };

interface RawReport {
  kind?: "clarify" | "report" | "answer";
  clarifyQuestion?: string;
  clarifyChoices?: string[];
  title?: string;
  definition?: string;
  sql?: string;
  charts?: ChartConfig[];
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

## 出力ルール（kind で分岐）
- まず依頼が分析を実行するのに十分具体的かを判断してください。
- **曖昧な場合は kind="clarify"**: 対象の商材・期間（daily/weekly等）・対象範囲などが特定できないときは、関係しそうなテーブルを踏まえて clarifyQuestion で1問だけ聞き返し、clarifyChoices に実在データに基づく具体的な候補を2〜4個入れてください。一度に1つの論点だけ聞くこと。
- **十分具体的なら kind="report"**: title / definition / sql / charts を埋めてください。definition には「このレポートが何を示すか（対象・期間・指標の定義）」を必ず書く。charts にはこのデータに適したグラフ案を1〜3個（先頭が推奨）入れる。※解釈・分析はこの段階では書かないこと（実データ取得後に別途生成します）。
- **分析と無関係なら kind="answer"**: message に日本語で返答（sql は空文字）。
- 会話履歴で既にユーザーが答えた論点は再度聞かないこと。十分情報が揃ったら report に進むこと。
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
    return { kind: "answer", message: text };
  }

  if (raw.kind === "clarify" && raw.clarifyQuestion?.trim()) {
    return {
      kind: "clarify",
      question: raw.clarifyQuestion.trim(),
      choices: (raw.clarifyChoices ?? []).map((c) => c.trim()).filter(Boolean),
    };
  }

  const sql = raw.sql?.trim() ? raw.sql.trim() : null;
  if (raw.kind === "report" && sql) {
    return {
      kind: "report",
      title: raw.title?.trim() ?? "",
      definition: raw.definition?.trim() ?? "",
      sql,
      chartOptions: (raw.charts ?? []).filter((c) => c && c.type && c.xKey),
    };
  }

  // answer、または report なのに sql が無い場合のフォールバック
  return {
    kind: "answer",
    message: raw.message?.trim() || "うまく解釈できませんでした。",
  };
}

/**
 * Stage 2: 実行済みクエリの「実データ」を見せて、グラフを踏まえた解釈・分析を生成する。
 * Stage 1（analyzeQuestion）が想定で書いていた分析を、実数に基づく分析へ置き換える。
 */
export async function analyzeResult(
  question: string,
  definition: string,
  result: QueryResult,
  chartOptions: ChartConfig[]
): Promise<{ analysis: string; recommendedChartIndex: number }> {
  // 行数が多いと冗長なので先頭の代表的な行のみ渡す
  const sampleRows = result.rows.slice(0, 50);
  const dataPreview = JSON.stringify(
    { columns: result.columns, totalRows: result.totalRows, rows: sampleRows },
    null,
    0
  );
  const chartList = chartOptions
    .map((c, i) => `  ${i}: ${c.type}（${c.title}）`)
    .join("\n");

  const systemPrompt = `あなたはデータアナリストです。実行済みクエリの結果データを踏まえて、日本語で解釈・分析を述べてください。
- 推測ではなく、提示された実データの数値・傾向に基づくこと（具体的な数値や変化に言及する）
- 簡潔に、示唆（次に何を見るべきか等）まで触れてよい
- グラフ案の中からこのデータを最も的確に見せられるものを recommendedChartIndex で選ぶこと`;

  const userPrompt = `## 依頼
${question}

## レポートの定義
${definition}

## グラフ案
${chartList || "（なし）"}

## 実行結果データ（先頭最大50行）
${dataPreview}`;

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          analysis: {
            type: Type.STRING,
            description: "実データに基づく解釈・分析（日本語）",
          },
          recommendedChartIndex: {
            type: Type.INTEGER,
            description: "推奨するグラフ案のインデックス（0始まり）",
          },
        },
        required: ["analysis"],
      },
    },
  });

  try {
    const parsed = JSON.parse(response.text ?? "{}") as {
      analysis?: string;
      recommendedChartIndex?: number;
    };
    const idx = parsed.recommendedChartIndex ?? 0;
    return {
      analysis: parsed.analysis?.trim() ?? "",
      recommendedChartIndex:
        Number.isInteger(idx) && idx >= 0 && idx < chartOptions.length ? idx : 0,
    };
  } catch {
    return { analysis: "", recommendedChartIndex: 0 };
  }
}
