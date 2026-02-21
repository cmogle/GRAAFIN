"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <div className="flex flex-col gap-2">
      <button
        onClick={trigger}
        disabled={loading}
        className={cn(
          "inline-flex w-fit items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity disabled:opacity-60"
        )}
      >
        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        {loading ? "Triggering..." : "Trigger Sync"}
      </button>
      {result?.message && (
        <p className="text-sm text-muted-foreground">{result.message}</p>
      )}
      {result?.lastSuccessfulSyncAt && (
        <p className="text-xs text-muted-foreground">
          Last successful sync:{" "}
          {new Date(result.lastSuccessfulSyncAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
