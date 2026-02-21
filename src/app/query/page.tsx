"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { Send, BarChart3, Activity, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const quickPrompts = [
  "Am I on track this week?",
  "How much did I run in the last 14 days?",
  "How many easy runs vs workouts this month?",
  "Which sessions had highest HR drift?",
];

export default function QueryPage() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<string>(
    "Ask a question about your training data and I will return live insights."
  );
  const [loading, setLoading] = useState(false);

  const ask = async (q?: string) => {
    const questionText = q ?? query;
    if (!questionText.trim()) return;
    setQuery(questionText);
    setLoading(true);
    setAnswer("");
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: questionText }),
      });
      const data = await res.json();
      setAnswer(data.summary ?? data.error ?? "No response");
    } catch {
      setAnswer("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Query Coach</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Natural-language analytics for your training data.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Question panel */}
        <SectionCard title="Ask a question">
          <div className="flex flex-col gap-4">
            <textarea
              className="min-h-[100px] w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask about your training..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask();
                }
              }}
            />
            <button
              onClick={() => ask()}
              disabled={loading || !query.trim()}
              className="inline-flex w-fit items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-opacity disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {loading ? "Running..." : "Run query"}
            </button>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Quick prompts
              </span>
              <div className="flex flex-wrap gap-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => ask(prompt)}
                    disabled={loading}
                    className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent-muted hover:text-accent disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Answer panel */}
        <SectionCard title="Coach Answer">
          <div className="flex flex-col gap-4">
            <div
              className={cn(
                "min-h-[100px] rounded-xl border border-border bg-background p-4 text-sm leading-relaxed",
                loading
                  ? "animate-pulse text-muted-foreground"
                  : "text-foreground"
              )}
            >
              {loading ? "Thinking..." : answer}
            </div>

            {/* Placeholder metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                <Activity className="h-4 w-4 text-accent" />
                <div>
                  <div className="text-xs text-muted-foreground">Distance</div>
                  <div className="text-sm font-semibold text-foreground">
                    --
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                <BarChart3 className="h-4 w-4 text-accent" />
                <div>
                  <div className="text-xs text-muted-foreground">Sessions</div>
                  <div className="text-sm font-semibold text-foreground">
                    --
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                <CheckCircle2 className="h-4 w-4 text-accent" />
                <div>
                  <div className="text-xs text-muted-foreground">
                    Compliance
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    --
                  </div>
                </div>
              </div>
            </div>

            {/* Placeholder chart area */}
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border bg-muted/50">
              <span className="text-xs text-muted-foreground">
                Chart visualization area (coming soon)
              </span>
            </div>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
