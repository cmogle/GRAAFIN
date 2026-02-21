"use client";

import Link from "next/link";
import { Activity, Sparkles } from "lucide-react";

export function TopNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="rounded-lg bg-blue-50 p-1.5">
            <Activity className="h-5 w-5 text-blue-600" />
          </span>
          Fionnuala Run Coach
        </Link>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          <Sparkles className="h-3.5 w-3.5" />
          Live Strava + plan intelligence
        </span>
      </div>
    </header>
  );
}
