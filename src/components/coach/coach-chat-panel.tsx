"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CircleAlert, Loader2, Plus, Send } from "lucide-react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;
  confidence?: number | null;
  metadata?: {
    suggestedActions?: string[];
    followUpQuestions?: string[];
    riskFlags?: string[];
  } | null;
};

type ThreadPayload = {
  thread: { id: string } | null;
  messages: Array<Partial<ChatMessage> & { id?: unknown; role?: unknown; content?: unknown }>;
  coachUnavailable?: boolean;
  warning?: unknown;
};

const CACHE_KEY = "graafin_coach_thread_cache_v1";

const quickPrompts = [
  "What should today's session focus on?",
  "Is my current training load sustainable?",
  "Give me one high-confidence adjustment for this week.",
  "What should recovery look like after my run?",
];

function normalizeContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => normalizeContent(item)).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "content", "message", "recommendation", "rationale"]) {
      const candidate = normalizeContent(record[key]);
      if (candidate) return candidate;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return "";
}

function normalizeRole(value: unknown): ChatMessage["role"] {
  return value === "assistant" || value === "system" ? value : "user";
}

function normalizeMessages(rawMessages: ThreadPayload["messages"]): ChatMessage[] {
  return (rawMessages ?? []).map((raw, index) => {
    const metadataRaw = raw.metadata as Record<string, unknown> | undefined;
    return {
      id: typeof raw.id === "string" ? raw.id : `msg-${Date.now()}-${index}`,
      role: normalizeRole(raw.role),
      content: normalizeContent(raw.content),
      created_at: typeof raw.created_at === "string" ? raw.created_at : undefined,
      confidence: typeof raw.confidence === "number" ? raw.confidence : null,
      metadata: {
        suggestedActions: Array.isArray(metadataRaw?.suggestedActions)
          ? metadataRaw.suggestedActions.map((value) => normalizeContent(value)).filter(Boolean)
          : [],
        followUpQuestions: Array.isArray(metadataRaw?.followUpQuestions)
          ? metadataRaw.followUpQuestions.map((value) => normalizeContent(value)).filter(Boolean)
          : [],
        riskFlags: Array.isArray(metadataRaw?.riskFlags)
          ? metadataRaw.riskFlags.map((value) => normalizeContent(value)).filter(Boolean)
          : [],
      },
    };
  });
}

export function CoachChatPanel() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const load = async () => {
      setBooting(true);
      setError(null);
      try {
        const res = await fetch("/api/coach/thread", { method: "GET" });
        if (!res.ok) throw new Error("Failed to load coach thread");
        const data = (await res.json()) as ThreadPayload;
        const normalized = normalizeMessages(data.messages ?? []);
        setThreadId(data.thread?.id ?? null);
        setMessages(normalized);
        if (data.warning) setError(normalizeContent(data.warning));
        localStorage.setItem(CACHE_KEY, JSON.stringify({ thread: data.thread, messages: normalized }));
      } catch (e) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const data = JSON.parse(cached) as ThreadPayload;
          const normalized = normalizeMessages(data.messages ?? []);
          setThreadId(data.thread?.id ?? null);
          setMessages(normalized);
          setError("Using cached coach thread while offline.");
        } else {
          setError(e instanceof Error ? e.message : "Failed to load coach thread");
        }
      } finally {
        setBooting(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, loading, booting]);

  const send = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);

    const tempId = `temp-user-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, role: "user", content: trimmed }]);
    setInput("");

    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          message: trimmed,
          contextMode: "balanced",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const normalizedError = normalizeContent(data?.error ?? data?.message ?? data);
        throw new Error(normalizedError || "Coach request failed");
      }

      const assistant: ChatMessage = {
        id: String(data.assistantMessageId ?? `assistant-${Date.now()}`),
        role: "assistant",
        content: normalizeContent(data.assistantMessage),
        confidence: typeof data.confidence === "number" ? data.confidence : null,
        metadata: {
          suggestedActions: Array.isArray(data.suggestedActions)
            ? data.suggestedActions.map((value: unknown) => normalizeContent(value)).filter(Boolean)
            : [],
          followUpQuestions: Array.isArray(data.followUpQuestions)
            ? data.followUpQuestions.map((value: unknown) => normalizeContent(value)).filter(Boolean)
            : [],
          riskFlags: Array.isArray(data.riskFlags)
            ? data.riskFlags.map((value: unknown) => normalizeContent(value)).filter(Boolean)
            : [],
        },
      };

      setMessages((prev) => {
        const nextThreadId = typeof data.threadId === "string" && data.threadId.length > 0 ? data.threadId : threadId;
        const nextMessages: ChatMessage[] = [
          ...prev.filter((m) => m.id !== tempId),
          { id: String(data.userMessageId ?? tempId), role: "user", content: trimmed },
          assistant,
        ];
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ thread: nextThreadId ? { id: nextThreadId } : null, messages: nextMessages }),
        );
        return nextMessages;
      });
      if (typeof data.warning === "string" && data.warning.trim().length > 0) {
        setError(data.warning.trim());
      }
      setThreadId(typeof data.threadId === "string" && data.threadId.length > 0 ? data.threadId : threadId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setLoading(false);
    }
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    if (loading || !input.trim()) return;
    void send(input);
  };

  const startNewChat = () => {
    setThreadId(null);
    setMessages([]);
    setInput("");
    setError(null);
    localStorage.removeItem(CACHE_KEY);
    composerRef.current?.focus();
  };

  const latestAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant"),
    [messages],
  );

  return (
    <div className="flex h-[calc(100dvh-12.5rem)] min-h-[520px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:h-[calc(100dvh-10.5rem)]">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">GPT Coach</p>
          <p className="text-xs text-slate-500">Evidence-based calm · suggest-only</p>
        </div>
        <button
          type="button"
          onClick={startNewChat}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" />
          New chat
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          {error ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>
          ) : null}

          {booting ? (
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading coach context...
            </div>
          ) : null}

          {!booting && messages.length === 0 ? (
            <div className="py-8 text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">How can I help with today&apos;s training?</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
                Ask about readiness, pacing, load management, or what session to prioritize next.
              </p>
              <div className="mx-auto mt-6 grid max-w-2xl gap-2 sm:grid-cols-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      setInput(prompt);
                      composerRef.current?.focus();
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {!booting &&
            messages.map((message) => (
              <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={
                    message.role === "user"
                      ? "max-w-[86%] rounded-3xl bg-slate-900 px-4 py-3 text-sm text-white"
                      : "max-w-[92%] rounded-3xl bg-slate-100 px-4 py-3 text-sm text-slate-800"
                  }
                >
                  {message.role !== "user" ? (
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Coach</p>
                  ) : null}
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  {message.role === "assistant" && message.metadata?.riskFlags?.length ? (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-amber-700">
                      <CircleAlert className="h-3.5 w-3.5" />
                      Risk flags: {message.metadata.riskFlags.join(", ")}
                    </p>
                  ) : null}
                  {message.role === "assistant" && message.metadata?.suggestedActions?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {message.metadata.suggestedActions.map((action) => (
                        <span key={action} className="rounded-full border border-slate-300 px-2 py-1 text-xs text-slate-600">
                          {action}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}

          {loading ? (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Coach is thinking...
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-4">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          {latestAssistant?.metadata?.followUpQuestions?.length ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {latestAssistant.metadata.followUpQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => {
                    setInput(question);
                    composerRef.current?.focus();
                  }}
                  className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  {question}
                </button>
              ))}
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-300 bg-white p-2 focus-within:border-slate-900">
            <textarea
              ref={composerRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onComposerKeyDown}
              className="max-h-44 min-h-16 w-full resize-y bg-transparent px-2 py-1 text-sm outline-none"
              placeholder="Message Coach..."
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-slate-400">Enter to send · Shift+Enter for newline</p>
              <button
                type="button"
                onClick={() => void send(input)}
                disabled={loading || !input.trim()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white disabled:opacity-50"
                aria-label="Send message"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
