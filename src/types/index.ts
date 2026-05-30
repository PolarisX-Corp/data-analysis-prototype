export type DataSourceKind = "bigquery" | "csv";

export interface TableSchema {
  source: DataSourceKind;
  project?: string;
  dataset?: string;
  table: string;
  columns: ColumnInfo[];
}

export interface CsvSource {
  name: string;
  csv: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  description: string;
}

export interface SchemaContext {
  tables: TableSchema[];
  customDefinitions: string;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

export interface ChartConfig {
  type: "bar" | "line" | "pie" | "area" | "scatter";
  xKey: string;
  yKeys: string[];
  title: string;
}

/** AIがユーザーに聞き返す逆質問（曖昧な依頼を絞り込むため） */
export interface ClarifyTurn {
  question: string;
  /** 選択肢（ボタン表示）。自由入力でも答えられる */
  choices: string[];
}

export interface Report {
  id: string;
  title: string;
  /** このレポート/グラフが何を示しているのかの定義 */
  definition: string;
  sql: string;
  queryResult: QueryResult;
  /** 推奨グラフ（chartOptions の先頭と一致） */
  chartConfig: ChartConfig | null;
  /** ユーザーが切り替えられるグラフ案（A/B/C）。推奨が先頭 */
  chartOptions: ChartConfig[];
  /** グラフ・集計結果を踏まえた解釈・分析 */
  analysis: string;
  createdAt: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  queryResult?: QueryResult;
  chartConfig?: ChartConfig;
  report?: Report;
  clarify?: ClarifyTurn;
  error?: string;
  isLoading?: boolean;
}

/** 1つの会話（チャット）。複数の会話を切り替え・参照できるようにするための単位 */
export interface Conversation {
  id: string;
  /** 一覧に表示するタイトル。最初のユーザー発言から自動生成する */
  title: string;
  messages: Message[];
  createdAt: string;
  /** 並び替え用。メッセージが追加されるたびに更新する */
  updatedAt: string;
}
