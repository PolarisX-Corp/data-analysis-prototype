"use client";

import { useState } from "react";
import { SchemaPanel } from "@/components/SchemaPanel";
import { ChatArea } from "@/components/ChatArea";
import { SchemaContext } from "@/types";

export default function Home() {
  const [schema, setSchema] = useState<SchemaContext>({
    tables: [],
    customDefinitions: "",
  });

  return (
    <div className="flex h-screen">
      <SchemaPanel schema={schema} onSchemaChange={setSchema} />
      <ChatArea schema={schema} />
    </div>
  );
}
