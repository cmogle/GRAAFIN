"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, Send } from "lucide-react";
import { CoachAvatar } from "@/components/coach/coach-avatar";
import {
  ChatMessage,
  ContextPayload,
  ThreadPayload,
  badgeToneForState,
  confidenceLabel,
  daysUntilRace,
  formatDateSeparator,
  getCalendarDay,
  getContextualPrompts,
  humanStateLabel,
  normalizeContent,
  normalizeMessages,
  normalizeMetadata,
  resolveActionTarget,
  riskBannerProps,
} from "@/components/coach/coach-chat-helpers";

type WorkbenchModule = {
  moduleKey: string;
  title: string;
  description: string;
  score: number;
  reason: string;
  pinned: boolean;
  visibility: "auto" | "manual_shown" | "manual_hidden";
  slotIndex: number;
  autoShown: boolean;
};

const CACHE_KEY = "graafin_coach_thread_cache_v3";

export function CoachChatPanel() {
  const router = useRouter();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [stateUpdating, setStateUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<ContextPayload | null>(null);
  const [coachModules, setCoachModules] = useState<WorkbenchModule[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const loadWorkbench = async () => {
    try {
      const res = await fetch("/api/coach/workbench?surface=coach", { method: "GET" });
      if (!res.ok) return;
      const data = (await res.json()) as { modules?: WorkbenchModule[] };
      if (Array.isArray(data.modules)) setCoachModules(data.modules);
    } catch {
      // Ignore optional workbench loading failures.
    }
  };

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
        await loadWorkbench();
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

  const latestLearningEventId = latestAssistant?.metadata?.learning?.eventId ?? null;

  useEffect(() => {
    if (!latestAssistant?.metadata) return;
    setContext((prev) => ({
      ...prev,
      coachState: latestAssistant.metadata?.coachState ?? prev?.coachState ?? null,
      activeBlock: latestAssistant.metadata?.activeBlock ?? prev?.activeBlock ?? null,
    }));

    const learningModules = latestAssistant.metadata.learning?.modules;
    if (Array.isArray(learningModules) && learningModules.length > 0) {
      setCoachModules(learningModules as unknown as WorkbenchModule[]);
    }
  }, [latestAssistant]);

  const sendFeedback = async (feedbackType: "thumb_up" | "thumb_down" | "module_open" | "module_hide", payload: Record<string, unknown>) => {
    try {
      await fetch("/api/coach/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: latestLearningEventId,
          feedbackType,
          payload,
        }),
      });
    } catch {
      // No-op by design.
    }
  };

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
        learning: data.learning,
      });

      const assistant: ChatMessage = {
        id: String(data.assistantMessageId ?? `assistant-${Date.now()}`),
        role: "assistant",
        content: normalizeContent(data.assistantMessage),
        confidence: typeof data.confidence === "number" ? data.confidence : null,
        created_at: typeof data.generatedAt === "string" ? data.generatedAt : new Date().toISOString(),
        metadata,
      };

      setMessages((prev) => {
        const nextThreadId = typeof data.threadId === "string" && data.threadId.length > 0 ? data.threadId : threadId;
        const nextMessages: ChatMessage[] = [
          ...prev.filter((m) => m.id !== tempId),
          {
            id: String(data.userMessageId ?? tempId),
            role: "user",
            content: trimmed,
            created_at: typeof data.generatedAt === "string" ? data.generatedAt : new Date().toISOString(),
          },
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

      if (data.learning?.modules && Array.isArray(data.learning.modules)) {
        setCoachModules(data.learning.modules as WorkbenchModule[]);
      } else {
        await loadWorkbench();
      }

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
          created_at: new Date().toISOString(),
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
    if (messages.length > 0) {
      const confirmed = window.confirm("Start fresh? Your coach keeps your training history and memory.");
      if (!confirmed) return;
    }
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
  const raceCountdown = daysUntilRace(context?.objective?.goalRaceDate ?? context?.activeBlock?.raceDate ?? null);
  const readableState = humanStateLabel(context?.coachState ?? null);
  const riskModule = coachModules.find((module) => module.moduleKey === "risk_banner" && module.autoShown);
  const riskBanner = riskBannerProps(latestAssistant?.metadata?.riskFlags ?? []);

  return (
    <div className="flex h-[calc(100dvh-12.5rem)] min-h-[520px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:h-[calc(100dvh-10.5rem)]">
      <header className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CoachAvatar size="md" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Coach</p>
              <p className="text-xs text-slate-500">Grounded in your data</p>
            </div>
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
            Race: {context?.objective?.goalRaceName ?? "Boston Marathon"}
            {raceCountdown != null ? ` · ${raceCountdown} days` : ""}
          </span>
          {context?.activeBlock?.weekIndex != null ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700">
              Week {context.activeBlock.weekIndex} of {context.activeBlock.weekCount ?? 12}
            </span>
          ) : null}
          <span className={`rounded-full px-2.5 py-1 text-[11px] ${readableState.tone}`}>
            {readableState.label}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] ${badgeToneForState(context?.coachState ?? null)}`}>
            Run {context?.coachState?.runningAllowed ? "allowed" : "paused"}
          </span>
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

      {riskBanner ? (
        <div className={`mx-3 mt-2 rounded-xl border px-3 py-2 text-xs ${riskBanner.tone}`}>
          <p className="inline-flex items-center gap-1 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            {riskBanner.text}
          </p>
          {riskModule?.reason ? <p className="mt-1 text-[11px] opacity-80">Why shown: {riskModule.reason}</p> : null}
        </div>
      ) : null}

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
                {getContextualPrompts(context).map((prompt) => (
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
            messages.map((message, index) => {
              const previous = index > 0 ? messages[index - 1] : null;
              const showDateSeparator = getCalendarDay(message.created_at) !== getCalendarDay(previous?.created_at);
              const showTopicShift =
                message.role === "assistant" &&
                previous?.role === "assistant" &&
                message.metadata?.intent &&
                previous.metadata?.intent &&
                message.metadata.intent !== previous.metadata.intent;
              const moduleReason = message.metadata?.learning?.modules?.[0]?.reason;
              const confidence = confidenceLabel(message.confidence ?? null);

              return (
                <div key={message.id} className="space-y-2">
                  {showDateSeparator ? (
                    <div className="flex items-center gap-2 py-1">
                      <span className="h-px flex-1 bg-slate-200" />
                      <span className="text-[11px] text-slate-400">{formatDateSeparator(message.created_at)}</span>
                      <span className="h-px flex-1 bg-slate-200" />
                    </div>
                  ) : null}

                  {showTopicShift ? (
                    <p className="text-center text-[11px] uppercase tracking-[0.12em] text-slate-400">Topic shift</p>
                  ) : null}

                  <article className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    {message.role === "assistant" ? (
                      <div className="flex max-w-[96%] items-start gap-2">
                        <CoachAvatar size="sm" />
                        <div className="max-w-[92%] rounded-3xl bg-slate-100 px-4 py-3 text-sm text-slate-800">
                          <p className="mb-1 text-[11px] font-semibold text-slate-500">
                            Coach
                            {confidence ? (
                              <span className={`ml-1 font-medium ${confidence.tone}`}>
                                · {confidence.text}
                              </span>
                            ) : null}
                          </p>
                          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>

                          {message.metadata?.stateChanges?.length ? (
                            <p className="mt-2 text-xs text-slate-500">State changes: {message.metadata.stateChanges.join(" · ")}</p>
                          ) : null}

                          {message.metadata?.assumptionsUsed?.length ? (
                            <details className="mt-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700">
                              <summary className="cursor-pointer font-medium text-slate-800">
                                Coach is assuming ({message.metadata.assumptionsUsed.length})
                              </summary>
                              <ul className="mt-1 space-y-1">
                                {message.metadata.assumptionsUsed.map((item) => (
                                  <li key={item}>- {item}</li>
                                ))}
                              </ul>
                            </details>
                          ) : null}

                          {message.metadata?.memoryApplied?.length ? (
                            <p className="mt-2 text-xs italic text-slate-500">
                              Using your preferences: {message.metadata.memoryApplied.join(", ")}
                            </p>
                          ) : null}

                          {message.metadata?.scenarioPlan?.items?.length ? (
                            <div className="mt-3 space-y-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700">
                              <p className="font-semibold text-slate-800">Outage scenarios</p>
                              {message.metadata.scenarioPlan.items.map((item) => (
                                <p key={`scenario-${item.outageDays}`}>
                                  {item.outageDays}d: ~{item.missedKm.toFixed(1)} km missed, {item.missedSessions} sessions, {item.riskLevel} risk.
                                </p>
                              ))}
                            </div>
                          ) : null}

                          {message.metadata?.suggestedActions?.length ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {message.metadata.suggestedActions.map((action) => (
                                <button
                                  key={action}
                                  type="button"
                                  onClick={() => {
                                    const target = resolveActionTarget(action);
                                    if (target.type === "navigate") {
                                      router.push(target.href);
                                    } else {
                                      setInput(target.text);
                                      composerRef.current?.focus();
                                    }
                                    void sendFeedback("module_open", {
                                      moduleKey: "action_rail",
                                      action,
                                      targetType: target.type,
                                    });
                                  }}
                                  className="rounded-full border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200"
                                >
                                  {action}
                                </button>
                              ))}
                            </div>
                          ) : null}

                          {moduleReason ? <p className="mt-2 text-[11px] text-slate-400">Why shown: {moduleReason}</p> : null}
                        </div>
                      </div>
                    ) : (
                      <div
                        className={
                          message.role === "user"
                            ? "max-w-[86%] rounded-3xl bg-slate-900 px-4 py-3 text-sm text-white"
                            : "max-w-[92%] rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                        }
                      >
                        {message.role === "system" ? (
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Context</p>
                        ) : null}
                        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                      </div>
                    )}
                  </article>
                </div>
              );
            })}

          {loading ? (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-600">
                <CoachAvatar size="sm" />
                <Loader2 className="h-4 w-4 animate-spin" />
                Coach is thinking...
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-4">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          {followups.length > 0 || unresolved.length > 0 ? (
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
