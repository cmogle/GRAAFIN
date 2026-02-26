"use client";

import Link from "next/link";
import { Activity, Bot } from "lucide-react";

export function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5 font-semibold text-slate-900">
          <span className="rounded-xl bg-slate-900 p-1.5">
            <Activity className="h-4 w-4 text-white" />
          </span>
          GRAAFIN
        </Link>
        <Link
          href="/coach"
          className="inline-flex min-h-10 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm"
        >
          <Bot className="h-3.5 w-3.5" />
          Coach
        </Link>
      </div>
    </header>
  );
}
