"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CircleAlert, Loader2, Plus, Send } from "lucide-react";

type CoachState = {
  availabilityState: "normal" | "injury_adaptation" | "medical_hold" | "return_build";
  runningAllowed: boolean;
  expectedReturnDate: string | null;
  confidence: number;
  source: string;
  updatedAt: string | null;
};

type ActiveBlock = {
  raceName: string;
  raceDate: string;
  weekIndex: number | null;
  comparator: {
    weeklyDeltaKm: number | null;
    confidence: "low" | "moderate" | "high";
  };
};

type EvidenceItem = {
  id: string;
  title: string;
  url: string;
  domain: string;
  claim: string;
  confidence: number;
  publishedAt: string | null;
};

type ScenarioPlan = {
  items: Array<{
    outageDays: number;
    missedSessions: number;
    missedKm: number;
    riskLevel: "low" | "moderate" | "high";
    planImpact: string;
    returnFocus: string;
  }>;
};

type ChatMetadata = {
  suggestedActions: string[];
  followUpQuestions: string[];
  riskFlags: string[];
  intent?: string | null;
  responseMode?: string | null;
  coachState?: CoachState | null;
  activeBlock?: ActiveBlock | null;
  stateChanges?: string[];
  evidenceItems?: EvidenceItem[];
  assumptionsUsed?: string[];
  memoryApplied?: string[];
  queryRoute?: string | null;
  scenarioPlan?: ScenarioPlan | null;
  unresolvedQuestions?: string[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;
  confidence?: number | null;
  metadata?: ChatMetadata | null;
};

type ThreadPayload = {
  thread: { id: string } | null;
  messages: Array<Partial<ChatMessage> & { id?: unknown; role?: unknown; content?: unknown }>;
  coachUnavailable?: boolean;
  warning?: unknown;
};

type ContextPayload = {
  objective?: { goalRaceName?: string; goalRaceDate?: string | null } | null;
  coachState?: CoachState | null;
  activeBlock?: ActiveBlock | null;
  generatedAt?: string;
};

const CACHE_KEY = "graafin_coach_thread_cache_v2";

const quickPrompts = [
  "Am I on track for Boston from where I am right now?",
  "Compare this week to my best historical marathon blocks.",
  "What is the single highest-value adjustment for this week?",
  "Use curated best practices and my own data to refine my plan.",
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

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeContent(item).trim()).filter(Boolean);
}

function normalizeEvidence(value: unknown): EvidenceItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        id: normalizeContent(row.id),
        title: normalizeContent(row.title),
        url: normalizeContent(row.url),
        domain: normalizeContent(row.domain),
        claim: normalizeContent(row.claim),
        confidence: typeof row.confidence === "number" ? row.confidence : Number(row.confidence ?? 0.7),
        publishedAt: row.publishedAt == null ? null : normalizeContent(row.publishedAt),
      };
    })
    .filter((item) => item.title.length > 0);
}

function normalizeMetadata(value: unknown): ChatMetadata {
  const metadataRaw = (value ?? {}) as Record<string, unknown>;
  return {
    suggestedActions: normalizeStringArray(metadataRaw.suggestedActions),
    followUpQuestions: normalizeStringArray(metadataRaw.followUpQuestions),
    riskFlags: normalizeStringArray(metadataRaw.riskFlags),
    intent: metadataRaw.intent == null ? null : normalizeContent(metadataRaw.intent),
    responseMode: metadataRaw.responseMode == null ? null : normalizeContent(metadataRaw.responseMode),
    coachState: (metadataRaw.coachState as CoachState | null | undefined) ?? null,
    activeBlock: (metadataRaw.activeBlock as ActiveBlock | null | undefined) ?? null,
    stateChanges: normalizeStringArray(metadataRaw.stateChanges),
    evidenceItems: normalizeEvidence(metadataRaw.evidenceItems),
    assumptionsUsed: normalizeStringArray(metadataRaw.assumptionsUsed),
    memoryApplied: normalizeStringArray(metadataRaw.memoryApplied),
    queryRoute: metadataRaw.queryRoute == null ? null : normalizeContent(metadataRaw.queryRoute),
    scenarioPlan: (metadataRaw.scenarioPlan as ScenarioPlan | null | undefined) ?? null,
    unresolvedQuestions: normalizeStringArray(metadataRaw.unresolvedQuestions),
  };
}

function normalizeMessages(rawMessages: ThreadPayload["messages"]): ChatMessage[] {
  return (rawMessages ?? []).map((raw, index) => {
    return {
      id: typeof raw.id === "string" ? raw.id : `msg-${Date.now()}-${index}`,
      role: normalizeRole(raw.role),
      content: normalizeContent(raw.content),
      created_at: typeof raw.created_at === "string" ? raw.created_at : undefined,
      confidence: typeof raw.confidence === "number" ? raw.confidence : null,
      metadata: normalizeMetadata(raw.metadata),
    };
  });
}

function badgeToneForState(state: CoachState | null): string {
  if (!state) return "bg-slate-100 text-slate-700";
  if (!state.runningAllowed || state.availabilityState === "medical_hold") return "bg-rose-100 text-rose-700";
  if (state.availabilityState === "injury_adaptation") return "bg-amber-100 text-amber-700";
  if (state.availabilityState === "return_build") return "bg-sky-100 text-sky-700";
  return "bg-emerald-100 text-emerald-700";
}

export function CoachChatPanel() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [stateUpdating, setStateUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<ContextPayload | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const load = async () => {
      setBooting(true);
      setError(null);
      try {
        const [threadRes, contextRes] = await Promise.all([
          fetch("/api/coach/thread", { method: "GET" }),
          fetch("/api/coach/context", { method: "GET" }),
        ]);
        if (!threadRes.ok) throw new Error("Failed to load coach thread");

        const threadData = (await threadRes.json()) as ThreadPayload;
        const normalized = normalizeMessages(threadData.messages ?? []);
        setThreadId(threadData.thread?.id ?? null);
        setMessages(normalized);
        if (threadData.warning) setError(normalizeContent(threadData.warning));

        if (contextRes.ok) {
          const contextData = (await contextRes.json()) as ContextPayload;
          setContext(contextData);
        }

        localStorage.setItem(CACHE_KEY, JSON.stringify({ thread: threadData.thread, messages: normalized }));
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

  const latestAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant"),
    [messages],
  );

  useEffect(() => {
    if (!latestAssistant?.metadata) return;
    setContext((prev) => ({
      ...prev,
      coachState: latestAssistant.metadata?.coachState ?? prev?.coachState ?? null,
      activeBlock: latestAssistant.metadata?.activeBlock ?? prev?.activeBlock ?? null,
    }));
  }, [latestAssistant]);

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

      const metadata = normalizeMetadata({
        suggestedActions: data.suggestedActions,
        followUpQuestions: data.followUpQuestions,
        riskFlags: data.riskFlags,
        intent: data.intent,
        responseMode: data.responseMode,
        coachState: data.coachState,
        activeBlock: data.activeBlock,
        stateChanges: data.stateChanges,
        evidenceItems: data.evidenceItems,
        assumptionsUsed: data.assumptionsUsed,
        memoryApplied: data.memoryApplied,
        queryRoute: data.queryRoute,
        scenarioPlan: data.scenarioPlan,
        unresolvedQuestions: data.unresolvedQuestions,
      });

      const assistant: ChatMessage = {
        id: String(data.assistantMessageId ?? `assistant-${Date.now()}`),
        role: "assistant",
        content: normalizeContent(data.assistantMessage),
        confidence: typeof data.confidence === "number" ? data.confidence : null,
        metadata,
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
      setContext((prev) => ({
        ...prev,
        coachState: metadata.coachState ?? prev?.coachState ?? null,
        activeBlock: metadata.activeBlock ?? prev?.activeBlock ?? null,
      }));
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

  const applyContextUpdate = async (payload: {
    availabilityState?: "normal" | "injury_adaptation" | "medical_hold" | "return_build";
    runningAllowed?: boolean;
    note: string;
  }) => {
    setStateUpdating(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          availabilityState: payload.availabilityState,
          runningAllowed: payload.runningAllowed,
          note: payload.note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(normalizeContent(data?.error ?? data?.message ?? data));
      setContext((prev) => ({
        ...prev,
        coachState: data.coachState ?? prev?.coachState ?? null,
      }));
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: "system",
          content: `Context updated: ${payload.note}.`,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update coach context");
    } finally {
      setStateUpdating(false);
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

  const followups = latestAssistant?.metadata?.followUpQuestions ?? [];
  const unresolved = latestAssistant?.metadata?.unresolvedQuestions ?? [];
  const evidenceItems = latestAssistant?.metadata?.evidenceItems ?? [];
  return (
    <div className="flex h-[calc(100dvh-12.5rem)] min-h-[520px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:h-[calc(100dvh-10.5rem)]">
      <header className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between">
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
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700">
            Race: {context?.objective?.goalRaceName ?? "Boston Marathon"} · {context?.objective?.goalRaceDate ?? "2026-04-20"}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700">
            Block week: {context?.activeBlock?.weekIndex ?? "n/a"}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] ${badgeToneForState(context?.coachState ?? null)}`}>
            State: {context?.coachState?.availabilityState ?? "normal"} · run {context?.coachState?.runningAllowed ? "allowed" : "paused"}
          </span>
          {latestAssistant?.metadata?.responseMode ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700">
              Mode: {latestAssistant.metadata.responseMode}
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={stateUpdating}
            onClick={() =>
              void applyContextUpdate({
                availabilityState: "medical_hold",
                runningAllowed: false,
                note: "I am not cleared to run.",
              })
            }
            className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-60"
          >
            I am not cleared
          </button>
          <button
            type="button"
            disabled={stateUpdating}
            onClick={() =>
              void applyContextUpdate({
                availabilityState: "return_build",
                runningAllowed: true,
                note: "I can run easy only.",
              })
            }
            className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs text-sky-700 hover:bg-sky-50 disabled:opacity-60"
          >
            I can run easy only
          </button>
          <button
            type="button"
            disabled={stateUpdating}
            onClick={() =>
              void applyContextUpdate({
                availabilityState: "normal",
                runningAllowed: true,
                note: "Goal unchanged.",
              })
            }
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Goal unchanged
          </button>
        </div>
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
                Ask naturally. Coach keeps context across topics, block comparisons, and state updates.
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
                      : message.role === "system"
                        ? "max-w-[92%] rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                        : "max-w-[92%] rounded-3xl bg-slate-100 px-4 py-3 text-sm text-slate-800"
                  }
                >
                  {message.role === "assistant" ? (
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Coach</p>
                  ) : null}
                  {message.role === "system" ? (
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Context</p>
                  ) : null}
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  {message.role === "assistant" && message.metadata?.riskFlags?.length ? (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-amber-700">
                      <CircleAlert className="h-3.5 w-3.5" />
                      Risk flags: {message.metadata.riskFlags.join(", ")}
                    </p>
                  ) : null}
                  {message.role === "assistant" && message.metadata?.stateChanges?.length ? (
                    <p className="mt-2 text-xs text-slate-500">State changes: {message.metadata.stateChanges.join(" · ")}</p>
                  ) : null}
                  {message.role === "assistant" && message.metadata?.scenarioPlan?.items?.length ? (
                    <div className="mt-3 space-y-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700">
                      <p className="font-semibold text-slate-800">Outage scenarios</p>
                      {message.metadata.scenarioPlan.items.map((item) => (
                        <p key={`scenario-${item.outageDays}`}>
                          {item.outageDays}d: ~{item.missedKm.toFixed(1)} km missed, {item.missedSessions} sessions, {item.riskLevel} risk.
                        </p>
                      ))}
                    </div>
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
          {(followups.length > 0 || unresolved.length > 0) ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[...unresolved, ...followups].slice(0, 4).map((question) => (
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

          {evidenceItems.length ? (
            <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-slate-700">
                Evidence used ({evidenceItems.length})
              </summary>
              <div className="mt-2 space-y-2">
                {evidenceItems.map((item) => (
                  <div key={item.id || item.title} className="text-xs text-slate-600">
                    <a href={item.url} className="font-medium text-slate-800 underline" target="_blank" rel="noreferrer">
                      {item.title}
                    </a>
                    <p>{item.claim}</p>
                  </div>
                ))}
              </div>
            </details>
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
