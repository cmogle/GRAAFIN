"use client";

import { useEffect, useMemo, useState } from "react";
import { Send, Loader2, CircleAlert } from "lucide-react";

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
  messages: ChatMessage[];
};

const CACHE_KEY = "graafin_coach_thread_cache_v1";

const quickPrompts = [
  "What should today's session focus on?",
  "Is my current training load sustainable?",
  "Give me one high-confidence adjustment for this week.",
];

export function CoachChatPanel() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setBooting(true);
      setError(null);
      try {
        const res = await fetch("/api/coach/thread", { method: "GET" });
        if (!res.ok) throw new Error("Failed to load coach thread");
        const data = (await res.json()) as ThreadPayload;
        setThreadId(data.thread?.id ?? null);
        setMessages(data.messages ?? []);
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch (e) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const data = JSON.parse(cached) as ThreadPayload;
          setThreadId(data.thread?.id ?? null);
          setMessages(data.messages ?? []);
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
      if (!res.ok) throw new Error(data?.error ?? "Coach request failed");

      const assistant: ChatMessage = {
        id: String(data.assistantMessageId ?? `assistant-${Date.now()}`),
        role: "assistant",
        content: String(data.assistantMessage ?? ""),
        confidence: typeof data.confidence === "number" ? data.confidence : null,
        metadata: {
          suggestedActions: Array.isArray(data.suggestedActions) ? data.suggestedActions : [],
          followUpQuestions: Array.isArray(data.followUpQuestions) ? data.followUpQuestions : [],
          riskFlags: Array.isArray(data.riskFlags) ? data.riskFlags : [],
        },
      };

      setMessages((prev) => {
        const nextMessages: ChatMessage[] = [
          ...prev.filter((m) => m.id !== tempId),
          { id: String(data.userMessageId ?? tempId), role: "user", content: trimmed },
          assistant,
        ];
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ thread: { id: String(data.threadId ?? threadId ?? "") }, messages: nextMessages }),
        );
        return nextMessages;
      });
      setThreadId(String(data.threadId ?? threadId ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setLoading(false);
    }
  };

  const latestAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant"),
    [messages],
  );

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>
      ) : null}

      {booting ? (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading coach context...
        </div>
      ) : (
        <div className="space-y-3">
          {messages.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Start a conversation with your coach. Guidance will use your current load, plan, and memory context.
            </div>
          ) : null}
          {messages.map((message) => (
            <article
              key={message.id}
              className={`rounded-2xl border px-4 py-3 text-sm ${
                message.role === "user"
                  ? "border-slate-200 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-800"
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.role === "assistant" && message.metadata?.riskFlags?.length ? (
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-amber-700">
                  <CircleAlert className="h-3.5 w-3.5" />
                  Risk flags: {message.metadata.riskFlags.join(", ")}
                </p>
              ) : null}
              {message.role === "assistant" && message.metadata?.suggestedActions?.length ? (
                <ul className="mt-2 grid gap-1 text-xs text-slate-600">
                  {message.metadata.suggestedActions.map((action) => (
                    <li key={action}>• {action}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {latestAssistant?.metadata?.followUpQuestions?.length ? (
        <div className="grid gap-2">
          {latestAssistant.metadata.followUpQuestions.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => setInput(question)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50"
            >
              {question}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => setInput(prompt)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="min-h-24 flex-1 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm"
          placeholder="Ask your coach anything about load, readiness, pacing, or plan decisions."
        />
        <button
          type="button"
          onClick={() => void send(input)}
          disabled={loading || !input.trim()}
          className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-slate-900 text-white disabled:opacity-50"
          aria-label="Send message"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
