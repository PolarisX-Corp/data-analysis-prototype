"use client";

import { useState } from "react";
import { Database, ChevronDown, ChevronRight, Plus, Loader2 } from "lucide-react";
import { TableSchema, SchemaContext } from "@/types";

interface SchemaPanelProps {
  schema: SchemaContext;
  onSchemaChange: (schema: SchemaContext) => void;
}

export function SchemaPanel({ schema, onSchemaChange }: SchemaPanelProps) {
  const [projectId, setProjectId] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

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

  const toggleTable = (key: string) => {
    const next = new Set(expandedTables);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedTables(next);
  };

  const removeTable = (table: TableSchema) => {
    onSchemaChange({
      ...schema,
      tables: schema.tables.filter(
        (t) =>
          !(
            t.project === table.project &&
            t.dataset === table.dataset &&
            t.table === table.table
          )
      ),
    });
  };

  return (
    <div className="w-80 border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
          <Database className="w-4 h-4" />
          データソース
        </h2>
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
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          テーブル一覧
        </h3>
        {schema.tables.length === 0 ? (
          <p className="text-xs text-gray-400 mt-2">
            テーブルが未登録です。上からBigQueryのデータセットを追加してください。
          </p>
        ) : (
          <div className="space-y-1">
            {schema.tables.map((table) => {
              const key = `${table.project}.${table.dataset}.${table.table}`;
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
