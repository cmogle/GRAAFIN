"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";

const quickPrompts = [
  "Am I on track this week?",
  "How much did I run in the last 14 days?",
  "How many easy runs vs workouts this month?",
  "Which sessions had the highest heart rate drift?",
];

export default function QueryPage() {
  const [query, setQuery] = useState(quickPrompts[0]);
  const [answer, setAnswer] = useState<string>("Ask about this week or last 14 days.");
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    setLoading(true);
    const res = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    setAnswer(data.summary ?? data.error ?? "No response");
    setLoading(false);
  };

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Query Coach</h1>
        <p className="mt-1 text-sm text-slate-600">Natural language Q&A against safe templates and your synced run data.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Ask a question">
          <div className="space-y-4">
            <textarea
              className="h-32 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-100 placeholder:text-slate-400 focus:ring-2"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask about your training..."
            />
            <button
              onClick={ask}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Running query..." : "Run query"}
            </button>
            <div className="flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => setQuery(prompt)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </SectionCard>

        <div className="xl:col-span-2">
          <SectionCard title="Coach answer">
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{answer}</p>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
