"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

type SyncResult = {
  ok?: boolean;
  skipped?: boolean;
  message?: string;
  lastSuccessfulSyncAt?: string | null;
};

export function DataSyncControls() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  const triggerSync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/sync/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "profile-manual", force: true }),
      });
      const data = (await response.json().catch(() => ({}))) as SyncResult;
      setResult(data);
    } catch {
      setResult({ ok: false, message: "Unable to contact sync endpoint." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <summary className="cursor-pointer list-none text-sm font-medium text-slate-800">
        Advanced data sync controls
      </summary>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-slate-600">
          Sync runs automatically on app launch with a smart throttle. Use this only if today&apos;s run has not appeared yet.
        </p>
        <button
          type="button"
          onClick={triggerSync}
          disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Syncing..." : "Sync now"}
        </button>
        {result?.message ? <p className="text-xs text-slate-600">{result.message}</p> : null}
        {result?.lastSuccessfulSyncAt ? (
          <p className="text-xs text-slate-500">
            Last successful sync: {new Date(result.lastSuccessfulSyncAt).toLocaleString()}
          </p>
        ) : null}
      </div>
    </details>
  );
}
