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

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  queryResult?: QueryResult;
  chartConfig?: ChartConfig;
  error?: string;
  isLoading?: boolean;
}
