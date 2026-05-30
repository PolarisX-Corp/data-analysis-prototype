"use client";

import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { Conversation } from "@/types";

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

/** 更新時刻をざっくり相対表記にする（今 / 〜分前 / 〜時間前 / 日付） */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMin = Math.floor((Date.now() - then) / 60000);
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}日前`;
  return new Date(iso).toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
  });
}

export function ConversationSidebar({
  conversations,
  activeId,
  onNew,
  onSelect,
  onDelete,
}: ConversationSidebarProps) {
  return (
    <div className="w-60 border-r border-gray-200 bg-gray-100 flex flex-col h-full">
      <div className="p-3 border-b border-gray-200">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          新しいチャット
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <p className="px-2 py-1 text-xs font-medium text-gray-400">履歴</p>
        {conversations.length === 0 && (
          <p className="px-2 py-2 text-xs text-gray-400">
            まだチャットがありません
          </p>
        )}
        {conversations.map((c) => {
          const isActive = c.id === activeId;
          return (
            <div
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer ${
                isActive
                  ? "bg-white shadow-sm"
                  : "hover:bg-gray-200"
              }`}
            >
              <MessageSquare
                className={`w-4 h-4 flex-shrink-0 ${
                  isActive ? "text-blue-600" : "text-gray-400"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-800 truncate">
                  {c.title || "新しいチャット"}
                </div>
                <div className="text-xs text-gray-400">
                  {relativeTime(c.updatedAt)}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(c.id);
                }}
                title="このチャットを削除"
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
