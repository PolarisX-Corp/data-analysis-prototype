import { QueryResult, Report } from "@/types";

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** 集計データを Markdown のテーブルに整形する */
function dataToMarkdownTable(result: QueryResult): string {
  if (result.columns.length === 0) return "_データなし_";
  const escape = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const header = `| ${result.columns.map(escape).join(" | ")} |`;
  const divider = `| ${result.columns.map(() => "---").join(" | ")} |`;
  const body = result.rows
    .map(
      (row) =>
        `| ${result.columns.map((c) => escape(cell(row[c]))).join(" | ")} |`
    )
    .join("\n");
  return [header, divider, body].filter(Boolean).join("\n");
}

/** レポートを Markdown 文字列に変換する */
export function reportToMarkdown(report: Report): string {
  const chart = report.chartConfig;
  const chartSection = chart
    ? `## グラフ\n- 種類: ${chart.type}\n- X軸: ${chart.xKey}\n- Y軸: ${chart.yKeys.join(", ")}\n- タイトル: ${chart.title}`
    : "";

  return [
    `# ${report.title}`,
    `_作成: ${report.createdAt}_`,
    report.definition && `## データ定義\n${report.definition}`,
    report.analysis && `## 解釈・分析\n${report.analysis}`,
    chartSection,
    `## SQL\n\`\`\`sql\n${report.sql}\n\`\`\``,
    `## 集計データ（${report.queryResult.totalRows}件）\n${dataToMarkdownTable(report.queryResult)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** 集計データを CSV 文字列に変換する（RFC 4180 ベース） */
export function queryResultToCsv(result: QueryResult): string {
  const escape = (value: unknown) => {
    const s = cell(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = result.columns.map(escape).join(",");
  const rows = result.rows.map((row) =>
    result.columns.map((c) => escape(row[c])).join(",")
  );
  return [header, ...rows].join("\n");
}

/** ブラウザでテキストをファイルとしてダウンロードさせる */
export function downloadText(
  filename: string,
  text: string,
  mime = "text/plain"
): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** ファイル名に使える安全な文字列にする */
export function safeFilename(name: string): string {
  return (name || "report").replace(/[^\w぀-ヿ一-鿿-]+/g, "_").slice(0, 60);
}
