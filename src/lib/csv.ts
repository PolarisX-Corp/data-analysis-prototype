import alasql from "alasql";
import { ColumnInfo, CsvSource, QueryResult } from "@/types";

// RFC 4180-ish parser: handles quoted fields, escaped quotes ("") and
// newlines/commas inside quotes.
function splitRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

const INT_RE = /^-?\d+$/;
const FLOAT_RE = /^-?\d*\.\d+(e-?\d+)?$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;
const BOOL_RE = /^(true|false)$/i;

function inferType(values: string[]): string {
  const present = values.filter((v) => v !== "");
  if (present.length === 0) return "STRING";
  if (present.every((v) => INT_RE.test(v))) return "INTEGER";
  if (present.every((v) => INT_RE.test(v) || FLOAT_RE.test(v))) return "FLOAT";
  if (present.every((v) => BOOL_RE.test(v))) return "BOOL";
  if (present.every((v) => DATE_RE.test(v))) return "DATE";
  return "STRING";
}

function coerce(value: string, type: string): unknown {
  if (value === "") return null;
  if (type === "INTEGER" || type === "FLOAT") return Number(value);
  if (type === "BOOL") return value.toLowerCase() === "true";
  return value;
}

export interface ParsedCsv {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
}

export function parseCsv(text: string): ParsedCsv {
  const grid = splitRows(text);
  if (grid.length === 0) return { columns: [], rows: [] };

  const headers = grid[0].map((h, i) => h.trim() || `column_${i + 1}`);
  const body = grid.slice(1);

  const columns: ColumnInfo[] = headers.map((name, i) => ({
    name,
    type: inferType(body.map((r) => r[i] ?? "")),
    description: "",
  }));

  const rows = body.map((r) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((name, i) => {
      obj[name] = coerce(r[i] ?? "", columns[i].type);
    });
    return obj;
  });

  return { columns, rows };
}

// Turn a file name into a SQL-safe table identifier.
export function sanitizeTableName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[a-zA-Z_]/.test(base) ? base : `t_${base}`;
}

export function runCsvQuery(sql: string, sources: CsvSource[]): QueryResult {
  const db = new alasql.Database();
  for (const src of sources) {
    const name = sanitizeTableName(src.name);
    db.exec(`CREATE TABLE \`${name}\``);
    (db.tables[name] as { data: unknown[] }).data = parseCsv(src.csv).rows;
  }

  const result = db.exec<Record<string, unknown>[]>(sql.replace(/;\s*$/, ""));
  if (!Array.isArray(result) || result.length === 0) {
    return { columns: [], rows: [], totalRows: 0 };
  }

  const columns = Object.keys(result[0]);
  return {
    columns,
    rows: result.slice(0, 1000),
    totalRows: result.length,
  };
}
