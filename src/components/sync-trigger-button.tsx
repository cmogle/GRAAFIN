"use client";

import { useState } from "react";

type Result = {
  ok?: boolean;
  message?: string;
  lastSuccessfulSyncAt?: string | null;
};

export function SyncTriggerButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const trigger = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/sync/trigger", { method: "POST" });
      const data = (await res.json()) as Result;
      setResult(data);
    } catch {
      setResult({ ok: false, message: "Failed to trigger sync" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={trigger}
        disabled={loading}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? "Triggering..." : "Run manual sync"}
      </button>
      {result?.message ? <p className="text-sm text-slate-600">{result.message}</p> : null}
      {result?.lastSuccessfulSyncAt ? (
        <p className="text-xs text-slate-500">Last successful sync: {new Date(result.lastSuccessfulSyncAt).toLocaleString()}</p>
      ) : null}
    </div>
  );
}
