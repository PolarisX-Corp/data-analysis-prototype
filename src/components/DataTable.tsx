"use client";

import { QueryResult } from "@/types";

interface DataTableProps {
  data: QueryResult;
}

export function DataTable({ data }: DataTableProps) {
  if (!data.rows.length) {
    return <p className="text-sm text-gray-500 my-2">結果が0件です</p>;
  }

  return (
    <div className="my-2 border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto max-h-64">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {data.columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-2 text-left font-semibold text-gray-600 border-b border-gray-200"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.slice(0, 100).map((row, i) => (
              <tr key={i} className="hover:bg-gray-50 even:bg-gray-25">
                {data.columns.map((col) => (
                  <td
                    key={col}
                    className="px-3 py-1.5 text-gray-700 border-b border-gray-100 whitespace-nowrap"
                  >
                    {String(row[col] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.totalRows > 100 && (
        <div className="px-3 py-1.5 text-xs text-gray-500 bg-gray-50 border-t border-gray-200">
          {data.totalRows}件中 100件を表示
        </div>
      )}
    </div>
  );
}
