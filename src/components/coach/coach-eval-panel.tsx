"use client";

import { useState } from "react";

type EvalCase = {
  id: string;
  title: string;
  passed: boolean;
  details: string;
};

type EvalPayload = {
  passed: number;
  failed: number;
  total: number;
  generatedAt: string;
  results: EvalCase[];
};

export function CoachEvalPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvalPayload | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/coach/eval");
      const data = (await response.json()) as EvalPayload & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Eval failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eval failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void run()}
        disabled={loading}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-60"
      >
        {loading ? "Running eval..." : "Run Coach Conversational Eval"}
      </button>

      {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {result ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-700">
            Passed {result.passed}/{result.total} · Failed {result.failed} · {new Date(result.generatedAt).toLocaleString()}
          </p>
          <div className="space-y-2">
            {result.results.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <p className={item.passed ? "text-emerald-700" : "text-rose-700"}>
                  {item.passed ? "PASS" : "FAIL"} · {item.title}
                </p>
                <p className="text-xs text-slate-600">{item.details}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
