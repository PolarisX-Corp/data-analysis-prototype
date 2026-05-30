"use client";

import { Dispatch, SetStateAction, useCallback, useEffect } from "react";
import { usePersistentState } from "./usePersistentState";
import { Conversation, Message } from "@/types";

const CONVERSATIONS_KEY = "data-analysis:conversations";
const ACTIVE_KEY = "data-analysis:active-conversation";
// 旧バージョン（単一チャット）が使っていたキー。初回だけ会話へ引き継ぐ。
const LEGACY_MESSAGES_KEY = "data-analysis:messages";

export const DEFAULT_TITLE = "新しいチャット";

function nowIso(): string {
  return new Date().toISOString();
}

function createConversation(messages: Message[] = []): Conversation {
  const ts = nowIso();
  return {
    id: crypto.randomUUID(),
    title: deriveTitle(messages) || DEFAULT_TITLE,
    messages,
    createdAt: ts,
    updatedAt: ts,
  };
}

/** 最初のユーザー発言からタイトルを作る。無ければ空文字。 */
function deriveTitle(messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "";
  const text = firstUser.content.trim().replace(/\s+/g, " ");
  return text.length > 30 ? `${text.slice(0, 30)}…` : text;
}

function readLegacyMessages(): Message[] {
  try {
    const raw = window.localStorage.getItem(LEGACY_MESSAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Message[]) : [];
  } catch {
    return [];
  }
}

export interface ConversationsApi {
  /** 一覧（更新が新しい順） */
  conversations: Conversation[];
  activeId: string;
  /** 現在アクティブな会話のメッセージ */
  messages: Message[];
  /** アクティブな会話のメッセージを更新する（usePersistentState 互換） */
  setMessages: Dispatch<SetStateAction<Message[]>>;
  newConversation: () => void;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
}

/**
 * 複数の会話（チャット）を localStorage 上で管理するフック。
 *
 * 既存の単一チャット用 state を会話単位に持ち替えたもの。新しいチャットの作成・
 * 過去チャットの参照（切り替え）・削除に対応する。常に最低1つの会話が存在し、
 * activeId は必ず実在する会話を指すよう正規化される。
 */
export function useConversations(): ConversationsApi {
  const [conversations, setConversations] = usePersistentState<Conversation[]>(
    CONVERSATIONS_KEY,
    []
  );
  const [activeId, setActiveId] = usePersistentState<string>(ACTIVE_KEY, "");

  // 会話が1つも無ければ用意する（旧データがあれば引き継ぐ）。また activeId が
  // 実在しない会話を指していたら先頭へ寄せる。レンダー中ではなく effect 内で行う。
  useEffect(() => {
    if (conversations.length === 0) {
      const seed = createConversation(readLegacyMessages());
      setConversations([seed]);
      setActiveId(seed.id);
      try {
        window.localStorage.removeItem(LEGACY_MESSAGES_KEY);
      } catch {
        // 失敗しても致命的ではない
      }
      return;
    }
    if (!conversations.some((c) => c.id === activeId)) {
      setActiveId(conversations[0].id);
    }
  }, [conversations, activeId, setConversations, setActiveId]);

  const sorted = [...conversations].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );

  const active =
    conversations.find((c) => c.id === activeId) ?? conversations[0] ?? null;
  const messages = active?.messages ?? [];

  const setMessages = useCallback<Dispatch<SetStateAction<Message[]>>>(
    (action) => {
      setConversations((prev) => {
        if (prev.length === 0) return prev; // effect が会話を用意するまで待つ
        const targetId = prev.some((c) => c.id === activeId)
          ? activeId
          : prev[0].id;
        return prev.map((c) => {
          if (c.id !== targetId) return c;
          const nextMessages =
            typeof action === "function"
              ? (action as (p: Message[]) => Message[])(c.messages)
              : action;
          // タイトルがまだ既定のままなら最初の発言から付け直す
          const title =
            c.title === DEFAULT_TITLE
              ? deriveTitle(nextMessages) || DEFAULT_TITLE
              : c.title;
          return {
            ...c,
            messages: nextMessages,
            title,
            updatedAt: nowIso(),
          };
        });
      });
    },
    [activeId, setConversations]
  );

  const newConversation = useCallback(() => {
    const conv = createConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
  }, [setConversations, setActiveId]);

  const selectConversation = useCallback(
    (id: string) => setActiveId(id),
    [setActiveId]
  );

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        // 削除したのがアクティブな会話なら別の会話へ移す（空になれば effect が補充）
        if (id === activeId) {
          const fallback = [...next].sort((a, b) =>
            b.updatedAt.localeCompare(a.updatedAt)
          )[0];
          setActiveId(fallback ? fallback.id : "");
        }
        return next;
      });
    },
    [activeId, setConversations, setActiveId]
  );

  return {
    conversations: sorted,
    activeId: active?.id ?? "",
    messages,
    setMessages,
    newConversation,
    selectConversation,
    deleteConversation,
  };
}
