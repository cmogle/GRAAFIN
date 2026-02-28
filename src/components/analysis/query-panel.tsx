"use client";

import { useState, useRef, useCallback } from "react";
import { Send, ChevronDown, ChevronUp, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type QueryResult = {
  answer: string;
  highlights: string[];
  followUpQuestions: string[];
  sql?: string;
  explanation?: string;
  resultCount?: number;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  result?: QueryResult;
  loading?: boolean;
};

const STARTER_QUESTIONS = [
  "What's my average resting heart rate by month over the last 4 years?",
  "How does my sleep duration correlate with next-day body battery?",
  "What are my worst and best months for HRV?",
  "How has my VO2 max changed over time?",
  "When do I tend to have the highest stress levels?",
  "What's my typical recovery pattern after a week with 50+ km of running?",
];

export function QueryPanel({ athleteId }: { athleteId: number }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  const sendQuestion = useCallback(
    async (question: string) => {
      if (!question.trim() || loading) return;

      const userMsg: Message = { role: "user", content: question.trim() };
      const loadingMsg: Message = { role: "assistant", content: "", loading: true };

      setMessages((prev) => [...prev, userMsg, loadingMsg]);
      setInput("");
      setLoading(true);
      setExpanded(true);
      scrollToBottom();

      try {
        const res = await fetch("/api/analysis/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: question.trim(), athleteId }),
        });

        const result: QueryResult = await res.json();

        setMessages((prev) => [
          ...prev.slice(0, -1), // Remove loading message
          {
            role: "assistant",
            content: result.answer,
            result,
          },
        ]);
      } catch (err) {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          {
            role: "assistant",
            content: `Error: ${err instanceof Error ? err.message : "Request failed"}`,
          },
        ]);
      } finally {
        setLoading(false);
        scrollToBottom();
      }
    },
    [loading, athleteId, scrollToBottom],
  );

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white shadow-sm">
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <h3 className="text-base font-semibold text-slate-900">Ask your data</h3>
          {messages.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              {messages.filter((m) => m.role === "user").length} queries
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5">
          {/* Messages */}
          {messages.length === 0 ? (
            <div className="py-4">
              <p className="mb-3 text-sm text-slate-500">
                Ask questions about your wellness data in plain English.
              </p>
              <div className="flex flex-wrap gap-2">
                {STARTER_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendQuestion(q)}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-h-[500px] space-y-3 overflow-y-auto py-4">
              {messages.map((msg, i) => (
                <div key={i}>
                  {msg.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl bg-slate-900 px-4 py-2.5 text-sm text-white">
                        {msg.content}
                      </div>
                    </div>
                  ) : msg.loading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing your data...
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="max-w-[95%] rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        {msg.content}
                      </div>

                      {/* Highlights */}
                      {msg.result?.highlights && msg.result.highlights.length > 0 && (
                        <div className="ml-2 space-y-1">
                          {msg.result.highlights.map((h, j) => (
                            <div
                              key={j}
                              className="flex items-start gap-1.5 text-xs text-slate-600"
                            >
                              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400" />
                              {h}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* SQL detail (collapsed) */}
                      {msg.result?.sql && <SqlDetail sql={msg.result.sql} />}

                      {/* Follow-up questions */}
                      {msg.result?.followUpQuestions &&
                        msg.result.followUpQuestions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {msg.result.followUpQuestions.map((q, j) => (
                              <button
                                key={j}
                                onClick={() => sendQuestion(q)}
                                disabled={loading}
                                className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendQuestion(input);
            }}
            className="mt-3 flex gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your wellness data..."
              disabled={loading}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition",
                input.trim() && !loading
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "bg-slate-100 text-slate-400",
              )}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function SqlDetail({ sql }: { sql: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ml-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-500"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        SQL query
      </button>
      {open && (
        <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-100 p-2 text-[10px] text-slate-600">
          {sql}
        </pre>
      )}
    </div>
  );
}
