"use client";

import { SchemaPanel } from "@/components/SchemaPanel";
import { ChatArea } from "@/components/ChatArea";
import { usePersistentState } from "@/lib/usePersistentState";
import { CsvSource, SchemaContext } from "@/types";

export default function Home() {
  const [schema, setSchema] = usePersistentState<SchemaContext>(
    "data-analysis:schema",
    { tables: [], customDefinitions: "" }
  );
  const [csvSources, setCsvSources] = usePersistentState<CsvSource[]>(
    "data-analysis:csv-sources",
    []
  );

  return (
    <div className="flex h-screen">
      <SchemaPanel
        schema={schema}
        onSchemaChange={setSchema}
        csvSources={csvSources}
        onCsvSourcesChange={setCsvSources}
      />
      <ChatArea schema={schema} csvSources={csvSources} />
    </div>
  );
}
