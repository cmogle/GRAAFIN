"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Activity, Bot, Menu, RefreshCw } from "lucide-react";

export function TopNav() {
  const pathname = usePathname();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const onCoachPage = pathname === "/coach" || pathname.startsWith("/coach/");

  const runGarminSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const response = await fetch("/api/wellness/garmin/sync", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setSyncMessage(String(data?.error ?? data?.message ?? "Garmin sync failed"));
      } else {
        setSyncMessage(String(data?.message ?? "Garmin manual sync completed"));
      }
    } catch {
      setSyncMessage("Unable to reach Garmin sync endpoint");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className={`mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6 ${onCoachPage ? "h-12 sm:h-14" : "h-14"}`}>
        <Link href="/dashboard" className="flex items-center gap-2.5 font-semibold text-slate-900">
          <span className="rounded-xl bg-slate-900 p-1.5">
            <Activity className="h-4 w-4 text-white" />
          </span>
          GRAAFIN
        </Link>
        <div className="flex items-center gap-2">
          {!onCoachPage ? (
            <Link
              href="/coach"
              className="inline-flex min-h-10 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm"
            >
              <Bot className="h-3.5 w-3.5" />
              Coach
            </Link>
          ) : null}

          <details className="relative">
            <summary className={`inline-flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-full border border-slate-200 bg-white py-1 text-xs font-medium text-slate-700 shadow-sm ${onCoachPage ? "px-2.5 sm:px-3" : "px-3"}`}>
              <Menu className="h-3.5 w-3.5" />
              {onCoachPage ? <span className="hidden sm:inline">Menu</span> : "Menu"}
            </summary>
            <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
              <Link
                href="/wellness/morning"
                className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Morning capture
              </Link>
              <Link
                href="/wellness"
                className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Wellness inputs
              </Link>
              <Link
                href="/profile"
                className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Preferences
              </Link>
              <Link
                href="/profile#garmin-connect"
                className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Connect Garmin
              </Link>
              <button
                type="button"
                disabled={syncing}
                onClick={() => void runGarminSync()}
                className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing Garmin..." : "Manual Garmin sync"}
              </button>
              {syncMessage ? (
                <p className="mt-1 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{syncMessage}</p>
              ) : null}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
