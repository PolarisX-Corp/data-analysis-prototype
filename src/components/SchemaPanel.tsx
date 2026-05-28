"use client";

import { useRef, useState } from "react";
import {
  Database,
  ChevronDown,
  ChevronRight,
  Plus,
  Loader2,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import { CsvSource, TableSchema, SchemaContext } from "@/types";

interface SchemaPanelProps {
  schema: SchemaContext;
  onSchemaChange: (schema: SchemaContext) => void;
  csvSources: CsvSource[];
  onCsvSourcesChange: (sources: CsvSource[]) => void;
}

function sameTable(a: TableSchema, b: TableSchema): boolean {
  return (
    a.source === b.source &&
    a.table === b.table &&
    a.project === b.project &&
    a.dataset === b.dataset
  );
}

function tableKey(t: TableSchema): string {
  return t.source === "csv"
    ? `csv:${t.table}`
    : `${t.project}.${t.dataset}.${t.table}`;
}

export function SchemaPanel({
  schema,
  onSchemaChange,
  csvSources,
  onCsvSourcesChange,
}: SchemaPanelProps) {
  const [tab, setTab] = useState<"bigquery" | "csv">("bigquery");
  const [projectId, setProjectId] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [loading, setLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSchema = async () => {
    if (!projectId || !datasetId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, datasetId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onSchemaChange({
        ...schema,
        tables: [...schema.tables, ...data.schemas],
      });
      setProjectId("");
      setDatasetId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch schema");
    } finally {
      setLoading(false);
    }
  };

  const uploadCsv = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setCsvLoading(true);
    setError("");
    try {
      const newTables: TableSchema[] = [];
      const newSources: CsvSource[] = [];
      for (const file of Array.from(files)) {
        const text = await file.text();
        const res = await fetch("/api/csv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, csv: text }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        const tableSchema = data.schema as TableSchema;
        newTables.push(tableSchema);
        newSources.push({ name: tableSchema.table, csv: text });
      }
      onSchemaChange({
        ...schema,
        tables: [...schema.tables, ...newTables],
      });
      onCsvSourcesChange([...csvSources, ...newSources]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSVの読み込みに失敗しました");
    } finally {
      setCsvLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleTable = (key: string) => {
    const next = new Set(expandedTables);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedTables(next);
  };

  const removeTable = (table: TableSchema) => {
    onSchemaChange({
      ...schema,
      tables: schema.tables.filter((t) => !sameTable(t, table)),
    });
    if (table.source === "csv") {
      onCsvSourcesChange(csvSources.filter((s) => s.name !== table.table));
    }
  };

  return (
    <div className="w-80 border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
          <Database className="w-4 h-4" />
          データソース
        </h2>

        <div className="flex gap-1 mb-3 bg-gray-100 p-0.5 rounded-md">
          {(["bigquery", "csv"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 px-2 py-1 text-xs rounded ${
                tab === t
                  ? "bg-white text-gray-800 shadow-sm font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "bigquery" ? "BigQuery" : "CSV"}
            </button>
          ))}
        </div>

        {tab === "bigquery" ? (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Project ID"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Dataset ID"
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={fetchSchema}
              disabled={loading || !projectId || !datasetId}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              スキーマを取得
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              multiple
              onChange={(e) => uploadCsv(e.target.files)}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={csvLoading}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {csvLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              CSVをアップロード
            </button>
            <p className="text-[11px] text-gray-400">
              ヘッダー行付きのCSVに対応しています。ファイル名がテーブル名になります。
            </p>
          </div>
        )}

        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          テーブル一覧
        </h3>
        {schema.tables.length === 0 ? (
          <p className="text-xs text-gray-400 mt-2">
            テーブルが未登録です。BigQueryのデータセットを追加するか、CSVをアップロードしてください。
          </p>
        ) : (
          <div className="space-y-1">
            {schema.tables.map((table) => {
              const key = tableKey(table);
              const expanded = expandedTables.has(key);
              return (
                <div key={key}>
                  <div className="flex items-center group">
                    <button
                      onClick={() => toggleTable(key)}
                      className="flex-1 flex items-center gap-1 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200 rounded"
                    >
                      {expanded ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      {table.source === "csv" && (
                        <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                      )}
                      <span className="font-mono truncate">{table.table}</span>
                    </button>
                    <button
                      onClick={() => removeTable(table)}
                      className="opacity-0 group-hover:opacity-100 px-1 text-gray-400 hover:text-red-500 text-xs"
                    >
                      x
                    </button>
                  </div>
                  {expanded && (
                    <div className="ml-6 mb-1">
                      {table.columns.map((col) => (
                        <div
                          key={col.name}
                          className="flex items-center gap-2 px-2 py-0.5 text-xs text-gray-500"
                        >
                          <span className="font-mono">{col.name}</span>
                          <span className="text-gray-400">{col.type}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-200">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          KPI定義・補足情報
        </h3>
        <textarea
          value={schema.customDefinitions}
          onChange={(e) =>
            onSchemaChange({ ...schema, customDefinitions: e.target.value })
          }
          placeholder="例: DAU = 1日にログインしたユニークユーザー数&#10;課金率 = 課金ユーザー / DAU"
          className="w-full h-24 px-3 py-2 text-xs border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}
