"use client";

import { useState } from "react";
import { SchemaPanel } from "@/components/SchemaPanel";
import { ChatArea } from "@/components/ChatArea";
import { CsvSource, SchemaContext } from "@/types";

export default function Home() {
  const [schema, setSchema] = useState<SchemaContext>({
    tables: [],
    customDefinitions: "",
  });
  const [csvSources, setCsvSources] = useState<CsvSource[]>([]);

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
