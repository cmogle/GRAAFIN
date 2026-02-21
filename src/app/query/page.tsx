"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";

export default function QueryPage() {
  const [query, setQuery] = useState("Am I on track this week?");
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
      <h1 className="text-2xl font-semibold text-slate-900">Query Coach</h1>
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Ask a question">
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about your training..."
              />
              <button onClick={ask} className="rounded-lg bg-slate-900 px-4 py-2 text-white" disabled={loading}>
                {loading ? "..." : "Ask"}
              </button>
            </div>
            <p className="text-xs text-slate-500">Try: “How much did I run in the last 14 days?”</p>
          </div>
        </SectionCard>
        <SectionCard title="Answer">
          <p className="text-slate-700">{answer}</p>
        </SectionCard>
      </div>
    </AppShell>
  );
}
