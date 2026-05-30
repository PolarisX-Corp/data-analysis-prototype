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

export interface Report {
  id: string;
  title: string;
  /** このレポート/グラフが何を示しているのかの定義 */
  definition: string;
  sql: string;
  queryResult: QueryResult;
  chartConfig: ChartConfig | null;
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
  error?: string;
  isLoading?: boolean;
}
