"use client";

import { useState } from "react";
import { Code, Table, FileText, Lightbulb } from "lucide-react";
import { Report } from "@/types";
import { ResultChart } from "./ResultChart";
import { DataTable } from "./DataTable";

interface ReportViewProps {
  report: Report;
}

export function ReportView({ report }: ReportViewProps) {
  const [showTable, setShowTable] = useState(false);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2 text-gray-800">
          <FileText className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold">{report.title}</h3>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {report.definition && (
          <section>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              データ定義
            </h4>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {report.definition}
            </p>
          </section>
        )}

        {report.chartConfig && (
          <ResultChart data={report.queryResult} config={report.chartConfig} />
        )}

        {report.analysis && (
          <section className="bg-amber-50 border border-amber-100 rounded-lg p-3">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 mb-1">
              <Lightbulb className="w-3.5 h-3.5" />
              解釈・分析
            </h4>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {report.analysis}
            </p>
          </section>
        )}

        <details>
          <summary className="text-xs text-gray-500 cursor-pointer flex items-center gap-1 hover:text-gray-700">
            <Code className="w-3 h-3" />
            SQLを表示
          </summary>
          <pre className="mt-1 p-3 bg-gray-900 text-gray-100 text-xs rounded-lg overflow-x-auto">
            <code>{report.sql}</code>
          </pre>
        </details>

        <div>
          <button
            onClick={() => setShowTable(!showTable)}
            className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700 mb-1"
          >
            <Table className="w-3 h-3" />
            {showTable ? "集計データを隠す" : "集計データを表示"}
            （{report.queryResult.totalRows}件）
          </button>
          {showTable && <DataTable data={report.queryResult} />}
        </div>
      </div>
    </div>
  );
}
