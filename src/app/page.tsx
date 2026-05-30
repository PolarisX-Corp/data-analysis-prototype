"use client";

import { SchemaPanel } from "@/components/SchemaPanel";
import { ChatArea } from "@/components/ChatArea";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { usePersistentState } from "@/lib/usePersistentState";
import { useConversations } from "@/lib/useConversations";
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

  const {
    conversations,
    activeId,
    messages,
    setMessages,
    newConversation,
    selectConversation,
    deleteConversation,
  } = useConversations();

  return (
    <div className="flex h-screen">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        onNew={newConversation}
        onSelect={selectConversation}
        onDelete={deleteConversation}
      />
      <SchemaPanel
        schema={schema}
        onSchemaChange={setSchema}
        csvSources={csvSources}
        onCsvSourcesChange={setCsvSources}
      />
      <ChatArea
        schema={schema}
        csvSources={csvSources}
        messages={messages}
        setMessages={setMessages}
      />
    </div>
  );
}
