"use client";

import { useState } from "react";
import {
  Code,
  Table,
  FileText,
  Lightbulb,
  Copy,
  Check,
  Download,
} from "lucide-react";
import { Report } from "@/types";
import { ResultChart } from "./ResultChart";
import { DataTable } from "./DataTable";
import {
  reportToMarkdown,
  queryResultToCsv,
  downloadText,
  safeFilename,
} from "@/lib/export";

interface ReportViewProps {
  report: Report;
}

const CHART_TYPE_LABEL: Record<string, string> = {
  bar: "棒",
  line: "折れ線",
  pie: "円",
  area: "面",
  scatter: "散布図",
};

export function ReportView({ report }: ReportViewProps) {
  const [showTable, setShowTable] = useState(false);
  const [chartIdx, setChartIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  const baseName = safeFilename(report.title);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(reportToMarkdown(report));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボード不可の環境では .md ダウンロードにフォールバック
      downloadText(`${baseName}.md`, reportToMarkdown(report), "text/markdown");
    }
  };

  // chartOptions が無い古いレポートでも壊れないよう chartConfig をフォールバック
  const chartOptions =
    report.chartOptions && report.chartOptions.length > 0
      ? report.chartOptions
      : report.chartConfig
        ? [report.chartConfig]
        : [];
  const selectedChart = chartOptions[chartIdx] ?? chartOptions[0] ?? null;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-gray-800 min-w-0">
          <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <h3 className="text-sm font-semibold truncate">{report.title}</h3>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={copyMarkdown}
            title="Markdownをコピー"
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copied ? "コピー済" : "Markdown"}
          </button>
          <button
            onClick={() =>
              downloadText(
                `${baseName}.md`,
                reportToMarkdown(report),
                "text/markdown"
              )
            }
            title="Markdownをダウンロード"
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded"
          >
            <Download className="w-3.5 h-3.5" />
            .md
          </button>
          <button
            onClick={() =>
              downloadText(
                `${baseName}.csv`,
                queryResultToCsv(report.queryResult),
                "text/csv"
              )
            }
            title="集計データをCSVでダウンロード"
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded"
          >
            <Download className="w-3.5 h-3.5" />
            .csv
          </button>
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

        {selectedChart && (
          <div>
            {chartOptions.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs text-gray-400">グラフ案:</span>
                {chartOptions.map((c, i) => (
                  <button
                    key={`${c.type}-${i}`}
                    onClick={() => setChartIdx(i)}
                    className={`px-2.5 py-1 text-xs rounded-full border ${
                      i === chartIdx
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {String.fromCharCode(65 + i)}: {CHART_TYPE_LABEL[c.type] ?? c.type}
                  </button>
                ))}
              </div>
            )}
            <ResultChart data={report.queryResult} config={selectedChart} />
          </div>
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
