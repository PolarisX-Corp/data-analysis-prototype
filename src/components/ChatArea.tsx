"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Code, AlertCircle, Table, BarChart3 } from "lucide-react";
import { CsvSource, Message, SchemaContext } from "@/types";
import { usePersistentState } from "@/lib/usePersistentState";
import { ResultChart } from "./ResultChart";
import { DataTable } from "./DataTable";
import { ReportView } from "./ReportView";

interface ChatAreaProps {
  schema: SchemaContext;
  csvSources: CsvSource[];
}

export function ChatArea({ schema, csvSources }: ChatAreaProps) {
  const [messages, setMessages] = usePersistentState<Message[]>(
    "data-analysis:messages",
    []
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // 取得済みの候補を「どのテーブル構成に対するものか」と一緒に保持する。
  // こうすると setState は全て fetch の非同期コールバック内だけで済み、
  // 取得中フラグは派生値として求められる。
  const [suggestState, setSuggestState] = useState<{
    key: string;
    items: string[];
  }>({ key: "", items: [] });
  const bottomRef = useRef<HTMLDivElement>(null);

  // 投入されたデータのスキーマが変わるたびに「こう指示してみては？」候補を取得する。
  // テーブル構成（参照名）が変わったときだけ再取得する。
  const tableKey = schema.tables
    .map((t) => `${t.source}:${t.table}`)
    .join(",");

  useEffect(() => {
    if (schema.tables.length === 0) return;
    let cancelled = false;
    fetch("/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema, csvTables: csvSources }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled)
          setSuggestState({ key: tableKey, items: data.suggestions ?? [] });
      })
      .catch(() => {
        if (!cancelled) setSuggestState({ key: tableKey, items: [] });
      });
    return () => {
      cancelled = true;
    };
    // schema/csvSources はオブジェクトのため、テーブル構成キーで依存を絞る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey]);

  const hasData = schema.tables.length > 0;
  const suggestionsReady = suggestState.key === tableKey;
  // データが無い状態では古い候補を見せない
  const displaySuggestions = hasData && suggestionsReady ? suggestState.items : [];
  const suggestLoading = hasData && !suggestionsReady;

  // A "loading" bubble persisted from a request that was interrupted by a
  // reload would otherwise spin forever, so only show in-flight bubbles while a
  // request is actually running.
  const visibleMessages = loading
    ? messages
    : messages.filter((m) => !m.isLoading);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (override?: string) => {
    const question = (override ?? input).trim();
    if (!question || loading) return;

    if (schema.tables.length === 0) {
      setMessages((prev) => [
        ...prev.filter((m) => !m.isLoading),
        {
          id: crypto.randomUUID(),
          role: "user",
          content: question,
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "まずは左のパネルからデータソースを追加してください。BigQueryのProject ID / Dataset IDを入力するか、CSVファイルをアップロードすると分析を始められます。",
        },
      ]);
      setInput("");
      return;
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    };

    const loadingMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      isLoading: true,
    };

    setMessages((prev) => [...prev.filter((m) => !m.isLoading), userMsg, loadingMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages
        .filter((m) => !m.isLoading)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          schema,
          conversationHistory: history.slice(-10),
          csvTables: csvSources,
        }),
      });

      const data = await res.json();

      const assistantMsg: Message = {
        id: loadingMsg.id,
        role: "assistant",
        content: data.report
          ? ""
          : data.clarify
            ? data.clarify.question
            : data.content || data.error || "応答がありませんでした",
        sql: data.sql,
        queryResult: data.queryResult,
        chartConfig: data.chartConfig,
        report: data.report,
        clarify: data.clarify,
        error: data.error,
      };

      setMessages((prev) =>
        prev.map((m) => (m.id === loadingMsg.id ? assistantMsg : m))
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMsg.id
            ? { ...m, content: "通信エラーが発生しました", error: "Network error", isLoading: false }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        {visibleMessages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <BarChart3 className="w-12 h-12 text-blue-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                AI Data Analyst
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                自然言語でデータについて質問すると、SQLを生成・実行し、結果をグラフで表示します。
              </p>
              {schema.tables.length > 0 && (
                <p className="text-xs font-medium text-gray-400 mb-2 text-left">
                  こう指示してみては？
                </p>
              )}
              <div className="space-y-2 text-left">
                {suggestLoading && (
                  <div className="flex items-center gap-2 text-sm text-gray-400 px-4 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    データに合った指示候補を考えています...
                  </div>
                )}
                {(displaySuggestions.length > 0
                  ? displaySuggestions
                  : hasData
                    ? []
                    : [
                        "先月のDAUの推移を見せて",
                        "課金率が高いユーザーセグメントは？",
                        "イベント別のコンバージョン率を比較して",
                      ]
                ).map((example) => (
                  <button
                    key={example}
                    onClick={() => setInput(example)}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4 max-w-4xl mx-auto">
          {visibleMessages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onChoose={sendMessage}
              disabled={loading}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-gray-200 p-4 bg-white">
        <div className="max-w-4xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="データについて質問してください..."
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onChoose,
  disabled,
}: {
  message: Message;
  onChoose: (text: string) => void;
  disabled: boolean;
}) {
  const [showTable, setShowTable] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-blue-600 text-white px-4 py-2.5 rounded-2xl rounded-br-md max-w-lg text-sm">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.isLoading) {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
          <BarChart3 className="w-4 h-4 text-gray-600" />
        </div>
        <div className="bg-gray-100 px-4 py-2.5 rounded-2xl rounded-bl-md">
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
        <BarChart3 className="w-4 h-4 text-gray-600" />
      </div>
      <div className="flex-1 min-w-0">
        {message.error && (
          <div className="flex items-center gap-2 text-red-600 text-sm mb-2 bg-red-50 px-3 py-2 rounded-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {message.error}
          </div>
        )}

        {message.content && (
          <div className="text-sm text-gray-800 whitespace-pre-wrap mb-2">
            {message.content}
          </div>
        )}

        {message.clarify && message.clarify.choices.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.clarify.choices.map((choice) => (
              <button
                key={choice}
                onClick={() => onChoose(choice)}
                disabled={disabled}
                className="px-3 py-1.5 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {choice}
              </button>
            ))}
          </div>
        )}

        {message.report && <ReportView report={message.report} />}

        {message.sql && (
          <details className="mb-2">
            <summary className="text-xs text-gray-500 cursor-pointer flex items-center gap-1 hover:text-gray-700">
              <Code className="w-3 h-3" />
              SQLを表示
            </summary>
            <pre className="mt-1 p-3 bg-gray-900 text-gray-100 text-xs rounded-lg overflow-x-auto">
              <code>{message.sql}</code>
            </pre>
          </details>
        )}

        {message.queryResult && message.chartConfig && (
          <ResultChart
            data={message.queryResult}
            config={message.chartConfig}
          />
        )}

        {message.queryResult && (
          <div>
            <button
              onClick={() => setShowTable(!showTable)}
              className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700 mb-1"
            >
              <Table className="w-3 h-3" />
              {showTable ? "テーブルを隠す" : "データテーブルを表示"}
              ({message.queryResult.totalRows}件)
            </button>
            {showTable && <DataTable data={message.queryResult} />}
          </div>
        )}
      </div>
    </div>
  );
}
