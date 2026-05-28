import { BigQuery } from "@google-cloud/bigquery";
import { TableSchema, ColumnInfo, QueryResult } from "@/types";

function getClient(): BigQuery {
  const credentials = process.env.GOOGLE_CLOUD_CREDENTIALS;
  if (credentials) {
    const parsed = JSON.parse(credentials);
    return new BigQuery({
      projectId: parsed.project_id,
      credentials: parsed,
    });
  }
  return new BigQuery();
}

export async function getSchemas(
  projectId: string,
  datasetId: string
): Promise<TableSchema[]> {
  const client = getClient();
  const dataset = client.dataset(datasetId, { projectId });
  const [tables] = await dataset.getTables();

  const schemas: TableSchema[] = [];

  for (const table of tables) {
    const [metadata] = await table.getMetadata();
    const columns: ColumnInfo[] = (metadata.schema?.fields ?? []).map(
      (f: { name: string; type: string; description?: string }) => ({
        name: f.name,
        type: f.type,
        description: f.description ?? "",
      })
    );
    schemas.push({
      source: "bigquery",
      project: projectId,
      dataset: datasetId,
      table: table.id ?? "",
      columns,
    });
  }

  return schemas;
}

export async function executeQuery(sql: string): Promise<QueryResult> {
  const client = getClient();
  const [rows] = await client.query({
    query: sql,
    maximumBytesBilled: "1000000000",
  });

  if (!rows.length) {
    return { columns: [], rows: [], totalRows: 0 };
  }

  const columns = Object.keys(rows[0]);
  const limited = rows.slice(0, 1000);

  return {
    columns,
    rows: limited.map((row: Record<string, unknown>) => {
      const clean: Record<string, unknown> = {};
      for (const key of columns) {
        const val = row[key];
        if (val !== null && typeof val === "object" && "value" in (val as Record<string, unknown>)) {
          clean[key] = (val as { value: unknown }).value;
        } else {
          clean[key] = val;
        }
      }
      return clean;
    }),
    totalRows: rows.length,
  };
}
